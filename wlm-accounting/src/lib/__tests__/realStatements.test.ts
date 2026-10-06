import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import {
  buildCandidates,
  candidateToTxn,
  parseStatement,
  summariseCandidates,
} from "../bankImport";
import { SEED_ACCOUNTS, Txn, computeBalances } from "../accounting";
import { closingBalanceFromStatement, reconcile, summariseReconciliation } from "../reconcile";

/**
 * The FNB parser against real exports.
 *
 * Everything else about bank import is covered by fixtures I wrote, which only
 * proves the parser agrees with my idea of the format. This runs it over real
 * statements and checks the result against the one thing in them that cannot
 * be fudged: the running balance the bank itself printed.
 *
 * Real statements are the owner's business and are not in this repository, so
 * this skips unless pointed at a folder of converted CSVs:
 *
 *     WLM_STATEMENTS=/path/to/csvs npm test
 */

const directory = process.env.WLM_STATEMENTS;
const describeIf = directory ? describe : describe.skip;

describeIf("real FNB statements", () => {
  // describe.skip still runs this body to collect the tests it is skipping, so
  // the directory has to be optional here rather than assumed.
  const files = directory
    ? readdirSync(directory)
        .filter((f) => f.endsWith(".csv") && f !== "fnb-all-statements.csv")
        .sort()
    : [];

  const read = (file: string) => parseStatement(readFileSync(join(directory!, file), "utf8"), file);

  const post = (candidates: ReturnType<typeof buildCandidates>, books: Txn[]) => {
    for (const candidate of candidates) {
      if (!candidate.selected) continue;
      const txn = candidateToTxn(
        candidate,
        candidate.suggestion.recipeId,
        candidate.suggestion.accountId
      );
      if (txn) books.push(txn);
    }
  };

  it("finds statements to check", () => {
    expect(files.length).toBeGreaterThan(0);
  });

  // The whole job, end to end: import each statement and reconcile it before
  // moving on, which is how the books are actually kept. Each reconciliation
  // marks what it cleared, so the next month weighs only what is genuinely
  // outstanding — reconciling one month against a year of books instead makes
  // every earlier entry look like money still in transit.
  it("reconciles every month to zero, in order", () => {
    const books: Txn[] = [];
    const cleared = new Set<string>();

    for (const file of files) {
      const parsed = read(file);
      if (!parsed.ok) throw new Error(`${file}: ${parsed.reason}`);

      post(buildCandidates(parsed.lines, books), books);

      const statementDate = parsed.lines.reduce((a, b) => (a > b.date ? a : b.date), "");
      const closing = closingBalanceFromStatement(parsed.lines);
      expect(closing).not.toBeNull();

      // The books as at this statement's closing date, which is what the screen
      // compares against: a period-only figure would differ for a reason that
      // is not an error.
      const upTo = books.filter((t) => t.date <= statementDate);
      const bookBalance = computeBalances(SEED_ACCOUNTS, upTo, 0).bank ?? 0;

      const result = reconcile(parsed.lines, upTo, cleared);
      const summary = summariseReconciliation(result, closing!, bookBalance);

      // Named, so a failure says which month rather than just a number.
      // Anything under a cent is floating-point dust, not a difference.
      const difference = Math.abs(summary.difference) < 0.005 ? 0 : summary.difference;
      expect(`${file} ${difference.toFixed(2)}`).toBe(`${file} 0.00`);
      expect(summary.balanced).toBe(true);

      for (const pair of result.matched) cleared.add(pair.txn.id);
    }
  });

  for (const file of files) {
    describe(file, () => {
      const parsed = read(file);

      it("parses", () => {
        if (!parsed.ok) throw new Error(parsed.reason);
        expect(parsed.lines.length).toBeGreaterThan(0);
      });

      it("agrees with the bank's own running balance", () => {
        if (!parsed.ok) throw new Error(parsed.reason);

        // Each line carries the balance after it, so applying this line's
        // amount to the previous line's balance has to land on it. A misread
        // figure or a flipped sign shows up here and nowhere else.
        const lines = [...parsed.lines].sort((a, b) => (a.date < b.date ? -1 : 1));
        let previous: number | undefined;
        for (const line of lines) {
          if (previous !== undefined && line.balance !== undefined) {
            expect(Math.abs(previous + line.amount - line.balance)).toBeLessThan(0.011);
          }
          if (line.balance !== undefined) previous = line.balance;
        }
      });

      it("reads money out as money out", () => {
        if (!parsed.ok) throw new Error(parsed.reason);
        // A working account has both, and purchases outnumber deposits.
        // Getting FNB's sign convention backwards would invert this.
        const out = parsed.lines.filter((l) => l.amount < 0);
        const inward = parsed.lines.filter((l) => l.amount > 0);
        expect(out.length).toBeGreaterThan(0);
        expect(inward.length).toBeGreaterThan(0);
        expect(out.length).toBeGreaterThan(inward.length);
      });

      it("dates every line", () => {
        if (!parsed.ok) throw new Error(parsed.reason);
        for (const line of parsed.lines) {
          expect(line.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
        }
      });

      it("turns every line into a balanced double entry", () => {
        if (!parsed.ok) throw new Error(parsed.reason);
        const books: Txn[] = [];
        post(buildCandidates(parsed.lines, []), books);

        expect(books).toHaveLength(parsed.lines.length);
        for (const txn of books) {
          expect(txn.amount).toBeGreaterThan(0);
          expect(txn.debit).not.toBe(txn.credit);
          expect(txn.debit === "bank" || txn.credit === "bank").toBe(true);
        }
      });

      it("refuses to import the same statement twice", () => {
        if (!parsed.ok) throw new Error(parsed.reason);
        const books: Txn[] = [];
        post(buildCandidates(parsed.lines, []), books);

        // The same file again, with the first import already in the books.
        const second = summariseCandidates(buildCandidates(parsed.lines, books));
        expect(second.duplicates).toBe(parsed.lines.length);
        expect(second.selected).toBe(0);
      });
    });
  }
});
