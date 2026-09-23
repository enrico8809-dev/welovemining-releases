import { useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, FileDown } from "lucide-react";
import { useLedger } from "@engine/LedgerContext";
import {
  computeBalances,
  computeProfitAndLoss,
  computeTrialBalance,
  filterByPeriod,
} from "@engine/accounting";
import { PERIOD_OPTIONS, PeriodId, buildPeriod, describePeriod } from "@engine/period";
import {
  buildReportHtml,
  profitAndLossHtml,
  trialBalanceHtml,
} from "@engine/pdfHtml";
import { abs, fmt } from "@engine/format";
import Screen from "../components/Screen";
import { Card, Money, Pill, Tabs } from "../components/ui";
import { api } from "../api";
import { useToast } from "../components/Toast";

export default function Reports() {
  const { accounts, txns, openingBank, settings } = useLedger();
  const toast = useToast();
  const [periodId, setPeriodId] = useState<PeriodId>("ytd");

  const period = useMemo(
    () => buildPeriod(periodId, settings.fyStartMonth),
    [periodId, settings.fyStartMonth]
  );

  const pnl = useMemo(
    () =>
      computeProfitAndLoss(
        accounts,
        computeBalances(accounts, filterByPeriod(txns, period), 0)
      ),
    [accounts, txns, period]
  );

  // The trial balance is a snapshot of the whole book — which is the only way
  // its two columns can be expected to agree.
  const trial = useMemo(
    () => computeTrialBalance(accounts, computeBalances(accounts, txns, openingBank)),
    [accounts, txns, openingBank]
  );

  const exportPnl = async () => {
    const html = buildReportHtml(
      "Profit & Loss",
      describePeriod(period),
      settings,
      profitAndLossHtml(pnl)
    );
    if (await api.savePdf(html, "profit-and-loss.pdf")) toast.show("Saved profit-and-loss.pdf");
  };

  const exportTrial = async () => {
    const html = buildReportHtml(
      "Trial Balance",
      "All time",
      settings,
      trialBalanceHtml(trial.rows, trial.totalDebit, trial.totalCredit)
    );
    if (await api.savePdf(html, "trial-balance.pdf")) toast.show("Saved trial-balance.pdf");
  };

  return (
    <Screen
      title="Reports"
      subtitle={describePeriod(period)}
      actions={<Tabs options={PERIOD_OPTIONS} value={periodId} onChange={setPeriodId} />}
    >
      <div className="grid cols-2">
        <Card
          title="PROFIT & LOSS"
          action={
            <button className="btn small ghost" onClick={exportPnl}>
              <FileDown size={13} /> PDF
            </button>
          }
        >
          <table className="data">
            <thead>
              <tr>
                <th>Income</th>
                <th className="right" style={{ width: 150 }}>
                  {fmt(pnl.income)}
                </th>
              </tr>
            </thead>
            <tbody>
              {pnl.incomeLines.map((line) => (
                <tr key={line.account.id}>
                  <td className="wide">{line.account.name}</td>
                  <td className="right num">{abs(line.amount)}</td>
                </tr>
              ))}
              {pnl.incomeLines.length === 0 && (
                <tr>
                  <td colSpan={2} className="muted">
                    Nothing in this period.
                  </td>
                </tr>
              )}
            </tbody>
            <thead>
              <tr>
                <th>Expenses</th>
                <th className="right">{fmt(pnl.expenses)}</th>
              </tr>
            </thead>
            <tbody>
              {pnl.expenseLines.map((line) => (
                <tr key={line.account.id}>
                  <td className="wide">{line.account.name}</td>
                  <td className="right num">{abs(line.amount)}</td>
                </tr>
              ))}
              {pnl.expenseLines.length === 0 && (
                <tr>
                  <td colSpan={2} className="muted">
                    Nothing in this period.
                  </td>
                </tr>
              )}
            </tbody>
            <tfoot>
              <tr>
                <td>Net {pnl.net >= 0 ? "profit" : "loss"}</td>
                <td className="right">
                  <Money value={pnl.net} />
                </td>
              </tr>
            </tfoot>
          </table>
        </Card>

        <Card
          title="TRIAL BALANCE"
          action={
            <div className="row" style={{ gap: 8 }}>
              {trial.balanced ? (
                <Pill tone="good">
                  <CheckCircle2 size={10} /> balanced
                </Pill>
              ) : (
                <Pill tone="bad">
                  <AlertTriangle size={10} /> out of balance
                </Pill>
              )}
              <button className="btn small ghost" onClick={exportTrial}>
                <FileDown size={13} /> PDF
              </button>
            </div>
          }
        >
          <table className="data">
            <thead>
              <tr>
                <th>Account · all time</th>
                <th className="right" style={{ width: 130 }}>
                  Debit
                </th>
                <th className="right" style={{ width: 130 }}>
                  Credit
                </th>
              </tr>
            </thead>
            <tbody>
              {trial.rows.map((row) => (
                <tr key={row.account.id}>
                  <td className="wide">{row.account.name}</td>
                  <td className="right num">{row.debit > 0 ? abs(row.debit) : "—"}</td>
                  <td className="right num">{row.credit > 0 ? abs(row.credit) : "—"}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td>Total</td>
                <td className="right num">{abs(trial.totalDebit)}</td>
                <td className="right num">{abs(trial.totalCredit)}</td>
              </tr>
            </tfoot>
          </table>
          <div className="hint" style={{ marginTop: 10 }}>
            Every entry posts an equal debit and credit, so these two columns can never
            disagree.
          </div>
        </Card>
      </div>
    </Screen>
  );
}
