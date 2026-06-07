import React from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import Header from "../../components/Header";
import Card from "../../components/Card";
import { C, FONT_DISPLAY, FONT_DISPLAY_BOLD, FONT_MONO } from "../../lib/theme";

interface ComingSoonScreenProps {
  moduleNumber: number;
  title: string;
  blurb: string;
}

export default function ComingSoonScreen({ moduleNumber, title, blurb }: ComingSoonScreenProps) {
  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Header />
      <Card style={styles.card}>
        <Text style={styles.moduleTag}>MODULE {moduleNumber}</Text>
        <Text style={styles.title}>{title}</Text>
        <View style={styles.pill}>
          <Text style={styles.pillText}>COMING SOON</Text>
        </View>
        <Text style={styles.blurb}>{blurb}</Text>
      </Card>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.bg },
  content: { padding: 16, paddingBottom: 40 },
  card: { alignItems: "flex-start", gap: 10 },
  moduleTag: {
    color: C.mute,
    fontFamily: FONT_MONO,
    fontSize: 12,
    letterSpacing: 1.5,
  },
  title: {
    color: C.text,
    fontFamily: FONT_DISPLAY_BOLD,
    fontSize: 24,
  },
  pill: {
    backgroundColor: C.panel2,
    borderWidth: 1,
    borderColor: C.orange,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 4,
    marginTop: 4,
  },
  pillText: {
    color: C.orange,
    fontFamily: FONT_DISPLAY_BOLD,
    fontSize: 11,
    letterSpacing: 1.5,
  },
  blurb: {
    color: C.mute,
    fontFamily: FONT_DISPLAY,
    fontSize: 15,
    lineHeight: 22,
    marginTop: 6,
  },
});
