# WLM Gateway

The one program you install at each mining site. It runs on an always-on Windows
PC on the same network as the miners, **auto-discovers** them (Braiins OS+
first-class, plus Bitmain stock, Avalon and VNish), shows a live dashboard, and
creates a **public address** so the WLM ASIC Manager app can reach the site from
anywhere.

```
miners ◀─LAN─ WLM Gateway ─tunnel─▶ WLM ASIC Manager app
```

Two pieces, that's it: **this Gateway** + **the app**. No separate hub or server.

## Install (Windows)

Download **`WLM-Gateway-Setup.exe`** from the `gateway-latest` release and run
it. Type a **site name** (and, optionally, a Cloudflare connection code for a
permanent custom address). Finish.

Open the dashboard (Start menu → **WLM Gateway**, or `http://localhost:8787`).
At the top it shows the **App address** and **App token** — paste both into the
app under **Settings → My Sites → Add site**. Done.

> The app operator adds every client's gateway (each has its own address +
> token) to see all sites; a client adds just their own.

## Other OS

`WLM-Gateway-source.zip` (or this folder): `cp config.example.json config.json`,
set a `token`, then `node server.js` (Node 18+).

## config.json

| Field | Meaning |
|---|---|
| `token` | App access token (the app must send this) |
| `quickTunnel` | `true` = free auto address; `false` = use `tunnelToken` |
| `tunnelToken` | Cloudflare connection code for a permanent custom address |
| `discover` | Auto-scan the LAN for miners (default true) |
| `subnets` | Optional explicit CIDRs; empty = auto-detect |
| `miners` | Optional manual miner list |

> Diagnostics: `http://localhost:8787/api/v1/raw?host=<miner-ip>&cmd=stats`
> dumps a miner's raw cgminer reply — handy for mapping firmware fields.
