// South African Rand formatting — "R 1,234.56" / "R -1,234.56"
export function fmt(n: number): string {
  const sign = n < 0 ? "-" : "";
  const abs = Math.abs(n).toLocaleString("en-ZA", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return `R ${sign}${abs}`;
}
