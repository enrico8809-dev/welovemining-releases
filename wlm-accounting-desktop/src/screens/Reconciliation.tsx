import { useCallback, useMemo, useState } from "react";
import { CheckCircle2, Link2, Scale, Unlink } from "lucide-react";
import { useLedger } from "@engine/LedgerContext";
import { Txn, accountName, computeBalances, isMoneyIn } from "@engine/accounting";
import { ParsedLine, parseStatement } from "@engine/bankImport";
import {
  applyManualMatch,
  buildReconciliation,
  closingBalanceFromStatement,
  reconcile,
  reconciledToDate,
  reconciledTxnIds,
  summariseReconciliation,
  unmatch,
} from "@engine/reconcile";
import { abs, fmt, fmtDate, fmtDateShort, parseAmount } from "@engine/format";
import Screen from "../components/Screen";
import { Card, EmptyState, Money, MoneyInput, Pill, Tabs, Tile } from "../components/ui";
import { api } from "../api";
import { useToast } from "../components/Toast";

type Tab = "matched" | "statement" | "books";

export default function Reconciliation() {
  const { accounts, txns, openingBank, reconciliations, addReconciliation } = useLedger();
  const toast = useToast();

  const [lines, setLines] = useState<ParsedLine[] | null>(null);
  const [source, setSource] = useState("");
  const [closing, setClosing] = useState("");
  const [manual, setManual] = useState<{ lineId: string; txnId: string }[]>([]);
  const [unmatched, setUnmatched] = useState<string[]>([]);
  const [tab, setTab] = useState<Tab>("matched");
  const [pickFor, setPickFor] = useState<ParsedLine | null>(null);

  const alreadyDone = useMemo(() => reconciledTxnIds(reconciliations), [reconciliations]);
  const lastReconciled = reconciledToDate(reconciliations);

  /**
   * Matching runs from scratch each time so that a manual pairing and a manual
   * unpairing are both just inputs to the same function — there is no separate
   * mutable match state to fall out of step with the statement.
   */
  const result = useMemo(() => {
    if (!lines) return null;
    let current = reconcile(lines, txns, alreadyDone);
    for (const id of unmatched) current = unmatch(current, id);
    for (const pair of manual) current = applyManualMatch(current, pair.lineId, pair.txnId);
    return current;
  }, [lines, txns, alreadyDone, manual, unmatched]);

  const statementDate = useMemo(
    () => (lines?.length ? lines.reduce((a, b) => (a.date > b.date ? a : b)).date : ""),
    [lines]
  );

  // The book balance must be the bank as at the statement's closing date, with
  // the opening balance in it — a period-only figure produces a difference that
  // looks like an error but is only a truncated book.
  const bookBalance = useMemo(() => {
    if (!statementDate) return 0;
    const upTo = txns.filter((t) => t.date <= statementDate);
    return computeBalances(accounts, upTo, openingBank).bank ?? 0;
  }, [txns, accounts, openingBank, statementDate]);

  const summary = useMemo(
    () =>
      result ? summariseReconciliation(result, parseAmount(closing) || 0, bookBalance) : null,
    [result, closing, bookBalance]
  );

  const load = useCallback(
    (name: string, text: string) => {
      const parsed = parseStatement(text, name);
      if (!parsed.ok) {
        toast.show(parsed.reason, "error");
        return;
      }
      setLines(parsed.lines);
      setSource(`${name} · ${parsed.format.toUpperCase()}`);
      setManual([]);
      setUnmatched([]);

      const fromFile = closingBalanceFromStatement(parsed.lines);
      setClosing(fromFile === null ? "" : abs(fromFile));
      if (fromFile === null) {
        toast.show("No running balance in this file — type the closing balance", "warning");
      }
    },
    [toast]
  );

  const choose = async () => {
    const picked = await api.openTextFile("Bank statement", ["csv", "ofx", "txt"]);
    if (picked) load(picked.name, picked.text);
  };

  const save = async () => {
    if (!result || !summary) return;
    await addReconciliation(buildReconciliation(result, summary, statementDate));
    toast.show(
      summary.balanced
        ? `Reconciled to ${fmtDate(statementDate)} — the books agree with the bank`
        : `Saved with a difference of ${fmt(summary.difference)}`,
      summary.balanced ? "info" : "warning"
    );
    setLines(null);
  };

  if (!lines || !result || !summary) {
    return (
      <Screen
        title="Reconciliation"
        subtitle={
          lastReconciled ? `Reconciled to ${fmtDate(lastReconciled)}` : "Not yet reconciled"
        }
      >
        <EmptyState
          icon={<Scale size={28} className="muted" />}
          title="Match a statement against the books"
          body="Load the same statement file you'd import. Nothing is posted — this only proves that what the bank says and what the books say are the same, and shows exactly where they differ."
          action={
            <button className="btn primary" onClick={choose}>
              Choose a statement
            </button>
          }
        />
      </Screen>
    );
  }

  return (
    <Screen
      title="Reconciliation"
      subtitle={`${source} · to ${fmtDate(statementDate)}`}
      actions={
        <>
          <button className="btn ghost" onClick={() => setLines(null)}>
            Discard
          </button>
          <button className="btn primary" onClick={save}>
            Save reconciliation
          </button>
        </>
      }
    >
      <div className="stack">
        <div className="grid cols-4">
          <Tile label="MATCHED" value={String(result.matched.length)} foot="Lines tied to entries" />
          <Tile
            label="ON THE STATEMENT ONLY"
            value={String(result.statementOnly.length)}
            tone={result.statementOnly.length ? "warn" : undefined}
            foot="Not captured yet"
          />
          <Tile
            label="IN THE BOOKS ONLY"
            value={String(result.booksOnly.length)}
            foot="In transit, or wrong"
          />
          <Tile
            label="DIFFERENCE"
            value={fmt(summary.difference)}
            tone={summary.balanced ? "pos" : "neg"}
            foot={summary.balanced ? "The books agree" : "Needs explaining"}
          />
        </div>

        <div className="grid cols-2">
          <Card title="RECONCILIATION STATEMENT">
            <table className="data">
              <tbody>
                <tr>
                  <td className="wide">Closing balance per the bank</td>
                  <td className="right">
                    <div style={{ width: 170, marginLeft: "auto" }}>
                      <MoneyInput value={closing} onChange={setClosing} />
                    </div>
                  </td>
                </tr>
                <tr>
                  <td className="wide">Add: deposits not yet shown</td>
                  <td className="right num">{abs(summary.depositsInTransit)}</td>
                </tr>
                <tr>
                  <td className="wide">Less: payments not yet taken</td>
                  <td className="right num">{abs(summary.unpresentedPayments)}</td>
                </tr>
                <tr>
                  <td className="wide">Adjusted bank balance</td>
                  <td className="right num">{abs(summary.adjustedBankBalance)}</td>
                </tr>
                <tr>
                  <td className="wide">Balance per the books</td>
                  <td className="right num">{abs(summary.bookBalance)}</td>
                </tr>
              </tbody>
              <tfoot>
                <tr>
                  <td>
                    {summary.balanced ? (
                      <Pill tone="good">
                        <CheckCircle2 size={10} /> balanced
                      </Pill>
                    ) : (
                      <Pill tone="bad">difference</Pill>
                    )}
                  </td>
                  <td className="right">
                    <Money value={summary.difference} />
                  </td>
                </tr>
              </tfoot>
            </table>
            {!summary.balanced && (
              <div className="hint" style={{ marginTop: 10 }}>
                A difference means something on the statement isn't in the books, something in
                the books never happened, or an amount was captured wrongly. The three tabs
                below show which.
              </div>
            )}
          </Card>

          <Card title="STILL TO CAPTURE">
            {result.statementOnly.length === 0 ? (
              <div className="hint">
                Every line on this statement is in the books. Nothing to capture.
              </div>
            ) : (
              <>
                <div className="hint" style={{ marginBottom: 10 }}>
                  {result.statementOnly.length} lines worth {fmt(summary.unrecordedValue)} are on
                  the statement but not in the books. Import the statement to capture them.
                </div>
                <div className="table-wrap" style={{ maxHeight: 190 }}>
                  <table className="data">
                    <tbody>
                      {result.statementOnly.slice(0, 20).map((line) => (
                        <tr key={line.id}>
                          <td className="num" style={{ width: 90 }}>
                            {fmtDateShort(line.date)}
                          </td>
                          <td className="wide">{line.description}</td>
                          <td className="right">
                            <Money value={line.amount} />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </Card>
        </div>

        <div className="row">
          <Tabs
            options={[
              { id: "matched" as Tab, label: `Matched (${result.matched.length})` },
              { id: "statement" as Tab, label: `Statement only (${result.statementOnly.length})` },
              { id: "books" as Tab, label: `Books only (${result.booksOnly.length})` },
            ]}
            value={tab}
            onChange={setTab}
          />
        </div>

        <Card flush>
          <div className="table-wrap" style={{ maxHeight: 380 }}>
            {tab === "matched" && (
              <table className="data">
                <thead>
                  <tr>
                    <th style={{ width: 100 }}>Date</th>
                    <th>Statement line</th>
                    <th>Book entry</th>
                    <th className="right" style={{ width: 130 }}>
                      Amount
                    </th>
                    <th style={{ width: 120 }}>Match</th>
                    <th style={{ width: 90 }} />
                  </tr>
                </thead>
                <tbody>
                  {result.matched.map((pair) => (
                    <tr key={pair.line.id}>
                      <td className="num">{fmtDateShort(pair.line.date)}</td>
                      <td className="wide">{pair.line.description}</td>
                      <td className="wide">{pair.txn.desc}</td>
                      <td className="right">
                        <Money value={pair.line.amount} />
                      </td>
                      <td>
                        <Pill tone={pair.confidence === "exact" ? "good" : "warning"}>
                          {pair.confidence === "exact"
                            ? "exact"
                            : pair.confidence === "close"
                              ? `${pair.dayGap}d apart`
                              : "manual"}
                        </Pill>
                      </td>
                      <td>
                        <button
                          className="btn ghost small"
                          title="Unmatch"
                          onClick={() => {
                            setManual((m) => m.filter((p) => p.lineId !== pair.line.id));
                            setUnmatched((u) => [...u, pair.line.id]);
                          }}
                        >
                          <Unlink size={13} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}

            {tab === "statement" && (
              <table className="data">
                <thead>
                  <tr>
                    <th style={{ width: 100 }}>Date</th>
                    <th>Description</th>
                    <th className="right" style={{ width: 130 }}>
                      Amount
                    </th>
                    <th style={{ width: 120 }} />
                  </tr>
                </thead>
                <tbody>
                  {result.statementOnly.map((line) => (
                    <tr key={line.id}>
                      <td className="num">{fmtDateShort(line.date)}</td>
                      <td className="wide">{line.description}</td>
                      <td className="right">
                        <Money value={line.amount} />
                      </td>
                      <td>
                        <button className="btn small ghost" onClick={() => setPickFor(line)}>
                          <Link2 size={13} /> Match
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}

            {tab === "books" && (
              <table className="data">
                <thead>
                  <tr>
                    <th style={{ width: 100 }}>Date</th>
                    <th>Description</th>
                    <th style={{ width: 200 }}>Account</th>
                    <th className="right" style={{ width: 130 }}>
                      Amount
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {result.booksOnly.map((txn) => (
                    <tr key={txn.id}>
                      <td className="num">{fmtDateShort(txn.date)}</td>
                      <td className="wide">{txn.desc}</td>
                      <td className="muted">
                        {accountName(accounts, isMoneyIn(txn) ? txn.credit : txn.debit)}
                      </td>
                      <td className="right">
                        <Money value={isMoneyIn(txn) ? txn.amount : -txn.amount} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </Card>
      </div>

      {pickFor && (
        <MatchPicker
          line={pickFor}
          candidates={result.booksOnly}
          accounts={accounts}
          onClose={() => setPickFor(null)}
          onPick={(txn) => {
            setUnmatched((u) => u.filter((id) => id !== pickFor.id));
            setManual((m) => [...m, { lineId: pickFor.id, txnId: txn.id }]);
            setPickFor(null);
          }}
        />
      )}
    </Screen>
  );
}

function MatchPicker({
  line,
  candidates,
  accounts,
  onPick,
  onClose,
}: {
  line: ParsedLine;
  candidates: Txn[];
  accounts: ReturnType<typeof useLedger>["accounts"];
  onPick: (txn: Txn) => void;
  onClose: () => void;
}) {
  // Nearest in amount first: the entry that belongs to this line is nearly
  // always the one for the same money, even when the date or wording differs.
  const ordered = useMemo(
    () =>
      [...candidates].sort(
        (a, b) =>
          Math.abs(a.amount - Math.abs(line.amount)) -
          Math.abs(b.amount - Math.abs(line.amount))
      ),
    [candidates, line.amount]
  );

  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <div className="modal-head">
          <div>
            <h2>Match this line by hand</h2>
            <div className="hint">
              {fmtDate(line.date)} · {line.description} · {fmt(line.amount)}
            </div>
          </div>
        </div>
        <div className="modal-body">
          {ordered.length === 0 ? (
            <div className="hint">
              There's nothing in the books left to match this to. Import the statement to
              capture it.
            </div>
          ) : (
            <table className="data">
              <tbody>
                {ordered.map((txn) => (
                  <tr key={txn.id} className="selectable" onClick={() => onPick(txn)}>
                    <td className="num" style={{ width: 90 }}>
                      {fmtDateShort(txn.date)}
                    </td>
                    <td className="wide">{txn.desc}</td>
                    <td className="muted" style={{ width: 170 }}>
                      {accountName(accounts, isMoneyIn(txn) ? txn.credit : txn.debit)}
                    </td>
                    <td className="right">
                      <Money value={isMoneyIn(txn) ? txn.amount : -txn.amount} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
        <div className="modal-foot">
          <button className="btn ghost" onClick={onClose}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
