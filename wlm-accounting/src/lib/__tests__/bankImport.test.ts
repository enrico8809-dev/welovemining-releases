import { SEED_ACCOUNTS, Txn, computeBalances, computeTrialBalance } from "../accounting";
import {
  buildCandidates,
  candidateToTxn,
  dateRange,
  findDuplicate,
  parseBankAmount,
  parseCsv,
  parseFlexibleDate,
  parseOfx,
  parseStatement,
  recipesForLine,
  splitCsvLine,
  suggestCategory,
  summariseCandidates,
} from "../bankImport";

// A realistic FNB export: metadata preamble, then the header, newest first.
const FNB_CSV = `"Statement","FNB Business Account"
"Account Number","62123456789"
"Statement Period","01 March 2026 to 31 March 2026"
"Opening Balance","125000.00"
""
"Date","Amount","Balance","Description"
"2026-03-28","-1,250.00","118750.00","POS PURCHASE ENGEN GARAGE JHB"
"2026-03-27","45000.00","120000.00","FNB APP PAYMENT FROM MINING CO INV-0007"
"2026-03-25","-105.00","75000.00","##MONTHLY ACCOUNT FEE"
"2026-03-20","-8500.00","75105.00","VODACOM BUSINESS DEBIT ORDER"
"2026-03-15","-32000.00","83605.00","SALARY J MOKOENA"
`;

const OFX = `<OFX><BANKMSGSRSV1><STMTTRNRS><STMTRS><BANKTRANLIST>
<STMTTRN>
<TRNTYPE>DEBIT
<DTPOSTED>20260328120000[0:GMT]
<TRNAMT>-1250.00
<FITID>FNB000001
<NAME>ENGEN GARAGE
<MEMO>POS PURCHASE
</STMTTRN>
<STMTTRN>
<TRNTYPE>CREDIT
<DTPOSTED>20260327
<TRNAMT>45000.00
<FITID>FNB000002
<MEMO>PAYMENT FROM MINING CO
</STMTTRN>
</BANKTRANLIST></STMTRS></STMTTRNRS></BANKMSGSRSV1></OFX>`;

describe("csv field splitting", () => {
  it("keeps commas that sit inside quoted fields", () => {
    expect(splitCsvLine('"2026-03-01","-1,250.00","118,750.00","POS, JHB"')).toEqual([
      "2026-03-01",
      "-1,250.00",
      "118,750.00",
      "POS, JHB",
    ]);
  });

  it("unescapes doubled quotes", () => {
    expect(splitCsvLine('"He said ""hi""",2')).toEqual(['He said "hi"', "2"]);
  });

  it("handles unquoted fields", () => {
    expect(splitCsvLine("2026-03-01,-100.00,500.00,FEE")).toEqual([
      "2026-03-01", "-100.00", "500.00", "FEE",
    ]);
  });
});

describe("date parsing", () => {
  it.each([
    ["2026-03-09", "2026-03-09"],
    ["2026/03/09", "2026-03-09"],
    ["09/03/2026", "2026-03-09"],
    ["09-03-2026", "2026-03-09"],
    ["09 Mar 2026", "2026-03-09"],
    ["9 March 2026", "2026-03-09"],
  ])("reads %s", (input, expected) => {
    expect(parseFlexibleDate(input)).toBe(expected);
  });

  it("treats ambiguous dates as day-first, the SA convention", () => {
    // 03/04/2026 is 3 April here, not 4 March.
    expect(parseFlexibleDate("03/04/2026")).toBe("2026-04-03");
  });

  it("rejects nonsense", () => {
    expect(parseFlexibleDate("")).toBeNull();
    expect(parseFlexibleDate("not a date")).toBeNull();
    expect(parseFlexibleDate("45/13/2026")).toBeNull();
  });
});

describe("amount parsing", () => {
  it.each([
    ["-1,250.00", -1250],
    ["1,250.00", 1250],
    ["R 1 250.00", 1250],
    ["(500.00)", -500],
    ["500.00Cr", 500],
    ["500.00Dr", -500],
    ["0.00", 0],
  ])("reads %s", (input, expected) => {
    expect(parseBankAmount(input)).toBe(expected);
  });

  it("rejects non-numeric text", () => {
    expect(parseBankAmount("")).toBeNull();
    expect(parseBankAmount("abc")).toBeNull();
  });
});

describe("FNB CSV", () => {
  const result = parseCsv(FNB_CSV);

  it("skips the metadata preamble and finds the header", () => {
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.lines).toHaveLength(5);
  });

  it("keeps the sign, so money in and out stay distinguishable", () => {
    if (!result.ok) return;
    const credit = result.lines.find((l) => l.description.includes("PAYMENT FROM"))!;
    const debit = result.lines.find((l) => l.description.includes("ENGEN"))!;
    expect(credit.amount).toBe(45000);
    expect(debit.amount).toBe(-1250);
  });

  it("carries the running balance through when the column exists", () => {
    if (!result.ok) return;
    expect(result.lines[0].balance).toBe(118750);
  });

  it("explains itself when the file isn't a statement", () => {
    const bad = parseCsv("name,surname\nJohn,Smith");
    expect(bad.ok).toBe(false);
    if (bad.ok) return;
    expect(bad.reason).toMatch(/Date and Amount/i);
  });

  it("reports an empty file rather than throwing", () => {
    expect(parseCsv("").ok).toBe(false);
  });

  it("tolerates a header with no transactions", () => {
    const res = parseCsv('"Date","Amount","Balance","Description"');
    expect(res.ok).toBe(false);
  });

  it("gives identical lines identical ids across re-imports", () => {
    const again = parseCsv(FNB_CSV);
    if (!result.ok || !again.ok) return;
    expect(again.lines.map((l) => l.id)).toEqual(result.lines.map((l) => l.id));
  });
});

describe("OFX", () => {
  const result = parseOfx(OFX);

  it("reads STMTTRN blocks", () => {
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.lines).toHaveLength(2);
  });

  it("strips the time and timezone off DTPOSTED", () => {
    if (!result.ok) return;
    expect(result.lines[0].date).toBe("2026-03-28");
  });

  it("treats a negative TRNAMT as money out", () => {
    if (!result.ok) return;
    expect(result.lines[0].amount).toBe(-1250);
    expect(result.lines[1].amount).toBe(45000);
  });

  it("uses the bank's own FITID as the line id when present", () => {
    if (!result.ok) return;
    expect(result.lines[0].id).toBe("ofx:FNB000001");
  });

  it("combines NAME and MEMO into a description", () => {
    if (!result.ok) return;
    expect(result.lines[0].description).toBe("ENGEN GARAGE — POS PURCHASE");
  });

  it("rejects a file with no transaction blocks", () => {
    expect(parseOfx("<OFX></OFX>").ok).toBe(false);
  });
});

describe("format detection", () => {
  it("picks OFX by content, not just the extension", () => {
    const res = parseStatement(OFX, "statement.txt");
    expect(res.ok && res.format).toBe("ofx");
  });

  it("falls back to CSV", () => {
    const res = parseStatement(FNB_CSV, "statement.csv");
    expect(res.ok && res.format).toBe("csv");
  });
});

describe("categorisation", () => {
  const lines = parseCsv(FNB_CSV);

  it("routes bank fees to Bank Charges", () => {
    if (!lines.ok) return;
    const fee = lines.lines.find((l) => l.description.includes("ACCOUNT FEE"))!;
    expect(suggestCategory(fee)).toMatchObject({ recipeId: "expense", accountId: "bank_charges" });
  });

  it("routes fuel to Motor Vehicle", () => {
    if (!lines.ok) return;
    const fuel = lines.lines.find((l) => l.description.includes("ENGEN"))!;
    expect(suggestCategory(fuel).accountId).toBe("motor");
  });

  it("routes a telecoms debit order to Telephone & Internet", () => {
    if (!lines.ok) return;
    const vodacom = lines.lines.find((l) => l.description.includes("VODACOM"))!;
    expect(suggestCategory(vodacom).accountId).toBe("telephone");
  });

  it("routes salaries to Salaries & Wages", () => {
    if (!lines.ok) return;
    const salary = lines.lines.find((l) => l.description.includes("SALARY"))!;
    expect(suggestCategory(salary).accountId).toBe("salaries");
  });

  it("treats money in mentioning an invoice as settling a receivable, not new income", () => {
    if (!lines.ok) return;
    const paid = lines.lines.find((l) => l.description.includes("INV-0007"))!;
    expect(suggestCategory(paid).recipeId).toBe("invoice_paid");
  });

  it("falls back to General Expenses rather than guessing wildly", () => {
    const line = { id: "x", date: "2026-03-01", amount: -99, description: "SOMETHING ODD" };
    expect(suggestCategory(line)).toMatchObject({ recipeId: "expense", accountId: "general" });
  });

  it("offers only money-in recipes for a credit, and money-out for a debit", () => {
    const credit = { id: "a", date: "2026-03-01", amount: 100, description: "x" };
    const debit = { id: "b", date: "2026-03-01", amount: -100, description: "x" };
    expect(recipesForLine(credit).every((r) => r.dir === "in")).toBe(true);
    expect(recipesForLine(debit).every((r) => r.dir === "out")).toBe(true);
  });
});

describe("duplicate detection", () => {
  const existing: Txn[] = [
    {
      id: "t1",
      date: "2026-03-27",
      desc: "Payment received",
      amount: 45000,
      debit: "bank",
      credit: "receivables",
      recipe: "invoice_paid",
    },
  ];

  it("catches a line already captured, even when worded differently", () => {
    const line = { id: "x", date: "2026-03-27", amount: 45000, description: "FNB APP PAYMENT FROM MINING CO" };
    expect(findDuplicate(line, existing)).toBeTruthy();
  });

  it("does not flag the same amount on a different day", () => {
    const line = { id: "x", date: "2026-03-26", amount: 45000, description: "whatever" };
    expect(findDuplicate(line, existing)).toBeUndefined();
  });

  it("does not confuse money out with money in of the same size", () => {
    const line = { id: "x", date: "2026-03-27", amount: -45000, description: "whatever" };
    expect(findDuplicate(line, existing)).toBeUndefined();
  });

  it("leaves duplicates unselected so a re-import can't double-count", () => {
    const parsed = parseCsv(FNB_CSV);
    if (!parsed.ok) return;
    const candidates = buildCandidates(parsed.lines, existing);
    const dupe = candidates.find((c) => c.duplicateOf)!;
    expect(dupe.selected).toBe(false);
    expect(candidates.filter((c) => c.selected)).toHaveLength(4);
  });
});

describe("posting imported lines", () => {
  it("books a debit line as an expense against the chosen account", () => {
    const line = { id: "x", date: "2026-03-28", amount: -1250, description: "ENGEN" };
    const txn = candidateToTxn(
      { line, suggestion: suggestCategory(line), selected: true },
      "expense",
      "motor"
    )!;
    expect(txn.debit).toBe("motor");
    expect(txn.credit).toBe("bank");
    expect(txn.amount).toBe(1250); // stored unsigned; direction lives in the entry
  });

  it("books an invoice payment against receivables, never income", () => {
    const line = { id: "y", date: "2026-03-27", amount: 45000, description: "INV-0007" };
    const txn = candidateToTxn(
      { line, suggestion: suggestCategory(line), selected: true },
      "invoice_paid",
      undefined
    )!;
    expect(txn.debit).toBe("bank");
    expect(txn.credit).toBe("receivables");
  });

  it("keeps the books balanced after importing a whole statement", () => {
    const parsed = parseCsv(FNB_CSV);
    if (!parsed.ok) return;
    const txns = buildCandidates(parsed.lines, [])
      .map((c) => candidateToTxn(c, c.suggestion.recipeId, c.suggestion.accountId))
      .filter((t): t is Txn => t !== null);

    expect(txns).toHaveLength(5);
    const tb = computeTrialBalance(SEED_ACCOUNTS, computeBalances(SEED_ACCOUNTS, txns, 0));
    expect(tb.balanced).toBe(true);
  });

  it("gives imported entries stable ids, so importing twice overwrites rather than duplicates", () => {
    const line = { id: "z", date: "2026-03-01", amount: -50, description: "FEE" };
    const candidate = { line, suggestion: suggestCategory(line), selected: true };
    const first = candidateToTxn(candidate, "expense", "bank_charges")!;
    const second = candidateToTxn(candidate, "expense", "bank_charges")!;
    expect(first.id).toBe(second.id);
  });

  it("returns nothing for an unknown recipe rather than posting a broken entry", () => {
    const line = { id: "q", date: "2026-03-01", amount: -50, description: "x" };
    expect(candidateToTxn({ line, suggestion: suggestCategory(line), selected: true }, "nope", undefined)).toBeNull();
  });
});

describe("summary", () => {
  it("totals only the selected lines", () => {
    const parsed = parseCsv(FNB_CSV);
    if (!parsed.ok) return;
    const candidates = buildCandidates(parsed.lines, []);
    const summary = summariseCandidates(candidates);

    expect(summary.total).toBe(5);
    expect(summary.selected).toBe(5);
    expect(summary.moneyIn).toBe(45000);
    expect(summary.moneyOut).toBe(1250 + 105 + 8500 + 32000);
  });

  it("reports the statement's date span", () => {
    const parsed = parseCsv(FNB_CSV);
    if (!parsed.ok) return;
    expect(dateRange(parsed.lines)).toEqual({ from: "2026-03-15", to: "2026-03-28" });
  });
});
