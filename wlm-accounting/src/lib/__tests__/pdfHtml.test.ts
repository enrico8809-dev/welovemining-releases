import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { buildDocHtml } from "../pdfHtml";
import { DEFAULT_SETTINGS } from "../ledgerModel";
import { BusinessDoc } from "../invoices";

/**
 * The document the customer actually receives.
 *
 * Tested because this is the one screen in the app that leaves the building. A
 * wrong figure here is quoted to a real customer, and a wrong network sends
 * real coins somewhere they cannot be recovered from.
 *
 * Set WLM_WRITE_HTML to a folder to drop the rendered files there and look at
 * them.
 */

const ADDRESS = "TQn9Y2khDD95J42FQtQTdwVVRkvBHcVhZ8";

const settings = {
  ...DEFAULT_SETTINGS,
  registrationNumber: "2019/123456/07",
  bank: { ...DEFAULT_SETTINGS.bank, accountNumber: "62812345678" },
  crypto: {
    ...DEFAULT_SETTINGS.crypto,
    assets: [
      {
        ...DEFAULT_SETTINGS.crypto.assets[0],
        address: ADDRESS,
        rateZar: 18.52,
        rateSetOn: "2026-10-06",
      },
    ],
  },
};

const invoice: BusinessDoc = {
  id: "d1",
  kind: "invoice",
  number: "INV-0042",
  customer: "Highveld Mining Co (Pty) Ltd",
  date: "2026-10-06",
  dueDate: "2026-10-20",
  items: [
    { id: "a", description: "Antminer S21 Hydro — 335 TH/s", qty: 2, unitPrice: 128_500 },
    { id: "b", description: "Delivery — Johannesburg", qty: 1, unitPrice: 1_500 },
  ],
  status: "sent",
  incomeAccount: "sales",
  crypto: { asset: "USDT", rateZar: 18.52, decimals: 2 },
};

const quote: BusinessDoc = {
  ...invoice,
  id: "d2",
  kind: "quote",
  number: "QUO-0042",
};

const html = buildDocHtml(invoice, settings);

if (process.env.WLM_WRITE_HTML) {
  const out = process.env.WLM_WRITE_HTML;
  writeFileSync(join(out, "invoice.html"), html);
  writeFileSync(join(out, "quote.html"), buildDocHtml(quote, settings));
}

describe("an invoice offering crypto", () => {
  it("still asks for the rand total", () => {
    // 2 × 128 500 + 1 500 = 258 500. The rands are what is owed; the coins are
    // a way of paying it.
    expect(html).toContain("R 258,500.00");
  });

  it("quotes the coins at the rate fixed on the document", () => {
    // 258 500 / 18.52 = 13,957.88... rounded up, so the customer is never asked
    // for less value than they were invoiced.
    expect(html).toContain("13,957.89 USDT");
    expect(html).toContain("R 18.52 per USDT");
  });

  it("gives the network as much weight as the address", () => {
    expect(html).toContain("TRC20 (Tron)");
    expect(html).toContain("network only");
  });

  it("prints the deposit address in full", () => {
    expect(html).toContain(ADDRESS);
  });

  it("uses the invoice number as the reference on both panels", () => {
    expect(html.match(/INV-0042/g)!.length).toBeGreaterThanOrEqual(3);
  });

  it("keeps the bank details as well — crypto is an option, not a replacement", () => {
    expect(html).toContain("62812345678");
  });

  it("drops the panel once it has been paid", () => {
    const paid = buildDocHtml(
      { ...invoice, status: "paid", paidDate: "2026-10-09" },
      settings
    );
    expect(paid).not.toContain(ADDRESS);
    expect(paid).not.toContain("USDT");
  });

  it("drops the panel when crypto is switched off in settings", () => {
    const off = buildDocHtml(invoice, {
      ...settings,
      crypto: { ...settings.crypto, offerOnDocs: false },
    });
    expect(off).not.toContain("USDT");
  });

  it("says nothing about coins on a document that wasn't offered them", () => {
    expect(buildDocHtml({ ...invoice, crypto: undefined }, settings)).not.toContain("USDT");
  });
});

describe("a quote offering crypto", () => {
  const quoted = buildDocHtml(quote, settings);

  it("shows what it comes to in coins", () => {
    expect(quoted).toContain("13,957.89 USDT");
  });

  it("says how long the rate holds", () => {
    expect(quoted).toContain(`held for ${settings.quoteValidityDays} days`);
  });

  // A quote is a price, not a demand for payment: nothing is owed yet, and
  // putting a deposit address on one invites someone to pay against a document
  // that posts nothing to the books.
  it("withholds the deposit address", () => {
    expect(quoted).not.toContain(ADDRESS);
  });
});

describe("a document with no rate set", () => {
  it("offers no coin figure rather than a wrong one", () => {
    const rateless = buildDocHtml({ ...invoice, crypto: { asset: "USDT", rateZar: 0, decimals: 2 } }, settings);
    expect(rateless).not.toContain("USDT");
  });
});
