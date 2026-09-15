import { Txn } from "../accounting";
import { ParsedLine } from "../bankImport";
import {
  applyManualMatch,
  bankTxns,
  buildReconciliation,
  closingBalanceFromStatement,
  reconcile,
  reconciledToDate,
  reconciledTxnIds,
  summariseReconciliation,
  unmatch,
} from "../reconcile";

function line(p: Partial<ParsedLine> & Pick<ParsedLine, "id" | "amount">): ParsedLine {
  return { date: "2026-03-10", description: "Statement line", ...p };
}

function txn(p: Partial<Txn> & Pick<Txn, "id" | "amount">): Txn {
  return {
    date: "2026-03-10",
    desc: "Book entry",
    debit: "bank",
    credit: "sales",
    recipe: "sale_cash",
    ...p,
  };
}

/** Money out of the bank. */
function payment(p: Partial<Txn> & Pick<Txn, "id" | "amount">): Txn {
  return txn({ debit: "general", credit: "bank", recipe: "expense", ...p });
}

describe("bankTxns", () => {
  it("ignores entries that never touch the bank", () => {
    const all = [
      txn({ id: "a", amount: 100 }),
      { ...txn({ id: "b", amount: 200 }), debit: "receivables", credit: "sales" },
    ];
    expect(bankTxns(all).map((t) => t.id)).toEqual(["a"]);
  });

  it("can cut off at the statement date", () => {
    const all = [
      txn({ id: "a", amount: 100, date: "2026-03-01" }),
      txn({ id: "b", amount: 100, date: "2026-04-01" }),
    ];
    expect(bankTxns(all, "2026-03-31").map((t) => t.id)).toEqual(["a"]);
  });
});

describe("matching", () => {
  it("matches same day, same amount, same direction", () => {
    const result = reconcile([line({ id: "l1", amount: 5000 })], [txn({ id: "t1", amount: 5000 })]);
    expect(result.matched).toHaveLength(1);
    expect(result.matched[0].confidence).toBe("exact");
    expect(result.statementOnly).toHaveLength(0);
    expect(result.booksOnly).toHaveLength(0);
  });

  it("never matches money in against money out of the same size", () => {
    const result = reconcile(
      [line({ id: "l1", amount: 5000 })],
      [payment({ id: "t1", amount: 5000 })]
    );
    expect(result.matched).toHaveLength(0);
    expect(result.statementOnly).toHaveLength(1);
    expect(result.booksOnly).toHaveLength(1);
  });

  it("matches within a few days when the dates don't line up", () => {
    const result = reconcile(
      [line({ id: "l1", amount: 5000, date: "2026-03-12" })],
      [txn({ id: "t1", amount: 5000, date: "2026-03-10" })]
    );
    expect(result.matched[0].confidence).toBe("close");
    expect(result.matched[0].dayGap).toBe(2);
  });

  it("does not match across a long gap", () => {
    const result = reconcile(
      [line({ id: "l1", amount: 5000, date: "2026-03-30" })],
      [txn({ id: "t1", amount: 5000, date: "2026-03-01" })]
    );
    expect(result.matched).toHaveLength(0);
  });

  it("gives an exact match priority over a near one for the same amount", () => {
    // The near entry must not steal the line that has a perfect partner.
    const result = reconcile(
      [line({ id: "l1", amount: 5000, date: "2026-03-10" })],
      [
        txn({ id: "near", amount: 5000, date: "2026-03-08" }),
        txn({ id: "exact", amount: 5000, date: "2026-03-10" }),
      ]
    );
    expect(result.matched).toHaveLength(1);
    expect(result.matched[0].txn.id).toBe("exact");
    expect(result.booksOnly.map((t) => t.id)).toEqual(["near"]);
  });

  it("uses each entry at most once", () => {
    const result = reconcile(
      [line({ id: "l1", amount: 100 }), line({ id: "l2", amount: 100 })],
      [txn({ id: "t1", amount: 100 })]
    );
    expect(result.matched).toHaveLength(1);
    expect(result.statementOnly).toHaveLength(1);
  });

  it("separates what only the bank knows from what only the books know", () => {
    const result = reconcile(
      [
        line({ id: "l1", amount: 5000 }),
        line({ id: "fee", amount: -105, description: "##MONTHLY ACCOUNT FEE" }),
      ],
      [txn({ id: "t1", amount: 5000 }), payment({ id: "cheque", amount: 2000 })]
    );
    expect(result.matched).toHaveLength(1);
    expect(result.statementOnly.map((l) => l.id)).toEqual(["fee"]);
    expect(result.booksOnly.map((t) => t.id)).toEqual(["cheque"]);
  });

  it("skips entries cleared by an earlier reconciliation", () => {
    const result = reconcile(
      [line({ id: "l1", amount: 5000 })],
      [txn({ id: "t1", amount: 5000 })],
      new Set(["t1"])
    );
    expect(result.matched).toHaveLength(0);
    expect(result.booksOnly).toHaveLength(0);
  });
});

describe("manual matching", () => {
  const base = reconcile(
    [line({ id: "l1", amount: 5000, date: "2026-03-01" })],
    [txn({ id: "t1", amount: 5000, date: "2026-03-28" })]
  );

  it("pairs two things the matcher wouldn't have", () => {
    expect(base.matched).toHaveLength(0);
    const manual = applyManualMatch(base, "l1", "t1");
    expect(manual.matched).toHaveLength(1);
    expect(manual.matched[0].confidence).toBe("manual");
    expect(manual.statementOnly).toHaveLength(0);
    expect(manual.booksOnly).toHaveLength(0);
  });

  it("puts both sides back when unmatched", () => {
    const manual = applyManualMatch(base, "l1", "t1");
    const undone = unmatch(manual, "l1");
    expect(undone.matched).toHaveLength(0);
    expect(undone.statementOnly).toHaveLength(1);
    expect(undone.booksOnly).toHaveLength(1);
  });

  it("ignores a pairing that refers to something missing", () => {
    expect(applyManualMatch(base, "nope", "t1")).toBe(base);
  });
});

describe("the reconciliation statement", () => {
  it("balances when everything matches", () => {
    const result = reconcile([line({ id: "l1", amount: 5000 })], [txn({ id: "t1", amount: 5000 })]);
    const summary = summariseReconciliation(result, 5000, 5000);
    expect(summary.balanced).toBe(true);
    expect(summary.difference).toBe(0);
  });

  it("adds back a deposit the bank hasn't shown yet", () => {
    // Books show R10 000 (R8 000 cleared + R2 000 in transit); bank shows R8 000.
    const result = reconcile([], [txn({ id: "transit", amount: 2000 })]);
    const summary = summariseReconciliation(result, 8000, 10000);

    expect(summary.depositsInTransit).toBe(2000);
    expect(summary.adjustedBankBalance).toBe(10000);
    expect(summary.balanced).toBe(true);
  });

  it("deducts a payment the bank hasn't taken yet", () => {
    // Books show R7 000; bank still shows R10 000 because a R3 000 payment
    // hasn't been presented.
    const result = reconcile([], [payment({ id: "unpresented", amount: 3000 })]);
    const summary = summariseReconciliation(result, 10000, 7000);

    expect(summary.unpresentedPayments).toBe(3000);
    expect(summary.adjustedBankBalance).toBe(7000);
    expect(summary.balanced).toBe(true);
  });

  it("does not balance while a bank charge is uncaptured, and says so", () => {
    // The bank took R105 in fees that the books know nothing about.
    const result = reconcile([line({ id: "fee", amount: -105 })], []);
    const summary = summariseReconciliation(result, 9895, 10000);

    expect(summary.unrecordedCount).toBe(1);
    expect(summary.unrecordedValue).toBe(-105);
    expect(summary.balanced).toBe(false);
    expect(summary.difference).toBeCloseTo(-105, 6);
  });

  it("handles both kinds of timing difference at once", () => {
    const result = reconcile(
      [],
      [txn({ id: "in", amount: 2000 }), payment({ id: "out", amount: 500 })]
    );
    // Bank 8 500 + 2 000 in transit − 500 unpresented = 10 000 per books.
    const summary = summariseReconciliation(result, 8500, 10000);
    expect(summary.adjustedBankBalance).toBe(10000);
    expect(summary.balanced).toBe(true);
  });

  it("reports the shortfall when the books are simply wrong", () => {
    const result = reconcile([], []);
    const summary = summariseReconciliation(result, 10000, 9000);
    expect(summary.difference).toBe(1000);
    expect(summary.balanced).toBe(false);
  });
});

describe("closing balance from a statement", () => {
  it("takes the balance from the latest-dated line", () => {
    const lines = [
      line({ id: "a", amount: -100, date: "2026-03-28", balance: 118750 }),
      line({ id: "b", amount: 500, date: "2026-03-01", balance: 90000 }),
    ];
    expect(closingBalanceFromStatement(lines)).toBe(118750);
  });

  it("returns null when the export has no balance column", () => {
    expect(closingBalanceFromStatement([line({ id: "a", amount: 100 })])).toBeNull();
  });
});

describe("saved reconciliations", () => {
  const result = reconcile([line({ id: "l1", amount: 5000 })], [txn({ id: "t1", amount: 5000 })]);
  const summary = summariseReconciliation(result, 5000, 5000);
  const record = buildReconciliation(result, summary, "2026-03-31");

  it("records which entries were cleared", () => {
    expect(record.matchedTxnIds).toEqual(["t1"]);
    expect(record.statementDate).toBe("2026-03-31");
    expect(record.difference).toBe(0);
  });

  it("collects cleared entries across every past reconciliation", () => {
    const ids = reconciledTxnIds([record, { ...record, id: "r2", matchedTxnIds: ["t2"] }]);
    expect(ids.has("t1")).toBe(true);
    expect(ids.has("t2")).toBe(true);
  });

  it("reports how far the books are proven", () => {
    expect(
      reconciledToDate([record, { ...record, id: "r2", statementDate: "2026-04-30" }])
    ).toBe("2026-04-30");
  });

  it("has no reconciled-to date before the first reconciliation", () => {
    expect(reconciledToDate([])).toBeNull();
  });
});
