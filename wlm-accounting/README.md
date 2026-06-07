# WLM Accounting

A double-entry accounting app for **WeLoveMining Pty Ltd**, built with Expo + React
Native + TypeScript, shipped as an Android APK via EAS Build.

## Why this app exists

The previous bookkeeping system double-counted income — an invoice *and* the matching
bank deposit were both booked as revenue, overstating the bank by roughly R1.3m. WLM
Accounting prevents that by construction: you never type raw debits/credits. You pick
**what happened** (a "recipe") and the app applies the correct double entry under the
hood. A bank deposit that pays an invoice clears the receivable — it never creates new
income. See [`src/lib/accounting.ts`](./src/lib/accounting.ts) for the engine.

The company is **not VAT-registered yet**, so there is no VAT anywhere in the app. A
hook for adding it later is noted in `accounting.ts`.

## Project layout

```
wlm-accounting/
  App.tsx                  — font loading, providers, root render
  app.json                 — Expo config (name, Android package co.welovemining.accounting)
  eas.json                 — EAS Build profiles ("preview" → installable .apk)
  src/
    lib/
      accounting.ts        — chart of accounts, recipes, double-entry balance engine
      storage.ts           — AsyncStorage persistence (key "wlm:ledger:v1")
      LedgerContext.tsx    — React context wiring storage <-> screens
      theme.ts             — brand colours & font names
      format.ts            — ZAR currency formatting ("R 1,234.56")
    components/            — Header, Card, ModuleRoadmap
    navigation/            — bottom tabs (Home · Ledger · Add · Reports) + stack
    screens/               — the four Module 1 screens
    screens/comingsoon/    — labelled "Coming soon" screens for Modules 2–6
```

## Module roadmap

1. **(built) Ledger + Reports** — dashboard, ledger, add-transaction recipes, P&L,
   trial balance, AsyncStorage persistence.
2. Bank import (FNB CSV / OFX, manual categorisation before posting)
3. Invoices & Quotes (`INV-XXXX` / `QUO-XXXX`, paid-invoice flow that avoids
   double-counting)
4. Inventory (ASIC catalogue with landed cost)
5. Reconciliation (match imported bank lines to ledger entries)
6. PDF export (trial balance, P&L, invoices via `expo-print` / `expo-sharing`)

Modules 2–6 are scaffolded as navigable "Coming soon" screens, reachable from the
**Roadmap** card on the Home tab.

## Running it locally

```bash
cd wlm-accounting
npm install
npx expo start
```

Install **Expo Go** on your Android phone from the Play Store and scan the QR code to
test live. Data is stored locally on-device with AsyncStorage and survives closing and
reopening the app.

## Building the installable APK

EAS Build compiles the app on Expo's servers — no Android Studio required. The
`preview` profile in [`eas.json`](./eas.json) is configured to output a `.apk`
(EAS defaults to `.aab`, which Android phones can't install directly).

### Option A — from your own machine

```bash
npm install -g eas-cli
eas login                                  # free Expo account from expo.dev
eas build -p android --profile preview
```

This takes roughly 5–15 minutes and returns a download link for the `.apk`. Transfer it
to the phone, allow "install from unknown sources", and install.

### Option B — GitHub Actions (configured in this repo)

[`.github/workflows/wlm-accounting-build.yml`](../.github/workflows/wlm-accounting-build.yml)
runs the same build on Expo's servers from CI. To enable it:

1. Create a free account at [expo.dev](https://expo.dev) and run `eas login` once
   locally, or generate an access token from **Account settings → Access tokens**.
2. In this GitHub repo, add a secret named **`EXPO_TOKEN`** with that token
   (**Settings → Secrets and variables → Actions → New repository secret**).
3. Push to `main` (touching anything under `wlm-accounting/`) or trigger the workflow
   manually from the **Actions** tab (`workflow_dispatch`).
4. EAS queues the build; open the run link it prints (or your
   [expo.dev dashboard](https://expo.dev/accounts)) to download the finished `.apk`
   once it completes.

## Acceptance checklist

- [x] App launches to the dark WLM-branded Home screen with Rajdhani / Share Tech Mono fonts.
- [x] Adding each of the 6 recipe types posts a correct, single double entry.
- [x] Trial Balance Debit total == Credit total, always (enforced by the balance engine —
      every transaction posts equal debit and credit amounts).
- [x] Data survives closing and reopening the app (AsyncStorage, key `wlm:ledger:v1`).
- [ ] `eas build -p android --profile preview` yields an installable `.apk` — run via
      Option A or B above (requires an authenticated Expo account; not runnable from
      this environment).
