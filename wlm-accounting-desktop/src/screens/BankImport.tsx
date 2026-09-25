import { useCallback, useMemo, useState } from "react";
import { AlertTriangle, FileUp } from "lucide-react";
import { useLedger } from "@engine/LedgerContext";
import { Txn, accountName } from "@engine/accounting";
import {
  ImportCandidate,
  buildCandidates,
  candidateToTxn,
  dateRange,
  parseStatement,
  recipesForLine,
  summariseCandidates,
} from "@engine/bankImport";
import { fmt, fmtDateShort } from "@engine/format";
import Screen from "../components/Screen";
import { Card, EmptyState, Money, Pill, Tile } from "../components/ui";
import { api } from "../api";
import { useToast } from "../components/Toast";

type Choice = { recipeId: string; accountId?: string };

export default function BankImport() {
  const { accounts, txns, addTxns } = useLedger();
  const toast = useToast();

  const [candidates, setCandidates] = useState<ImportCandidate[] | null>(null);
  const [overrides, setOverrides] = useState<Record<string, Choice>>({});
  const [dragging, setDragging] = useState(false);
  const [source, setSource] = useState("");

  const summary = useMemo(
    () => (candidates ? summariseCandidates(candidates) : null),
    [candidates]
  );
  const span = useMemo(
    () => (candidates ? dateRange(candidates.map((c) => c.line)) : null),
    [candidates]
  );

  const choiceFor = useCallback(
    (c: ImportCandidate): Choice => overrides[c.line.id] ?? c.suggestion,
    [overrides]
  );

  const load = useCallback(
    (name: string, text: string) => {
      const parsed = parseStatement(text, name);
      if (!parsed.ok) {
        toast.show(parsed.reason, "error");
        return;
      }
      setCandidates(buildCandidates(parsed.lines, txns));
      setOverrides({});
      setSource(`${name} · ${parsed.format.toUpperCase()}`);
    },
    [txns, toast]
  );

  const choose = async () => {
    const picked = await api.openTextFile("Bank statement", ["csv", "ofx", "txt"]);
    if (picked) load(picked.name, picked.text);
  };

  const onDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) load(file.name, await file.text());
  };

  const setSelected = (id: string, selected: boolean) =>
    setCandidates(
      (prev) => prev?.map((c) => (c.line.id === id ? { ...c, selected } : c)) ?? null
    );

  // Duplicates stay off even here: "select all" is a convenience, not a
  // decision to post a line the books already have.
  const selectAll = (selected: boolean) =>
    setCandidates(
      (prev) => prev?.map((c) => ({ ...c, selected: selected && !c.duplicateOf })) ?? null
    );

  const post = async () => {
    if (!candidates || !summary?.selected) return;

    const batch = candidates
      .filter((c) => c.selected)
      .map((c) => {
        const choice = choiceFor(c);
        return candidateToTxn(c, choice.recipeId, choice.accountId);
      })
      .filter((t): t is Txn => t !== null);

    await addTxns(batch);
    setCandidates(null);
    setOverrides({});
    toast.show(`Posted ${batch.length} transaction${batch.length === 1 ? "" : "s"}`);
  };

  if (!candidates) {
    return (
      <Screen title="Import statement" subtitle="FNB CSV or OFX">
        <div
          className={`dropzone ${dragging ? "over" : ""}`}
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
        >
          <EmptyState
            icon={<FileUp size={28} className="muted" />}
            title="Drop a statement here"
            body="Or choose the file. Every line is shown with the entry it would post, and nothing reaches the books until you say so. Lines the books already have are flagged and left unticked."
            action={
              <button className="btn primary" onClick={choose}>
                Choose a file
              </button>
            }
          />
        </div>
      </Screen>
    );
  }

  return (
    <Screen
      title="Import statement"
      subtitle={`${source}${span ? ` · ${fmtDateShort(span.from)} – ${fmtDateShort(span.to)}` : ""}`}
      actions={
        <>
          <button className="btn ghost" onClick={() => setCandidates(null)}>
            Discard
          </button>
          <button className="btn primary" onClick={post} disabled={!summary?.selected}>
            Post {summary?.selected ?? 0} selected
          </button>
        </>
      }
    >
      <div className="stack">
        <div className="grid cols-4">
          <Tile label="LINES" value={String(summary?.total ?? 0)} foot={`${summary?.selected ?? 0} selected`} />
          <Tile label="MONEY IN" value={fmt(summary?.moneyIn ?? 0)} tone="pos" />
          <Tile label="MONEY OUT" value={fmt(summary?.moneyOut ?? 0)} tone="neg" />
          <Tile
            label="ALREADY IN THE BOOKS"
            value={String(summary?.duplicates ?? 0)}
            tone={summary?.duplicates ? "warn" : undefined}
            foot="Left unticked"
          />
        </div>

        <div className="row">
          <button className="btn small" onClick={() => selectAll(true)}>
            Select all
          </button>
          <button className="btn small ghost" onClick={() => selectAll(false)}>
            Select none
          </button>
          <span className="spacer" />
          <span className="hint">
            Change the category on any line before posting — the entry shown is what will be
            booked.
          </span>
        </div>

        <Card flush>
          <div className="table-wrap" style={{ maxHeight: "calc(100vh - 420px)" }}>
            <table className="data">
              <thead>
                <tr>
                  <th style={{ width: 40 }} />
                  <th style={{ width: 100 }}>Date</th>
                  <th>Description</th>
                  <th className="right" style={{ width: 130 }}>
                    Amount
                  </th>
                  <th style={{ width: 210 }}>Treat as</th>
                  <th style={{ width: 200 }}>Account</th>
                  <th style={{ width: 190 }}>Why</th>
                </tr>
              </thead>
              <tbody>
                {candidates.map((c) => {
                  const choice = choiceFor(c);
                  const recipes = recipesForLine(c.line);
                  const recipe = recipes.find((r) => r.id === choice.recipeId) ?? recipes[0];
                  const pickable = recipe?.pick
                    ? accounts.filter((a) =>
                        recipe.pickTypes?.length ? recipe.pickTypes.includes(a.type) : true
                      )
                    : [];

                  return (
                    <tr key={c.line.id} className={c.duplicateOf ? "dim" : undefined}>
                      <td>
                        <input
                          type="checkbox"
                          checked={c.selected}
                          onChange={(e) => setSelected(c.line.id, e.target.checked)}
                        />
                      </td>
                      <td className="num">{fmtDateShort(c.line.date)}</td>
                      <td className="wide" title={c.line.description}>
                        {c.line.description}
                        {c.duplicateOf && (
                          <>
                            {" "}
                            <Pill tone="warning">
                              <AlertTriangle size={10} /> already captured
                            </Pill>
                          </>
                        )}
                      </td>
                      <td className="right">
                        <Money value={c.line.amount} />
                      </td>
                      <td>
                        <select
                          className="input"
                          value={choice.recipeId}
                          onChange={(e) =>
                            setOverrides((o) => ({
                              ...o,
                              [c.line.id]: { recipeId: e.target.value, accountId: undefined },
                            }))
                          }
                        >
                          {recipes.map((r) => (
                            <option key={r.id} value={r.id}>
                              {r.label}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td>
                        {recipe?.pick ? (
                          <select
                            className="input"
                            value={choice.accountId ?? pickable[0]?.id ?? ""}
                            onChange={(e) =>
                              setOverrides((o) => ({
                                ...o,
                                [c.line.id]: {
                                  recipeId: choice.recipeId,
                                  accountId: e.target.value,
                                },
                              }))
                            }
                          >
                            {pickable.map((a) => (
                              <option key={a.id} value={a.id}>
                                {a.name}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <span className="muted">
                            {accountName(
                              accounts,
                              c.line.amount > 0 ? recipe?.credit ?? "" : recipe?.debit ?? ""
                            )}
                          </span>
                        )}
                      </td>
                      <td className="muted" title={c.suggestion.reason}>
                        {c.suggestion.reason}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>

        <div className="hint">
          Imported entries carry an id derived from the statement line itself, so importing the
          same statement twice cannot produce two copies of the same transaction.
        </div>
      </div>
    </Screen>
  );
}
