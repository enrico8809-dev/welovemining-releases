import React from "react";
import { StyleSheet, Text, View } from "react-native";
import Sparkline from "./Sparkline";
import { C, R, S, T } from "../lib/theme";

interface StatTileProps {
  label: string;
  value: string;
  /** Signed change against a named period, e.g. "+12.4% vs last month". */
  delta?: { text: string; good: boolean };
  trend?: number[];
  color?: string;
  compact?: boolean;
}

/**
 * Label / value / optional delta / optional sparkline. Values wear the mono face;
 * labels and deltas stay in text tokens so colour never carries meaning alone.
 */
export default function StatTile({
  label,
  value,
  delta,
  trend,
  color = C.text,
  compact,
}: StatTileProps) {
  return (
    <View style={[styles.tile, compact && styles.compact]}>
      <Text style={styles.label}>{label}</Text>
      <Text style={[styles.value, compact && styles.valueCompact, { color }]} numberOfLines={1}>
        {value}
      </Text>
      {delta && (
        <View style={styles.deltaRow}>
          <View style={[styles.dot, { backgroundColor: delta.good ? C.green : C.red }]} />
          <Text style={styles.delta}>{delta.text}</Text>
        </View>
      )}
      {trend && trend.length > 1 && (
        <View style={styles.trend}>
          <Sparkline data={trend} color={color} width={100} height={28} />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  tile: {
    flex: 1,
    backgroundColor: C.panel,
    borderRadius: R.lg,
    borderWidth: 1,
    borderColor: C.line,
    padding: S.lg,
    gap: S.xs,
  },
  compact: { padding: S.md },
  label: { ...T.label, color: C.mute },
  value: { ...T.amountLg, marginTop: S.xs },
  valueCompact: { fontSize: 18 },
  deltaRow: { flexDirection: "row", alignItems: "center", gap: S.xs + 1, marginTop: 2 },
  dot: { width: 6, height: 6, borderRadius: 3 },
  delta: { ...T.caption, color: C.mute },
  trend: { marginTop: S.sm },
});
