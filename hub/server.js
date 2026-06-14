// WLM Hub — central relay (Braiins-Manager-style)
//
// Runs once, centrally (an always-on PC at the office, exposed via ONE tunnel
// or port-forward). Site agents dial OUT to it and push their fleet; the web
// dashboard and the Android app read everything from it. No per-site tunnels.
//
//   Agent  ── POST /api/agent/report {siteKey,...} ──▶  Hub   (reply carries queued commands)
//   Web/App ── GET /api/v1/fleet  (operator token) ──▶  Hub
//
// Zero npm dependencies — Node 18+ only.

import http from "node:http";
import { spawn } from "node:child_process";
import { readFileSync, existsSync, writeFileSync } from "node:fs";
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

const PORT = config.listenPort || 8900;
const OPERATOR_TOKEN = config.operatorToken || "";
const SITE_KEYS = config.siteKeys || {};          // { "<key>": "Default name" }
const ACCEPT_ANY = config.acceptAnySite === true; // off by default — unknown keys go to Pending
const OFFLINE_AFTER_MS = (config.offlineAfterSec || 60) * 1000;
const SEP = "::";

// siteKey -> { key, name, lastReportMs, miners: [...] }
const sites = new Map();
// siteKey -> [ {type, minerId} ]
const commands = new Map();
// approved site keys (config keys are pre-approved); persisted across restarts
const approved = new Set(Object.keys(SITE_KEYS));
// unknown keys awaiting operator approval: key -> { key, name, firstSeen, lastSeen }
const pending = new Map();
let publicUrl = null;

// --- helpers --------------------------------------------------------------

function send(res, code, obj) {
  res.writeHead(code, { "content-type": "application/json" });
  res.end(JSON.stringify(obj));
}
function readBody(req) {
  return new Promise((resolve) => {
    let b = "";
    req.on("data", (d) => { b += d; if (b.length > 5e6) req.destroy(); });
    req.on("end", () => { try { resolve(JSON.parse(b || "{}")); } catch { resolve(null); } });
    req.on("error", () => resolve(null));
  });
}
function operatorOk(req, url) {
  if (!OPERATOR_TOKEN) return true;
  const h = req.headers["authorization"] || "";
  return h === `Bearer ${OPERATOR_TOKEN}` || url.searchParams.get("token") === OPERATOR_TOKEN;
}
function siteOnline(s) { return Date.now() - s.lastReportMs < OFFLINE_AFTER_MS; }

/** Flatten every site's miners into one list with globally-unique ids + site group. */
function aggregateFleet() {
  const out = [];
  for (const s of sites.values()) {
    const online = siteOnline(s);
    for (const m of s.miners) {
      const stats = online ? m.stats : { ...(m.stats || {}), state: "OFFLINE" };
      out.push({ ...m, id: `${s.key}${SEP}${m.id}`, group: s.name, site: s.name, stats });
    }
    if (s.miners.length === 0) {
      out.push({
        id: `${s.key}${SEP}-site`, name: s.name, host: "", model: "", firmware: "",
        cooling: "air", group: s.name, site: s.name,
        stats: { state: online ? "WARNING" : "OFFLINE", hashrateThs: 0, powerW: 0, maxTempC: 0, boards: [], fanRpms: [], hydro: null, pools: [], errorMessage: online ? "no miners discovered yet" : "site offline" },
      });
    }
  }
  return out;
}

function persist() {
  try {
    writeFileSync(join(here, "state.json"), JSON.stringify({ sites: [...sites.values()], approved: [...approved] }));
  } catch { /* best effort */ }
}
function restore() {
  try {
    const raw = JSON.parse(readFileSync(join(here, "state.json"), "utf8"));
    const list = Array.isArray(raw) ? raw : (raw.sites || []);   // tolerate old format
    for (const s of list) sites.set(s.key, s);
    for (const k of (raw.approved || list.map((s) => s.key))) approved.add(k);
    console.log(`Restored ${sites.size} site(s), ${approved.size} approved key(s)`);
  } catch { /* none */ }
}

// --- single public route for the Hub itself (premises hosting) ------------

function startTunnel() {
  const bin = process.platform === "win32" ? join(here, "cloudflared.exe") : join(here, "cloudflared");
  const exe = existsSync(bin) ? bin : "cloudflared";
  const args = config.tunnelToken
    ? ["tunnel", "run", "--token", config.tunnelToken]
    : ["tunnel", "--no-autoupdate", "--url", `http://localhost:${PORT}`];
  if (config.tunnelToken && config.publicUrl) publicUrl = config.publicUrl;
  let proc;
  try { proc = spawn(exe, args, { windowsHide: true }); } catch (e) { console.error("cloudflared:", e.message); return; }
  const scan = (b) => { const m = b.toString().match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/i); if (m) { publicUrl = m[0]; console.log("Hub public URL:", publicUrl); } };
  proc.stdout?.on("data", scan); proc.stderr?.on("data", scan);
  proc.on("error", (e) => console.error("cloudflared:", e.message));
  proc.on("exit", () => { if (!config.tunnelToken) publicUrl = null; setTimeout(startTunnel, 5000); });
}

// --- HTTP server ----------------------------------------------------------

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, "http://localhost");
  const p = url.pathname;

  if (p === "/healthz") return send(res, 200, { ok: true, sites: sites.size });

  // ----- Agent push (auth = site key in body) -----
  if (req.method === "POST" && p === "/api/agent/report") {
    const body = await readBody(req);
    const key = body?.siteKey;
    if (!key) return send(res, 400, { error: "siteKey required" });
    const name = body.siteName || SITE_KEYS[key] || key;
    // Unknown key → hold for operator approval, don't admit into the fleet.
    if (!ACCEPT_ANY && !approved.has(key)) {
      const prev = pending.get(key);
      pending.set(key, { key, name, firstSeen: prev?.firstSeen || Date.now(), lastSeen: Date.now() });
      return send(res, 202, { pending: true });
    }
    sites.set(key, { key, name, lastReportMs: Date.now(), miners: Array.isArray(body.miners) ? body.miners : [] });
    persist();
    const queued = commands.get(key) || [];
    commands.set(key, []);
    return send(res, 200, { ok: true, commands: queued });
  }

  // ----- Client API (auth = operator token) -----
  if (p === "/" || p === "") { res.writeHead(200, { "content-type": "text/html; charset=utf-8" }); return res.end(dashboardHtml()); }
  if (!operatorOk(req, url)) return send(res, 401, { error: "unauthorized" });

  if (req.method === "GET" && p === "/api/v1/tunnel") return send(res, 200, { url: publicUrl });

  if (req.method === "GET" && (p === "/api/v1/fleet")) {
    return send(res, 200, { miners: aggregateFleet() });
  }
  if (req.method === "GET" && p === "/api/v1/sites") {
    return send(res, 200, {
      sites: [...sites.values()].map((s) => ({
        id: s.key, name: s.name, online: siteOnline(s), miners: s.miners.length,
        lastSeen: s.lastReportMs,
      })),
    });
  }

  // ----- Pending site approvals -----
  if (req.method === "GET" && p === "/api/v1/pending") {
    return send(res, 200, { pending: [...pending.values()] });
  }
  const appr = p.match(/^\/api\/v1\/pending\/(.+)\/(approve|reject)$/);
  if (req.method === "POST" && appr) {
    const key = decodeURIComponent(appr[1]);
    if (appr[2] === "approve") { approved.add(key); persist(); }
    pending.delete(key);
    return send(res, 200, { ok: true });
  }

  // Command routing: /api/v1/miners/<siteKey::minerId>/reboot|locate
  const cmd = p.match(/^\/api\/v1\/miners\/(.+)\/(reboot|locate)$/);
  if (req.method === "POST" && cmd) {
    const full = decodeURIComponent(cmd[1]);
    const i = full.indexOf(SEP);
    if (i < 0) return send(res, 400, { error: "bad miner id" });
    const key = full.slice(0, i), minerId = full.slice(i + SEP.length);
    if (!sites.has(key)) return send(res, 404, { error: "no such site" });
    const q = commands.get(key) || [];
    q.push({ type: cmd[2], minerId });
    commands.set(key, q);
    return send(res, 200, { ok: true, queued: true });
  }

  send(res, 404, { error: "not found" });
});

function dashboardHtml() {
  return `<!doctype html><html><head><meta charset="utf-8"><title>WLM Hub</title>
<style>:root{--bg:#0a0d12;--surf:#121822;--line:#2a3442;--fg:#e7ecf3;--mut:#8c97a8;--orange:#f7931a;--good:#34d399;--warn:#fbbf24;--bad:#f87171}
*{box-sizing:border-box}body{font-family:system-ui,'Segoe UI',sans-serif;background:var(--bg);color:var(--fg);margin:0;padding:24px 28px}
h1{color:var(--orange);margin:0 0 4px}a{color:var(--orange)}.tok{margin:14px 0}input{background:var(--surf);border:1px solid var(--line);color:var(--fg);border-radius:8px;padding:8px 10px;width:340px;max-width:70vw}
.site{background:var(--surf);border:1px solid var(--line);border-radius:14px;padding:14px 16px;margin:12px 0}
.site h2{margin:0 0 8px;font-size:17px}.dot{display:inline-block;width:8px;height:8px;border-radius:99px;margin-right:6px}
table{border-collapse:collapse;width:100%}td,th{border-bottom:1px solid var(--line);padding:7px 10px;text-align:left;font-size:13px}th{color:var(--mut);font-size:11px;text-transform:uppercase}
.pill{padding:2px 8px;border-radius:99px;font-size:11px}.ONLINE{background:rgba(52,211,153,.13);color:var(--good)}.WARNING{background:rgba(251,191,36,.13);color:var(--warn)}.OFFLINE,.ERROR{background:rgba(248,113,113,.13);color:var(--bad)}
.mono{font-family:ui-monospace,Consolas,monospace}button{background:var(--orange);color:#1a1206;border:0;border-radius:7px;padding:4px 10px;font-weight:600;cursor:pointer}</style></head><body>
<h1>⛏ WLM Hub</h1><small style="color:var(--mut)">All client sites · <span id="meta">…</span></small>
<div class="tok">Operator token: <input id="tok" type="password" placeholder="paste token"> <button onclick="save()">Save</button></div>
<div id="pending"></div>
<div id="sites"></div>
<script>
let T=localStorage.getItem('wlm_tok')||'';document.getElementById('tok').value=T;
function save(){T=document.getElementById('tok').value.trim();localStorage.setItem('wlm_tok',T);refresh();}
function hdr(){return T?{authorization:'Bearer '+T}:{}}
async function approve(key,act){await fetch('/api/v1/pending/'+encodeURIComponent(key)+'/'+act,{method:'POST',headers:hdr()});refresh();}
async function pend(){try{const r=await fetch('/api/v1/pending',{headers:hdr()});if(!r.ok)return;const d=await r.json();const ps=d.pending||[];
 document.getElementById('pending').innerHTML=ps.length?('<div class="site" style="border-color:#fbbf24"><h2 style="color:#fbbf24">Pending approval ('+ps.length+')</h2>'+
 ps.map(p=>'<div style="display:flex;justify-content:space-between;align-items:center;padding:4px 0"><span>'+p.name+' <small style="color:#8c97a8" class=mono>'+p.key.slice(0,8)+'…</small></span><span><button onclick="approve(\\''+p.key+'\\',\\'approve\\')">Approve</button> <button style="background:#f87171" onclick="approve(\\''+p.key+'\\',\\'reject\\')">Reject</button></span></div>').join('')+'</div>'):'';
 }catch(e){}}
async function refresh(){
 pend();
 try{const r=await fetch('/api/v1/fleet',{headers:hdr()});if(r.status==401){document.getElementById('meta').textContent='enter operator token';return;}
 const f=await r.json();const ms=f.miners||[];const by={};ms.forEach(m=>{(by[m.site]=by[m.site]||[]).push(m)});
 document.getElementById('meta').textContent=Object.keys(by).length+' sites · '+ms.length+' miners · '+new Date().toLocaleTimeString();
 document.getElementById('sites').innerHTML=Object.entries(by).map(([site,list])=>{
  const on=list.filter(m=>m.stats&&(m.stats.state=='ONLINE'||m.stats.state=='WARNING'));
  const hash=on.reduce((a,m)=>a+(m.stats.hashrateThs||0),0),pow=on.reduce((a,m)=>a+(m.stats.powerW||0),0);
  const up=list.some(m=>m.stats&&m.stats.state!='OFFLINE');
  return '<div class="site"><h2><span class="dot" style="background:'+(up?'#34d399':'#f87171')+'"></span>'+site+
   ' <small style="color:#8c97a8">'+hash.toFixed(1)+' TH/s · '+(pow/1000).toFixed(1)+' kW · '+on.length+'/'+list.length+' online</small></h2>'+
   '<table><tr><th>Miner</th><th>Firmware</th><th>IP</th><th>State</th><th>TH/s</th><th>Temp</th><th>Water</th><th></th></tr>'+
   list.map(m=>{const s=m.stats||{};const w=s.hydro?(s.hydro.inletTempC.toFixed(0)+'→'+s.hydro.outletTempC.toFixed(0)):'—';
   return '<tr><td>'+(m.model||m.name)+'</td><td><small>'+(s.firmwareVersion||m.firmware||'')+'</small></td><td class=mono>'+(m.host||'')+'</td><td><span class="pill '+(s.state||'OFFLINE')+'">'+(s.state||'OFFLINE')+'</span></td><td class=mono>'+(s.hashrateThs||0).toFixed(1)+'</td><td class=mono>'+(s.maxTempC||0).toFixed(0)+'°</td><td class=mono>'+w+'</td><td><button onclick="rb(\\''+m.id+'\\',\\''+(m.name||m.host)+'\\')">Reboot</button></td></tr>';}).join('')+'</table></div>';
 }).join('')||'<p style="color:#8c97a8">No sites have reported yet. Install a Site Agent and point it here.</p>';
 }catch(e){document.getElementById('meta').textContent='error';}
}
async function rb(id,name){if(!confirm('Reboot '+name+'?'))return;await fetch('/api/v1/miners/'+encodeURIComponent(id)+'/reboot',{method:'POST',headers:hdr()});}
refresh();setInterval(refresh,10000);
</script></body></html>`;
}

restore();
if (config.tunnel !== false) startTunnel();
server.listen(PORT, () => console.log(`WLM Hub on :${PORT} — operator token ${OPERATOR_TOKEN ? "set" : "OPEN (set one!)"}, ${ACCEPT_ANY ? "accepting any site key" : approved.size + " approved key(s), unknown → pending"}`));
