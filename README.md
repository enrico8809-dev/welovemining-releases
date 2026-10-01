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

---

## Mr Dweedery 🌿 (cannabis delivery app)

A separate, Mr D–style cannabis delivery app for South Africa — shop discovery,
basket, checkout with SA payment platforms (PayFast, Yoco, Ozow, SnapScan), and
live order tracking. Green & grey, Android-first. **18+ only.**

| Part | Runs on | Download |
|---|---|---|
| **Mr Dweedery** (app) | Android phones | [`mr-dweedery-latest`](../../releases/tag/mr-dweedery-latest) → `Mr-Dweedery-latest.apk` |

- `mr-dweedery/` — the app (Expo / React Native + TypeScript)
- `mr-dweedery-backend/` — Firebase Functions payment backend (holds secret keys)

The APK is built on EAS and auto-published to the release above by GitHub Actions
(needs an `EXPO_TOKEN` repo secret). See [`mr-dweedery/README.md`](mr-dweedery/README.md).

## WLM Trader 📈 (trading bot + Windows/Android app)

Personal trading bot for crypto (Binance, spot only), stocks (Interactive Brokers) and Forex/gold
(MetaTrader 5, demo by default, 1:1 swing / 3:1 day mode). Paper mode by default, never withdraws.

| Part | Runs on | Download |
|---|---|---|
| **WLM Trader** for Windows | the PC that trades (runs the bot) | [`trader-latest`](../../releases/tag/trader-latest) → `WLM-Trader-Setup.exe` |
| **WLM Trader** for Android | your phone (via Tailscale) | [`trader-latest`](../../releases/tag/trader-latest) → `WLM-Trader.apk` |

- `trading-bot/` — the bot (Python): strategies, backtester, Risk Manager, auto-trader, app server.
  See [`trading-bot/README.md`](trading-bot/README.md).
- `wlm-trader-app/` — the app (React; Electron for Windows, Capacitor for Android).
  See [`wlm-trader-app/README.md`](wlm-trader-app/README.md).

## Support

**enrico@welovemining.co.za** · [welovemining.co.za](https://welovemining.co.za)

© 2026 WeLoveMining (Pty) Ltd. All rights reserved.
