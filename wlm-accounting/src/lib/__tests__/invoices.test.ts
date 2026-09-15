import { SEED_ACCOUNTS, computeBalances, computeProfitAndLoss, computeTrialBalance } from "../accounting";
import {
  BusinessDoc,
  convertQuoteToInvoice,
  docTotal,
  isOverdue,
  nextDocNumber,
  postingsForDocs,
  summariseReceivables,
} from "../invoices";

function invoice(overrides: Partial<BusinessDoc> = {}): BusinessDoc {
  return {
    id: "doc-1",
    kind: "invoice",
    number: "INV-0001",
    customer: "Mining Co",
    date: "2026-03-01",
    items: [{ id: "li-1", description: "Antminer S21", qty: 2, unitPrice: 45000 }],
    status: "sent",
    incomeAccount: "sales",
    ...overrides,
  };
}

describe("document numbering", () => {
  it("starts at 0001 for each kind", () => {
    expect(nextDocNumber([], "invoice")).toBe("INV-0001");
    expect(nextDocNumber([], "quote")).toBe("QUO-0001");
  });

  it("increments past the highest existing number", () => {
    const docs = [
      invoice({ number: "INV-0001" }),
      invoice({ id: "doc-2", number: "INV-0007" }),
    ];
    expect(nextDocNumber(docs, "invoice")).toBe("INV-0008");
  });

  it("numbers invoices and quotes independently", () => {
    const docs = [invoice({ number: "INV-0004" })];
    expect(nextDocNumber(docs, "quote")).toBe("QUO-0001");
  });
});

describe("postings", () => {
  it("an issued invoice recognises revenue exactly once", () => {
    const postings = postingsForDocs([invoice()]);
    expect(postings).toHaveLength(1);
    expect(postings[0].debit).toBe("receivables");
    expect(postings[0].credit).toBe("sales");
    expect(postings[0].amount).toBe(90000);
  });

  it("a draft posts nothing at all", () => {
    expect(postingsForDocs([invoice({ status: "draft" })])).toHaveLength(0);
  });

  it("a quote posts nothing at all", () => {
    const quote = invoice({ kind: "quote", number: "QUO-0001", status: "sent" });
    expect(postingsForDocs([quote])).toHaveLength(0);
  });

  it("marking paid adds a second entry that never touches income", () => {
    const paid = invoice({ status: "paid", paidDate: "2026-03-20" });
    const postings = postingsForDocs([paid]);

    expect(postings).toHaveLength(2);
    const payment = postings[1];
    expect(payment.debit).toBe("bank");
    expect(payment.credit).toBe("receivables");

    // The whole point: no posting on a paid invoice credits an income account twice.
    const incomeCredits = postings.filter((p) => p.credit === "sales");
    expect(incomeCredits).toHaveLength(1);
  });
});

describe("the R1.3m bug", () => {
  it("a paid invoice books income once and leaves the receivable clear", () => {
    const paid = invoice({ status: "paid", paidDate: "2026-03-20" });
    const balances = computeBalances(SEED_ACCOUNTS, postingsForDocs([paid]), 0);
    const pnl = computeProfitAndLoss(SEED_ACCOUNTS, balances);

    expect(pnl.income).toBe(90000); // not 180000
    expect(balances.bank).toBe(90000);
    expect(balances.receivables).toBe(0);
  });

  it("keeps the trial balance balanced through the full invoice lifecycle", () => {
    const lifecycle: BusinessDoc[] = [
      invoice({ id: "a", number: "INV-0001", status: "sent" }),
      invoice({ id: "b", number: "INV-0002", status: "paid", paidDate: "2026-04-02" }),
      invoice({ id: "c", number: "INV-0003", status: "draft" }),
    ];
    const tb = computeTrialBalance(
      SEED_ACCOUNTS,
      computeBalances(SEED_ACCOUNTS, postingsForDocs(lifecycle), 0)
    );
    expect(tb.totalDebit).toBeCloseTo(tb.totalCredit, 6);
    expect(tb.balanced).toBe(true);
  });

  it("re-deriving postings is idempotent — no duplicate entries accumulate", () => {
    const paid = invoice({ status: "paid", paidDate: "2026-03-20" });
    const first = postingsForDocs([paid]);
    const second = postingsForDocs([paid]);
    expect(first.map((p) => p.id)).toEqual(second.map((p) => p.id));
    // Stable ids mean a re-render can't double-post the same sale.
    expect(new Set(first.map((p) => p.id)).size).toBe(first.length);
  });
});

describe("quote conversion", () => {
  it("produces an invoice with a fresh number and the same lines", () => {
    const quote = invoice({ kind: "quote", number: "QUO-0001", status: "sent" });
    const converted = convertQuoteToInvoice(quote, [quote]);

    expect(converted.kind).toBe("invoice");
    expect(converted.number).toBe("INV-0001");
    expect(docTotal(converted)).toBe(docTotal(quote));
    expect(converted.id).not.toBe(quote.id);
  });
});

describe("receivables summary", () => {
  it("separates outstanding from overdue", () => {
    const docs = [
      invoice({ id: "a", status: "sent", dueDate: "2000-01-01" }), // long overdue
      invoice({ id: "b", status: "sent", dueDate: "2999-01-01" }),
      invoice({ id: "c", status: "paid", paidDate: "2026-03-05" }),
    ];
    const s = summariseReceivables(docs);
    expect(s.unpaidCount).toBe(2);
    expect(s.outstanding).toBe(180000);
    expect(s.overdue).toBe(90000);
    expect(s.paidThisPeriod).toBe(90000);
  });

  it("does not treat a paid invoice as overdue", () => {
    const paid = invoice({ status: "paid", dueDate: "2000-01-01", paidDate: "2026-01-01" });
    expect(isOverdue(paid)).toBe(false);
  });
});

describe("totals", () => {
  it("multiplies quantity by unit price across lines", () => {
    const doc = invoice({
      items: [
        { id: "1", description: "S21", qty: 3, unitPrice: 40000 },
        { id: "2", description: "PSU", qty: 2, unitPrice: 2500 },
      ],
    });
    expect(docTotal(doc)).toBe(125000);
  });

  it("is zero for a document with no lines", () => {
    expect(docTotal(invoice({ items: [] }))).toBe(0);
  });
});
