// South African Rand formatting — "R 149.00"
export function fmt(n: number): string {
  const sign = n < 0 ? "-" : "";
  const abs = Math.abs(n).toLocaleString("en-ZA", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return `R ${sign}${abs}`;
}

export function distanceLabel(km: number): string {
  return km < 1 ? `${Math.round(km * 1000)} m` : `${km.toFixed(1)} km`;
}

export function etaLabel(minMinutes: number, maxMinutes: number): string {
  return `${minMinutes}–${maxMinutes} min`;
}
