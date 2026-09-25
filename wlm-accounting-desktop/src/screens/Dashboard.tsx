import { useMemo } from "react";
import { ArrowRight } from "lucide-react";
import { useLedger } from "@engine/LedgerContext";
import {
  accountName,
  counterAccountId,
  isMoneyIn,
  monthlyCashFlow,
  sortByDateDesc,
  topExpenses,
} from "@engine/accounting";
import { summariseReceivables } from "@engine/invoices";
import { summariseInventory } from "@engine/inventory";
import { reconciledToDate } from "@engine/reconcile";
import { fmt, fmtCompact, fmtDateShort } from "@engine/format";
import Screen from "../components/Screen";
import { Card, Money, Tile } from "../components/ui";
import type { View } from "../App";

export default function Dashboard({ onNavigate }: { onNavigate: (v: View) => void }) {
  const { accounts, txns, docs, movements, reconciliations, balances } = useLedger();

  const months = useMemo(() => monthlyCashFlow(txns, 6), [txns]);
  const receivables = useMemo(() => summariseReceivables(docs), [docs]);
  const inventory = useMemo(() => summariseInventory(movements), [movements]);
  const expenses = useMemo(() => topExpenses(accounts, balances, 5), [accounts, balances]);
  const recent = useMemo(() => sortByDateDesc(txns).slice(0, 12), [txns]);
  const lastReconciled = reconciledToDate(reconciliations);

  const thisMonth = months[months.length - 1];
  const peak = Math.max(1, ...months.map((m) => Math.max(m.income, m.expenses)));

  return (
    <Screen
      title="Dashboard"
      subtitle={
        lastReconciled
          ? `Bank reconciled to ${fmtDateShort(lastReconciled)}`
          : "Bank not yet reconciled"
      }
    >
      <div className="stack">
        <div className="grid cols-4">
          <Tile label="BANK BALANCE" value={fmt(balances.bank ?? 0)} foot="Per the books" />
          <Tile
            label="IN THIS MONTH"
            value={fmt(thisMonth?.income ?? 0)}
            tone="pos"
            foot={thisMonth?.label}
          />
          <Tile
            label="OUT THIS MONTH"
            value={fmt(thisMonth?.expenses ?? 0)}
            tone="neg"
            foot={thisMonth?.label}
          />
          <Tile
            label="OWED TO YOU"
            value={fmt(receivables.outstanding)}
            tone={receivables.overdue > 0 ? "warn" : undefined}
            foot={
              receivables.overdue > 0
                ? `${fmt(receivables.overdue)} overdue`
                : "Nothing overdue"
            }
          />
        </div>

        <div className="grid cols-2">
          <Card title="CASH FLOW — LAST SIX MONTHS">
            <div className="bars">
              {months.map((m) => (
                <div className="bar-col" key={m.key}>
                  <div className="bar-pair">
                    <div
                      className="bar in"
                      style={{ height: `${(m.income / peak) * 100}%` }}
                      title={`In ${fmt(m.income)}`}
                    />
                    <div
                      className="bar out"
                      style={{ height: `${(m.expenses / peak) * 100}%` }}
                      title={`Out ${fmt(m.expenses)}`}
                    />
                  </div>
                  <div className="bar-label">{m.label}</div>
                </div>
              ))}
            </div>
            <div className="row" style={{ marginTop: 12, gap: 16 }}>
              <span className="hint">
                <span className="pos">▇</span> Money in
              </span>
              <span className="hint">
                <span className="neg">▇</span> Money out
              </span>
              <span className="spacer" />
              <span className="hint num">Peak {fmtCompact(peak)}</span>
            </div>
          </Card>

          <Card title="WHERE THE MONEY WENT">
            {expenses.length === 0 ? (
              <div className="hint">No expenses recorded yet.</div>
            ) : (
              <table className="data">
                <tbody>
                  {expenses.map((e) => (
                    <tr key={e.account.id}>
                      <td className="wide">{e.account.name}</td>
                      <td className="right">
                        <Money value={e.amount} plain />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            <div className="row" style={{ marginTop: 12 }}>
              <span className="hint">Stock on hand {fmt(inventory.totalValueZar)}</span>
              <span className="spacer" />
              <button className="btn small ghost" onClick={() => onNavigate("reports")}>
                Full reports <ArrowRight size={13} />
              </button>
            </div>
          </Card>
        </div>

        <Card
          title="RECENT ENTRIES"
          flush
          action={
            <button className="btn small ghost" onClick={() => onNavigate("ledger")}>
              Open ledger <ArrowRight size={13} />
            </button>
          }
        >
          <table className="data">
            <thead>
              <tr>
                <th style={{ width: 96 }}>Date</th>
                <th>Description</th>
                <th style={{ width: 200 }}>Account</th>
                <th className="right" style={{ width: 140 }}>
                  Amount
                </th>
              </tr>
            </thead>
            <tbody>
              {recent.map((t) => (
                <tr key={t.id}>
                  <td className="num">{fmtDateShort(t.date)}</td>
                  <td className="wide">{t.desc}</td>
                  <td className="muted">{accountName(accounts, counterAccountId(t))}</td>
                  <td className="right">
                    <Money value={isMoneyIn(t) ? t.amount : -t.amount} />
                  </td>
                </tr>
              ))}
              {recent.length === 0 && (
                <tr>
                  <td colSpan={4} className="muted" style={{ textAlign: "center" }}>
                    Nothing captured yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </Card>
      </div>
    </Screen>
  );
}
