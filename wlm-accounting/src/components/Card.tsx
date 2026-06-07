import React from "react";
import { StyleProp, StyleSheet, View, ViewStyle } from "react-native";
import { C } from "../lib/theme";

interface CardProps {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  accent?: "orange" | "green" | "red" | "none";
}

export default function Card({ children, style, accent = "none" }: CardProps) {
  const borderColor =
    accent === "orange" ? C.orange : accent === "green" ? C.green : accent === "red" ? C.red : C.line;
  return <View style={[styles.card, { borderColor }, style]}>{children}</View>;
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: C.panel,
    borderRadius: 14,
    borderWidth: 1,
    padding: 16,
  },
});
