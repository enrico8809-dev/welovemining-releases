import { Save, Undo2 } from "lucide-react";

/** Appears when a settings screen has unsaved changes. */
export function SaveBar({ dirty, saving, onSave, onDiscard }: { dirty: boolean; saving: boolean; onSave: () => void; onDiscard: () => void }) {
  if (!dirty) return null;
  return (
    <div className="card" style={{ position: "sticky", bottom: 12, zIndex: 5, borderColor: "var(--orange-line)", display: "flex",
      alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap", padding: 12 }}>
      <span className="dim">You have unsaved changes.</span>
      <div className="row">
        <button className="btn ghost" onClick={onDiscard}><Undo2 size={17} />Undo</button>
        <button className="btn primary" disabled={saving} onClick={onSave}><Save size={17} />{saving ? "Saving…" : "Save"}</button>
      </div>
    </div>
  );
}

/** Edit a list of symbols as chips. */
export function SymbolEditor({ value, onChange, placeholder }: { value: string[]; onChange: (v: string[]) => void; placeholder: string }) {
  const add = (input: HTMLInputElement) => {
    const sym = input.value.trim().toUpperCase();
    if (sym && /^[A-Z0-9/=.^_-]{1,20}$/.test(sym) && !value.includes(sym)) onChange([...value, sym]);
    input.value = "";
  };
  return (
    <div className="stack">
      <div className="row wrap" style={{ gap: 6 }}>
        {value.map((s) => (
          <span key={s} className="chip">{s}
            <button type="button" aria-label={`Remove ${s}`} onClick={() => onChange(value.filter((x) => x !== s))}>×</button>
          </span>
        ))}
      </div>
      <input className="input" placeholder={placeholder}
        onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); add(e.currentTarget); } }}
        onBlur={(e) => add(e.currentTarget)} />
    </div>
  );
}
