// Payment platform integration layer for Mr Dweedery.
//
// This abstracts the South African payment gateways most commonly used by
// delivery apps. Each provider has a `configured` flag driven by public keys
// supplied through Expo's `extra` config (app.json) or env. Until live keys are
// supplied the app runs in SANDBOX mode and simulates an authorised charge so
// the full order flow is testable end-to-end.
//
// To go live, set the relevant keys (see PAYMENTS_CONFIG below) and replace the
// body of `process<Provider>` with the real SDK / hosted-checkout redirect.

import { PaymentMethodId } from "./types";

export interface PaymentMethod {
  id: PaymentMethodId;
  label: string;
  blurb: string;
  emoji: string;
  /** false until live API keys are present; sandbox still simulates success */
  live: boolean;
  /** card-style methods need extra UI; cash is on-delivery */
  kind: "card" | "redirect" | "qr" | "cash";
}

// ---- Configuration ---------------------------------------------------------
// Replace empty strings with real public/merchant keys to go live. Keep secret
// keys on a backend — never ship a server secret inside the APK. The actual
// charge is performed by the Firebase Functions backend in mr-dweedery-backend
// (set `backendUrl` to its deployed base, e.g.
// https://europe-west1-<project>.cloudfunctions.net/api).
export const PAYMENTS_CONFIG = {
  sandbox: true,
  backendUrl: "", // e.g. "https://europe-west1-mr-dweedery.cloudfunctions.net/api"
  payfast: { merchantId: "", merchantKey: "", returnUrl: "mrdweedery://pay/return" },
  yoco: { publicKey: "" },
  ozow: { siteCode: "", countryCode: "ZA", currencyCode: "ZAR" },
  snapscan: { merchantId: "" },
};

function isConfigured(method: PaymentMethodId): boolean {
  switch (method) {
    case "payfast":
      return !!(PAYMENTS_CONFIG.payfast.merchantId && PAYMENTS_CONFIG.payfast.merchantKey);
    case "yoco":
    case "card":
      return !!PAYMENTS_CONFIG.yoco.publicKey;
    case "ozow":
      return !!PAYMENTS_CONFIG.ozow.siteCode;
    case "snapscan":
      return !!PAYMENTS_CONFIG.snapscan.merchantId;
    case "cash":
      return true;
  }
}

export const PAYMENT_METHODS: PaymentMethod[] = [
  {
    id: "card",
    label: "Credit / Debit card",
    blurb: "Visa, Mastercard — secured by Yoco",
    emoji: "💳",
    kind: "card",
    live: isConfigured("card"),
  },
  {
    id: "payfast",
    label: "PayFast",
    blurb: "Card, Instant EFT, Mobicred & more",
    emoji: "🅿️",
    kind: "redirect",
    live: isConfigured("payfast"),
  },
  {
    id: "ozow",
    label: "Ozow",
    blurb: "Instant EFT from your bank",
    emoji: "🏦",
    kind: "redirect",
    live: isConfigured("ozow"),
  },
  {
    id: "snapscan",
    label: "SnapScan",
    blurb: "Scan to pay with the SnapScan app",
    emoji: "📷",
    kind: "qr",
    live: isConfigured("snapscan"),
  },
  {
    id: "cash",
    label: "Cash on delivery",
    blurb: "Pay the driver when your order arrives",
    emoji: "💵",
    kind: "cash",
    live: true,
  },
];

export interface ChargeRequest {
  method: PaymentMethodId;
  amount: number; // ZAR
  orderId: string;
  reference: string; // human-readable, e.g. "MW-1234"
  customerEmail?: string;
}

export interface ChargeResult {
  ok: boolean;
  reference: string;
  message: string;
  sandbox: boolean;
  /** For redirect/QR gateways: the hosted-checkout URL to open in a WebView. */
  redirectUrl?: string;
}

/** Map a payment method to its backend endpoint + the field carrying the ref. */
const BACKEND_ENDPOINTS: Partial<Record<PaymentMethodId, string>> = {
  card: "/yoco/charge",
  yoco: "/yoco/charge",
  payfast: "/payfast/create",
  ozow: "/ozow/create",
  snapscan: "/snapscan/create",
};

function genRef(provider: string): string {
  return `${provider.toUpperCase()}-${Date.now().toString(36)}-${Math.random()
    .toString(36)
    .slice(2, 6)}`;
}

/**
 * Authorise a charge. In sandbox mode this resolves to a simulated success so
 * the order pipeline can be exercised without live credentials. Swap the inner
 * branches for real provider calls when keys are configured.
 */
export async function charge(req: ChargeRequest): Promise<ChargeResult> {
  const sandbox = PAYMENTS_CONFIG.sandbox || !isConfigured(req.method);

  // Simulate network/processing latency.
  await new Promise((r) => setTimeout(r, 900));

  if (req.method === "cash") {
    return {
      ok: true,
      reference: genRef("cash"),
      message: "Cash on delivery — pay the driver when your order arrives.",
      sandbox,
    };
  }

  if (sandbox) {
    return {
      ok: true,
      reference: genRef(req.method),
      message: `Sandbox payment approved via ${req.method}. Add live keys to charge real cards.`,
      sandbox: true,
    };
  }

  // ---- Live: call the payment backend -----------------------------------
  if (!PAYMENTS_CONFIG.backendUrl) {
    throw new Error("Live payments need PAYMENTS_CONFIG.backendUrl (see mr-dweedery-backend).");
  }
  const endpoint = BACKEND_ENDPOINTS[req.method];
  if (!endpoint) throw new Error(`No backend endpoint for ${req.method}.`);

  const resp = await fetch(`${PAYMENTS_CONFIG.backendUrl}${endpoint}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      amount: req.amount,
      reference: req.reference,
      orderId: req.orderId,
      email: req.customerEmail,
      itemName: "Mr Dweedery order",
      // Card charges: tokenise with the Yoco SDK on-device first, then pass it.
      // token: <yoco card token>,
    }),
  });
  const data = (await resp.json()) as {
    ok?: boolean;
    error?: unknown;
    reference?: string;
    url?: string; // hosted checkout / QR for redirect & qr gateways
  };
  if (!resp.ok || data.ok === false) {
    return {
      ok: false,
      reference: req.reference,
      message: typeof data.error === "string" ? data.error : `Payment failed (${req.method}).`,
      sandbox: false,
    };
  }

  // Redirect / QR gateways return a URL the checkout screen opens in a WebView;
  // the order is only confirmed once the backend notify/webhook fires.
  return {
    ok: true,
    reference: data.reference || req.reference,
    message:
      data.url != null
        ? `Complete payment via ${req.method}.`
        : `Payment authorised via ${req.method}.`,
    sandbox: false,
    redirectUrl: data.url,
  };
}
