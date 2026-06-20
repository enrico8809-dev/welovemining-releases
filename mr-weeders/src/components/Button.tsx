import React from "react";
import { ActivityIndicator, Pressable, StyleProp, StyleSheet, Text, View, ViewStyle } from "react-native";
import { C } from "../lib/theme";

interface ButtonProps {
  label: string;
  onPress: () => void;
  variant?: "primary" | "outline" | "ghost";
  disabled?: boolean;
  loading?: boolean;
  style?: StyleProp<ViewStyle>;
  right?: string; // optional trailing text, e.g. a price
}

export default function Button({
  label,
  onPress,
  variant = "primary",
  disabled,
  loading,
  style,
  right,
}: ButtonProps) {
  const isPrimary = variant === "primary";
  const isOutline = variant === "outline";
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || loading}
      style={({ pressed }) => [
        styles.base,
        isPrimary && styles.primary,
        isOutline && styles.outline,
        variant === "ghost" && styles.ghost,
        (disabled || loading) && styles.disabled,
        pressed && !disabled && { opacity: 0.85 },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={isPrimary ? C.onGreen : C.green} />
      ) : (
        <View style={styles.row}>
          <Text
            style={[
              styles.label,
              isPrimary ? { color: C.onGreen } : { color: C.green },
            ]}
          >
            {label}
          </Text>
          {right ? (
            <Text style={[styles.right, isPrimary ? { color: C.onGreen } : { color: C.green }]}>
              {right}
            </Text>
          ) : null}
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    borderRadius: 14,
    paddingVertical: 16,
    paddingHorizontal: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  primary: { backgroundColor: C.green },
  outline: { borderWidth: 1.5, borderColor: C.green, backgroundColor: "transparent" },
  ghost: { backgroundColor: "transparent" },
  disabled: { opacity: 0.5 },
  row: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10 },
  label: { fontSize: 16, fontWeight: "700", letterSpacing: 0.3 },
  right: { fontSize: 16, fontWeight: "700" },
});
