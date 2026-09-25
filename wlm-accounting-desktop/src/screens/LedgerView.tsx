import { useEffect, useMemo, useState } from "react";
import { BookOpen, Pencil, Plus, Search, Trash2 } from "lucide-react";
import { useLedger } from "@engine/LedgerContext";
import {
  Txn,
  accountName,
  counterAccountId,
  filterByPeriod,
  isMoneyIn,
  searchTxns,
  sortByDateDesc,
} from "@engine/accounting";
import { PERIOD_OPTIONS, PeriodId, buildPeriod, describePeriod } from "@engine/period";
import { fmtDateShort } from "@engine/format";
import Screen from "../components/Screen";
import { Card, EmptyState, Money, Tabs } from "../components/ui";
import CaptureDialog from "./CaptureDialog";
import { useToast } from "../components/Toast";

type Flow = "all" | "in" | "out";

const FLOWS: { id: Flow; label: string }[] = [
  { id: "all", label: "All" },
  { id: "in", label: "Money in" },
  { id: "out", label: "Money out" },
];

export default function LedgerView() {
  const { accounts, txns, removeTxn, settings } = useLedger();
  const toast = useToast();

  const [query, setQuery] = useState("");
  const [flow, setFlow] = useState<Flow>("all");
  const [periodId, setPeriodId] = useState<PeriodId>("all");
  const [editing, setEditing] = useState<Txn | null>(null);
  const [capturing, setCapturing] = useState(false);

  // Ctrl+N captures, / searches — the two things done all day.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.key.toLowerCase() === "n") {
        e.preventDefault();
        setCapturing(true);
      }
      if (e.key === "/" && document.activeElement?.tagName !== "INPUT") {
        e.preventDefault();
        document.getElementById("ledger-search")?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const period = useMemo(
    () => buildPeriod(periodId, settings.fyStartMonth),
    [periodId, settings.fyStartMonth]
  );

  const rows = useMemo(() => {
    let list = filterByPeriod(txns, period);
    if (flow !== "all") {
      list = list.filter((t) => (flow === "in" ? isMoneyIn(t) : !isMoneyIn(t)));
    }
    return sortByDateDesc(searchTxns(list, accounts, query));
  }, [txns, period, flow, query, accounts]);

  const net = useMemo(
    () => rows.reduce((sum, t) => sum + (isMoneyIn(t) ? t.amount : -t.amount), 0),
    [rows]
  );

  const remove = (txn: Txn) => {
    if (txn.sourceDoc) {
      toast.show("This entry belongs to an invoice — edit the invoice instead.", "warning");
      return;
    }
    removeTxn(txn.id);
    toast.show("Entry deleted");
  };

  const edit = (txn: Txn) => {
    if (txn.sourceDoc) {
      toast.show("This entry belongs to an invoice — edit the invoice instead.", "warning");
      return;
    }
    setEditing(txn);
  };

  return (
    <Screen
      title="Ledger"
      subtitle={`${rows.length} entries · ${describePeriod(period)}`}
      actions={
        <button className="btn primary" onClick={() => setCapturing(true)}>
          <Plus size={15} /> New entry <span className="muted">Ctrl+N</span>
        </button>
      }
    >
      <div className="stack">
        <div className="row wrap">
          <div className="money-field" style={{ width: 320, paddingLeft: 10 }}>
            <Search size={15} className="muted" />
            <input
              id="ledger-search"
              value={query}
              placeholder="Search description, account or amount"
              onChange={(e) => setQuery(e.target.value)}
              style={{ textAlign: "left", fontFamily: "var(--font-ui)" }}
            />
          </div>
          <Tabs options={FLOWS} value={flow} onChange={setFlow} />
          <Tabs options={PERIOD_OPTIONS} value={periodId} onChange={setPeriodId} />
          <span className="spacer" />
          <span className="hint">Net in view</span>
          <Money value={net} />
        </div>

        <Card flush>
          {rows.length === 0 ? (
            <EmptyState
              icon={<BookOpen size={26} className="muted" />}
              title={query || flow !== "all" ? "Nothing matches" : "No entries yet"}
              body={
                query || flow !== "all"
                  ? "Try a different search or clear the filters."
                  : "Capture what happened and the app books both sides of it for you."
              }
            />
          ) : (
            <div className="table-wrap">
              <table className="data">
                <thead>
                  <tr>
                    <th style={{ width: 100 }}>Date</th>
                    <th>Description</th>
                    <th style={{ width: 190 }}>Account</th>
                    <th style={{ width: 150 }}>Recipe</th>
                    <th className="right" style={{ width: 150 }}>
                      Amount
                    </th>
                    <th style={{ width: 78 }} />
                  </tr>
                </thead>
                <tbody>
                  {rows.map((t) => (
                    <tr key={t.id} className={t.sourceDoc ? "dim" : undefined}>
                      <td className="num">{fmtDateShort(t.date)}</td>
                      <td className="wide" title={t.desc}>
                        {t.desc}
                      </td>
                      <td>{accountName(accounts, counterAccountId(t))}</td>
                      <td className="muted">{t.sourceDoc ? "From a document" : t.recipe}</td>
                      <td className="right">
                        <Money value={isMoneyIn(t) ? t.amount : -t.amount} />
                      </td>
                      <td>
                        <div className="row" style={{ gap: 4 }}>
                          <button
                            className="btn ghost small"
                            title="Edit"
                            onClick={() => edit(t)}
                          >
                            <Pencil size={13} />
                          </button>
                          <button
                            className="btn ghost small"
                            title="Delete"
                            onClick={() => remove(t)}
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr>
                    <td colSpan={4}>{rows.length} entries</td>
                    <td className="right">
                      <Money value={net} />
                    </td>
                    <td />
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </Card>

        <div className="hint">
          Entries in grey come from an invoice or a stock movement. They are worked out from
          the document itself, so the only way to change one is to change what it came from —
          which is what stops the same sale being counted twice.
        </div>
      </div>

      {(capturing || editing) && (
        <CaptureDialog
          existing={editing ?? undefined}
          onClose={() => {
            setCapturing(false);
            setEditing(null);
          }}
          onSaved={(what) => toast.show(what)}
        />
      )}
    </Screen>
  );
}
