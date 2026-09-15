// Bank reconciliation (Module 5).
//
// Proving the books agree with the bank, and — more useful — showing exactly
// what doesn't. Three things can be true of any transaction:
//
//   matched          on the statement AND in the books
//   statement only   the bank knows about it, the books don't (fees, interest,
//                    debit orders you forgot) — these need capturing
//   books only       you recorded it, the bank hasn't shown it yet (a deposit
//                    in transit, an unpresented payment) — or it's an error
//
// A reconciliation that "balances" while items sit unexplained is worse than
// useless, so the summary always shows the difference and what makes it up.

import { Txn, isMoneyIn } from "./accounting";
import { ParsedLine } from "./bankImport";
import { parseISO } from "./format";

export type MatchConfidence = "exact" | "close" | "manual";

export interface MatchPair {
  line: ParsedLine;
  txn: Txn;
  confidence: MatchConfidence;
  /** Days between the statement date and the book date. */
  dayGap: number;
}

export interface ReconcileResult {
  matched: MatchPair[];
  /** On the statement, nothing in the books — needs capturing. */
  statementOnly: ParsedLine[];
  /** In the books, not on the statement — in transit, or wrong. */
  booksOnly: Txn[];
}

/** How many days apart a "close" match may be. */
const CLOSE_WINDOW_DAYS = 5;

function daysBetween(a: string, b: string): number {
  const da = parseISO(a);
  const db = parseISO(b);
  if (!da || !db) return Number.MAX_SAFE_INTEGER;
  return Math.abs(Math.round((da.getTime() - db.getTime()) / 86_400_000));
}

function sameDirection(line: ParsedLine, txn: Txn): boolean {
  return line.amount > 0 === isMoneyIn(txn);
}

function sameAmount(line: ParsedLine, txn: Txn): boolean {
  return Math.abs(Math.abs(line.amount) - txn.amount) < 0.005;
}

/** Only entries that actually move the bank account can appear on a statement. */
export function bankTxns(txns: Txn[], upToDate?: string): Txn[] {
  return txns.filter((t) => {
    if (t.debit !== "bank" && t.credit !== "bank") return false;
    if (upToDate && t.date > upToDate) return false;
    return true;
  });
}

/**
 * Two passes, greedy. Exact date matches are taken first across the whole
 * statement, so a same-amount entry a few days away can't steal a line that has
 * a perfect partner — which is the usual cause of a rec that nearly works.
 */
export function reconcile(
  lines: ParsedLine[],
  txns: Txn[],
  alreadyReconciled: Set<string> = new Set()
): ReconcileResult {
  const candidates = bankTxns(txns).filter((t) => !alreadyReconciled.has(t.id));
  const usedTxns = new Set<string>();
  const usedLines = new Set<string>();
  const matched: MatchPair[] = [];

  const take = (line: ParsedLine, txn: Txn, confidence: MatchConfidence) => {
    matched.push({ line, txn, confidence, dayGap: daysBetween(line.date, txn.date) });
    usedTxns.add(txn.id);
    usedLines.add(line.id);
  };

  // Pass 1 — same day, same amount, same direction.
  for (const line of lines) {
    const hit = candidates.find(
      (t) =>
        !usedTxns.has(t.id) && t.date === line.date && sameAmount(line, t) && sameDirection(line, t)
    );
    if (hit) take(line, hit, "exact");
  }

  // Pass 2 — same amount and direction within a few days, nearest first.
  for (const line of lines) {
    if (usedLines.has(line.id)) continue;
    const near = candidates
      .filter((t) => !usedTxns.has(t.id) && sameAmount(line, t) && sameDirection(line, t))
      .map((t) => ({ t, gap: daysBetween(line.date, t.date) }))
      .filter((x) => x.gap <= CLOSE_WINDOW_DAYS)
      .sort((a, b) => a.gap - b.gap)[0];
    if (near) take(line, near.t, "close");
  }

  return {
    matched,
    statementOnly: lines.filter((l) => !usedLines.has(l.id)),
    booksOnly: candidates.filter((t) => !usedTxns.has(t.id)),
  };
}

/** Applies a manual pairing on top of an automatic result. */
export function applyManualMatch(
  result: ReconcileResult,
  lineId: string,
  txnId: string
): ReconcileResult {
  const line = result.statementOnly.find((l) => l.id === lineId);
  const txn = result.booksOnly.find((t) => t.id === txnId);
  if (!line || !txn) return result;

  return {
    matched: [
      ...result.matched,
      { line, txn, confidence: "manual", dayGap: daysBetween(line.date, txn.date) },
    ],
    statementOnly: result.statementOnly.filter((l) => l.id !== lineId),
    booksOnly: result.booksOnly.filter((t) => t.id !== txnId),
  };
}

/** Breaks a pair apart again, returning both sides to the unmatched lists. */
export function unmatch(result: ReconcileResult, lineId: string): ReconcileResult {
  const pair = result.matched.find((m) => m.line.id === lineId);
  if (!pair) return result;

  return {
    matched: result.matched.filter((m) => m.line.id !== lineId),
    statementOnly: [...result.statementOnly, pair.line],
    booksOnly: [...result.booksOnly, pair.txn],
  };
}

export interface ReconcileSummary {
  /** Closing balance per the bank statement. */
  statementClosing: number;
  /** Bank balance per the books, as at the statement date. */
  bookBalance: number;
  /** Recorded money in the bank hasn't shown yet. */
  depositsInTransit: number;
  /** Recorded money out the bank hasn't taken yet. */
  unpresentedPayments: number;
  /** statementClosing + deposits − unpresented. Should equal bookBalance. */
  adjustedBankBalance: number;
  difference: number;
  balanced: boolean;
  /** Statement lines with no book entry — the work still to do. */
  unrecordedCount: number;
  unrecordedValue: number;
}

/**
 * The reconciliation statement itself.
 *
 * `bookBalance` must be the bank balance as at the statement's closing date,
 * including the opening balance — passing a period-only figure produces a
 * difference that looks like an error but is just a truncated book.
 */
export function summariseReconciliation(
  result: ReconcileResult,
  statementClosing: number,
  bookBalance: number
): ReconcileSummary {
  let depositsInTransit = 0;
  let unpresentedPayments = 0;

  for (const txn of result.booksOnly) {
    if (isMoneyIn(txn)) depositsInTransit += txn.amount;
    else unpresentedPayments += txn.amount;
  }

  const adjustedBankBalance = statementClosing + depositsInTransit - unpresentedPayments;
  const difference = adjustedBankBalance - bookBalance;

  const unrecordedValue = result.statementOnly.reduce((sum, l) => sum + l.amount, 0);

  return {
    statementClosing,
    bookBalance,
    depositsInTransit,
    unpresentedPayments,
    adjustedBankBalance,
    difference,
    balanced: Math.abs(difference) < 0.005,
    unrecordedCount: result.statementOnly.length,
    unrecordedValue,
  };
}

/**
 * The closing balance a statement implies, when it carries a running balance
 * column. Uses the latest-dated line, since FNB exports newest-first.
 */
export function closingBalanceFromStatement(lines: ParsedLine[]): number | null {
  const withBalance = lines.filter((l) => typeof l.balance === "number");
  if (!withBalance.length) return null;

  const latest = withBalance.reduce((best, l) => (l.date > best.date ? l : best), withBalance[0]);
  return latest.balance ?? null;
}

export interface Reconciliation {
  id: string;
  /** Closing date of the statement reconciled. */
  statementDate: string;
  closingBalance: number;
  bookBalance: number;
  difference: number;
  matchedTxnIds: string[];
  createdAt: string;
  /** Set on every change; drives last-write-wins during cloud sync. */
  updatedAt?: number;
  /** Set instead of removing the record, so the deletion reaches other devices. */
  deletedAt?: number;
}

export function newReconciliationId(): string {
  return `rec-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

export function buildReconciliation(
  result: ReconcileResult,
  summary: ReconcileSummary,
  statementDate: string
): Reconciliation {
  return {
    id: newReconciliationId(),
    statementDate,
    closingBalance: summary.statementClosing,
    bookBalance: summary.bookBalance,
    difference: summary.difference,
    matchedTxnIds: result.matched.map((m) => m.txn.id),
    createdAt: new Date().toISOString(),
  };
}

/** Every transaction cleared by a past reconciliation. */
export function reconciledTxnIds(reconciliations: Reconciliation[]): Set<string> {
  const ids = new Set<string>();
  for (const r of reconciliations) {
    for (const id of r.matchedTxnIds) ids.add(id);
  }
  return ids;
}

/** How far the books are proven against the bank. */
export function reconciledToDate(reconciliations: Reconciliation[]): string | null {
  if (!reconciliations.length) return null;
  return reconciliations.reduce(
    (latest, r) => (r.statementDate > latest ? r.statementDate : latest),
    reconciliations[0].statementDate
  );
}
