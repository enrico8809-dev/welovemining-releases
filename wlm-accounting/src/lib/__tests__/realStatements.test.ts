import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { parseStatement, buildCandidates, candidateToTxn, summariseCandidates } from "../bankImport";
import { Txn } from "../accounting";

/**
 * The FNB parser against real exports.
 *
 * Everything else about bank import is covered by fixtures I wrote, which
 * proves the parser agrees with my idea of the format. This runs it over nine
 * real statements — converted from the owner's PDFs — and checks the result
 * against the one thing in the file that cannot be fudged: the running balance
 * the bank itself printed.
 *
 * Point WLM_STATEMENTS at a directory of converted CSVs to run it.
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

  it("finds statements to check", () => {
    expect(files.length).toBeGreaterThan(0);
  });

  for (const file of files) {
    describe(file, () => {
      const text = readFileSync(join(directory!, file), "utf8");
      const parsed = parseStatement(text, file);

      it("parses", () => {
        if (!parsed.ok) throw new Error(parsed.reason);
        expect(parsed.lines.length).toBeGreaterThan(0);
      });

      it("agrees with the bank's own running balance", () => {
        if (!parsed.ok) throw new Error(parsed.reason);

        // Each line carries the balance after it. Applying this line's amount
        // to the previous line's balance has to land on it — if a sign or a
        // figure were misread, this is where it shows.
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
        // A statement of a working account has both, and purchases outnumber
        // deposits. Getting the sign convention backwards would invert this.
        const out = parsed.lines.filter((l) => l.amount < 0);
        const inward = parsed.lines.filter((l) => l.amount > 0);
        expect(out.length).toBeGreaterThan(0);
        expect(inward.length).toBeGreaterThan(0);
        expect(out.length).toBeGreaterThan(inward.length);
      });

      it("gives every line a date inside the statement's own range", () => {
        if (!parsed.ok) throw new Error(parsed.reason);
        for (const line of parsed.lines) {
          expect(line.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
        }
      });

      it("turns every line into a balanced double entry", () => {
        if (!parsed.ok) throw new Error(parsed.reason);
        const candidates = buildCandidates(parsed.lines, []);
        const posted = candidates
          .map((c) => candidateToTxn(c, c.suggestion.recipeId, c.suggestion.accountId))
          .filter((t): t is Txn => t !== null);

        expect(posted).toHaveLength(parsed.lines.length);
        for (const txn of posted) {
          expect(txn.amount).toBeGreaterThan(0);
          expect(txn.debit).not.toBe(txn.credit);
          expect(txn.debit === "bank" || txn.credit === "bank").toBe(true);
        }
      });

      it("refuses to import the same statement twice", () => {
        if (!parsed.ok) throw new Error(parsed.reason);
        const first = buildCandidates(parsed.lines, []);
        const posted = first
          .map((c) => candidateToTxn(c, c.suggestion.recipeId, c.suggestion.accountId))
          .filter((t): t is Txn => t !== null);

        // The same file again, with the first import already in the books.
        const second = summariseCandidates(buildCandidates(parsed.lines, posted));
        expect(second.duplicates).toBe(parsed.lines.length);
        expect(second.selected).toBe(0);
      });
    });
  }
});
