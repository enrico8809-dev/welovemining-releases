import React from "react";
import { StyleProp, StyleSheet, View, ViewStyle } from "react-native";
import { C, R } from "../lib/theme";

interface CardProps {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  /** Accent tints the border and washes the surface — used for money-coded cards. */
  accent?: "orange" | "green" | "red" | "none";
  /** Raised cards sit on the higher-elevation surface (hero panels). */
  raised?: boolean;
}

export default function Card({ children, style, accent = "none", raised = false }: CardProps) {
  const borderColor =
    accent === "orange" ? "rgba(247,147,26,0.45)"
    : accent === "green" ? "rgba(52,211,153,0.35)"
    : accent === "red" ? "rgba(248,113,113,0.35)"
    : C.lineSoft;
  const backgroundColor =
    accent === "green" ? "rgba(52,211,153,0.05)"
    : accent === "red" ? "rgba(248,113,113,0.05)"
    : raised ? C.panel3
    : C.panel;
  return <View style={[styles.card, { borderColor, backgroundColor }, style]}>{children}</View>;
}

const styles = StyleSheet.create({
  card: {
    borderRadius: R.lg,
    borderWidth: 1,
    padding: 16,
  },
});
