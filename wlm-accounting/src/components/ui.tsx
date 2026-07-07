// Shared premium UI primitives — section labels, money text, chips, buttons.
import React from "react";
import { Pressable, StyleProp, StyleSheet, Text, TextStyle, View, ViewStyle } from "react-native";
import { C, FONT_DISPLAY, FONT_DISPLAY_BOLD, FONT_MONO, R } from "../lib/theme";
import { fmt } from "../lib/format";

export function SectionLabel({ children, style }: { children: React.ReactNode; style?: StyleProp<TextStyle> }) {
  return <Text style={[s.sectionLabel, style]}>{children}</Text>;
}

/** Money readout in tabular mono; sign-colored unless a color is forced. */
export function Amount({
  value,
  size = 24,
  color,
  signed = false,
  style,
}: {
  value: number;
  size?: number;
  color?: string;
  signed?: boolean;
  style?: StyleProp<TextStyle>;
}) {
  const auto = value < 0 ? C.red : C.text;
  const prefix = signed ? (value >= 0 ? "+ " : "− ") : "";
  const shown = signed ? Math.abs(value) : value;
  return (
    <Text style={[{ fontFamily: FONT_MONO, fontSize: size, color: color ?? auto }, style]}>
      {prefix}
      {fmt(shown)}
    </Text>
  );
}

/** Small rounded icon container with a tinted background. */
export function IconBadge({
  children,
  tint,
  size = 36,
}: {
  children: React.ReactNode;
  tint: string;
  size?: number;
}) {
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size * 0.3,
        backgroundColor: tint,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      {children}
    </View>
  );
}

export function Pill({ label, color, bg }: { label: string; color: string; bg: string }) {
  return (
    <View style={[s.pill, { backgroundColor: bg }]}>
      <Text style={[s.pillText, { color }]}>{label}</Text>
    </View>
  );
}

export function PrimaryButton({
  label,
  onPress,
  style,
}: {
  label: string;
  onPress: () => void;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [s.primary, pressed && { opacity: 0.85, transform: [{ scale: 0.99 }] }, style]}
    >
      <Text style={s.primaryText}>{label}</Text>
    </Pressable>
  );
}

export function GhostButton({
  label,
  onPress,
  style,
}: {
  label: string;
  onPress: () => void;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [s.ghost, pressed && { opacity: 0.7 }, style]}>
      <Text style={s.ghostText}>{label}</Text>
    </Pressable>
  );
}

export function EmptyState({ icon, title, hint }: { icon?: React.ReactNode; title: string; hint?: string }) {
  return (
    <View style={s.empty}>
      {icon ? <View style={s.emptyIcon}>{icon}</View> : null}
      <Text style={s.emptyTitle}>{title}</Text>
      {hint ? <Text style={s.emptyHint}>{hint}</Text> : null}
    </View>
  );
}

const s = StyleSheet.create({
  sectionLabel: {
    color: C.mute,
    fontFamily: FONT_DISPLAY_BOLD,
    fontSize: 12,
    letterSpacing: 2,
  },
  pill: {
    borderRadius: R.pill,
    paddingHorizontal: 10,
    paddingVertical: 4,
    alignSelf: "flex-start",
  },
  pillText: { fontFamily: FONT_DISPLAY_BOLD, fontSize: 11, letterSpacing: 1.2 },
  primary: {
    backgroundColor: C.orange,
    borderRadius: R.md,
    paddingVertical: 16,
    alignItems: "center",
  },
  primaryText: { color: C.ink, fontFamily: FONT_DISPLAY_BOLD, fontSize: 17, letterSpacing: 0.5 },
  ghost: {
    borderRadius: R.sm + 2,
    borderWidth: 1,
    borderColor: C.orange,
    paddingVertical: 12,
    alignItems: "center",
  },
  ghostText: { color: C.orange, fontFamily: FONT_DISPLAY_BOLD, fontSize: 14, letterSpacing: 0.5 },
  empty: { paddingTop: 56, alignItems: "center", gap: 10 },
  emptyIcon: {
    width: 56,
    height: 56,
    borderRadius: 18,
    backgroundColor: C.panel2,
    borderWidth: 1,
    borderColor: C.line,
    alignItems: "center",
    justifyContent: "center",
  },
  emptyTitle: { color: C.text, fontFamily: FONT_DISPLAY_BOLD, fontSize: 16 },
  emptyHint: {
    color: C.mute,
    fontFamily: FONT_DISPLAY,
    fontSize: 13,
    textAlign: "center",
    paddingHorizontal: 40,
    lineHeight: 19,
  },
});
