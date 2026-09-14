import * as Print from "expo-print";
import * as Sharing from "expo-sharing";
import { BusinessDoc, docTotal, lineTotal, statusLabel } from "./invoices";
import { Settings } from "./storage";
import { logoAsDataUri } from "./logo";
import { abs, fmtDate } from "./format";
import { Account, TrialBalanceRow, ProfitAndLoss } from "./accounting";

// The PDF is deliberately plain-light rather than the app's dark theme: these
// get printed, emailed and forwarded to accountants, and a near-black page
// wastes a cartridge and reads as a screenshot rather than a document.
const CSS = `
  * { box-sizing: border-box; }
  body {
    font-family: -apple-system, 'Helvetica Neue', Helvetica, Arial, sans-serif;
    color: #1A1A1A; margin: 0; padding: 40px; font-size: 12px; line-height: 1.5;
  }
  .head { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 36px; }
  .logo { max-height: 78px; max-width: 220px; }
  .brand-name { font-size: 20px; font-weight: 700; letter-spacing: 0.5px; }
  .brand-meta { color: #666; font-size: 11px; margin-top: 6px; white-space: pre-line; }
  .doc-title { text-align: right; }
  .doc-title h1 { margin: 0; font-size: 26px; letter-spacing: 2px; color: #F7931A; text-transform: uppercase; }
  .doc-number { font-size: 15px; font-weight: 700; margin-top: 4px; }
  .doc-dates { color: #666; font-size: 11px; margin-top: 8px; }
  .status { display: inline-block; margin-top: 8px; padding: 3px 10px; border-radius: 3px;
            font-size: 10px; font-weight: 700; letter-spacing: 1px; text-transform: uppercase;
            border: 1px solid #999; color: #555; }
  .status.paid { border-color: #2E7D32; color: #2E7D32; }
  .status.overdue { border-color: #C62828; color: #C62828; }
  .parties { display: flex; gap: 40px; margin-bottom: 28px; }
  .party { flex: 1; }
  .party h3 { margin: 0 0 6px; font-size: 10px; letter-spacing: 1.5px; color: #888; text-transform: uppercase; }
  .party .name { font-weight: 700; font-size: 14px; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 24px; }
  th { text-align: left; font-size: 10px; letter-spacing: 1px; text-transform: uppercase;
       color: #888; border-bottom: 2px solid #1A1A1A; padding: 8px 6px; }
  td { padding: 10px 6px; border-bottom: 1px solid #E5E5E5; vertical-align: top; }
  .num { text-align: right; white-space: nowrap; font-variant-numeric: tabular-nums; }
  .totals { margin-left: auto; width: 280px; }
  .totals td { border: none; padding: 5px 6px; }
  .totals .grand td { border-top: 2px solid #1A1A1A; font-size: 16px; font-weight: 700; padding-top: 10px; }
  .panel { background: #FAFAFA; border: 1px solid #E5E5E5; border-left: 3px solid #F7931A;
           padding: 16px; margin-bottom: 20px; }
  .panel h3 { margin: 0 0 10px; font-size: 10px; letter-spacing: 1.5px; color: #888; text-transform: uppercase; }
  .bank-grid { display: flex; flex-wrap: wrap; }
  .bank-grid div { width: 50%; padding: 3px 0; }
  .bank-grid .k { color: #777; font-size: 10px; text-transform: uppercase; letter-spacing: 0.5px; }
  .bank-grid .v { font-weight: 600; }
  .foot { margin-top: 30px; padding-top: 14px; border-top: 1px solid #E5E5E5;
          color: #888; font-size: 10px; text-align: center; }
`;

function esc(s: string): string {
  return String(s ?? "").replace(/[&<>"]/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!
  );
}

function letterhead(settings: Settings): string {
  const logo = settings.logoUri ? logoAsDataUri(settings.logoUri) : null;
  const meta = [
    settings.registrationNumber ? `Reg: ${settings.registrationNumber}` : "",
    settings.vatNumber ? `VAT: ${settings.vatNumber}` : "",
    settings.address,
    settings.phone,
    settings.email,
    settings.website,
  ]
    .filter(Boolean)
    .join("\n");

  return `
    <div>
      ${logo ? `<img class="logo" src="${logo}" />` : ""}
      <div class="brand-name">${esc(settings.companyName)}</div>
      <div class="brand-meta">${esc(meta)}</div>
    </div>`;
}

export function buildDocHtml(doc: BusinessDoc, settings: Settings): string {
  const total = docTotal(doc);
  const isInvoice = doc.kind === "invoice";
  const label = statusLabel(doc);
  const statusClass =
    doc.status === "paid" ? "paid" : label === "Overdue" ? "overdue" : "";

  const rows = doc.items
    .filter((i) => i.description || lineTotal(i) > 0)
    .map(
      (i) => `
      <tr>
        <td>${esc(i.description)}</td>
        <td class="num">${i.qty}</td>
        <td class="num">R ${abs(i.unitPrice)}</td>
        <td class="num">R ${abs(lineTotal(i))}</td>
      </tr>`
    )
    .join("");

  const dates = [
    `${isInvoice ? "Invoice" : "Quote"} date: ${fmtDate(doc.date)}`,
    isInvoice && doc.dueDate ? `Due: ${fmtDate(doc.dueDate)}` : "",
    !isInvoice ? `Valid for ${settings.quoteValidityDays} days` : "",
    doc.paidDate ? `Paid: ${fmtDate(doc.paidDate)}` : "",
  ]
    .filter(Boolean)
    .join("<br/>");

  const b = settings.bank;
  const bankBlock =
    isInvoice && doc.status !== "paid" && b.accountNumber
      ? `
    <div class="panel">
      <h3>Payment details</h3>
      <div class="bank-grid">
        <div><div class="k">Bank</div><div class="v">${esc(b.bankName)}</div></div>
        <div><div class="k">Account name</div><div class="v">${esc(b.accountName)}</div></div>
        <div><div class="k">Account number</div><div class="v">${esc(b.accountNumber)}</div></div>
        <div><div class="k">Branch code</div><div class="v">${esc(b.branchCode)}</div></div>
        <div><div class="k">Account type</div><div class="v">${esc(b.accountType)}</div></div>
        <div><div class="k">Reference</div><div class="v">${esc(doc.number)}</div></div>
        ${b.swift ? `<div><div class="k">SWIFT</div><div class="v">${esc(b.swift)}</div></div>` : ""}
      </div>
    </div>`
      : "";

  return `<html><head><meta charset="utf-8"/><style>${CSS}</style></head><body>
    <div class="head">
      ${letterhead(settings)}
      <div class="doc-title">
        <h1>${isInvoice ? "Invoice" : "Quotation"}</h1>
        <div class="doc-number">${esc(doc.number)}</div>
        <div class="doc-dates">${dates}</div>
        <div class="status ${statusClass}">${esc(label)}</div>
      </div>
    </div>

    <div class="parties">
      <div class="party">
        <h3>${isInvoice ? "Billed to" : "Prepared for"}</h3>
        <div class="name">${esc(doc.customer || "—")}</div>
      </div>
    </div>

    <table>
      <thead>
        <tr><th>Description</th><th class="num">Qty</th><th class="num">Unit price</th><th class="num">Amount</th></tr>
      </thead>
      <tbody>${rows || `<tr><td colspan="4">No line items</td></tr>`}</tbody>
    </table>

    <table class="totals">
      <tr><td>Subtotal</td><td class="num">R ${abs(total)}</td></tr>
      <tr class="grand"><td>Total due</td><td class="num">R ${abs(total)}</td></tr>
    </table>

    ${bankBlock}
    ${doc.notes ? `<div class="panel"><h3>Notes</h3><div>${esc(doc.notes)}</div></div>` : ""}

    <div class="foot">
      ${esc(settings.invoiceFooter)}<br/>
      ${esc(settings.companyName)}${settings.registrationNumber ? ` · Reg ${esc(settings.registrationNumber)}` : ""}
      ${settings.vatNumber ? "" : " · Not registered for VAT"}
    </div>
  </body></html>`;
}

export function buildReportHtml(
  title: string,
  periodLabel: string,
  settings: Settings,
  bodyHtml: string
): string {
  return `<html><head><meta charset="utf-8"/><style>${CSS}</style></head><body>
    <div class="head">
      ${letterhead(settings)}
      <div class="doc-title">
        <h1>${esc(title)}</h1>
        <div class="doc-dates">${esc(periodLabel)}</div>
      </div>
    </div>
    ${bodyHtml}
    <div class="foot">
      Generated by WLM Accounting · ${esc(settings.companyName)}
    </div>
  </body></html>`;
}

export function profitAndLossHtml(pnl: ProfitAndLoss): string {
  const lines = (rows: { account: Account; amount: number }[]) =>
    rows.map((l) => `<tr><td>${esc(l.account.name)}</td><td class="num">R ${abs(l.amount)}</td></tr>`).join("");

  return `
    <table>
      <thead><tr><th>Income</th><th class="num">Amount</th></tr></thead>
      <tbody>${lines(pnl.incomeLines) || `<tr><td colspan="2">None</td></tr>`}
        <tr><td><strong>Total income</strong></td><td class="num"><strong>R ${abs(pnl.income)}</strong></td></tr>
      </tbody>
    </table>
    <table>
      <thead><tr><th>Expenses</th><th class="num">Amount</th></tr></thead>
      <tbody>${lines(pnl.expenseLines) || `<tr><td colspan="2">None</td></tr>`}
        <tr><td><strong>Total expenses</strong></td><td class="num"><strong>R ${abs(pnl.expenses)}</strong></td></tr>
      </tbody>
    </table>
    <table class="totals">
      <tr class="grand">
        <td>Net ${pnl.net >= 0 ? "profit" : "loss"}</td>
        <td class="num">R ${abs(pnl.net)}</td>
      </tr>
    </table>`;
}

export function trialBalanceHtml(
  rows: TrialBalanceRow[],
  totalDebit: number,
  totalCredit: number
): string {
  return `
    <table>
      <thead><tr><th>Account</th><th class="num">Debit</th><th class="num">Credit</th></tr></thead>
      <tbody>
        ${rows
          .map(
            (r) => `<tr><td>${esc(r.account.name)}</td>
              <td class="num">${r.debit > 0 ? `R ${abs(r.debit)}` : "—"}</td>
              <td class="num">${r.credit > 0 ? `R ${abs(r.credit)}` : "—"}</td></tr>`
          )
          .join("")}
        <tr>
          <td><strong>Total</strong></td>
          <td class="num"><strong>R ${abs(totalDebit)}</strong></td>
          <td class="num"><strong>R ${abs(totalCredit)}</strong></td>
        </tr>
      </tbody>
    </table>`;
}

/** Renders HTML to a PDF and opens the share sheet. Returns the file URI. */
export async function sharePdf(html: string, filename: string): Promise<string> {
  const { uri } = await Print.printToFileAsync({ html, base64: false });

  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(uri, {
      mimeType: "application/pdf",
      dialogTitle: filename,
      UTI: "com.adobe.pdf",
    });
  }
  return uri;
}
