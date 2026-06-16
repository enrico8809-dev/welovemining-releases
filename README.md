<p align="center">
  <img src="docs/logo.png" alt="WeLoveMining" width="120" />
</p>

# WLM ASIC Manager

Monitor and manage Antminer/ASIC fleets (Braiins OS+ first-class, plus Bitmain
stock, Avalon and VNish) from your phone — on-site or from anywhere.

**Two pieces, nothing else:**

| Part | Runs on | Download |
|---|---|---|
| **WLM Gateway** | a PC at each mining site | [`gateway-latest`](../../releases/tag/gateway-latest) → `WLM-Gateway-Setup.exe` |
| **WLM ASIC Manager** (app) | your / clients' phones | [`app-latest`](../../releases/tag/app-latest) → `WLM-ASIC-Manager-latest.apk` |

```
miners ◀─LAN─ WLM Gateway ─tunnel─▶ App
```

## Setup

1. **Each site:** run `WLM-Gateway-Setup.exe`, type a site name, finish. Open its
   dashboard (`http://localhost:8787`) — it shows the **App address + token**.
2. **App:** Settings → **My Sites → Add site** → paste that address + token.
   - A client adds their own site; you add every client's gateway to see them all.

That's the whole thing — no hub, no server, no port-forwarding (the Gateway
makes its own tunnel; paste a Cloudflare connection code during install if you
want a permanent custom domain).

## Source

- `gateway/` — the Windows Gateway (Node, zero-dep): discovery, dashboard, API, tunnel
- `android/` — the app (Kotlin + Jetpack Compose)

Installers/APK are built by GitHub Actions and published to the releases above.

## Support

**enrico@welovemining.co.za** · [welovemining.co.za](https://welovemining.co.za)

© 2026 WeLoveMining (Pty) Ltd. All rights reserved.
