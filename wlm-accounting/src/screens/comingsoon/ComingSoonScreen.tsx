import React from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { Hourglass } from "lucide-react-native";
import Header from "../../components/Header";
import Card from "../../components/Card";
import { IconBadge, Pill } from "../../components/ui";
import { C, FONT_DISPLAY, FONT_DISPLAY_BOLD, FONT_MONO } from "../../lib/theme";

interface ComingSoonScreenProps {
  moduleNumber: number;
  title: string;
  blurb: string;
}

export default function ComingSoonScreen({ moduleNumber, title, blurb }: ComingSoonScreenProps) {
  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Header subtitle={`Module ${moduleNumber}`} />
      <Card raised style={styles.card}>
        <IconBadge tint={C.orangeSoft} size={52}>
          <Hourglass color={C.orange} size={24} />
        </IconBadge>
        <Text style={styles.moduleTag}>MODULE {moduleNumber}</Text>
        <Text style={styles.title}>{title}</Text>
        <Pill label="COMING SOON" color={C.orange} bg={C.orangeSoft} />
        <Text style={styles.blurb}>{blurb}</Text>
      </Card>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.bg },
  content: { padding: 16, paddingBottom: 48 },
  card: { alignItems: "flex-start", gap: 10, paddingVertical: 22 },
  moduleTag: {
    color: C.mute,
    fontFamily: FONT_MONO,
    fontSize: 12,
    letterSpacing: 1.5,
    marginTop: 4,
  },
  title: {
    color: C.text,
    fontFamily: FONT_DISPLAY_BOLD,
    fontSize: 26,
  },
  blurb: {
    color: C.mute,
    fontFamily: FONT_DISPLAY,
    fontSize: 15,
    lineHeight: 22,
    marginTop: 6,
  },
});
