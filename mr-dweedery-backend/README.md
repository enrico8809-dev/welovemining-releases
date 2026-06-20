# Mr Dweedery — payment backend (Firebase Functions)

Holds the **secret** payment keys (which must never ship inside the APK) and
exposes a small REST API the app calls at checkout. One HTTPS function (`api`)
serves an Express app.

## Endpoints

| Method | Path | Purpose |
|---|---|---|
| GET | `/health` | Liveness + which gateways are configured |
| POST | `/payfast/create` | Returns signed PayFast hosted-checkout fields + URL |
| POST | `/payfast/notify` | PayFast ITN (server-to-server) handler |
| POST | `/yoco/charge` | Charges a tokenised card via Yoco |
| POST | `/ozow/create` | Returns signed Ozow redirect fields + URL |
| POST | `/ozow/notify` | Ozow notification handler |
| POST | `/snapscan/create` | Returns a SnapScan scan-to-pay link / QR |
| POST | `/snapscan/webhook` | SnapScan webhook handler |

## Setup

```bash
cd mr-dweedery-backend
npm install
cp .env.example .env     # fill in sandbox keys
npm run serve            # build + run the Firebase emulator
```

Set your Firebase project id in `.firebaserc`, then:

```bash
npm run deploy           # firebase deploy --only functions
```

The deployed base URL looks like:
`https://europe-west1-<project>.cloudfunctions.net/api`

## Wiring the app to it

In `mr-dweedery/src/lib/payments.ts` set `PAYMENTS_CONFIG.backendUrl` to that
base URL and `sandbox: false`. The app then calls these endpoints instead of
simulating the charge. Card payments (Yoco) tokenise on-device first; PayFast
and Ozow return a hosted-checkout URL you open in a WebView; SnapScan returns a
QR/deep link.

## Security notes

- Secret keys live **only** here, never in the app. For production, move them
  into Secret Manager (`firebase functions:secrets:set NAME`) and add a
  `secrets: [...]` option to the `onRequest` call in `src/index.ts`.
- The signature/hash helpers follow each provider's public docs — **verify them
  against the current documentation** and complete the `TODO` validation in the
  notify/webhook handlers (verify signature + source, then mark the order paid)
  before accepting real money.
- Always confirm payment via the server-to-server notify/webhook, not just the
  customer redirect.
