import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { AmountDraft, NO_DRAFT, amountBlurred, amountText, amountTyped } from "@engine/amountField";
import { abs, fmt, parseAmount } from "@engine/format";

/* ------------------------------------------------------------ containers -- */

export function Card({
  title,
  action,
  flush,
  className = "",
  children,
}: {
  title?: string;
  action?: React.ReactNode;
  flush?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={`card ${flush ? "flush" : ""} ${className}`}>
      {(title || action) && (
        <div className="card-head" style={flush ? { padding: "14px 16px 0" } : undefined}>
          {title && <span className="card-title">{title}</span>}
          <span className="spacer" />
          {action}
        </div>
      )}
      {children}
    </div>
  );
}

export function Tile({
  label,
  value,
  foot,
  tone,
}: {
  label: string;
  value: string;
  foot?: string;
  tone?: "pos" | "neg" | "warn";
}) {
  return (
    <div className="tile">
      <div className="label">{label}</div>
      <div className={`value ${tone ?? ""}`}>{value}</div>
      {foot && <div className="foot">{foot}</div>}
    </div>
  );
}

export function Pill({
  tone = "neutral",
  children,
}: {
  tone?: "neutral" | "good" | "warning" | "bad" | "accent";
  children: React.ReactNode;
}) {
  return <span className={`pill ${tone === "neutral" ? "" : tone}`}>{children}</span>;
}

export function Tabs<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { id: T; label: string }[];
  value: T;
  onChange: (id: T) => void;
}) {
  return (
    <div className="tabs">
      {options.map((o) => (
        <button
          key={o.id}
          className={`tab ${o.id === value ? "active" : ""}`}
          onClick={() => onChange(o.id)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function EmptyState({
  icon,
  title,
  body,
  action,
}: {
  icon?: React.ReactNode;
  title: string;
  body?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="empty">
      {icon}
      <h3>{title}</h3>
      {body && <div style={{ maxWidth: 460, margin: "0 auto" }}>{body}</div>}
      {action && <div style={{ marginTop: 14 }}>{action}</div>}
    </div>
  );
}

/* ---------------------------------------------------------------- forms -- */

export function Field({
  label,
  error,
  children,
}: {
  label?: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="field">
      {label && <label>{label}</label>}
      {children}
      {error && <span className="field-error">{error}</span>}
    </div>
  );
}

export function TextInput({
  value,
  onChange,
  placeholder,
  autoFocus,
  invalid,
  type = "text",
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  autoFocus?: boolean;
  invalid?: boolean;
  type?: string;
}) {
  return (
    <input
      className={`input ${invalid ? "invalid" : ""}`}
      type={type}
      value={value}
      placeholder={placeholder}
      autoFocus={autoFocus}
      onChange={(e) => onChange(e.target.value)}
    />
  );
}

export function Select<T extends string>({
  value,
  onChange,
  options,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { id: T; label: string }[];
}) {
  return (
    <select className="input" value={value} onChange={(e) => onChange(e.target.value as T)}>
      {options.map((o) => (
        <option key={o.id} value={o.id}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

/**
 * An amount field, holding what was typed until focus leaves it.
 *
 * The rule comes from the engine, the same one the phone runs: deriving the
 * text back from a number eats the decimal point mid-entry, and then every
 * further digit multiplies the amount by ten.
 */
export function MoneyInput({
  value,
  onChange,
  autoFocus,
  invalid,
}: {
  value: string;
  onChange: (v: string) => void;
  autoFocus?: boolean;
  invalid?: boolean;
}) {
  const [draft, setDraft] = useState<AmountDraft>(NO_DRAFT);
  const text = amountText(draft, value);

  return (
    <div className="money-field" style={invalid ? { borderColor: "var(--red)" } : undefined}>
      <span className="prefix">R</span>
      <input
        value={text}
        autoFocus={autoFocus}
        inputMode="decimal"
        onChange={(e) => {
          const next = amountTyped(e.target.value);
          setDraft(next.draft);
          onChange(next.emit);
        }}
        onFocus={(e) => {
          setDraft(NO_DRAFT);
          e.target.select();
        }}
        onBlur={() => {
          const next = amountBlurred(text);
          setDraft(next.draft);
          if (next.emit !== null) onChange(next.emit);
        }}
      />
    </div>
  );
}

/** The same field for a caller that stores a number rather than the text. */
export function NumberInput({
  value,
  onChange,
  suffix,
}: {
  value: number;
  onChange: (n: number) => void;
  suffix?: string;
}) {
  const [draft, setDraft] = useState<AmountDraft>(NO_DRAFT);
  const text = amountText(draft, value ? String(value) : "");

  return (
    <div className="money-field">
      {suffix && <span className="prefix">{suffix}</span>}
      <input
        value={text}
        inputMode="decimal"
        onChange={(e) => {
          const next = amountTyped(e.target.value);
          setDraft(next.draft);
          const n = parseAmount(next.emit);
          onChange(Number.isFinite(n) ? n : 0);
        }}
        onFocus={(e) => {
          setDraft(NO_DRAFT);
          e.target.select();
        }}
        onBlur={() => setDraft(NO_DRAFT)}
      />
    </div>
  );
}

export function DateInput({
  value,
  onChange,
}: {
  value: string;
  onChange: (iso: string) => void;
}) {
  return (
    <input
      className="input num"
      type="date"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      style={{ textAlign: "left" }}
    />
  );
}

/* ---------------------------------------------------------------- modal -- */

export function Modal({
  title,
  subtitle,
  wide,
  onClose,
  footer,
  children,
}: {
  title: string;
  subtitle?: string;
  wide?: boolean;
  onClose: () => void;
  footer?: React.ReactNode;
  children: React.ReactNode;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`modal ${wide ? "wide" : ""}`}>
        <div className="modal-head">
          <div>
            <h2>{title}</h2>
            {subtitle && <div className="hint">{subtitle}</div>}
          </div>
          <span className="spacer" />
          <button className="btn ghost small" onClick={onClose} aria-label="Close">
            <X size={15} />
          </button>
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-foot">{footer}</div>}
      </div>
    </div>
  );
}

/* --------------------------------------------------------------- money --- */

/** A signed figure, coloured by direction. Always two decimals, always R. */
export function Money({ value, plain }: { value: number; plain?: boolean }) {
  if (plain) return <span className="num">{abs(value)}</span>;
  return <span className={`num ${value >= 0 ? "pos" : "neg"}`}>{fmt(value)}</span>;
}
