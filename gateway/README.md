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
At the top it shows the **App address** and two tokens:
- **Full token** — view *and* control (reboot/locate). Keep this for yourself.
- **View-only token** — view only; reboot/locate are rejected. Hand this to a
  client so they can watch but not change anything.

Paste the address + a token into the app under **Settings → My Sites → Add site**
(tick *View only* when using a view token).

> **Seeing all sites / permissions:** you (operator) add every client's gateway
> with its **full** token → you see and control everything. To let a client see
> only certain sites, give them the **address + view-only token** for just those
> sites. The token *is* the permission — no accounts or central server needed.

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
