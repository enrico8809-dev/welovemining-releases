import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { ChevronRight } from "lucide-react-native";
import Card from "./Card";
import { C, FONT_DISPLAY, FONT_DISPLAY_BOLD, FONT_MONO } from "../lib/theme";
import { ComingSoonRoute } from "../navigation/routes";

const MODULES: { number: number; title: string; route: ComingSoonRoute }[] = [
  { number: 2, title: "Bank Import", route: "BankImport" },
  { number: 3, title: "Invoices & Quotes", route: "Invoices" },
  { number: 4, title: "Inventory", route: "Inventory" },
  { number: 5, title: "Reconciliation", route: "Reconciliation" },
  { number: 6, title: "PDF Export", route: "Export" },
];

interface ModuleRoadmapProps {
  onOpen: (route: ComingSoonRoute) => void;
}

export default function ModuleRoadmap({ onOpen }: ModuleRoadmapProps) {
  return (
    <Card>
      <Text style={styles.label}>ROADMAP</Text>
      {MODULES.map((m) => (
        <Pressable key={m.route} style={styles.row} onPress={() => onOpen(m.route)}>
          <View style={styles.tag}>
            <Text style={styles.tagText}>{m.number}</Text>
          </View>
          <Text style={styles.title}>{m.title}</Text>
          <Text style={styles.soon}>Coming soon</Text>
          <ChevronRight color={C.mute} size={18} />
        </Pressable>
      ))}
    </Card>
  );
}

const styles = StyleSheet.create({
  label: {
    color: C.mute,
    fontFamily: FONT_DISPLAY_BOLD,
    fontSize: 12,
    letterSpacing: 1.5,
    marginBottom: 12,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 10,
  },
  tag: {
    width: 24,
    height: 24,
    borderRadius: 6,
    backgroundColor: C.panel2,
    borderWidth: 1,
    borderColor: C.line,
    alignItems: "center",
    justifyContent: "center",
  },
  tagText: { color: C.mute, fontFamily: FONT_MONO, fontSize: 12 },
  title: { flex: 1, color: C.text, fontFamily: FONT_DISPLAY, fontSize: 15 },
  soon: { color: C.mute, fontFamily: FONT_MONO, fontSize: 11 },
});
