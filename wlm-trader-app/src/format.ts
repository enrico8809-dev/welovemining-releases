// Number and time formatting shared by every screen.

export function money(value: number | null | undefined, digits = 2): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "–";
  return value.toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

export function signed(value: number | null | undefined, digits = 2): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "–";
  return `${value >= 0 ? "+" : "−"}${money(Math.abs(value), digits)}`;
}

export function pct(value: number | null | undefined, digits = 2): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "–";
  return `${signed(value, digits)}%`;
}

/** Prices: enough decimals for Forex (1.08534) without padding big numbers (84,195.10). */
export function price(value: number | null | undefined): string {
  if (value === null || value === undefined) return "–";
  const abs = Math.abs(value);
  const digits = abs >= 1000 ? 2 : abs >= 10 ? 3 : abs >= 1 ? 5 : 6;
  return value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: digits });
}

export function qty(value: number): string {
  return Math.abs(value).toLocaleString("en-US", { maximumFractionDigits: 8 });
}

export function ago(iso: string | null | undefined): string {
  if (!iso) return "never";
  const seconds = (Date.now() - new Date(iso).getTime()) / 1000;
  if (seconds < 60) return "just now";
  if (seconds < 3600) return `${Math.floor(seconds / 60)} min ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)} h ago`;
  return `${Math.floor(seconds / 86400)} d ago`;
}

export function dateTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString("en-ZA", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
}

export const MARKET_LABEL: Record<string, string> = { crypto: "Crypto", stocks: "Stocks", forex: "Forex" };

export function modeLabel(mode: string): string {
  return { paper: "Paper", demo: "Demo", live: "Live" }[mode] ?? mode;
}

export function upDown(value: number | null | undefined): string {
  if (value === null || value === undefined || value === 0) return "";
  return value > 0 ? "up" : "down";
}

/** Plain-English names for exit reasons in the trade history. */
export function reasonLabel(reason: string): string {
  return (
    {
      signal: "Strategy signal",
      stop_loss: "Stop-loss",
      end_of_day: "End of day",
      closed: "Closed at broker",
      "kill switch": "Kill switch",
    }[reason] ?? reason
  );
}
