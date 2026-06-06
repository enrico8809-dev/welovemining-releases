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

## Run (Windows — recommended)

This is designed to run as a **Windows service** on an always-on PC at the site.

1. Install **Node.js 18+** from <https://nodejs.org> (LTS).
2. Copy `config.example.json` → `config.json` and edit it (miners, and a long
   random `token`).
3. Quick test: double-click **`windows\run.bat`** (foreground). Browse to
   <http://localhost:8787> — you should see a status page listing your miners.
4. Install as an auto-starting service (so it survives reboots). In an
   **Administrator** PowerShell:
   ```powershell
   cd gateway\windows
   npm install            # pulls node-windows (service wrapper only)
   node install-service.js
   ```
   A service named **“WLM Gateway”** now runs on boot (manage it in
   `services.msc`). Remove it later with `node uninstall-service.js`.

Set the same `token` in the app: **Settings → Connectivity → Access token**.

> macOS/Linux: same `config.json`, just `node server.js` (or a systemd unit).

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
