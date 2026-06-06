<p align="center">
  <img src="docs/logo.png" alt="WeLoveMining" width="120" />
</p>

# WeLoveMining — Releases

Official downloads for the WeLoveMining ASIC miner management ecosystem.

Two paired apps:

| App | For | Where it runs |
|---|---|---|
| **WeLoveMining CRM** | You (the operator) | Windows PC, Android phone, or any web browser |
| **WeLoveMining Miner Manager** | Each mining site (you or your customers) | Windows PC on the same LAN as the miners |

---

## 📱 WLM ASIC Manager (Android, in development)

A native Kotlin + Jetpack Compose app for monitoring and managing the fleet
(hydro + air S19/S21/S23) on **Braiins OS+**, **VNish** and **Avalon** firmware —
direct on the LAN, or from anywhere through a **Cloudflare tunnel**. Live
hashrate/temps/power, water-loop in/out + flow, per-board stats, remote reboot,
LAN discovery and add/edit of miners.

- App source: [`android/`](android/) · build with `cd android && ./gradlew assembleDebug`
- Site gateway for the remote path: [`gateway/`](gateway/)
- CI builds the debug APK on every push (see the **Actions** tab).

---

## ⬇️ Downloads (latest release)

Go to the **[Releases page](../../releases/latest)** and pick the file for your platform:

### WeLoveMining CRM
The central dashboard — clients, quotes, invoices, expenses, banking, P&L reports, plus a Customer Sites view that aggregates miner stats from every linked Miner Manager.

| Platform | File | Size |
|---|---|---|
| Windows installer | `WeLoveMining-CRM-Setup-1.0.0.exe` | 105 MB |
| Windows portable (no install) | `WeLoveMining-CRM-Portable-1.0.0.exe` | 105 MB |
| Android phone (sideload APK) | `WeLoveMining-CRM-Android-1.0.0.apk` | 5 MB |
| Web bundle (host on your own server) | `WeLoveMining-CRM-Web-1.0.0.zip` | 1.4 MB |

### WeLoveMining Miner Manager
Light, customer-facing app. Installed at the mining site, it auto-discovers ASIC miners on the LAN, polls their stats, and reports back to the CRM over a secure outbound connection — no port forwarding needed.

| Platform | File | Size |
|---|---|---|
| Windows installer | `WeLoveMining-MinerManager-Setup-1.0.0.exe` | 94 MB |
| Windows portable | `WeLoveMining-MinerManager-Portable-1.0.0.exe` | 94 MB |
| Android phone (LAN viewer) | `WeLoveMining-MinerManager-Android-1.0.0.apk` | 5 MB |

---

## 🚀 Quick start

### For the operator (you)

1. Download **WeLoveMining-CRM-Setup-1.0.0.exe** → install on the PC where the CRM will live.
2. Run it. The CRM opens at `http://localhost:4500`.
3. (Optional) **Settings → Remote Access → Start Tunnel** to get a public URL your phone can hit from anywhere.
4. (Recommended) **Settings → Security** → set a password.
5. To add a customer site:
   - **Customer Sites → New Customer Site** → enter a name → click Generate Agent Key
   - Hand the customer their **Agent Key** + your **CRM URL**

### For a mining site (customer)

1. Download **WeLoveMining-MinerManager-Setup-1.0.0.exe** → install on a Windows PC on the same Wi-Fi/LAN as the ASIC miners.
2. Launch → on the **Setup** screen, paste:
   - **Agent Key**: provided by your WeLoveMining supplier
   - **CRM URL**: provided by your WeLoveMining supplier
   - **Subnet**: e.g. `192.168.1.0/24`
3. Click **Save & Connect**. The app scans the LAN and starts reporting back.
4. (Optional) Install the Android app for an on-the-go view of your fleet.

---

## ⛏️ Supported miners

### Antminer (HTTP & cgminer / bmminer)
S19, S19j, S19 Pro, S19j Pro, S19 XP, S19k Pro, S21, S21+, S21 Pro, S21 XP, T21
**Hydro / water-cooled** variants: S19 Hydro, S19 Pro Hydro, S19j Pro Hydro, S19 XP Hydro, S21 Hydro, S21 Pro Hyd., S21 XP Hyd., T21 Hydro
Firmware: stock Bitmain, **Braiins OS+ / BOSer**, Vnish, LuxOS, Hiveon

### Whatsminer (TCP API)
M30S/+/++, M50/M50S, M53/M53S, M56, M60/M60S, M63S

### Hydro stats automatically picked up
Coolant inlet & outlet temperature, flow rate (L/min), pump RPM.

---

## 🛡️ Architecture

```
Operator's phone → Cloudflare tunnel → CRM PC ↔ Customer Miner Manager → ASIC miners on customer LAN
```

- CRM ↔ Miner Manager uses an outbound socket.io connection (customer doesn't need port-forwarding).
- Authentication: per-customer Agent Keys (UUIDs); CRM password is operator-side.
- All communication TLS-protected when using the Cloudflare tunnel.

---

## 📦 Versions

Each binary embeds version `1.0.0`. Patch releases ship as new files on the [Releases page](../../releases). The Android APKs auto-rebuild on every commit to the source repos via GitHub Actions — these mirror the published binaries.

## 🧑‍💻 Source code

Source repositories are **private**. Contact WeLoveMining for access.

- CRM: `welovemining-crm`
- Miner Manager: `welovemining-client`

---

## 📞 Support

For setup help, custom builds, or new miner-model integrations:
**enrico@welovemining.co.za** · [welovemining.co.za](https://welovemining.co.za)

© 2026 WeLoveMining (Pty) Ltd. All rights reserved.
