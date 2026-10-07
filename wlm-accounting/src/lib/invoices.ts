// Invoices & Quotes (Module 3).
//
// This module is the reason the app exists. The owner's previous system booked an
// invoice as revenue AND booked the matching bank deposit as revenue again,
// overstating income and the bank by ~R1.3m. Here, revenue is recognised exactly
// once, at exactly one moment:
//
//   Issue an invoice  ->  Dr Trade Receivables / Cr Sales   (revenue recognised)
//   Mark it paid      ->  Dr Bank / Cr Trade Receivables    (receivable cleared)
//
// The payment posting NEVER touches an income account. Both entries are generated
// by this module and tagged with `sourceDoc`, so they can't be hand-edited out of
// step with the document they belong to.
//
// Quotes post nothing at all — they are not transactions until accepted and
// converted to an invoice.

import { Txn } from "./accounting";
import { CRYPTO_ACCOUNT, CRYPTO_GAINS_ACCOUNT, CryptoAsset, unitsForZar } from "./crypto";
import { todayISO } from "./format";

export type DocKind = "invoice" | "quote";
export type DocStatus = "draft" | "sent" | "paid" | "accepted" | "declined" | "void";

export interface LineItem {
  id: string;
  description: string;
  qty: number;
  unitPrice: number;
}

/**
 * The crypto option offered on a document.
 *
 * The rate is fixed here and the units are not: the figure a customer was
 * quoted must not move because a rate in settings was updated afterwards, but
 * it must follow the document's own total if a line is corrected. So the rate
 * is stored, the coins are worked out from it, and there is only ever one
 * version of each.
 *
 * The rands remain what is owed. This is a way to pay it, not a second price.
 */
export interface DocCrypto {
  /** Asset symbol, e.g. "USDT". */
  asset: string;
  /** Rands per coin, fixed when the document was issued. */
  rateZar: number;
  /** The asset's precision, carried along so the quoted figure never shifts. */
  decimals: number;
}

/**
 * How an invoice was actually settled.
 *
 * Absent means the ordinary thing: the full amount, into the bank. For crypto
 * it records the coins that arrived and what they were worth that day, which is
 * rarely the rand total exactly — the rate moves between issuing an invoice and
 * being paid for it.
 */
export interface DocSettlement {
  /** The account the payment landed in — "bank" or "crypto". */
  account: string;
  /** Crypto only: the symbol of what arrived. */
  asset?: string;
  /** Crypto only: how many coins arrived. */
  units?: number;
  /** Crypto only: what those coins were worth in rands on the day. */
  zar?: number;
}

export interface BusinessDoc {
  id: string;
  kind: DocKind;
  number: string; // INV-0001 / QUO-0001
  customer: string;
  date: string; // issue date, ISO
  dueDate?: string;
  items: LineItem[];
  notes?: string;
  status: DocStatus;
  /** Set when an invoice is marked paid. */
  paidDate?: string;
  /** Set to offer payment in coins as well as into the bank. */
  crypto?: DocCrypto;
  /** How it was paid. Absent means the full amount, into the bank. */
  settlement?: DocSettlement;
  /** Set on a quote once it has been turned into an invoice. */
  convertedToId?: string;
  /** The income account the sale is credited to. */
  incomeAccount: string;
  /** Set on every change; drives last-write-wins during cloud sync. */
  updatedAt?: number;
  /** Set instead of removing the record, so the deletion reaches other devices. */
  deletedAt?: number;
}

export function lineTotal(item: LineItem): number {
  return item.qty * item.unitPrice;
}

// No VAT: the company is not VAT-registered. When it registers, the VAT split
// goes here and on the postings below — nowhere else.
export function docTotal(doc: BusinessDoc): number {
  return doc.items.reduce((sum, i) => sum + lineTotal(i), 0);
}

/** Next sequential number for a kind, zero-padded to 4 digits. */
export function nextDocNumber(docs: BusinessDoc[], kind: DocKind): string {
  const prefix = kind === "invoice" ? "INV" : "QUO";
  const used = docs
    .filter((d) => d.kind === kind)
    .map((d) => Number(d.number.split("-")[1]))
    .filter((n) => Number.isFinite(n));
  const next = used.length ? Math.max(...used) + 1 : 1;
  return `${prefix}-${String(next).padStart(4, "0")}`;
}

/** Both postings an invoice can produce are tagged so they stay linked to it. */
export function issuePostingId(docId: string): string {
  return `doc:${docId}:issue`;
}

export function paymentPostingId(docId: string): string {
  return `doc:${docId}:payment`;
}

export function settlementPostingId(docId: string): string {
  return `doc:${docId}:settlement`;
}

/** The coins a document asks for, worked out from its own total and rate. */
export function cryptoDue(doc: BusinessDoc): number {
  if (!doc.crypto) return 0;
  return unitsForZar(docTotal(doc), doc.crypto.rateZar, doc.crypto.decimals);
}

/** The crypto block to put on a document, from the asset's current settings. */
export function cryptoOption(asset: CryptoAsset): DocCrypto {
  return { asset: asset.symbol, rateZar: asset.rateZar, decimals: asset.decimals };
}

export function isCryptoSettlement(doc: BusinessDoc): boolean {
  return doc.settlement?.account === CRYPTO_ACCOUNT && typeof doc.settlement.zar === "number";
}

/**
 * The entry that recognises revenue. Posted once, when an invoice is issued.
 * Quotes never produce this.
 */
export function buildIssuePosting(doc: BusinessDoc): Txn | null {
  if (doc.kind !== "invoice") return null;
  const total = docTotal(doc);
  if (total <= 0) return null;
  return {
    id: issuePostingId(doc.id),
    date: doc.date,
    desc: `${doc.number} — ${doc.customer}`,
    amount: total,
    debit: "receivables",
    credit: doc.incomeAccount,
    recipe: "invoice_issued",
    sourceDoc: doc.id,
  };
}

/**
 * The entry that settles the receivable. Credits receivables and debits
 * whichever account the money landed in — deliberately never an income
 * account, which is what stops the same sale being counted twice.
 *
 * Paid in coins, the amount is what those coins were worth on the day rather
 * than the rand total of the invoice. The wallet has to carry what actually
 * arrived or it will never agree with Binance again; whatever that leaves of
 * the receivable is cleared by the settlement entry below.
 */
export function buildPaymentPosting(doc: BusinessDoc): Txn | null {
  if (doc.kind !== "invoice" || doc.status !== "paid" || !doc.paidDate) return null;
  const total = docTotal(doc);
  if (total <= 0) return null;

  const crypto = isCryptoSettlement(doc);
  const amount = crypto ? doc.settlement!.zar! : total;
  if (amount <= 0) return null;

  return {
    id: paymentPostingId(doc.id),
    date: doc.paidDate,
    desc: `${doc.number} paid — ${doc.customer}`,
    amount,
    debit: doc.settlement?.account || "bank",
    credit: "receivables",
    recipe: "invoice_paid",
    sourceDoc: doc.id,
    ...(crypto && doc.settlement!.units
      ? { crypto: { asset: doc.settlement!.asset ?? "", units: doc.settlement!.units! } }
      : {}),
  };
}

/**
 * The gap between what an invoice asked for and what settling it was worth.
 *
 * Coins are quoted at one rate and arrive at another, so a R100 000 invoice can
 * be honestly settled by USDT worth R99 500. The receivable still has to clear
 * in full — the customer sent what they were asked for and owes nothing — and
 * the R500 is what the business lost on the rate, not revenue it failed to earn.
 * So it goes to crypto gains and losses, which is where every other movement in
 * a rate ends up.
 *
 * Without this the receivable sits R500 short forever and the aged-debtors list
 * fills up with invoices that were paid.
 */
export function buildSettlementPosting(doc: BusinessDoc): Txn | null {
  if (doc.kind !== "invoice" || doc.status !== "paid" || !doc.paidDate) return null;
  if (!isCryptoSettlement(doc)) return null;

  const total = docTotal(doc);
  if (total <= 0) return null;

  // Positive: the coins were worth less than the invoice. Negative: more.
  const shortfall = total - doc.settlement!.zar!;
  if (Math.abs(shortfall) < 0.005) return null;

  return {
    id: settlementPostingId(doc.id),
    date: doc.paidDate,
    desc: `${doc.number} rate difference on settlement — ${doc.customer}`,
    amount: Math.abs(shortfall),
    debit: shortfall > 0 ? CRYPTO_GAINS_ACCOUNT : "receivables",
    credit: shortfall > 0 ? "receivables" : CRYPTO_GAINS_ACCOUNT,
    recipe: "crypto_settlement",
    sourceDoc: doc.id,
  };
}

/** Every ledger entry a document set should produce, in order. */
export function postingsForDocs(docs: BusinessDoc[]): Txn[] {
  const out: Txn[] = [];
  for (const doc of docs) {
    if (doc.status === "draft" || doc.status === "void") continue;
    const issue = buildIssuePosting(doc);
    if (issue) out.push(issue);
    const payment = buildPaymentPosting(doc);
    if (payment) out.push(payment);
    const settlement = buildSettlementPosting(doc);
    if (settlement) out.push(settlement);
  }
  return out;
}

export function newDoc(kind: DocKind, docs: BusinessDoc[]): BusinessDoc {
  return {
    id: `${kind}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    kind,
    number: nextDocNumber(docs, kind),
    customer: "",
    date: todayISO(),
    items: [newLineItem()],
    status: "draft",
    incomeAccount: "sales",
  };
}

export function newLineItem(): LineItem {
  return {
    id: `li-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    description: "",
    qty: 1,
    unitPrice: 0,
  };
}

/**
 * Turns an accepted quote into a fresh invoice, keeping the line items.
 *
 * The crypto rate is re-fixed rather than carried over, because a quote accepted
 * three weeks later would otherwise bill coins at a rate three weeks old. Pass
 * the asset's current option in; passing nothing keeps the quote's own rate,
 * which is right when the two happen the same day.
 */
export function convertQuoteToInvoice(
  quote: BusinessDoc,
  docs: BusinessDoc[],
  crypto?: DocCrypto
): BusinessDoc {
  return {
    ...quote,
    id: `invoice-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    kind: "invoice",
    number: nextDocNumber(docs, "invoice"),
    date: todayISO(),
    status: "sent",
    paidDate: undefined,
    convertedToId: undefined,
    crypto: quote.crypto ? crypto ?? quote.crypto : undefined,
    settlement: undefined,
    items: quote.items.map((i) => ({ ...i, id: newLineItem().id })),
  };
}

export function isOverdue(doc: BusinessDoc, today = todayISO()): boolean {
  return (
    doc.kind === "invoice" &&
    doc.status === "sent" &&
    !!doc.dueDate &&
    doc.dueDate < today
  );
}

export function statusLabel(doc: BusinessDoc): string {
  if (isOverdue(doc)) return "Overdue";
  switch (doc.status) {
    case "draft":
      return "Draft";
    case "sent":
      return doc.kind === "invoice" ? "Unpaid" : "Sent";
    case "paid":
      return "Paid";
    case "accepted":
      return "Accepted";
    case "declined":
      return "Declined";
    case "void":
      return "Void";
  }
}

export interface ReceivablesSummary {
  outstanding: number;
  overdue: number;
  paidThisPeriod: number;
  unpaidCount: number;
}

export function summariseReceivables(docs: BusinessDoc[]): ReceivablesSummary {
  let outstanding = 0;
  let overdue = 0;
  let paidThisPeriod = 0;
  let unpaidCount = 0;

  for (const doc of docs) {
    if (doc.kind !== "invoice") continue;
    const total = docTotal(doc);
    if (doc.status === "sent") {
      outstanding += total;
      unpaidCount++;
      if (isOverdue(doc)) overdue += total;
    } else if (doc.status === "paid") {
      paidThisPeriod += total;
    }
  }

  return { outstanding, overdue, paidThisPeriod, unpaidCount };
}
