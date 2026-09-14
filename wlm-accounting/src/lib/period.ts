import { MONTHS, parseISO, toISO } from "./format";

export type PeriodId = "mtd" | "last_month" | "ytd" | "all" | "custom";

export interface Period {
  id: PeriodId;
  label: string;
  /** Inclusive ISO start, or null for "no lower bound". */
  from: string | null;
  /** Inclusive ISO end, or null for "no upper bound". */
  to: string | null;
}

/**
 * The financial year start month (1-12). South African small businesses
 * commonly run March-February; the user can change this in Settings.
 */
export const DEFAULT_FY_START_MONTH = 3;

export function buildPeriod(id: PeriodId, fyStartMonth: number, now = new Date()): Period {
  const y = now.getFullYear();
  const m = now.getMonth();

  switch (id) {
    case "mtd":
      return {
        id,
        label: "This month",
        from: toISO(new Date(y, m, 1)),
        to: toISO(new Date(y, m + 1, 0)),
      };
    case "last_month":
      return {
        id,
        label: "Last month",
        from: toISO(new Date(y, m - 1, 1)),
        to: toISO(new Date(y, m, 0)),
      };
    case "ytd": {
      const start = financialYearStart(now, fyStartMonth);
      return { id, label: "This financial year", from: toISO(start), to: toISO(now) };
    }
    case "all":
      return { id, label: "All time", from: null, to: null };
    case "custom":
      return { id, label: "Custom", from: null, to: null };
  }
}

export function financialYearStart(now: Date, fyStartMonth: number): Date {
  const startIdx = fyStartMonth - 1;
  const year = now.getMonth() >= startIdx ? now.getFullYear() : now.getFullYear() - 1;
  return new Date(year, startIdx, 1);
}

export function describePeriod(p: Period): string {
  if (!p.from && !p.to) return "All time";
  const from = p.from ? shortLabel(p.from) : "start";
  const to = p.to ? shortLabel(p.to) : "today";
  return `${from} — ${to}`;
}

function shortLabel(iso: string): string {
  const d = parseISO(iso);
  if (!d) return iso;
  return `${String(d.getDate()).padStart(2, "0")} ${MONTHS[d.getMonth()]} ${String(
    d.getFullYear()
  ).slice(2)}`;
}

/** Inclusive on both ends; a null bound means unbounded on that side. */
export function inPeriod(dateISO: string, p: Period): boolean {
  if (p.from && dateISO < p.from) return false;
  if (p.to && dateISO > p.to) return false;
  return true;
}

export const PERIOD_OPTIONS: { id: PeriodId; label: string }[] = [
  { id: "mtd", label: "Month" },
  { id: "last_month", label: "Last mo." },
  { id: "ytd", label: "FY" },
  { id: "all", label: "All" },
];
