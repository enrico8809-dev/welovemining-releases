import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { ChevronRight } from "lucide-react-native";
import Card from "./Card";
import { SectionLabel } from "./ui";
import { C, FONT_DISPLAY, FONT_MONO, R } from "../lib/theme";
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
      <SectionLabel style={{ marginBottom: 12 }}>ROADMAP</SectionLabel>
      {MODULES.map((m, i) => (
        <Pressable
          key={m.route}
          style={({ pressed }) => [styles.row, i < MODULES.length - 1 && styles.rowBorder, pressed && { opacity: 0.6 }]}
          onPress={() => onOpen(m.route)}
        >
          <View style={styles.tag}>
            <Text style={styles.tagText}>{m.number}</Text>
          </View>
          <Text style={styles.title}>{m.title}</Text>
          <View style={styles.soonPill}>
            <Text style={styles.soon}>SOON</Text>
          </View>
          <ChevronRight color={C.mute} size={17} />
        </Pressable>
      ))}
    </Card>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 12,
  },
  rowBorder: { borderBottomWidth: 1, borderBottomColor: C.lineSoft },
  tag: {
    width: 26,
    height: 26,
    borderRadius: 8,
    backgroundColor: C.panel2,
    borderWidth: 1,
    borderColor: C.lineSoft,
    alignItems: "center",
    justifyContent: "center",
  },
  tagText: { color: C.orange, fontFamily: FONT_MONO, fontSize: 12 },
  title: { flex: 1, color: C.text, fontFamily: FONT_DISPLAY, fontSize: 15 },
  soonPill: {
    backgroundColor: C.panel2,
    borderRadius: R.pill,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  soon: { color: C.mute, fontFamily: FONT_MONO, fontSize: 9, letterSpacing: 1 },
});
