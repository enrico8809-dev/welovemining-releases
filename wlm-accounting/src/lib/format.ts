/** South African Rand: "R 1,234.56" / "R -1,234.56" */
export function fmt(n: number): string {
  const sign = n < 0 ? "-" : "";
  return `R ${sign}${abs(n)}`;
}

/**
 * Bare amount with no currency symbol — for table columns.
 *
 * Grouped by hand rather than through toLocaleString("en-ZA"). The locale's own
 * convention is "1 200,50" — a narrow no-break space for thousands and a decimal
 * comma — which is not the format this app was specified in, and worse, it does
 * not survive a round trip: parseAmount strips the space and the comma, so
 * "1 200,50" reads back as 120050. Every amount field normalises on blur, so an
 * entered price was multiplied by a hundred each time focus left it. Formatting
 * here is fixed and does not depend on what ICU data a phone happens to ship.
 */
export function abs(n: number): string {
  const [whole, cents] = Math.abs(n).toFixed(2).split(".");
  return `${group(whole)}.${cents}`;
}

/** 1234567 -> "1,234,567" */
function group(digits: string): string {
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

/** Whole number with thousands separators, no decimals — e.g. USD price tags. */
export function fmtWhole(n: number): string {
  return group(String(Math.round(Math.abs(n))));
}

/**
 * A quantity of a coin: "5,399.57" or "0.01234567".
 *
 * Grouped by hand for the same reason amounts are — see abs() — and padded out
 * to the asset's own precision, because 0.1 BTC and 0.10000000 BTC are the same
 * number but only the second one reads as a balance.
 */
export function fmtUnits(n: number, decimals = 2): string {
  const places = Math.max(0, Math.min(18, Math.round(decimals)));
  const [whole, frac] = Math.abs(n).toFixed(places).split(".");
  return frac ? `${group(whole)}.${frac}` : group(whole);
}

/**
 * A bare amount for a report column, negatives in brackets: "(500.00)".
 *
 * abs() drops the sign, which is right for a column where every figure is
 * positive by construction — and wrong the moment one isn't. A loss on crypto
 * is a negative income line, and printed through abs() it reads as income of
 * that size while the total it belongs to has gone *down* by it. A line that
 * disagrees with its own total is how a set of books stops being believed.
 *
 * Brackets rather than a minus sign because that is what the accountant reading
 * it expects, and because the account is called Crypto Gains / (Losses).
 */
export function fmtBracketed(n: number): string {
  return n < 0 ? `(${abs(n)})` : abs(n);
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
 *
 * A comma with one or two digits behind it and nothing else is a decimal comma —
 * the South African convention, what a phone keypad set to en-ZA offers, and how
 * this app itself used to format amounts. Reading it as a thousands separator
 * turns R 1,50 into R 150.
 */
export function parseAmount(input: string): number {
  const stripped = input.replace(/[R\s  ]/g, "");
  const cleaned = /^-?\d+,\d{1,2}$/.test(stripped)
    ? stripped.replace(",", ".")
    : stripped.replace(/,/g, "");
  if (!cleaned || !/^-?\d*\.?\d*$/.test(cleaned)) return NaN;
  return Number(cleaned);
}
