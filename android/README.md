# WLM ASIC Manager — Android

Native Android app (Kotlin + Jetpack Compose, Material 3) for monitoring and
managing a fleet of Antminer hydro & air ASICs running **Braiins OS+**,
**VNish** and **Avalon / CGMiner** firmware — from on-site (LAN) or anywhere via
a **Cloudflare tunnel** gateway.

> Brand: Bitcoin orange on charcoal, matching the WeLoveMining identity.

## What's in this build

A runnable foundation with a complete, professional UI and a pluggable firmware
integration layer:

- **Dashboard** — fleet totals (hashrate, power, efficiency), hottest miner,
  average coolant Δ, a live hashrate trend chart, and the miner list.
- **Miners** — searchable, status-filtered, grouped list.
- **Alerts** — offline / overheating / degraded miners derived from live data.
- **Miner detail** — hashrate + temperature gauges, power/efficiency/uptime,
  per-hashboard breakdown, **hydro coolant loop** (in / out / Δ / flow), fans,
  pools, and **Reboot / Locate** actions.
- **Settings** — demo mode, connection mode (Auto / LAN / Gateway), Cloudflare
  gateway URL + token, LAN subnet, poll interval, temperature alert threshold.

**Demo mode is ON by default** so the app is alive on first launch with a
simulated S19/S21/S23 hydro+air fleet. Turn it off in Settings to talk to real
hardware.

## Architecture

```
ui/                Compose screens + ViewModels (single FleetViewModel poll loop)
data/model/        Normalized domain (Miner, MinerStats, HydroStat, FleetSummary…)
data/remote/
  firmware/        MinerApiClient interface + Braiins / VNish / Avalon adapters
  cgminer/         Raw cgminer/bmminer TCP socket client (port 4028)
  gateway/         Cloudflare-tunnel aggregator client (whole fleet in one call)
data/repository/   MinerRepository — picks adapter per firmware, resolves
                   LAN-direct vs gateway, returns one normalized snapshot
data/connection/   Connection mode / active link types
data/settings/     DataStore-backed AppSettings + miner list
```

Every firmware normalizes into the **same `MinerStats`** shape, so the UI never
cares which firmware produced a reading. Adding LuxOS, Hiveon or Whatsminer
later is just a new `MinerApiClient` implementation registered in
`MinerRepository`.

### Connection model

- **LAN:** direct firmware APIs (VNish HTTP, Braiins/Avalon cgminer socket).
- **Gateway:** a small aggregator at the site (your Miner Manager / a Pi)
  published over the Cloudflare tunnel, serving the contract documented in
  `GatewayClient`.
- **Auto:** try LAN first; fall back to the gateway when off-site.

## Build

Requires the Android SDK (`compileSdk 35`) and JDK 17+.

```bash
cd android
./gradlew assembleDebug      # build the debug APK
# or open the `android/` folder in Android Studio and Run.
```

## Roadmap (next steps)

- Add/edit miners UI + LAN auto-discovery (subnet sweep of port 80/4028).
- Braiins OS+ gRPC Public API (port 50051) for richer control.
- Bitmain stock HTTP digest-auth adapter; Whatsminer TCP token API.
- Pool editing, tuning profiles, bulk actions, push notifications for alerts.
- Reference implementation of the gateway aggregator service.
