<p align="center">
  <img src="docs/logo.png" alt="WeLoveMining" width="120" />
</p>

# WLM ASIC Manager

Monitor and manage Antminer/ASIC fleets (Braiins OS+ first-class, plus Bitmain
stock, Avalon and VNish) across every client site — from a phone or a browser.
Modelled on Braiins Manager: sites dial **out** to a central hub, so there's no
port-forwarding and no per-site tunnels.

```
miners ◀─LAN─ Site Agent ─outbound─▶ WLM Hub ─▶ Web dashboard + Android app
```

## Components

| Part | Runs on | Download (latest) |
|---|---|---|
| **WLM Hub** | one always-on PC (yours) | [`hub-latest`](../../releases/tag/hub-latest) → `WLM-Hub-Setup.exe` |
| **WLM Site Agent** | a PC at each client site | [`gateway-latest`](../../releases/tag/gateway-latest) → `WLM-SiteAgent-Setup.exe` |
| **WLM ASIC Manager** (Android) | your / clients' phones | [`app-latest`](../../releases/tag/app-latest) → `WLM-ASIC-Manager-latest.apk` |

## Setup (once)

1. **Hub** — run `WLM-Hub-Setup.exe`. Copy the **operator token**; for its public
   address paste a Cloudflare connection code (→ e.g. `manage.welovemining.co.za`,
   `localhost:8900`) or leave blank for a free address.
2. **Each site** — run `WLM-SiteAgent-Setup.exe`, type a site name + the Hub
   address. The site appears in the Hub automatically.
3. **App** — Settings → My Sites → add the Hub address + operator token. You see
   every site; a client sees their own.

## Source

- `hub/` — central relay + web dashboard (Node, zero-dep)
- `gateway/` — Site Agent (discovers miners, reports to the Hub)
- `android/` — the Android app (Kotlin + Jetpack Compose)

Installers are built by GitHub Actions and published to the releases above.

## Support

**enrico@welovemining.co.za** · [welovemining.co.za](https://welovemining.co.za)

© 2026 WeLoveMining (Pty) Ltd. All rights reserved.
