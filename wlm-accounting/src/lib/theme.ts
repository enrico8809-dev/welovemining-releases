// WLM Accounting design system.
//
// Brand colours come from the WeLoveMining identity; the scales below exist so
// screens never hand-pick a pixel value. Chart tokens were contrast-checked
// against the panel surface (#141414): orange 8.0:1, green 7.3:1, red 5.3:1 —
// all clear the 3:1 floor for data marks.

export const C = {
  orange: "#F7931A", // Bitcoin orange — primary accent
  orangeDim: "#8A5310", // accent at rest / track fills
  bg: "#0A0A0A", // app background (near-black)
  panel: "#141414", // cards
  panel2: "#1C1C1C", // inputs / secondary
  panel3: "#242424", // raised / pressed
  line: "#2A2A2A", // borders, gridlines (recessive by design)
  lineStrong: "#3A3A3A", // dividers that need to read
  text: "#E8E8E8",
  textDim: "#B4B4B4",
  mute: "#8A8A8A",
  green: "#3FB950", // money in / profit
  greenDim: "#1E5C28",
  red: "#F0506E", // money out / loss
  redDim: "#6E2434",
  amber: "#D9A441", // warning / pending status
  amberDim: "#5C4519",
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

export const R = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  pill: 999,
};

export const FONT = {
  display: "Rajdhani_500Medium",
  displayBold: "Rajdhani_700Bold",
  mono: "ShareTechMono_400Regular",
};

/** Type scale. `hero` is the single number a screen leads with. */
export const T = {
  hero: { fontFamily: FONT.mono, fontSize: 40, letterSpacing: -0.5 },
  title: { fontFamily: FONT.displayBold, fontSize: 22, letterSpacing: 0.3 },
  heading: { fontFamily: FONT.displayBold, fontSize: 17, letterSpacing: 0.3 },
  body: { fontFamily: FONT.display, fontSize: 15 },
  bodyBold: { fontFamily: FONT.displayBold, fontSize: 15 },
  small: { fontFamily: FONT.display, fontSize: 13 },
  label: { fontFamily: FONT.displayBold, fontSize: 11, letterSpacing: 1.4 },
  amount: { fontFamily: FONT.mono, fontSize: 16 },
  amountLg: { fontFamily: FONT.mono, fontSize: 22 },
  amountSm: { fontFamily: FONT.mono, fontSize: 13 },
  caption: { fontFamily: FONT.mono, fontSize: 11 },
} as const;

/** Card elevation — subtle on near-black, so it reads without glowing. */
export const ELEV = {
  card: {
    shadowColor: "#000",
    shadowOpacity: 0.4,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
  sheet: {
    shadowColor: "#000",
    shadowOpacity: 0.6,
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
  areaOpacity: 0.1,
};
