// WLM Accounting design system.
//
// Palette and radii come from WLM ASIC Manager, so the two apps read as one
// product: layered blue-tinted charcoal, Bitcoin orange accent, semantic money
// colours with soft tinted fills. The spacing, type, elevation and chart scales
// below exist so screens never hand-pick a pixel value.
//
// Chart marks were re-checked against the new panel surface (#121822) when this
// palette was adopted: orange 7.8:1, green 9.3:1, red 6.4:1, amber 10.7:1 — all
// clear the 3:1 floor for data marks. Text clears 4.5:1 down to `mute` at 6.0:1.

export const C = {
  orange: "#F7931A", // Bitcoin orange — primary accent
  orangeSoft: "rgba(247,147,26,0.14)", // tinted fills behind orange elements
  orangeFaint: "rgba(247,147,26,0.55)",
  orangeLine: "rgba(247,147,26,0.45)", // accent borders

  bg: "#0A0D12", // app background
  panel: "#121822", // cards
  panel2: "#1A2230", // inputs / nested surfaces
  panel3: "#202A3A", // highest elevation (hero, active chips)
  line: "#2A3442", // hairline borders, gridlines (recessive by design)
  lineSoft: "rgba(42,52,66,0.55)",
  lineStrong: "#3A4658", // dividers that need to read

  text: "#E7ECF3",
  textDim: "#B6C0CE",
  mute: "#8C97A8",
  ink: "#1A1206", // text on orange

  green: "#34D399", // money in / profit
  greenSoft: "rgba(52,211,153,0.14)",
  greenDim: "rgba(52,211,153,0.35)",
  red: "#F87171", // money out / loss
  redSoft: "rgba(248,113,113,0.14)",
  redDim: "rgba(248,113,113,0.35)",
  amber: "#FBBF24", // warning / pending status
  amberSoft: "rgba(251,191,36,0.14)",
  amberDim: "rgba(251,191,36,0.35)",
};

/** Status colours carry reserved meaning and always ship with an icon + label. */
export const STATUS = {
  good: C.green,
  warning: C.amber,
  critical: C.red,
  neutral: C.mute,
};

/** 4pt spacing scale. Use these instead of raw numbers. */
export const S = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  xxxl: 32,
  huge: 40,
};

export const R = { sm: 10, md: 14, lg: 18, xl: 22, pill: 999 };

export const FONT = {
  display: "Rajdhani_500Medium",
  displayBold: "Rajdhani_700Bold",
  mono: "ShareTechMono_400Regular",
};

// Also exported under the names ASIC Manager uses, so shared components can be
// moved between the two codebases without rewriting imports.
export const FONT_DISPLAY = FONT.display;
export const FONT_DISPLAY_BOLD = FONT.displayBold;
export const FONT_MONO = FONT.mono;

/** Type scale. `hero` is the single number a screen leads with. */
export const T = {
  hero: { fontFamily: FONT.mono, fontSize: 40, letterSpacing: -0.5 },
  title: { fontFamily: FONT.displayBold, fontSize: 20, letterSpacing: 1.2 },
  heading: { fontFamily: FONT.displayBold, fontSize: 17, letterSpacing: 0.3 },
  body: { fontFamily: FONT.display, fontSize: 15 },
  bodyBold: { fontFamily: FONT.displayBold, fontSize: 15 },
  small: { fontFamily: FONT.display, fontSize: 13 },
  label: { fontFamily: FONT.displayBold, fontSize: 11, letterSpacing: 1.4 },
  amount: { fontFamily: FONT.mono, fontSize: 16 },
  amountLg: { fontFamily: FONT.mono, fontSize: 22 },
  amountSm: { fontFamily: FONT.mono, fontSize: 13 },
  caption: { fontFamily: FONT.mono, fontSize: 11, letterSpacing: 0.5 },
} as const;

/** Soft elevation for floating elements (FAB, hero). */
export const SHADOW = {
  shadowColor: "#000",
  shadowOpacity: 0.35,
  shadowRadius: 12,
  shadowOffset: { width: 0, height: 6 },
  elevation: 8,
} as const;

export const ELEV = {
  card: {
    shadowColor: "#000",
    shadowOpacity: 0.3,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
  sheet: {
    shadowColor: "#000",
    shadowOpacity: 0.55,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: -6 },
    elevation: 16,
  },
};

/** Chart mark specs, per the data-visualisation standard. */
export const CHART = {
  barMaxThickness: 24,
  barRadius: 4,
  lineWidth: 2,
  markerRadius: 4,
  surfaceGap: 2,
  gridColor: C.line,
  areaOpacity: 0.12,
};
