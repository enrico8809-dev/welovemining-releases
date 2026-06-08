# WLM Gateway

The site-side aggregator for **WLM ASIC Manager**. It runs on a small always-on
machine on the same LAN as your miners (a Raspberry Pi, mini-PC, or the box that
already runs your Miner Manager), polls every miner's firmware, and serves a
single normalized API. Published through a **Cloudflare tunnel**, it lets the
Android app reach the whole fleet from anywhere without port-forwarding.

```
Android app  ──HTTPS──▶  Cloudflare tunnel  ──▶  this gateway  ──LAN──▶  miners
```

The gateway itself has **zero npm dependencies** — Node.js 18+ only.

## Easiest: one-click Windows installer (recommended)

Download **`WLM-Gateway-Setup.exe`** from the `gateway-latest` release and run it
on an always-on Windows PC on the miners' LAN. It bundles Node + cloudflared,
installs the gateway as an auto-starting service, and **auto-discovers the
miners** on the network — there's no miner list to edit.

During setup you only:
1. Paste your **Cloudflare Tunnel connector token** (optional — from the
   Cloudflare Zero Trust dashboard; leave blank to set up the tunnel later).
2. Copy the generated **app access token** into the Android app
   (Settings → Access token).

That's it — the gateway is running as a service and (if you pasted the token)
reachable at your tunnel hostname. Status page: <http://localhost:8787>.

## Manual run (any OS)

If you'd rather not use the installer (Linux/macOS, or a Pi):

1. Install **Node.js 18+**.
2. `cp config.example.json config.json` and set a long random `token`. Leave
   `discover: true` to auto-find miners (optionally set `subnets`), or list them
   explicitly under `miners`.
3. `node server.js` — or install as a service (Windows: the installer above;
   Linux: a systemd unit). Browse to <http://localhost:8787> to confirm.

Set the same `token` in the app under **Settings → Access token**.

## API

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/v1/fleet` | All miners + latest normalized stats |
| POST | `/api/v1/miners/:id/reboot` | Reboot / restart a miner |
| POST | `/api/v1/miners/:id/locate` | Toggle locator (best-effort) |
| GET | `/healthz` | Liveness (no auth) |

Auth: `Authorization: Bearer <token>`. If you front the tunnel with
**Cloudflare Access**, the `Cf-Access-Jwt-Assertion` header is also accepted.

## Expose with a Cloudflare Tunnel (Windows)

Prerequisite: your domain (e.g. `welovemining.co.za`) is on Cloudflare, and you
have a Cloudflare Zero Trust account (the free plan is fine).

**1. Create the tunnel in the dashboard** (easiest, token-based):
Zero Trust → **Networks → Tunnels → Create a tunnel** → *Cloudflared* → name it
`wlm` → add a **Public Hostname**:
- Subdomain/Domain: `miners.welovemining.co.za`
- Service: **HTTP** → `localhost:8787`

Copy the **connector token** it displays.

**2. Install the connector on the Windows box** (Administrator PowerShell):
```powershell
cd gateway\windows
powershell -ExecutionPolicy Bypass -File setup-cloudflared.ps1 -Token "<CONNECTOR_TOKEN>"
```
This downloads `cloudflared.exe` and installs it as a Windows service. Within a
few seconds the tunnel shows **HEALTHY** in the dashboard.

**3. Point the app at it:** Settings → **Gateway URL** `https://miners.welovemining.co.za`
+ your `token`. With **Connection mode = Auto**, the app talks directly to
miners on the LAN and falls back to this tunnel when you're away.

> CLI alternative (if you prefer config files): `cloudflared tunnel login`,
> `cloudflared tunnel create wlm`, route DNS, and run with an `ingress` mapping
> `miners.welovemining.co.za → http://localhost:8787`.

## Supported firmware

Braiins OS+ and Avalon/Bitmain via the cgminer socket (port 4028); VNish via its
HTTP API (port 80, `password` in config for authed endpoints). This is a
reference implementation — verify the field mappings against your hardware and
extend `pollOne()` for LuxOS / Hiveon / Whatsminer as needed.
