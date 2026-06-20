# Mr Weeders 🌿

Cannabis delivery app for South Africa — built like Mr D (shop discovery, basket,
checkout, live order tracking) with multiple South African payment platforms.
Green & grey UI, Android-first (APK via EAS build).

> **18+ only.** The app opens with an age gate. Consume responsibly. Availability
> depends on local regulations.

## Features

- **Discover** shops near you with search, category filters, ratings, ETA, delivery fee & minimum order.
- **Shop menu** grouped by category (Flower, Pre-rolls, Edibles, Vapes, Concentrates, CBD, Accessories) with quantity steppers.
- **Single-shop basket** (like Mr D) with subtotal, delivery fee, service fee and minimum-order enforcement.
- **Checkout** with delivery address, driver tip and payment method selection.
- **Payments** — integration-ready layer for **PayFast, Yoco (card), Ozow, SnapScan** plus **cash on delivery**. Runs in sandbox until live keys are added.
- **Live order tracking** with a status timeline (placed → accepted → preparing → on the way → delivered).
- **Orders history** and an **account** screen with default address & payment status.
- State persists on-device with AsyncStorage.

## Tech

Expo (React Native + TypeScript), React Navigation, lucide icons. No backend required to run the demo.

## Run locally

```bash
cd mr-weeders
npm install
npm start          # then press "a" for Android, or scan the QR with Expo Go
```

## Build the Android APK

The APK is built by GitHub Actions via EAS (see
`.github/workflows/mr-weeders-build.yml`). It needs an `EXPO_TOKEN` repo secret
(create one at https://expo.dev → Account → Access Tokens).

- Push to `main` under `mr-weeders/**`, **or**
- Run the **"Mr Weeders — Android APK (EAS Build)"** workflow manually
  (Actions tab → Run workflow → choose `preview` for an APK).

The finished APK downloads from your Expo dashboard (and the build log link).

## Going live with payments

Payments are abstracted in [`src/lib/payments.ts`](src/lib/payments.ts):

1. Add your merchant/public keys to `PAYMENTS_CONFIG` (keep **secret** keys on a backend, never in the APK).
2. Set `sandbox: false`.
3. Replace the live branch in `charge()` with the real call:
   - **PayFast / Ozow** — build a signed form, open the hosted checkout in a WebView, verify the ITN/notify callback server-side.
   - **Yoco** — tokenise the card with the Yoco SDK, charge via your backend.
   - **SnapScan** — create a payment and render the merchant QR / deep link.

## Disclaimer

Sample/demo app. Selling and delivering cannabis is subject to South African law;
operating a real service requires the appropriate licensing and compliance.
