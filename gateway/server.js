// WLM ASIC Manager — site gateway
//
// Runs at the mining site (an always-on Windows PC / Pi on the same LAN as the
// miners) and exposes ONE HTTP API that the Android app reaches through a
// Cloudflare tunnel. It AUTO-DISCOVERS miners on the local network, polls each
// one's firmware (Braiins / Avalon / Bitmain over the cgminer socket, VNish
// over HTTP), normalizes the readings, and serves the contract the app expects:
//
//   GET  /api/v1/fleet
//   GET  /api/v1/raw?host=&cmd=&token=     (diagnostics)
//   POST /api/v1/miners/:id/reboot
//   POST /api/v1/miners/:id/locate
//   GET  /healthz   ·   GET /   (status page)
//
// Zero npm dependencies — Node 18+ only.

import http from "node:http";
import net from "node:net";
import os from "node:os";
import { spawn } from "node:child_process";
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const configPath = process.env.WLM_CONFIG || join(here, "config.json");

let config;
try {
  config = JSON.parse(readFileSync(configPath, "utf8"));
} catch {
  console.error(`Could not read config at ${configPath}. Copy config.example.json to config.json.`);
  process.exit(1);
}

const POLL_MS = (config.pollIntervalSec || 10) * 1000;
const DISCOVERY_MS = (config.discoveryIntervalSec || 300) * 1000;
const DISCOVER = config.discover !== false; // on by default
const QUICK_TUNNEL = config.quickTunnel === true; // free instant Cloudflare tunnel
const cache = new Map();   // minerId -> normalized stats
let discovered = [];       // auto-found miner descriptors
let publicUrl = null;      // current quick-tunnel public URL, if any

// ===========================================================================
//  cgminer / bmminer socket
// ===========================================================================

function cgminer(host, port, command, timeout = 4000) {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    let raw = "";
    let done = false;
    const fin = (val) => { if (!done) { done = true; try { socket.destroy(); } catch {} resolve(val); } };
    socket.setTimeout(timeout);
    socket.on("timeout", () => fin(null));
    socket.on("error", () => fin(null));
    socket.on("data", (d) => { raw += d.toString("utf8"); });
    socket.on("close", () => {
      // Reply is NUL-terminated; cut there (NOT at the first space — model
      // strings like "Antminer S19 Hydro" contain spaces).
      const text = raw.split("\u0000")[0].replace(/[\u0001-\u001F]/g, "").trim();
      try { resolve(JSON.parse(text)); } catch { resolve(null); }
    });
    socket.connect(port || 4028, host, () => socket.write(JSON.stringify({ command })));
  });
}

function num(v) { const n = Number(v); return Number.isFinite(n) ? n : 0; }
function ghsToThs(v) { return num(v) / 1000; }

// Pull a value out of an Avalon "Key[value]" token (optionally the Nth field).
function avalonToken(mm, key, index = 0) {
  const m = mm.match(new RegExp(`${key}\\[([^\\]]*)\\]`));
  if (!m) return null;
  const parts = m[1].trim().split(/\s+/).filter(Boolean);
  return parts[index] ?? parts[0] ?? null;
}

// ===========================================================================
//  Unified cgminer poller (Braiins / Avalon / Bitmain)
// ===========================================================================

async function pollCgminer(miner) {
  const host = miner.host, port = miner.port || 4028;
  const summary = await cgminer(host, port, "summary");
  const s = summary?.SUMMARY?.[0];
  if (!s) return offline(miner, "no SUMMARY");

  const version = await cgminer(host, port, "version");
  const v = version?.VERSION?.[0] || {};
  const deviceModel = v.Type || v.Miner || v.Model || "";
  const bosKey = Object.keys(v).find((k) => /bos/i.test(k));
  const firmwareVersion = bosKey ? `Braiins OS+ ${v[bosKey] || ""}`.trim()
    : /avalon/i.test(deviceModel) ? "Avalon / CGMiner"
    : /antminer|bitmain/i.test(deviceModel) ? "Bitmain"
    : (v.CGMiner || v.BMMiner ? `CGMiner ${v.CGMiner || v.BMMiner}` : "");

  const temps = (await cgminer(host, port, "temps"))?.TEMPS || [];
  const fans = (await cgminer(host, port, "fans"))?.FANS || [];
  const tuner = (await cgminer(host, port, "tunerstatus"))?.TUNERSTATUS?.[0] || {};
  const statsArr = (await cgminer(host, port, "stats"))?.STATS || [];
  const mm = statsArr.map((o) => o["MM ID0"] || o["MM ID1"] || "").find(Boolean) || "";
  const bm = statsArr.find((o) => o.temp1 != null || o.temp2_1 != null || o.temp_max != null);
  const pools = (await cgminer(host, port, "pools"))?.POOLS || [];

  // boards
  let boards = [];
  if (temps.length) {
    boards = temps.map((t, i) => ({
      index: t.ID ?? i, hashrateThs: 0,
      chipTempC: num(t.Chip ?? t["Chip temperature"]),
      boardTempC: num(t.Board ?? t["Board temperature"]),
      chipsWorking: 0, chipsTotal: 0,
    }));
  } else if (bm) {
    const chip = [1, 2, 3, 4, 5, 6].map((i) => num(bm[`temp2_${i}`])).filter(Boolean);
    const board = [1, 2, 3, 4, 5, 6].map((i) => num(bm[`temp_pcb${i}`] ?? bm[`temp${i}`])).filter(Boolean);
    const n = Math.max(chip.length, board.length);
    boards = Array.from({ length: n }, (_, i) => ({
      index: i, hashrateThs: 0, chipTempC: chip[i] || 0, boardTempC: board[i] || 0, chipsWorking: 0, chipsTotal: 0,
    }));
  } else if (avalonToken(mm, "Temp") != null) {
    const t = num(avalonToken(mm, "Temp"));
    boards = [{ index: 0, hashrateThs: 0, chipTempC: num(avalonToken(mm, "TMax")) || t, boardTempC: t, chipsWorking: 0, chipsTotal: 0 }];
  }

  const fanRpms = fans.length ? fans.map((f) => num(f.RPM ?? f.Speed)).filter(Boolean)
    : [1, 2, 3, 4].map((i) => num(avalonToken(mm, `Fan${i}`))).filter(Boolean).length
      ? [1, 2, 3, 4].map((i) => num(avalonToken(mm, `Fan${i}`))).filter(Boolean)
      : bm ? [1, 2, 3, 4, 5, 6, 7, 8].map((i) => num(bm[`fan${i}`])).filter(Boolean) : [];

  const power = num(tuner.ApproximateMinerPowerConsumption ?? tuner.PowerConsumption ?? tuner.MinerPowerConsumption ?? tuner.PowerLimit)
    || num(avalonToken(mm, "WALLPOWER")) || num(avalonToken(mm, "PS", 5)) || 0;

  const maxTemp = boards.length ? Math.max(...boards.flatMap((b) => [b.chipTempC, b.boardTempC]))
    : num(avalonToken(mm, "TMax")) || num(bm?.temp_max) || 0;

  const hydro = miner.cooling === "hydro" ? cgminerHydro(temps, mm) : null;

  return normalize(miner, {
    hashrateThs: ghsToThs(s["GHS 5s"] ?? s["MHS 5s"]),
    avgHashrateThs: ghsToThs(s["GHS av"] ?? s["MHS av"]),
    powerW: power, maxTempC: maxTemp, boards, fanRpms, hydro,
    pools: pools.map(mapCgminerPool),
    uptimeSeconds: num(s.Elapsed),
    model: miner.model || deviceModel, firmwareVersion,
  });
}

function cgminerHydro(temps, mm) {
  const avIn = avalonToken(mm, "ITemp") ?? avalonToken(mm, "WaterIn");
  if (avIn != null) {
    return {
      inletTempC: num(avIn),
      outletTempC: num(avalonToken(mm, "OTemp") ?? avalonToken(mm, "WaterOut") ?? avIn),
      flowLpm: num(avalonToken(mm, "Flow")), pumpRpm: num(avalonToken(mm, "Pump")),
    };
  }
  const pick = (...keys) => { for (const t of temps) for (const k of keys) if (t[k] != null) return num(t[k]); return null; };
  const bIn = pick("Water in", "Inlet", "WaterIn", "Coolant in");
  if (bIn == null) return null;
  return { inletTempC: bIn, outletTempC: pick("Water out", "Outlet", "WaterOut", "Coolant out") ?? bIn, flowLpm: pick("Flow", "FlowRate") ?? 0, pumpRpm: 0 };
}

// ===========================================================================
//  VNish poller
// ===========================================================================

const vnishTokens = new Map();
async function vnishToken(miner) {
  if (vnishTokens.has(miner.host)) return vnishTokens.get(miner.host);
  if (!miner.password) return null;
  try {
    const r = await fetch(`http://${miner.host}:${miner.port || 80}/api/v1/unlock`, {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ pw: miner.password }),
    });
    const j = await r.json();
    const t = j.token || j.access_token || null;
    if (t) vnishTokens.set(miner.host, t);
    return t;
  } catch { return null; }
}

async function pollVnish(miner) {
  const base = `http://${miner.host}:${miner.port || 80}/api/v1`;
  const token = await vnishToken(miner);
  let body;
  try {
    const r = await fetch(`${base}/summary`, { headers: token ? { authorization: `Bearer ${token}` } : {} });
    body = await r.json();
  } catch (e) { return offline(miner, e.message); }
  const m = body.miner || body;
  const chains = m.chains || [];
  const boards = chains.map((c, i) => ({
    index: c.id ?? i, hashrateThs: ghsToThs(c.hashrate_rt ?? c.hr_realtime),
    chipTempC: num(c.temp_chip ?? c.temp_max ?? c.chip_temp), boardTempC: num(c.temp_pcb ?? c.pcb_temp ?? c.temp),
    chipsWorking: num(c.chips_alive), chipsTotal: num(c.chip_count),
  }));
  const hashrate = ghsToThs(m.instant_hashrate ?? m.hr_realtime ?? m.hashrate_rt);
  const fansSrc = (m.fans && m.fans.length ? m.fans : m.cooling?.fans) || [];
  return normalize(miner, {
    hashrateThs: hashrate, avgHashrateThs: ghsToThs(m.average_hashrate ?? m.hr_average ?? hashrate * 1000),
    powerW: num(m.power_usage ?? m.power_consumption ?? m.power), boards,
    fanRpms: fansSrc.map((f) => num(f.rpm ?? f.speed)).filter(Boolean),
    hydro: miner.cooling === "hydro" ? vnishHydro(m.cooling || m.hydro) : null,
    pools: (m.pools || []).map((p) => ({ url: p.url || "", user: p.user || p.worker || "", status: p.status || p.state || "", accepted: num(p.accepted), rejected: num(p.rejected) })),
    uptimeSeconds: num(m.uptime ?? m.elapsed), model: m.miner_type || m.model || miner.model || "", firmwareVersion: m.fw_version || m.version || "VNish",
  });
}

function vnishHydro(c) {
  if (!c) return null;
  const inlet = c.water_in ?? c.inlet_temp ?? c.temp_in;
  if (inlet == null) return null;
  return { inletTempC: num(inlet), outletTempC: num(c.water_out ?? c.outlet_temp ?? c.temp_out ?? inlet), flowLpm: num(c.flow ?? c.flow_rate ?? c.water_flow), pumpRpm: num(c.pump_rpm ?? c.pump) };
}

// ===========================================================================
//  normalization
// ===========================================================================

function mapCgminerPool(p) {
  return { url: p.URL || "", user: p.User || "", status: p.Status || "", accepted: num(p.Accepted), rejected: num(p.Rejected) };
}
function offline(miner, message) {
  return { state: "OFFLINE", hashrateThs: 0, avgHashrateThs: 0, powerW: 0, efficiencyJTh: 0, maxTempC: 0, boards: [], fanRpms: [], hydro: null, pools: [], uptimeSeconds: 0, model: miner.model || "", firmwareVersion: "", errorMessage: message };
}
function normalize(miner, p) {
  const hr = p.hashrateThs || 0;
  const maxTemp = p.maxTempC ?? 0;
  return {
    state: hr > 0 ? (maxTemp > 88 ? "WARNING" : "ONLINE") : "WARNING",
    hashrateThs: hr, avgHashrateThs: p.avgHashrateThs || hr, powerW: p.powerW || 0,
    efficiencyJTh: hr > 0 ? (p.powerW || 0) / hr : 0, maxTempC: maxTemp,
    boards: p.boards || [], fanRpms: p.fanRpms || [], hydro: p.hydro || null, pools: p.pools || [],
    uptimeSeconds: p.uptimeSeconds || 0, model: p.model || miner.model || "", firmwareVersion: p.firmwareVersion || "",
  };
}
function pollOne(miner) {
  return (miner.firmware || "").toUpperCase() === "VNISH" ? pollVnish(miner) : pollCgminer(miner);
}

// ===========================================================================
//  LAN auto-discovery
// ===========================================================================

function localSubnets() {
  const out = [];
  for (const ifaces of Object.values(os.networkInterfaces())) {
    for (const i of ifaces || []) {
      if (i.family === "IPv4" && !i.internal) out.push(i.address.split(".").slice(0, 3).join(".") + ".0/24");
    }
  }
  return [...new Set(out)];
}

function expandCidr(cidr) {
  const [ip, prefixStr] = String(cidr).trim().split("/");
  const prefix = Number(prefixStr);
  const o = ip.split(".").map(Number);
  if (o.length !== 4 || !(prefix >= 8 && prefix <= 32)) return [];
  const base = ((o[0] << 24) >>> 0) + (o[1] << 16) + (o[2] << 8) + o[3];
  const hostBits = 32 - prefix;
  const count = 2 ** hostBits;
  if (count - 2 > 1024) return [];
  const network = (base & (0xffffffff << hostBits)) >>> 0;
  const first = hostBits >= 1 ? network + 1 : network;
  const last = hostBits >= 1 ? network + count - 2 : network;
  const hosts = [];
  for (let a = first; a <= last; a++) hosts.push(`${(a >>> 24) & 255}.${(a >>> 16) & 255}.${(a >>> 8) & 255}.${a & 255}`);
  return hosts;
}

function tcpOpen(host, port, timeout = 500) {
  return new Promise((resolve) => {
    const s = new net.Socket();
    let done = false;
    const fin = (v) => { if (!done) { done = true; try { s.destroy(); } catch {} resolve(v); } };
    s.setTimeout(timeout);
    s.on("connect", () => fin(true));
    s.on("timeout", () => fin(false));
    s.on("error", () => fin(false));
    s.connect(port, host);
  });
}

async function probeHost(host) {
  if (await tcpOpen(host, 4028)) {
    const version = await cgminer(host, 4028, "version", 3000);
    const v = version?.VERSION?.[0] || {};
    let type = v.Type || v.Miner || v.Model || "";
    const bos = Object.keys(v).some((k) => /bos/i.test(k));
    const t = type.toLowerCase();
    const firmware = bos || /braiins/.test(t) ? "BRAIINS"
      : /avalon/.test(t) ? "AVALON"
      : /antminer|bitmain/.test(t) ? "BITMAIN" : "BRAIINS";
    if (!type) {
      const stats = await cgminer(host, 4028, "stats", 3000);
      const mmStr = JSON.stringify(stats || {});
      type = (mmStr.match(/Antminer\s?[A-Z0-9+ ]+|Avalon[A-Za-z0-9]+/) || [""])[0].trim();
    }
    return { host, port: 4028, firmware, model: type, cooling: /hydro/i.test(type) ? "hydro" : "air" };
  }
  if (await tcpOpen(host, 80)) {
    try {
      const r = await fetch(`http://${host}/api/v1/summary`, { signal: AbortSignal.timeout(2500) });
      const body = await r.json();
      const m = body.miner || body;
      const looksVnish = body.miner || m.miner_type || m.instant_hashrate != null || m.chains != null || m.hr_realtime != null;
      if (looksVnish) {
        const model = m.miner_type || m.model || "";
        return { host, port: 80, firmware: "VNISH", model, cooling: /hydro/i.test(model) ? "hydro" : "air" };
      }
    } catch { /* not a vnish miner */ }
  }
  return null;
}

async function refreshDiscovery() {
  if (!DISCOVER) return;
  const subnets = (config.subnets && config.subnets.length) ? config.subnets : localSubnets();
  const hosts = subnets.flatMap(expandCidr);
  const queue = [...hosts];
  const found = [];
  const workers = Array.from({ length: 32 }, async () => {
    while (queue.length) {
      const host = queue.pop();
      const m = await probeHost(host).catch(() => null);
      if (m) found.push({ id: `auto-${m.host}`, name: `${m.model || m.firmware} @ ${m.host}`, group: "Discovered", ...m });
    }
  });
  await Promise.all(workers);
  discovered = found.sort((a, b) => a.host.localeCompare(b.host));
  console.log(`Discovery: ${discovered.length} miner(s) found on ${subnets.join(", ")}`);
}

/** Configured miners win over discovered ones with the same host. */
function minerList() {
  const explicit = config.miners || [];
  const explicitHosts = new Set(explicit.map((m) => m.host));
  return [...explicit, ...discovered.filter((d) => !explicitHosts.has(d.host))];
}

async function pollAll() {
  await Promise.all(minerList().map(async (miner) => {
    try { cache.set(miner.id, await pollOne(miner)); }
    catch (e) { cache.set(miner.id, offline(miner, e.message)); }
  }));
}

// ===========================================================================
//  actions
// ===========================================================================

async function reboot(miner) {
  if ((miner.firmware || "").toUpperCase() === "VNISH") {
    const token = await vnishToken(miner);
    await fetch(`http://${miner.host}:${miner.port || 80}/api/v1/system/reboot`, { method: "POST", headers: token ? { authorization: `Bearer ${token}` } : {} });
  } else {
    await cgminer(miner.host, miner.port || 4028, "restart");
  }
}
async function locate(miner) {
  if ((miner.firmware || "").toUpperCase() === "VNISH") {
    const token = await vnishToken(miner);
    await fetch(`http://${miner.host}:${miner.port || 80}/api/v1/find-miner`, { method: "POST", headers: token ? { authorization: `Bearer ${token}` } : {} });
  }
}

function statusPage() {
  const rows = minerList().map((m) => {
    const s = cache.get(m.id);
    return `<tr><td>${m.name}</td><td>${m.firmware}</td><td>${m.host}</td><td>${s ? s.state : "—"}</td><td>${s ? s.hashrateThs.toFixed(1) : "—"} TH/s</td></tr>`;
  }).join("");
  const banner = QUICK_TUNNEL
    ? (publicUrl
        ? `<div class="box"><b>Your public address (paste into the app → Gateway URL):</b><br><a href="${publicUrl}">${publicUrl}</a></div>`
        : `<div class="box">Setting up your free tunnel… refresh in a few seconds.</div>`)
    : "";
  return `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="refresh" content="15"><title>WLM Gateway</title>
<style>body{font-family:system-ui,Segoe UI,sans-serif;background:#0a0d12;color:#e7ecf3;margin:0;padding:32px}
h1{color:#f7931a}a{color:#f7931a}table{border-collapse:collapse;width:100%;max-width:760px}td,th{border-bottom:1px solid #2a3442;padding:8px 12px;text-align:left}small{color:#8c97a8}
.box{background:#121822;border:1px solid #2a3442;border-radius:10px;padding:14px 16px;margin:14px 0;max-width:760px;word-break:break-all}</style></head><body>
<h1>WLM Gateway</h1><small>${minerList().length} miner(s) · poll ${POLL_MS / 1000}s · discovery ${DISCOVER ? `every ${DISCOVERY_MS / 1000}s` : "off"} · API /api/v1/fleet</small>
${banner}
<table><tr><th>Name</th><th>Firmware</th><th>Host</th><th>State</th><th>Hashrate</th></tr>${rows}</table></body></html>`;
}

// ===========================================================================
//  Free instant tunnel (Cloudflare quick tunnel — no account/token needed)
// ===========================================================================

function startQuickTunnel(port) {
  const exe = process.platform === "win32" ? "cloudflared.exe" : "cloudflared";
  const local = join(here, exe);
  const bin = existsSync(local) ? local : exe; // bundled next to server.js, else PATH
  let proc;
  try {
    proc = spawn(bin, ["tunnel", "--no-autoupdate", "--url", `http://localhost:${port}`], { windowsHide: true });
  } catch (e) {
    console.error("Could not start cloudflared:", e.message);
    return;
  }
  const scan = (buf) => {
    const m = buf.toString().match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/i);
    if (m && publicUrl !== m[0]) { publicUrl = m[0]; console.log("Public tunnel URL:", publicUrl); }
  };
  proc.stdout?.on("data", scan);
  proc.stderr?.on("data", scan); // cloudflared prints the URL to stderr
  proc.on("error", (e) => console.error("cloudflared error:", e.message));
  proc.on("exit", (code) => {
    console.log(`cloudflared exited (${code}); restarting in 3s`);
    publicUrl = null;
    setTimeout(() => startQuickTunnel(port), 3000);
  });
}

// ===========================================================================
//  HTTP server
// ===========================================================================

function authed(req, url) {
  if (!config.token) return true;
  const h = req.headers["authorization"] || "";
  if (h === `Bearer ${config.token}`) return true;
  if (req.headers["cf-access-jwt-assertion"] != null) return true;
  if (url && url.searchParams.get("token") === config.token) return true;
  return false;
}
function send(res, code, obj) {
  res.writeHead(code, { "content-type": "application/json" });
  res.end(JSON.stringify(obj));
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, "http://localhost");
  if (url.pathname === "/healthz") return send(res, 200, { ok: true, miners: minerList().length, discovered: discovered.length });
  if (url.pathname === "/api/v1/tunnel") return send(res, 200, { url: publicUrl, quickTunnel: QUICK_TUNNEL });
  if (url.pathname === "/" || url.pathname === "") { res.writeHead(200, { "content-type": "text/html; charset=utf-8" }); return res.end(statusPage()); }
  if (!authed(req, url)) return send(res, 401, { error: "unauthorized" });

  if (req.method === "GET" && url.pathname === "/api/v1/raw") {
    const host = url.searchParams.get("host");
    if (!host) return send(res, 400, { error: "host query param required" });
    const data = await cgminer(host, Number(url.searchParams.get("port") || 4028), url.searchParams.get("cmd") || "stats");
    return send(res, 200, { host, cmd: url.searchParams.get("cmd") || "stats", data });
  }
  if (req.method === "GET" && url.pathname === "/api/v1/fleet") {
    return send(res, 200, {
      miners: minerList().map((m) => ({
        id: m.id, name: m.name, host: m.host, model: m.model || "", firmware: m.firmware,
        cooling: m.cooling || "air", group: m.group || "Default", stats: cache.get(m.id) || offline(m, "not polled yet"),
      })),
    });
  }
  const reb = url.pathname.match(/^\/api\/v1\/miners\/([^/]+)\/reboot$/);
  if (req.method === "POST" && reb) {
    const miner = minerList().find((m) => m.id === reb[1]);
    if (!miner) return send(res, 404, { error: "no such miner" });
    try { await reboot(miner); return send(res, 200, { ok: true }); } catch (e) { return send(res, 502, { error: e.message }); }
  }
  const loc = url.pathname.match(/^\/api\/v1\/miners\/([^/]+)\/locate$/);
  if (req.method === "POST" && loc) {
    const miner = minerList().find((m) => m.id === loc[1]);
    if (!miner) return send(res, 404, { error: "no such miner" });
    try { await locate(miner); return send(res, 200, { ok: true }); } catch (e) { return send(res, 502, { error: e.message }); }
  }
  send(res, 404, { error: "not found" });
});

(async () => {
  const port = config.listenPort || 8787;
  if (QUICK_TUNNEL) startQuickTunnel(port);
  await refreshDiscovery();
  if (DISCOVER) setInterval(refreshDiscovery, DISCOVERY_MS);
  await pollAll();
  setInterval(pollAll, POLL_MS);
  server.listen(port, () => {
    console.log(`WLM gateway on :${port} — ${minerList().length} miner(s), polling every ${POLL_MS / 1000}s`);
  });
})();
