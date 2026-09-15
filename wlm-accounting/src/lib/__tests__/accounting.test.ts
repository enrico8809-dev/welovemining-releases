import {
  Account,
  RECIPES,
  SEED_ACCOUNTS,
  Txn,
  computeBalances,
  computeProfitAndLoss,
  computeTrialBalance,
  monthlyCashFlow,
  topExpenses,
} from "../accounting";

function txn(partial: Partial<Txn> & Pick<Txn, "amount" | "debit" | "credit">): Txn {
  return {
    id: Math.random().toString(36).slice(2),
    date: "2026-03-15",
    desc: "test",
    recipe: "test",
    ...partial,
  };
}

/** Posts a recipe the way the Add screen does, and returns the entry. */
function post(recipeId: string, amount: number, pickedAccount?: string): Txn {
  const recipe = RECIPES.find((r) => r.id === recipeId)!;
  const debit = recipe.pick === "debit" ? pickedAccount! : recipe.debit;
  const credit = recipe.pick === "credit" ? pickedAccount! : recipe.credit;
  return txn({ amount, debit, credit, recipe: recipeId });
}

describe("computeBalances", () => {
  it("seeds the bank with the opening balance", () => {
    const b = computeBalances(SEED_ACCOUNTS, [], 15000);
    expect(b.bank).toBe(15000);
  });

  it("debits add and credits subtract", () => {
    const b = computeBalances(SEED_ACCOUNTS, [post("sale_cash", 1000, "sales")], 0);
    expect(b.bank).toBe(1000);
    expect(b.sales).toBe(-1000); // income carries a credit balance
  });
});

describe("the six recipes", () => {
  it.each([
    ["sale_cash", "sales", "bank", "sales"],
    ["invoice_paid", undefined, "bank", "receivables"],
    ["owner_in", undefined, "bank", "owner_contrib"],
    ["expense", "rent", "rent", "bank"],
    ["buy_stock", undefined, "inventory", "bank"],
    ["drawings", undefined, "owner_draw", "bank"],
  ])("%s posts Dr %s / Cr %s", (recipeId, picked, expectDebit, expectCredit) => {
    const entry = post(recipeId as string, 500, picked as string | undefined);
    expect(entry.debit).toBe(expectDebit);
    expect(entry.credit).toBe(expectCredit);
  });

  it("never posts an entry where both sides are the same account", () => {
    for (const r of RECIPES) {
      const picked = r.pick
        ? SEED_ACCOUNTS.find((a) => r.pickTypes!.includes(a.type))!.id
        : undefined;
      const entry = post(r.id, 100, picked);
      expect(entry.debit).not.toBe(entry.credit);
    }
  });
});

describe("the double-counting guard", () => {
  it("an invoice settlement clears the receivable without booking income", () => {
    // Invoice issued: revenue recognised once.
    const issue = txn({ amount: 50000, debit: "receivables", credit: "sales" });
    // Customer pays: bank goes up, receivable goes down, income untouched.
    const payment = post("invoice_paid", 50000);

    const balances = computeBalances(SEED_ACCOUNTS, [issue, payment], 0);
    const pnl = computeProfitAndLoss(SEED_ACCOUNTS, balances);

    expect(balances.bank).toBe(50000);
    expect(balances.receivables).toBe(0);
    // The bug this app exists to prevent: income must be 50k, never 100k.
    expect(pnl.income).toBe(50000);
  });

  it("owner contributions are equity, never income", () => {
    const balances = computeBalances(SEED_ACCOUNTS, [post("owner_in", 250000)], 0);
    const pnl = computeProfitAndLoss(SEED_ACCOUNTS, balances);
    expect(balances.bank).toBe(250000);
    expect(pnl.income).toBe(0);
  });

  it("buying stock is an asset swap, not an expense", () => {
    const balances = computeBalances(SEED_ACCOUNTS, [post("buy_stock", 80000)], 100000);
    const pnl = computeProfitAndLoss(SEED_ACCOUNTS, balances);
    expect(balances.inventory).toBe(80000);
    expect(pnl.expenses).toBe(0);
  });

  it("drawings reduce the bank without touching profit", () => {
    const balances = computeBalances(SEED_ACCOUNTS, [post("drawings", 20000)], 50000);
    const pnl = computeProfitAndLoss(SEED_ACCOUNTS, balances);
    expect(balances.bank).toBe(30000);
    expect(pnl.expenses).toBe(0);
    expect(pnl.net).toBe(0);
  });
});

describe("trial balance", () => {
  it("balances for an empty book", () => {
    const tb = computeTrialBalance(SEED_ACCOUNTS, computeBalances(SEED_ACCOUNTS, [], 0));
    expect(tb.balanced).toBe(true);
  });

  it("balances after every recipe has been posted", () => {
    const entries = [
      post("sale_cash", 120000, "sales"),
      post("sale_cash", 8000, "other_income"),
      post("invoice_paid", 45000),
      post("owner_in", 300000),
      post("expense", 12500, "rent"),
      post("expense", 3200, "telephone"),
      post("buy_stock", 90000),
      post("drawings", 15000),
    ];
    const tb = computeTrialBalance(
      SEED_ACCOUNTS,
      computeBalances(SEED_ACCOUNTS, entries, 250000)
    );
    expect(tb.totalDebit).toBeCloseTo(tb.totalCredit, 6);
    expect(tb.balanced).toBe(true);
  });

  it("stays balanced with an opening balance and no transactions", () => {
    // An opening balance must post both sides — Dr Bank / Cr Owner Contribution.
    // Seeding the bank alone would leave the book permanently out by that amount.
    const balances = computeBalances(SEED_ACCOUNTS, [], 250000);
    const tb = computeTrialBalance(SEED_ACCOUNTS, balances);

    expect(balances.bank).toBe(250000);
    expect(balances.owner_contrib).toBe(-250000);
    expect(tb.totalDebit).toBeCloseTo(tb.totalCredit, 6);
    expect(tb.balanced).toBe(true);
  });

  it("puts income in the credit column and expenses in the debit column", () => {
    const entries = [post("sale_cash", 70000, "sales"), post("expense", 20000, "rent")];
    const tb = computeTrialBalance(
      SEED_ACCOUNTS,
      computeBalances(SEED_ACCOUNTS, entries, 0)
    );

    const sales = tb.rows.find((r) => r.account.id === "sales")!;
    const rent = tb.rows.find((r) => r.account.id === "rent")!;
    expect(sales.credit).toBe(70000);
    expect(sales.debit).toBe(0);
    expect(rent.debit).toBe(20000);
    expect(rent.credit).toBe(0);
  });

  it("balances across 200 random entries", () => {
    const ids = SEED_ACCOUNTS.map((a) => a.id);
    const entries: Txn[] = [];
    for (let i = 0; i < 200; i++) {
      const debit = ids[i % ids.length];
      const credit = ids[(i * 7 + 3) % ids.length];
      if (debit === credit) continue;
      entries.push(txn({ amount: ((i * 137) % 9000) + 1, debit, credit }));
    }
    const tb = computeTrialBalance(
      SEED_ACCOUNTS,
      computeBalances(SEED_ACCOUNTS, entries, 0)
    );
    expect(tb.totalDebit).toBeCloseTo(tb.totalCredit, 6);
  });
});

describe("profit and loss", () => {
  it("nets income against expenses", () => {
    const entries = [
      post("sale_cash", 100000, "sales"),
      post("expense", 30000, "salaries"),
      post("expense", 10000, "rent"),
    ];
    const pnl = computeProfitAndLoss(
      SEED_ACCOUNTS,
      computeBalances(SEED_ACCOUNTS, entries, 0)
    );
    expect(pnl.income).toBe(100000);
    expect(pnl.expenses).toBe(40000);
    expect(pnl.net).toBe(60000);
  });

  it("reports a loss as a negative net", () => {
    const pnl = computeProfitAndLoss(
      SEED_ACCOUNTS,
      computeBalances(SEED_ACCOUNTS, [post("expense", 5000, "motor")], 0)
    );
    expect(pnl.net).toBe(-5000);
  });
});

describe("topExpenses", () => {
  it("ranks by spend and ignores accounts with no movement", () => {
    const entries = [
      post("expense", 5000, "rent"),
      post("expense", 12000, "salaries"),
      post("expense", 900, "bank_charges"),
    ];
    const ranked = topExpenses(
      SEED_ACCOUNTS,
      computeBalances(SEED_ACCOUNTS, entries, 0)
    );
    expect(ranked.map((r) => r.account.id)).toEqual(["salaries", "rent", "bank_charges"]);
  });
});

describe("monthlyCashFlow", () => {
  it("counts bank movements in the right direction", () => {
    const now = new Date(2026, 2, 20); // March 2026
    const entries = [
      txn({ date: "2026-03-02", amount: 10000, debit: "bank", credit: "sales" }),
      txn({ date: "2026-03-08", amount: 4000, debit: "rent", credit: "bank" }),
    ];
    const series = monthlyCashFlow(entries, 3, now);
    const march = series[series.length - 1];
    expect(march.income).toBe(10000);
    expect(march.expenses).toBe(4000);
    expect(march.net).toBe(6000);
  });

  it("ignores entries that never touch the bank", () => {
    const now = new Date(2026, 2, 20);
    const entries = [txn({ date: "2026-03-02", amount: 9999, debit: "receivables", credit: "sales" })];
    const series = monthlyCashFlow(entries, 3, now);
    expect(series[series.length - 1].net).toBe(0);
  });
});
