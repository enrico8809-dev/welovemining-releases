import { useState } from "react";
import { CheckCircle2, CircleDashed, Lock } from "lucide-react";
import { useApp } from "../App";
import { useToast } from "./ui";

/** Enter keys/passwords. They're sent once to the bot on THIS PC and never shown again. */
export function SecretFields({ fields, status, local, onSaved }: {
  fields: { key: string; label: string; help?: string; password?: boolean }[];
  status: Record<string, boolean>;
  local: boolean;
  onSaved: () => void;
}) {
  const { api } = useApp();
  const toast = useToast();
  const [values, setValues] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const changed = Object.fromEntries(Object.entries(values).filter(([, v]) => v.trim()));

  const save = async () => {
    setSaving(true);
    try {
      await api.saveSecrets(changed);
      setValues({});
      toast("Saved on your PC. Restart the bot (Stop, then Start) to use them.", "success");
      onSaved();
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e), "error");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="stack" style={{ gap: 12 }}>
      {fields.map((f) => (
        <label key={f.key} className="field">
          <span className="row between">
            <span className="label">{f.label}</span>
            {status[f.key]
              ? <span className="up small row" style={{ gap: 4 }}><CheckCircle2 size={14} />set</span>
              : <span className="mute small row" style={{ gap: 4 }}><CircleDashed size={14} />not set</span>}
          </span>
          {local ? (
            <input className="input" type={f.password ? "password" : "text"} autoComplete="off" spellCheck={false}
              placeholder={status[f.key] ? "•••••• (type to replace)" : ""} value={values[f.key] ?? ""}
              onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.value }))} />
          ) : null}
          {f.help && <span className="field-help">{f.help}</span>}
        </label>
      ))}
      {local ? (
        <div><button className="btn primary" disabled={saving || !Object.keys(changed).length} onClick={save}>
          <Lock size={16} />{saving ? "Saving…" : "Save keys"}</button></div>
      ) : (
        <div className="field-help row" style={{ gap: 6 }}><Lock size={14} />For your safety, keys and passwords can only be entered in the Windows app on the PC.</div>
      )}
    </div>
  );
}
