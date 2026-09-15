import React from "react";
import { StyleSheet, Text, View } from "react-native";
import Animated, { FadeIn } from "react-native-reanimated";
import Button from "./Button";
import { C, R, S, T } from "../lib/theme";

interface EmptyStateProps {
  icon: React.ReactNode;
  title: string;
  body: string;
  actionLabel?: string;
  onAction?: () => void;
}

export default function EmptyState({
  icon,
  title,
  body,
  actionLabel,
  onAction,
}: EmptyStateProps) {
  return (
    <Animated.View entering={FadeIn.duration(300)} style={styles.wrap}>
      <View style={styles.iconRing}>{icon}</View>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.body}>{body}</Text>
      {actionLabel && onAction && (
        <Button label={actionLabel} onPress={onAction} variant="ghost" style={styles.action} />
      )}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: "center", paddingVertical: S.huge, paddingHorizontal: S.xxl },
  iconRing: {
    width: 72,
    height: 72,
    borderRadius: R.pill,
    backgroundColor: C.panel,
    borderWidth: 1,
    borderColor: C.line,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: S.lg,
  },
  title: { ...T.heading, color: C.text, marginBottom: S.sm, textAlign: "center" },
  body: { ...T.body, color: C.mute, textAlign: "center", lineHeight: 22 },
  action: { marginTop: S.xl },
});
