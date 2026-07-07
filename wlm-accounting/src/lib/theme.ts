// WLM design tokens — shared visual language with WLM ASIC Manager.
// Layered blue-tinted charcoal + Bitcoin orange, semantic money colors.
export const C = {
  orange: "#F7931A", // Bitcoin orange — primary accent
  orangeSoft: "rgba(247,147,26,0.14)", // tinted fills behind orange elements
  orangeFaint: "rgba(247,147,26,0.55)",

  bg: "#0A0D12", // app background
  panel: "#121822", // cards
  panel2: "#1A2230", // inputs / nested surfaces
  panel3: "#202A3A", // highest elevation (hero, active chips)
  line: "#2A3442", // hairline borders
  lineSoft: "rgba(42,52,66,0.55)",

  text: "#E7ECF3",
  mute: "#8C97A8",

  green: "#34D399", // money in / profit
  greenSoft: "rgba(52,211,153,0.14)",
  red: "#F87171", // money out / loss
  redSoft: "rgba(248,113,113,0.14)",
  ink: "#1A1206", // text on orange
};

export const FONT_DISPLAY = "Rajdhani_500Medium";
export const FONT_DISPLAY_BOLD = "Rajdhani_700Bold";
export const FONT_MONO = "ShareTechMono_400Regular";

export const R = { sm: 10, md: 14, lg: 18, xl: 22, pill: 999 };

/** Soft elevation for floating elements (FAB, hero). */
export const SHADOW = {
  shadowColor: "#000",
  shadowOpacity: 0.35,
  shadowRadius: 12,
  shadowOffset: { width: 0, height: 6 },
  elevation: 8,
} as const;
