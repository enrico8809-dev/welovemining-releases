import { createContext, ReactNode, useCallback, useContext, useEffect, useRef, useState } from "react";

// ---------------------------------------------------------------- layout
export function Page({ title, sub, actions, children }: { title: string; sub?: ReactNode; actions?: ReactNode; children: ReactNode }) {
  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1 className="page-title">{title}</h1>
          {sub && <div className="page-sub">{sub}</div>}
        </div>
        {actions && <div className="row wrap">{actions}</div>}
      </div>
      {children}
    </div>
  );
}

export function Card({ title, actions, className = "", children }: { title?: ReactNode; actions?: ReactNode; className?: string; children: ReactNode }) {
  return (
    <section className={`card ${className}`}>
      {(title || actions) && (
        <div className="card-head">
          {title && <h2 className="card-title">{title}</h2>}
          {actions}
        </div>
      )}
      {children}
    </section>
  );
}

export function Pill({ tone = "", children }: { tone?: "" | "orange" | "green" | "red" | "amber" | "blue"; children: ReactNode }) {
  return <span className={`pill ${tone}`}>{children}</span>;
}

export function ModePill({ mode }: { mode: string }) {
  const tone = mode === "live" ? "red" : mode === "demo" ? "blue" : "orange";
  return <Pill tone={tone}>{{ live: "Live money", demo: "Demo", paper: "Paper" }[mode] ?? mode}</Pill>;
}

export function Banner({ tone, icon, children }: { tone: "warn" | "error" | "info"; icon?: ReactNode; children: ReactNode }) {
  return (
    <div className={`banner ${tone}`}>
      {icon}
      <div className="banner-text">{children}</div>
    </div>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="empty">{children}</div>;
}

// ---------------------------------------------------------------- inputs
export function Toggle({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label: string }) {
  return <button type="button" role="switch" aria-checked={on} aria-label={label} className={`toggle ${on ? "on" : ""}`} onClick={() => onChange(!on)} />;
}

export function Segmented<T extends string>({ value, options, onChange }: { value: T; options: { value: T; label: string }[]; onChange: (v: T) => void }) {
  return (
    <div className="segmented" role="radiogroup">
      {options.map((o) => (
        <button key={o.value} type="button" role="radio" aria-checked={o.value === value} className={o.value === value ? "on" : ""} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Field({ label, help, children }: { label: string; help?: ReactNode; children: ReactNode }) {
  return (
    <label className="field">
      <span className="label">{label}</span>
      {children}
      {help && <span className="field-help">{help}</span>}
    </label>
  );
}

/** A slider with the exact value next to it, for risk settings. */
export function RangeField({ label, help, value, min, max, step, unit = "", onChange }: {
  label: string; help?: ReactNode; value: number; min: number; max: number; step: number; unit?: string; onChange: (v: number) => void;
}) {
  return (
    <div className="field">
      <div className="row between">
        <span className="label">{label}</span>
        <span className="num" style={{ fontSize: 17, color: "var(--orange)" }}>{value}{unit}</span>
      </div>
      <input className="slider" type="range" min={min} max={max} step={step} value={value} aria-label={label}
        onChange={(e) => onChange(Number(e.target.value))} />
      {help && <span className="field-help">{help}</span>}
    </div>
  );
}

// ---------------------------------------------------------------- hold-to-confirm
/** For dangerous actions (kill switch): hold the button for 1.5 s. No accidental taps. */
export function HoldButton({ onConfirm, children, disabled }: { onConfirm: () => void; children: ReactNode; disabled?: boolean }) {
  const [progress, setProgress] = useState(0);
  const timer = useRef<number | null>(null);
  const started = useRef(0);

  const stop = () => {
    if (timer.current) cancelAnimationFrame(timer.current);
    timer.current = null;
    setProgress(0);
  };
  const tick = () => {
    const p = Math.min(1, (Date.now() - started.current) / 1500);
    setProgress(p);
    if (p >= 1) {
      stop();
      onConfirm();
    } else {
      timer.current = requestAnimationFrame(tick);
    }
  };
  const start = () => {
    if (disabled) return;
    started.current = Date.now();
    timer.current = requestAnimationFrame(tick);
  };
  useEffect(() => stop, []);

  return (
    <button type="button" className="btn danger hold" disabled={disabled}
      onPointerDown={start} onPointerUp={stop} onPointerLeave={stop} onPointerCancel={stop}
      onContextMenu={(e) => e.preventDefault()}>
      <span className="hold-fill" style={{ transform: `scaleX(${progress})` }} />
      <span style={{ position: "relative", display: "inline-flex", alignItems: "center", gap: 8 }}>{children}</span>
    </button>
  );
}

// ---------------------------------------------------------------- modal
export function Modal({ open, onClose, children }: { open: boolean; onClose: () => void; children: ReactNode }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="backdrop" onClick={onClose}>
      <div className="modal" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        {children}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- toasts
type ToastTone = "" | "error" | "success";
interface ToastItem { id: number; text: string; tone: ToastTone }
const ToastContext = createContext<(text: string, tone?: ToastTone) => void>(() => {});

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const show = useCallback((text: string, tone: ToastTone = "") => {
    const id = Date.now() + Math.random();
    setItems((list) => [...list, { id, text, tone }]);
    setTimeout(() => setItems((list) => list.filter((t) => t.id !== id)), 4500);
  }, []);
  return (
    <ToastContext.Provider value={show}>
      {children}
      <div className="toasts" aria-live="polite">
        {items.map((t) => <div key={t.id} className={`toast ${t.tone}`}>{t.text}</div>)}
      </div>
    </ToastContext.Provider>
  );
}

export const useToast = () => useContext(ToastContext);
