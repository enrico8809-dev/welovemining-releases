// Core accounting data model & double-entry engine.
//
// This is the anti-double-counting layer: the user never enters raw debits/credits.
// They pick "what happened" (a Recipe) and the app applies the correct debit/credit
// pair under the hood. A bank deposit that pays an invoice clears the receivable —
// it never creates new income.
//
// NOTE — VAT hook: the company is not VAT-registered yet. When that changes, VAT
// will be added as an extra split on relevant recipes (e.g. sale -> Dr Bank /
// Cr Sales + Cr VAT Output). No VAT fields exist anywhere in the app for now.

export type AcctType = "asset" | "liability" | "equity" | "income" | "expense";

export interface Account {
  id: string;
  name: string;
  type: AcctType;
  bank?: boolean;
}

export interface Txn {
  id: string;
  date: string; // ISO yyyy-mm-dd
  desc: string;
  amount: number; // always positive; debit/credit determine direction
  debit: string; // account id
  credit: string; // account id
  recipe: string; // recipe id, for display/audit purposes
}

// Chart of accounts — seeded from the owner's real Sage accounts.
export const SEED_ACCOUNTS: Account[] = [
  { id: "bank", name: "FNB Bank Account", type: "asset", bank: true },
  { id: "inventory", name: "Inventory (Stock)", type: "asset" },
  { id: "receivables", name: "Trade Receivables", type: "asset" },
  { id: "sales", name: "Sales", type: "income" },
  { id: "other_income", name: "Other Income", type: "income" },
  { id: "cos", name: "Cost of Sales", type: "expense" },
  { id: "advertising", name: "Advertising", type: "expense" },
  { id: "bank_charges", name: "Bank Charges", type: "expense" },
  { id: "general", name: "General Expenses", type: "expense" },
  { id: "motor", name: "Motor Vehicle", type: "expense" },
  { id: "rent", name: "Rent Paid", type: "expense" },
  { id: "salaries", name: "Salaries & Wages", type: "expense" },
  { id: "telephone", name: "Telephone & Internet", type: "expense" },
  { id: "travel", name: "Travel & Accommodation", type: "expense" },
  { id: "owner_contrib", name: "Owner Contribution", type: "equity" },
  { id: "owner_draw", name: "Owner Drawings", type: "equity" },
];

export type RecipeDirection = "in" | "out";
export type RecipePick = "debit" | "credit";

export interface Recipe {
  id: string;
  label: string;
  dir: RecipeDirection;
  debit: string;
  credit: string;
  /** If set, the user must pick which account fills this side of the entry. */
  pick?: RecipePick;
  /** Restricts the picker to accounts of these types. */
  pickTypes?: AcctType[];
}

// "Recipes": one tap -> a correct double entry.
export const RECIPES: Recipe[] = [
  {
    id: "sale_cash",
    label: "Sale (money in)",
    dir: "in",
    debit: "bank",
    credit: "sales",
    pick: "credit",
    pickTypes: ["income"],
  },
  {
    id: "invoice_paid",
    label: "Customer paid an invoice",
    dir: "in",
    debit: "bank",
    credit: "receivables",
  },
  {
    id: "owner_in",
    label: "Owner put money in",
    dir: "in",
    debit: "bank",
    credit: "owner_contrib",
  },
  {
    id: "expense",
    label: "Business expense (money out)",
    dir: "out",
    debit: "general",
    credit: "bank",
    pick: "debit",
    pickTypes: ["expense"],
  },
  {
    id: "buy_stock",
    label: "Bought stock (money out)",
    dir: "out",
    debit: "inventory",
    credit: "bank",
  },
  {
    id: "drawings",
    label: "Personal / drawings (money out)",
    dir: "out",
    debit: "owner_draw",
    credit: "bank",
  },
];

export function findRecipe(id: string): Recipe | undefined {
  return RECIPES.find((r) => r.id === id);
}

export function findAccount(accounts: Account[], id: string): Account | undefined {
  return accounts.find((a) => a.id === id);
}

/**
 * Balance engine: debit adds, credit subtracts. openingBank seeds the bank account.
 *
 * Income and liability/equity accounts naturally carry credit balances, which show
 * up as negative numbers here — flip the sign when displaying them. Asset/expense
 * accounts naturally carry debit (positive) balances.
 */
export function computeBalances(
  accounts: Account[],
  txns: Txn[],
  openingBank: number
): Record<string, number> {
  const b: Record<string, number> = {};
  accounts.forEach((a) => (b[a.id] = 0));
  b.bank += openingBank;
  for (const t of txns) {
    b[t.debit] = (b[t.debit] ?? 0) + t.amount;
    b[t.credit] = (b[t.credit] ?? 0) - t.amount;
  }
  return b;
}

/** Display balance: flips sign for accounts that naturally carry a credit balance. */
export function displayBalance(account: Account, raw: number): number {
  return account.type === "income" ||
    account.type === "liability" ||
    account.type === "equity"
    ? -raw
    : raw;
}

export interface ProfitAndLoss {
  income: number;
  expenses: number;
  net: number;
}

export function computeProfitAndLoss(accounts: Account[], balances: Record<string, number>): ProfitAndLoss {
  let income = 0;
  let expenses = 0;
  for (const a of accounts) {
    const raw = balances[a.id] ?? 0;
    if (a.type === "income") income += -raw;
    if (a.type === "expense") expenses += raw;
  }
  return { income, expenses, net: income - expenses };
}

export interface TrialBalanceRow {
  account: Account;
  debit: number;
  credit: number;
}

/** Trial balance: each account's natural-side balance split into Debit / Credit columns. */
export function computeTrialBalance(
  accounts: Account[],
  balances: Record<string, number>
): { rows: TrialBalanceRow[]; totalDebit: number; totalCredit: number } {
  const rows: TrialBalanceRow[] = [];
  let totalDebit = 0;
  let totalCredit = 0;
  for (const a of accounts) {
    const raw = balances[a.id] ?? 0;
    if (raw === 0) continue;
    const isDebitNature = a.type === "asset" || a.type === "expense";
    const debit = isDebitNature ? Math.max(raw, 0) : Math.max(-raw, 0);
    const credit = isDebitNature ? Math.max(-raw, 0) : Math.max(raw, 0);
    rows.push({ account: a, debit, credit });
    totalDebit += debit;
    totalCredit += credit;
  }
  return { rows, totalDebit, totalCredit };
}

export function topExpenses(
  accounts: Account[],
  balances: Record<string, number>,
  limit = 6
): { account: Account; amount: number }[] {
  return accounts
    .filter((a) => a.type === "expense")
    .map((a) => ({ account: a, amount: balances[a.id] ?? 0 }))
    .filter((e) => e.amount > 0)
    .sort((x, y) => y.amount - x.amount)
    .slice(0, limit);
}
