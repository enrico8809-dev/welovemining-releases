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
}

/** Deep links the WebView intercepts to detect a finished hosted checkout. */
export const PAY_RETURN_URL = "mrdweedery://pay/return";
export const PAY_CANCEL_URL = "mrdweedery://pay/cancel";

function genRef(provider: string): string {
  return `${provider.toUpperCase()}-${Date.now().toString(36)}-${Math.random()
    .toString(36)
    .slice(2, 6)}`;
}

/**
 * True when a real charge should be attempted for this method: sandbox is off,
 * a backend URL is set, and the gateway has live keys. Cash is always handled
 * locally. The checkout screen uses this to decide between the simulated
 * `charge()` and the live WebView flow.
 */
export function isLivePayment(method: PaymentMethodId): boolean {
  return (
    !PAYMENTS_CONFIG.sandbox &&
    !!PAYMENTS_CONFIG.backendUrl &&
    method !== "cash" &&
    isConfigured(method)
  );
}

/**
 * Sandbox / cash resolver. In sandbox mode this returns a simulated success so
 * the order pipeline works without live credentials. Live charges go through
 * `createGatewayCheckout` / `chargeYocoToken` (driven by the Payment screen).
 */
export async function charge(req: ChargeRequest): Promise<ChargeResult> {
  await new Promise((r) => setTimeout(r, 900)); // simulate latency

  if (req.method === "cash") {
    return {
      ok: true,
      reference: genRef("cash"),
      message: "Cash on delivery — pay the driver when your order arrives.",
      sandbox: PAYMENTS_CONFIG.sandbox,
    };
  }

  return {
    ok: true,
    reference: genRef(req.method),
    message: `Sandbox payment approved via ${req.method}. Add live keys to charge real cards.`,
    sandbox: true,
  };
}

const CREATE_ENDPOINTS: Partial<Record<PaymentMethodId, string>> = {
  payfast: "/payfast/create",
  ozow: "/ozow/create",
  snapscan: "/snapscan/create",
};

/** Hosted-checkout instructions returned by the backend create endpoints. */
export interface GatewayCheckout {
  /** URL to load (SnapScan QR page) or POST to (PayFast/Ozow). */
  url: string;
  /** Present for PayFast/Ozow — POST these as a form to `url`. */
  fields?: Record<string, string>;
}

/** Create a hosted checkout for redirect/QR gateways (PayFast, Ozow, SnapScan). */
export async function createGatewayCheckout(req: ChargeRequest): Promise<GatewayCheckout> {
  if (!PAYMENTS_CONFIG.backendUrl) throw new Error("PAYMENTS_CONFIG.backendUrl is not set.");
  const endpoint = CREATE_ENDPOINTS[req.method];
  if (!endpoint) throw new Error(`No checkout endpoint for ${req.method}.`);

  const resp = await fetch(`${PAYMENTS_CONFIG.backendUrl}${endpoint}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      amount: req.amount,
      reference: req.reference,
      orderId: req.orderId,
      email: req.customerEmail,
      itemName: "Mr Dweedery order",
    }),
  });
  const data = (await resp.json()) as { ok?: boolean; error?: unknown; url?: string; fields?: Record<string, string> };
  if (!resp.ok || data.ok === false || !data.url) {
    throw new Error(typeof data.error === "string" ? data.error : `Could not start ${req.method} checkout.`);
  }
  return { url: data.url, fields: data.fields };
}

/** Charge a Yoco card token (obtained on-device via the Yoco SDK WebView). */
export async function chargeYocoToken(token: string, req: ChargeRequest): Promise<ChargeResult> {
  if (!PAYMENTS_CONFIG.backendUrl) throw new Error("PAYMENTS_CONFIG.backendUrl is not set.");
  const resp = await fetch(`${PAYMENTS_CONFIG.backendUrl}/yoco/charge`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      token,
      amount: req.amount,
      currency: "ZAR",
      reference: req.reference,
    }),
  });
  const data = (await resp.json()) as { ok?: boolean; error?: unknown; reference?: string };
  if (!resp.ok || data.ok === false) {
    return {
      ok: false,
      reference: req.reference,
      message: typeof data.error === "string" ? data.error : "Card was declined.",
      sandbox: false,
    };
  }
  return {
    ok: true,
    reference: data.reference || req.reference,
    message: "Card payment approved.",
    sandbox: false,
  };
}
