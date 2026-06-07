import React from "react";
import { Image, StyleSheet, Text, View } from "react-native";
import { C, FONT_DISPLAY_BOLD, FONT_MONO } from "../lib/theme";

const WLM_MARK = require("../assets/wlm-mark.png");

export default function Header() {
  return (
    <View style={styles.row}>
      <View style={styles.badge}>
        <Image source={WLM_MARK} style={styles.mark} resizeMode="contain" />
      </View>
      <View>
        <Text style={styles.title}>WLM ACCOUNTING</Text>
        <Text style={styles.subtitle}>WeLoveMining Pty Ltd</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 16,
    gap: 12,
  },
  badge: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: C.panel2,
    borderWidth: 1,
    borderColor: C.line,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  mark: {
    width: 30,
    height: 30,
  },
  title: {
    color: C.text,
    fontFamily: FONT_DISPLAY_BOLD,
    fontSize: 20,
    letterSpacing: 1,
  },
  subtitle: {
    color: C.mute,
    fontFamily: FONT_MONO,
    fontSize: 12,
  },
});
