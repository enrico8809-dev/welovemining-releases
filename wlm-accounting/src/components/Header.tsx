import React from "react";
import { Image, StyleSheet, Text, View } from "react-native";
import { C, FONT_DISPLAY_BOLD, FONT_MONO, R } from "../lib/theme";

const WLM_MARK = require("../assets/wlm-mark.png");

/** Brand header: glowing logo badge + split-color wordmark + live date chip. */
export default function Header({ subtitle }: { subtitle?: string }) {
  const today = new Date().toLocaleDateString("en-ZA", {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
  return (
    <View style={styles.row}>
      <View style={styles.badgeOuter}>
        <View style={styles.badge}>
          <Image source={WLM_MARK} style={styles.mark} resizeMode="contain" />
        </View>
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.title}>
          <Text style={{ color: C.orange }}>WLM</Text> ACCOUNTING
        </Text>
        <Text style={styles.subtitle}>{subtitle ?? "WeLoveMining Pty Ltd"}</Text>
      </View>
      <View style={styles.dateChip}>
        <Text style={styles.dateText}>{today}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 18,
    gap: 12,
  },
  badgeOuter: {
    padding: 2,
    borderRadius: R.md,
    backgroundColor: C.orangeSoft,
  },
  badge: {
    width: 42,
    height: 42,
    borderRadius: R.md - 2,
    backgroundColor: C.panel2,
    borderWidth: 1,
    borderColor: "rgba(247,147,26,0.35)",
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  mark: { width: 30, height: 30 },
  title: {
    color: C.text,
    fontFamily: FONT_DISPLAY_BOLD,
    fontSize: 20,
    letterSpacing: 1.2,
  },
  subtitle: {
    color: C.mute,
    fontFamily: FONT_MONO,
    fontSize: 11,
    letterSpacing: 0.5,
    marginTop: 1,
  },
  dateChip: {
    backgroundColor: C.panel,
    borderWidth: 1,
    borderColor: C.lineSoft,
    borderRadius: R.pill,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  dateText: { color: C.mute, fontFamily: FONT_MONO, fontSize: 11 },
});
