# Mr Dweedery 🌿

Cannabis delivery app for South Africa — built like Mr D (shop discovery, basket,
checkout, live order tracking) with multiple South African payment platforms.
Green & grey UI, Android-first (APK via EAS build).

> **18+ only.** The app opens with an age gate. Consume responsibly. Availability
> depends on local regulations.

## Features

- **Discover** — 10 shops across SA cities (Cape Town, Joburg, Durban, Pretoria, George, Gqeberha, Bloemfontein…) with search, category filters, ratings, ETA, delivery fee & minimum order.
- **Shop menu** grouped by category (Flower, Pre-rolls, Edibles, Vapes, Concentrates, CBD, Accessories) — 44 products with stylised image tiles and quantity steppers.
- **Single-shop basket** (like Mr D) with subtotal, delivery fee, service fee and minimum-order enforcement.
- **Checkout** with delivery address, driver tip and payment method selection.
- **Payments** — integration-ready layer for **PayFast, Yoco (card), Ozow, SnapScan** plus **cash on delivery**. Runs in sandbox until live keys + a backend are added.
- **Live order tracking** with a status timeline (placed → accepted → preparing → on the way → delivered).
- **Orders history** and an **account** screen with default address & payment status.
- State persists on-device with AsyncStorage.

## Tech

Expo (React Native + TypeScript), React Navigation, lucide icons. No backend required to run the demo.

## Run locally

```bash
cd mr-dweedery
npm install
npm start          # then press "a" for Android, or scan the QR with Expo Go
```

## Build the Android APK

The APK is built by GitHub Actions via EAS (see
`.github/workflows/mr-dweedery-build.yml`). It needs an `EXPO_TOKEN` repo secret
(create one at https://expo.dev → Account → Access Tokens).

- Push to `main` under `mr-dweedery/**`, **or**
- Run the **"Mr Dweedery — Android APK (EAS Build)"** workflow manually
  (Actions tab → Run workflow → choose `preview` for an APK).

When the build finishes, the workflow downloads the APK from EAS and publishes it
to the **`mr-dweedery-latest`** GitHub Release, so there's a stable public
download link:
`https://github.com/enrico8809-dev/welovemining-releases/releases/tag/mr-dweedery-latest`
(the file is `Mr-Dweedery-latest.apk`). The build also remains on your Expo
dashboard.

## Going live with payments

The app's payment layer ([`src/lib/payments.ts`](src/lib/payments.ts)) talks to a
Firebase Functions backend that holds the **secret** keys — see
[`../mr-dweedery-backend`](../mr-dweedery-backend). To go live:

1. Deploy the backend (`cd mr-dweedery-backend && npm install && npm run deploy`) with your gateway keys.
2. In `PAYMENTS_CONFIG`, set `backendUrl` to the deployed function base URL, fill in the public/merchant keys, and set `sandbox: false`.
3. The `charge()` function then calls the backend:
   - **Yoco (card)** — tokenise on-device with the Yoco SDK, then `POST /yoco/charge`.
   - **PayFast / Ozow** — `POST /…/create` returns a signed hosted-checkout URL to open in a WebView; the order is confirmed by the server-side ITN/notify.
   - **SnapScan** — `POST /snapscan/create` returns a scan-to-pay QR / deep link.

Never put secret keys in the app — only public keys and the backend URL ship in the APK.

## Disclaimer

Sample/demo app. Selling and delivering cannabis is subject to South African law;
operating a real service requires the appropriate licensing and compliance.
