// Bank statement import (Module 2).
//
// Two formats, because FNB gives you both and neither is pleasant:
//
//   CSV  — a handful of metadata rows, then a header row, then the transactions,
//          newest first. Column order and date format both vary by export, so
//          the header is located rather than assumed.
//   OFX  — SGML-ish <STMTTRN> blocks. Negative TRNAMT is money out.
//
// Nothing here posts anything. Parsing produces candidate lines; the user
// assigns a category to each one and confirms before a single entry is booked.
// Auto-posting an uncategorised statement is how books drift out of shape.

import { Txn, RECIPES, Recipe } from "./accounting";
import { parseISO, toISO } from "./format";

export interface ParsedLine {
  /** Stable across re-imports of the same statement. */
  id: string;
  date: string; // ISO
  /** Signed: positive is money into the account. */
  amount: number;
  balance?: number;
  description: string;
}

export type ParseResult =
  | { ok: true; lines: ParsedLine[]; format: "csv" | "ofx" }
  | { ok: false; reason: string };

// ---------------------------------------------------------------------------
// CSV
// ---------------------------------------------------------------------------

/** Splits one CSV line, honouring quoted fields and escaped quotes. */
export function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      out.push(field.trim());
      field = "";
    } else {
      field += ch;
    }
  }
  out.push(field.trim());
  return out;
}

interface ColumnMap {
  date: number;
  amount: number;
  balance: number;
  description: number;
}

/**
 * FNB puts account metadata above the real header, and the header wording
 * differs between exports, so the columns are found by matching on keywords
 * rather than by position.
 */
function findHeader(rows: string[][]): { index: number; columns: ColumnMap } | null {
  for (let i = 0; i < Math.min(rows.length, 40); i++) {
    const cells = rows[i].map((c) => c.toLowerCase());
    const date = cells.findIndex((c) => c === "date" || c.includes("date"));
    const amount = cells.findIndex((c) => c === "amount" || c.includes("amount"));
    if (date === -1 || amount === -1) continue;

    const balance = cells.findIndex((c) => c.includes("balance"));
    const description = cells.findIndex(
      (c) => c.includes("description") || c.includes("detail") || c.includes("narrative")
    );
    return {
      index: i,
      columns: { date, amount, balance, description: description === -1 ? -1 : description },
    };
  }
  return null;
}

/** Accepts the date shapes FNB exports use, plus a couple of common variants. */
export function parseFlexibleDate(raw: string): string | null {
  const s = raw.trim().replace(/"/g, "");
  if (!s) return null;

  // Already ISO.
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;

  // 2026/03/09
  let m = /^(\d{4})[/.](\d{1,2})[/.](\d{1,2})$/.exec(s);
  if (m) return pad(Number(m[1]), Number(m[2]), Number(m[3]));

  // 09/03/2026 or 09-03-2026 — day first, which is the SA convention.
  m = /^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{4})$/.exec(s);
  if (m) return pad(Number(m[3]), Number(m[2]), Number(m[1]));

  // 09 Mar 2026 / 9 March 2026
  m = /^(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})$/.exec(s);
  if (m) {
    const month = monthFromName(m[2]);
    if (month) return pad(Number(m[3]), month, Number(m[1]));
  }

  // 09 Mar (no year) — FNB does this on some statements; assume current year.
  m = /^(\d{1,2})\s+([A-Za-z]{3,})$/.exec(s);
  if (m) {
    const month = monthFromName(m[2]);
    if (month) return pad(new Date().getFullYear(), month, Number(m[1]));
  }

  const parsed = new Date(s);
  return Number.isNaN(parsed.getTime()) ? null : toISO(parsed);
}

function pad(y: number, m: number, d: number): string | null {
  if (m < 1 || m > 12 || d < 1 || d > 31) return null;
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

const MONTH_NAMES = [
  "jan", "feb", "mar", "apr", "may", "jun",
  "jul", "aug", "sep", "oct", "nov", "dec",
];

function monthFromName(name: string): number | null {
  const idx = MONTH_NAMES.indexOf(name.slice(0, 3).toLowerCase());
  return idx === -1 ? null : idx + 1;
}

/**
 * Bank amounts arrive with thousands separators, currency symbols, trailing
 * Cr/Dr markers, or parentheses for negatives. All of those mean the same
 * thing to us; only the sign matters.
 */
export function parseBankAmount(raw: string): number | null {
  let s = raw.trim().replace(/"/g, "");
  if (!s) return null;

  let negative = false;

  // Cr/Dr markers come off first. Stripping the rand symbol before this point
  // would also eat the "r", leaving "C"/"D" and losing the sign entirely.
  if (/dr$/i.test(s)) {
    negative = true;
    s = s.replace(/dr$/i, "");
  } else if (/cr$/i.test(s)) {
    s = s.replace(/cr$/i, "");
  }

  // Only a leading rand symbol, so a stray R elsewhere still fails validation.
  s = s.replace(/^R/i, "").replace(/\s/g, "");

  if (/^\(.*\)$/.test(s)) {
    negative = true;
    s = s.slice(1, -1);
  }

  s = s.replace(/,/g, "");
  if (s.startsWith("-")) {
    negative = true;
    s = s.slice(1);
  }
  if (!/^\d*\.?\d*$/.test(s) || s === "" || s === ".") return null;

  const value = Number(s);
  if (!Number.isFinite(value)) return null;
  return negative ? -value : value;
}

export function parseCsv(text: string): ParseResult {
  const rows = text
    .split(/\r?\n/)
    .filter((l) => l.trim() !== "")
    .map(splitCsvLine);

  if (!rows.length) return { ok: false, reason: "That file is empty." };

  const header = findHeader(rows);
  if (!header) {
    return {
      ok: false,
      reason: "Couldn't find a Date and Amount column. Is this an FNB CSV export?",
    };
  }

  const { columns } = header;
  const lines: ParsedLine[] = [];

  for (let i = header.index + 1; i < rows.length; i++) {
    const cells = rows[i];
    const date = parseFlexibleDate(cells[columns.date] ?? "");
    const amount = parseBankAmount(cells[columns.amount] ?? "");
    if (!date || amount === null || amount === 0) continue;

    const description =
      columns.description >= 0 ? (cells[columns.description] ?? "").trim() : "";
    const balance =
      columns.balance >= 0 ? parseBankAmount(cells[columns.balance] ?? "") : null;

    lines.push({
      id: lineId(date, amount, description),
      date,
      amount,
      balance: balance ?? undefined,
      description: description || "(no description)",
    });
  }

  if (!lines.length) {
    return { ok: false, reason: "Found the header but no transaction rows below it." };
  }
  return { ok: true, lines, format: "csv" };
}

// ---------------------------------------------------------------------------
// OFX
// ---------------------------------------------------------------------------

function ofxTag(block: string, tag: string): string {
  // OFX tags often aren't closed, so read to the next tag or line end.
  const m = new RegExp(`<${tag}>([^<\\r\\n]*)`, "i").exec(block);
  return m ? m[1].trim() : "";
}

export function parseOfx(text: string): ParseResult {
  const blocks = text.match(/<STMTTRN>[\s\S]*?<\/STMTTRN>/gi);
  if (!blocks?.length) {
    return { ok: false, reason: "No <STMTTRN> blocks found. Is this an OFX statement?" };
  }

  const lines: ParsedLine[] = [];
  for (const block of blocks) {
    const posted = ofxTag(block, "DTPOSTED");
    const amountRaw = ofxTag(block, "TRNAMT");
    const memo = ofxTag(block, "MEMO");
    const name = ofxTag(block, "NAME");
    const fitId = ofxTag(block, "FITID");

    // DTPOSTED is YYYYMMDD, sometimes with a time and timezone appended.
    const m = /^(\d{4})(\d{2})(\d{2})/.exec(posted);
    const date = m ? pad(Number(m[1]), Number(m[2]), Number(m[3])) : null;
    const amount = parseBankAmount(amountRaw);
    if (!date || amount === null || amount === 0) continue;

    const description = [name, memo].filter(Boolean).join(" — ") || "(no description)";
    lines.push({
      // FITID is the bank's own unique id, so prefer it when present.
      id: fitId ? `ofx:${fitId}` : lineId(date, amount, description),
      date,
      amount,
      description,
    });
  }

  if (!lines.length) {
    return { ok: false, reason: "Found OFX blocks but none held a usable date and amount." };
  }
  return { ok: true, lines, format: "ofx" };
}

export function parseStatement(text: string, filename: string): ParseResult {
  const looksOfx = /<OFX>|<STMTTRN>/i.test(text);
  if (looksOfx || /\.ofx$/i.test(filename)) return parseOfx(text);
  return parseCsv(text);
}

/** Deterministic id so the same line from the same statement always matches. */
function lineId(date: string, amount: number, description: string): string {
  const key = `${date}|${amount.toFixed(2)}|${description.toLowerCase().slice(0, 40)}`;
  let hash = 0;
  for (let i = 0; i < key.length; i++) {
    hash = (hash * 31 + key.charCodeAt(i)) | 0;
  }
  return `csv:${Math.abs(hash).toString(36)}`;
}

// ---------------------------------------------------------------------------
// Categorisation
// ---------------------------------------------------------------------------

interface Rule {
  /** Matched case-insensitively against the description. */
  keywords: string[];
  account: string;
}

/**
 * Keyword rules for the descriptions FNB actually writes. These only ever
 * pre-select a category — the user still confirms every line before it posts.
 */
const EXPENSE_RULES: Rule[] = [
  {
    account: "bank_charges",
    keywords: [
      "service fee", "monthly account fee", "account fee", "card fee", "cash dep fee",
      "cash deposit fee", "bank charge", "admin fee", "sms notification", "inmaestro fee",
      "unpaid fee", "payment fee", "atm fee", "##", "#monthly",
    ],
  },
  {
    account: "motor",
    keywords: ["engen", "sasol", "shell", "bp ", "total ", "caltex", "fuel", "petrol", "garage", "toll", "sanral", "e-toll"],
  },
  {
    account: "telephone",
    keywords: ["telkom", "vodacom", "mtn", "cell c", "afrihost", "rain ", "webafrica", "internet", "airtime", "fibre", "openserve"],
  },
  {
    account: "salaries",
    keywords: ["salary", "salaries", "wage", "payroll", "uif", "paye"],
  },
  { account: "rent", keywords: ["rent", "lease", "landlord"] },
  {
    account: "travel",
    keywords: ["uber", "bolt ", "flight", "airline", "hotel", "guest house", "lodge", "airbnb", "car hire", "avis", "hertz"],
  },
  {
    account: "advertising",
    keywords: ["facebook", "meta plat", "google ads", "adwords", "marketing", "advertis", "instagram"],
  },
  {
    account: "cos",
    keywords: ["freight", "shipping", "courier", "dhl", "fedex", "clearing", "customs", "forwarding"],
  },
];

const OWNER_KEYWORDS = ["owner", "capital", "loan from", "director"];
const DRAWINGS_KEYWORDS = ["drawings", "personal", "own use"];
const INVOICE_KEYWORDS = ["inv", "invoice"];

export interface Suggestion {
  recipeId: string;
  /** Only set when the recipe needs the user to choose an account. */
  accountId?: string;
  /** Why this was suggested, shown so the guess is auditable. */
  reason: string;
}

export function suggestCategory(line: ParsedLine): Suggestion {
  const desc = line.description.toLowerCase();
  const moneyIn = line.amount > 0;

  if (moneyIn) {
    if (OWNER_KEYWORDS.some((k) => desc.includes(k))) {
      return { recipeId: "owner_in", reason: "Looks like an owner contribution" };
    }
    if (INVOICE_KEYWORDS.some((k) => desc.includes(k))) {
      return { recipeId: "invoice_paid", reason: "Mentions an invoice" };
    }
    return { recipeId: "sale_cash", accountId: "sales", reason: "Money in — defaulting to a sale" };
  }

  if (DRAWINGS_KEYWORDS.some((k) => desc.includes(k))) {
    return { recipeId: "drawings", reason: "Looks personal" };
  }

  for (const rule of EXPENSE_RULES) {
    const hit = rule.keywords.find((k) => desc.includes(k));
    if (hit) {
      return {
        recipeId: "expense",
        accountId: rule.account,
        reason: `Matched "${hit.trim()}"`,
      };
    }
  }
  return { recipeId: "expense", accountId: "general", reason: "Money out — needs a category" };
}

/** Recipes valid for a line, narrowed by whether money came in or went out. */
export function recipesForLine(line: ParsedLine): Recipe[] {
  return RECIPES.filter((r) => (line.amount > 0 ? r.dir === "in" : r.dir === "out"));
}

// ---------------------------------------------------------------------------
// Duplicate detection
// ---------------------------------------------------------------------------

/**
 * Re-importing an overlapping statement is the single easiest way to
 * double-count, which is exactly what this app exists to prevent. A line is
 * treated as already captured when an existing bank entry shares its date and
 * amount; the description is used only to raise confidence, because banks
 * reword the same transaction between exports.
 */
export function findDuplicate(line: ParsedLine, existing: Txn[]): Txn | undefined {
  const target = Math.abs(line.amount);
  const moneyIn = line.amount > 0;

  return existing.find((t) => {
    const touchesBank = t.debit === "bank" || t.credit === "bank";
    if (!touchesBank) return false;
    if ((t.debit === "bank") !== moneyIn) return false;
    if (t.date !== line.date) return false;
    return Math.abs(t.amount - target) < 0.005;
  });
}

export interface ImportCandidate {
  line: ParsedLine;
  suggestion: Suggestion;
  duplicateOf?: Txn;
  /** Off by default for duplicates, on for everything else. */
  selected: boolean;
}

export function buildCandidates(lines: ParsedLine[], existing: Txn[]): ImportCandidate[] {
  return lines.map((line) => {
    const duplicateOf = findDuplicate(line, existing);
    return {
      line,
      suggestion: suggestCategory(line),
      duplicateOf,
      selected: !duplicateOf,
    };
  });
}

/** Turns a confirmed candidate into the ledger entry it should post. */
export function candidateToTxn(
  candidate: ImportCandidate,
  recipeId: string,
  accountId: string | undefined
): Txn | null {
  const recipe = RECIPES.find((r) => r.id === recipeId);
  if (!recipe) return null;

  const debit = recipe.pick === "debit" ? accountId ?? recipe.debit : recipe.debit;
  const credit = recipe.pick === "credit" ? accountId ?? recipe.credit : recipe.credit;

  return {
    id: `import-${candidate.line.id}`,
    date: candidate.line.date,
    desc: candidate.line.description,
    amount: Math.abs(candidate.line.amount),
    debit,
    credit,
    recipe: recipe.id,
  };
}

export interface ImportSummary {
  total: number;
  selected: number;
  duplicates: number;
  moneyIn: number;
  moneyOut: number;
}

export function summariseCandidates(candidates: ImportCandidate[]): ImportSummary {
  let selected = 0;
  let duplicates = 0;
  let moneyIn = 0;
  let moneyOut = 0;

  for (const c of candidates) {
    if (c.duplicateOf) duplicates++;
    if (!c.selected) continue;
    selected++;
    if (c.line.amount > 0) moneyIn += c.line.amount;
    else moneyOut += Math.abs(c.line.amount);
  }
  return { total: candidates.length, selected, duplicates, moneyIn, moneyOut };
}

/** Statement date span, for the summary header. */
export function dateRange(lines: ParsedLine[]): { from: string; to: string } | null {
  if (!lines.length) return null;
  const sorted = [...lines].map((l) => l.date).sort();
  return { from: sorted[0], to: sorted[sorted.length - 1] };
}

export function isValidStatementDate(iso: string): boolean {
  const d = parseISO(iso);
  if (!d) return false;
  const year = d.getFullYear();
  return year >= 2000 && year <= new Date().getFullYear() + 1;
}
