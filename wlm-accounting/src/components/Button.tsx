import React from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleProp,
  StyleSheet,
  Text,
  View,
  ViewStyle,
} from "react-native";
import { C, R, S, T } from "../lib/theme";
import * as haptics from "../lib/haptics";

type Variant = "primary" | "secondary" | "ghost" | "danger";

interface ButtonProps {
  label: string;
  onPress: () => void;
  variant?: Variant;
  icon?: React.ReactNode;
  disabled?: boolean;
  loading?: boolean;
  style?: StyleProp<ViewStyle>;
  size?: "md" | "lg";
}

export default function Button({
  label,
  onPress,
  variant = "primary",
  icon,
  disabled,
  loading,
  style,
  size = "md",
}: ButtonProps) {
  const inactive = disabled || loading;
  const v = VARIANTS[variant];

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: !!inactive }}
      disabled={inactive}
      onPress={() => {
        haptics.press();
        onPress();
      }}
      style={({ pressed }) => [
        styles.base,
        size === "lg" ? styles.lg : styles.md,
        { backgroundColor: v.bg, borderColor: v.border },
        pressed && !inactive && styles.pressed,
        inactive && styles.disabled,
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={v.fg} size="small" />
      ) : (
        <View style={styles.content}>
          {icon}
          <Text style={[styles.label, size === "lg" && styles.labelLg, { color: v.fg }]}>
            {label}
          </Text>
        </View>
      )}
    </Pressable>
  );
}

const VARIANTS = {
  primary: { bg: C.orange, fg: C.bg, border: C.orange },
  secondary: { bg: C.panel2, fg: C.text, border: C.line },
  ghost: { bg: "transparent", fg: C.orange, border: C.orange },
  danger: { bg: "transparent", fg: C.red, border: C.red },
} as const;

const styles = StyleSheet.create({
  base: {
    borderRadius: R.md,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  md: { paddingVertical: S.md, paddingHorizontal: S.lg },
  lg: { paddingVertical: S.lg, paddingHorizontal: S.xl },
  content: { flexDirection: "row", alignItems: "center", gap: S.sm },
  label: { ...T.bodyBold, letterSpacing: 0.3 },
  labelLg: { fontSize: 17 },
  pressed: { opacity: 0.82, transform: [{ scale: 0.985 }] },
  disabled: { opacity: 0.4 },
});
