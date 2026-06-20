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
// keys on a backend — never ship a server secret inside the APK.
export const PAYMENTS_CONFIG = {
  sandbox: true,
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

  // ---- Live integration points ------------------------------------------
  // PayFast / Ozow: build a signed form and open the hosted checkout URL in a
  //   WebView, then verify the ITN/notify callback on your backend.
  // Yoco: tokenise the card with the Yoco SDK and charge via your backend.
  // SnapScan: create a payment and render the merchant QR / deep link.
  // Each of these requires a server endpoint holding the secret key.
  throw new Error(`Live ${req.method} integration not wired up yet.`);
}
