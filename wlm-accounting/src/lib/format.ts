/** South African Rand: "R 1,234.56" / "R -1,234.56" */
export function fmt(n: number): string {
  const sign = n < 0 ? "-" : "";
  return `R ${sign}${abs(n)}`;
}

/** Bare amount with no currency symbol — for table columns. */
export function abs(n: number): string {
  return Math.abs(n).toLocaleString("en-ZA", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

/** Signed amount with an explicit +/− for ledger rows. */
export function fmtSigned(n: number): string {
  if (n === 0) return `R ${abs(n)}`;
  return `${n > 0 ? "+" : "−"} R ${abs(n)}`;
}

/** Compact form for chart axes and dense tiles: R 1.2k / R 3.4m */
export function fmtCompact(n: number): string {
  const a = Math.abs(n);
  const sign = n < 0 ? "-" : "";
  if (a >= 1_000_000) return `R ${sign}${trim(a / 1_000_000)}m`;
  if (a >= 1_000) return `R ${sign}${trim(a / 1_000)}k`;
  return `R ${sign}${Math.round(a)}`;
}

function trim(n: number): string {
  return n.toFixed(1).replace(/\.0$/, "");
}

/** "2026-03-09" -> "09 Mar 2026" */
export function fmtDate(iso: string): string {
  const d = parseISO(iso);
  if (!d) return iso;
  return `${String(d.getDate()).padStart(2, "0")} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

/** "2026-03-09" -> "09 Mar" (current-year rows don't need the year) */
export function fmtDateShort(iso: string): string {
  const d = parseISO(iso);
  if (!d) return iso;
  return `${String(d.getDate()).padStart(2, "0")} ${MONTHS[d.getMonth()]}`;
}

export const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

export function parseISO(iso: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return Number.isNaN(d.getTime()) ? null : d;
}

export function toISO(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate()
  ).padStart(2, "0")}`;
}

export function todayISO(): string {
  return toISO(new Date());
}

/**
 * Parses what a user typed into an amount field. Tolerates thousands
 * separators and a stray currency symbol; returns NaN for anything else.
 */
export function parseAmount(input: string): number {
  const cleaned = input.replace(/[R\s,]/g, "");
  if (!cleaned || !/^-?\d*\.?\d*$/.test(cleaned)) return NaN;
  return Number(cleaned);
}
