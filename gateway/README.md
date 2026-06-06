# WLM Gateway

The site-side aggregator for **WLM ASIC Manager**. It runs on a small always-on
machine on the same LAN as your miners (a Raspberry Pi, mini-PC, or the box that
already runs your Miner Manager), polls every miner's firmware, and serves a
single normalized API. Published through a **Cloudflare tunnel**, it lets the
Android app reach the whole fleet from anywhere without port-forwarding.

```
Android app  ──HTTPS──▶  Cloudflare tunnel  ──▶  this gateway  ──LAN──▶  miners
```

Zero npm dependencies — Node.js 18+ only.

## Run

```bash
cp config.example.json config.json   # then edit it
npm start                             # or: node server.js
```

Set a long random `token` in `config.json` and the same value in the app
(**Settings → Connectivity → Access token**).

## API

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/v1/fleet` | All miners + latest normalized stats |
| POST | `/api/v1/miners/:id/reboot` | Reboot / restart a miner |
| POST | `/api/v1/miners/:id/locate` | Toggle locator (best-effort) |
| GET | `/healthz` | Liveness (no auth) |

Auth: `Authorization: Bearer <token>`. If you front the tunnel with
**Cloudflare Access**, the `Cf-Access-Jwt-Assertion` header is also accepted.

## Expose with Cloudflare Tunnel

```bash
cloudflared tunnel create wlm
# route a hostname to this gateway:
cloudflared tunnel route dns wlm miners.welovemining.co.za
```

`~/.cloudflared/config.yml`:

```yaml
tunnel: wlm
credentials-file: /root/.cloudflared/<tunnel-id>.json
ingress:
  - hostname: miners.welovemining.co.za
    service: http://localhost:8787
  - service: http_status:404
```

```bash
cloudflared tunnel run wlm
```

Then in the app set **Gateway URL** to `https://miners.welovemining.co.za` and
your token. With **Connection mode = Auto**, the app uses direct LAN APIs when
you're on-site and falls back to this gateway when you're away.

## Supported firmware

Braiins OS+ and Avalon/Bitmain via the cgminer socket (port 4028); VNish via its
HTTP API (port 80, `password` in config for authed endpoints). This is a
reference implementation — verify the field mappings against your hardware and
extend `pollOne()` for LuxOS / Hiveon / Whatsminer as needed.
