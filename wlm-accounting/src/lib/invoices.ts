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
import { todayISO } from "./format";

export type DocKind = "invoice" | "quote";
export type DocStatus = "draft" | "sent" | "paid" | "accepted" | "declined" | "void";

export interface LineItem {
  id: string;
  description: string;
  qty: number;
  unitPrice: number;
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
 * The entry that settles the receivable. Debits the bank and credits
 * receivables — deliberately never an income account, which is what stops the
 * same sale being counted twice.
 */
export function buildPaymentPosting(doc: BusinessDoc): Txn | null {
  if (doc.kind !== "invoice" || doc.status !== "paid" || !doc.paidDate) return null;
  const total = docTotal(doc);
  if (total <= 0) return null;
  return {
    id: paymentPostingId(doc.id),
    date: doc.paidDate,
    desc: `${doc.number} paid — ${doc.customer}`,
    amount: total,
    debit: "bank",
    credit: "receivables",
    recipe: "invoice_paid",
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

/** Turns an accepted quote into a fresh invoice, keeping the line items. */
export function convertQuoteToInvoice(
  quote: BusinessDoc,
  docs: BusinessDoc[]
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
