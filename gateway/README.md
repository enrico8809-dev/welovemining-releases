# WLM Site Agent

Runs on an always-on Windows PC at a client mining site. It auto-discovers the
ASIC miners on the LAN (Braiins OS+ first-class, plus Bitmain stock, Avalon and
VNish) and **dials out** to your central **WLM Hub** — nothing to open on the
firewall, no Cloudflare at the site. A local dashboard is also served at
`http://localhost:8787` for on-site staff.

```
miners ◀─LAN─ WLM Site Agent ─outbound HTTPS─▶ WLM Hub ─▶ web dashboard + app
```

## Install (Windows)

Download **`WLM-SiteAgent-Setup.exe`** from the `gateway-latest` release and run
it. The wizard asks only for:
- **Site name** — how this site shows in the app/Hub.
- **Hub address** — e.g. `https://manage.welovemining.co.za`.

It installs as the **WLM Site Agent** service, generates its own site key, and
starts reporting. The site appears in the Hub automatically.

## Other OS

`WLM-SiteAgent-source.zip` (or this folder): set `hubUrl`, `siteKey` and
`siteName` in `config.json`, then `node server.js` (Node 18+).

## config.json

| Field | Meaning |
|---|---|
| `hubUrl` | Central Hub address the agent reports to |
| `siteKey` | Unique key identifying this site to the Hub |
| `siteName` | Display name |
| `discover` | Auto-scan the LAN for miners (default true) |
| `subnets` | Optional explicit CIDRs; empty = auto-detect |
| `miners` | Optional manual miner list (host/port/firmware) |

> Diagnostics: `http://localhost:8787/api/v1/raw?host=<miner-ip>&cmd=stats`
> dumps a miner's raw cgminer reply — handy for mapping firmware fields.

The Hub (`../hub`) is installed once, centrally; see its README.
