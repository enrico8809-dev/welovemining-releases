// WLM Trader palette: the same tokens as WLM ASIC Manager and WLM Accounting
// (wlm-accounting/src/lib/theme.ts), so the three apps read as one product:
// layered blue-tinted charcoal, Bitcoin orange accent, soft tinted money colours.
// They are handed to CSS as custom properties at boot; the stylesheet never names a colour.

export const C = {
  orange: "#F7931A",
  orangeSoft: "rgba(247,147,26,0.14)",
  orangeFaint: "rgba(247,147,26,0.55)",
  orangeLine: "rgba(247,147,26,0.45)",

  bg: "#0A0D12",
  panel: "#121822",
  panel2: "#1A2230",
  panel3: "#202A3A",
  line: "#2A3442",
  lineSoft: "rgba(42,52,66,0.55)",
  lineStrong: "#3A4658",

  text: "#E7ECF3",
  textDim: "#B6C0CE",
  mute: "#8C97A8",
  ink: "#1A1206",

  green: "#34D399",
  greenSoft: "rgba(52,211,153,0.14)",
  greenDim: "rgba(52,211,153,0.35)",
  red: "#F87171",
  redSoft: "rgba(248,113,113,0.14)",
  redDim: "rgba(248,113,113,0.35)",
  amber: "#FBBF24",
  amberSoft: "rgba(251,191,36,0.14)",
  amberDim: "rgba(251,191,36,0.35)",
  blue: "#38BDF8",
  blueSoft: "rgba(56,189,248,0.14)",
};

export function applyPalette(): void {
  const style = document.documentElement.style;
  for (const [token, value] of Object.entries(C)) {
    style.setProperty(`--${token.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)}`, value);
  }
}

/** Series colours for the per-market equity lines, in fixed order (crypto, stocks, Forex).
 *  Validated on the panel surface #121822 with the dataviz palette checker (dark band, CVD
 *  all-pairs). Green/red are NOT used here: they mean profit/loss everywhere in the app. */
export const MARKET_COLOR: Record<string, string> = {
  crypto: "#D9780B",
  stocks: "#2E8BD0",
  forex: "#C455A8",
};
