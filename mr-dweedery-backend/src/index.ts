/**
 * Mr Dweedery — payment backend (Firebase Functions).
 *
 * Holds the SECRET keys that must never ship inside the Android APK and exposes
 * a small REST API the app calls at checkout:
 *
 *   GET  /health
 *   POST /payfast/create     -> signed hosted-checkout fields + URL
 *   POST /payfast/notify     -> PayFast ITN (server-to-server) handler
 *   POST /yoco/charge        -> charge a tokenised card via Yoco
 *   POST /ozow/create        -> signed Ozow redirect fields + URL
 *   POST /ozow/notify        -> Ozow notification handler
 *   POST /snapscan/create    -> SnapScan pay link / QR for the amount
 *   POST /snapscan/webhook   -> SnapScan webhook handler
 *
 * Configure keys via .env (emulator) or `firebase functions:secrets:set` (prod).
 * The signature/flow helpers below follow each provider's public documentation —
 * verify against the current docs before going live.
 */
import * as crypto from "crypto";
import express, { Request, Response } from "express";
import cors from "cors";
import { onRequest } from "firebase-functions/v2/https";
import * as logger from "firebase-functions/logger";

const env = process.env;

const app = express();
app.use(cors({ origin: true }));
app.use(express.json());
// PayFast/Ozow post notifications as urlencoded forms.
app.use(express.urlencoded({ extended: false }));

function bad(res: Response, msg: string, code = 400) {
  return res.status(code).json({ ok: false, error: msg });
}

// --------------------------------------------------------------------------
// PayFast
// --------------------------------------------------------------------------
function payfastSignature(data: Record<string, string>, passphrase?: string): string {
  let out = "";
  for (const key of Object.keys(data)) {
    const val = data[key];
    if (val !== "" && val !== undefined) {
      out += `${key}=${encodeURIComponent(val.trim()).replace(/%20/g, "+")}&`;
    }
  }
  let str = out.slice(0, -1);
  if (passphrase) {
    str += `&passphrase=${encodeURIComponent(passphrase.trim()).replace(/%20/g, "+")}`;
  }
  return crypto.createHash("md5").update(str).digest("hex");
}

app.post("/payfast/create", (req: Request, res: Response) => {
  const { amount, itemName, reference, email } = req.body || {};
  if (!amount || !reference) return bad(res, "amount and reference are required");
  if (!env.PAYFAST_MERCHANT_ID || !env.PAYFAST_MERCHANT_KEY) {
    return bad(res, "PayFast keys not configured", 503);
  }

  const sandbox = env.PAYFAST_SANDBOX !== "false";
  const base = sandbox ? "https://sandbox.payfast.co.za/eng/process" : "https://www.payfast.co.za/eng/process";

  // Field order matters for the signature — keep insertion order.
  const data: Record<string, string> = {
    merchant_id: env.PAYFAST_MERCHANT_ID,
    merchant_key: env.PAYFAST_MERCHANT_KEY,
    return_url: env.RETURN_URL || "",
    cancel_url: env.CANCEL_URL || "",
    notify_url: `${req.protocol}://${req.get("host")}/payfast/notify`,
    email_address: email || "",
    m_payment_id: String(reference),
    amount: Number(amount).toFixed(2),
    item_name: itemName || "Mr Dweedery order",
  };
  data.signature = payfastSignature(data, env.PAYFAST_PASSPHRASE);

  return res.json({ ok: true, provider: "payfast", url: base, fields: data });
});

app.post("/payfast/notify", (req: Request, res: Response) => {
  const data: Record<string, string> = { ...req.body };
  const received = data.signature;
  delete data.signature;
  const expected = payfastSignature(data, env.PAYFAST_PASSPHRASE);
  const valid = received === expected;
  logger.info("PayFast ITN", { reference: data.m_payment_id, status: data.payment_status, valid });
  // TODO: also validate source IP and do a server postback to PayFast, then
  // mark the order paid in your datastore.
  return res.status(200).send(valid ? "OK" : "INVALID");
});

// --------------------------------------------------------------------------
// Yoco (tokenised card charge)
// --------------------------------------------------------------------------
app.post("/yoco/charge", async (req: Request, res: Response) => {
  const { token, amount, currency, reference } = req.body || {};
  if (!token || !amount) return bad(res, "token and amount are required");
  if (!env.YOCO_SECRET_KEY) return bad(res, "Yoco secret key not configured", 503);

  try {
    const resp = await fetch("https://payments.yoco.com/api/charges/", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Auth-Secret-Key": env.YOCO_SECRET_KEY,
      },
      body: JSON.stringify({
        token,
        amountInCents: Math.round(Number(amount) * 100),
        currency: currency || "ZAR",
        metadata: { reference: reference || "" },
      }),
    });
    const result = (await resp.json()) as Record<string, unknown>;
    if (!resp.ok) {
      logger.warn("Yoco charge failed", result);
      return res.status(resp.status).json({ ok: false, provider: "yoco", error: result });
    }
    return res.json({ ok: true, provider: "yoco", reference: result.id, charge: result });
  } catch (e) {
    logger.error("Yoco error", e as Error);
    return bad(res, "Yoco request failed", 502);
  }
});

// --------------------------------------------------------------------------
// Ozow (Instant EFT redirect)
// --------------------------------------------------------------------------
function ozowHash(fields: string[], privateKey: string): string {
  const input = (fields.join("") + privateKey).toLowerCase();
  return crypto.createHash("sha512").update(input).digest("hex");
}

app.post("/ozow/create", (req: Request, res: Response) => {
  const { amount, reference, bankReference } = req.body || {};
  if (!amount || !reference) return bad(res, "amount and reference are required");
  if (!env.OZOW_SITE_CODE || !env.OZOW_PRIVATE_KEY) return bad(res, "Ozow keys not configured", 503);

  const isTest = env.OZOW_IS_TEST !== "false";
  const fields: Record<string, string> = {
    SiteCode: env.OZOW_SITE_CODE,
    CountryCode: "ZA",
    CurrencyCode: "ZAR",
    Amount: Number(amount).toFixed(2),
    TransactionReference: String(reference),
    BankReference: String(bankReference || reference).slice(0, 20),
    Cancel: env.CANCEL_URL || "",
    Error: env.CANCEL_URL || "",
    Success: env.RETURN_URL || "",
    Notify: `${req.protocol}://${req.get("host")}/ozow/notify`,
    IsTest: isTest ? "true" : "false",
  };
  // Hash is computed over the values in the order Ozow documents for a request.
  const order = [
    fields.SiteCode,
    fields.CountryCode,
    fields.CurrencyCode,
    fields.Amount,
    fields.TransactionReference,
    fields.BankReference,
    fields.Cancel,
    fields.Error,
    fields.Success,
    fields.Notify,
    fields.IsTest,
  ];
  fields.HashCheck = ozowHash(order, env.OZOW_PRIVATE_KEY);

  return res.json({ ok: true, provider: "ozow", url: "https://pay.ozow.com", fields });
});

app.post("/ozow/notify", (req: Request, res: Response) => {
  const data = req.body || {};
  logger.info("Ozow notify", { ref: data.TransactionReference, status: data.Status });
  // TODO: recompute the response hash and verify before marking the order paid.
  return res.status(200).send("OK");
});

// --------------------------------------------------------------------------
// SnapScan (scan-to-pay link)
// --------------------------------------------------------------------------
app.post("/snapscan/create", (req: Request, res: Response) => {
  const { amount, reference } = req.body || {};
  if (!amount || !reference) return bad(res, "amount and reference are required");
  if (!env.SNAPSCAN_MERCHANT_ID) return bad(res, "SnapScan merchant id not configured", 503);

  const cents = Math.round(Number(amount) * 100);
  const query = `id=${encodeURIComponent(reference)}&amount=${cents}&strict=true`;
  let url = `https://pos.snapscan.io/qr/${env.SNAPSCAN_MERCHANT_ID}?${query}`;
  if (env.SNAPSCAN_API_KEY) {
    const sig = crypto.createHmac("sha256", env.SNAPSCAN_API_KEY).update(query).digest("hex");
    url += `&signature=${sig}`;
  }
  return res.json({ ok: true, provider: "snapscan", url, amount: cents });
});

app.post("/snapscan/webhook", (req: Request, res: Response) => {
  logger.info("SnapScan webhook", req.body);
  // TODO: verify the webhook signature header and mark the order paid.
  return res.status(200).send("OK");
});

// --------------------------------------------------------------------------
app.get("/health", (_req: Request, res: Response) => {
  res.json({
    ok: true,
    service: "mr-dweedery-backend",
    configured: {
      payfast: !!(env.PAYFAST_MERCHANT_ID && env.PAYFAST_MERCHANT_KEY),
      yoco: !!env.YOCO_SECRET_KEY,
      ozow: !!(env.OZOW_SITE_CODE && env.OZOW_PRIVATE_KEY),
      snapscan: !!env.SNAPSCAN_MERCHANT_ID,
    },
  });
});

// Exported HTTPS function.
//
// Keys are read from process.env (a local .env for the emulator, or function
// env vars in production). For production hardening, move the sensitive ones
// into Secret Manager with `firebase functions:secrets:set NAME` and add a
// `secrets: ["YOCO_SECRET_KEY", ...]` option here so they're injected securely.
export const api = onRequest({ region: "europe-west1" }, app);
