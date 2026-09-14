import React, { useState } from "react";
import { LayoutChangeEvent, Pressable, StyleSheet, Text, View } from "react-native";
import Svg, { Line, Path } from "react-native-svg";
import { MonthPoint } from "../lib/accounting";
import { fmt, fmtCompact } from "../lib/format";
import { C, CHART, R, S, T } from "../lib/theme";
import * as haptics from "../lib/haptics";

interface CashFlowChartProps {
  data: MonthPoint[];
  height?: number;
}

/**
 * Net cash per month as a diverging column chart: months above the zero baseline
 * took in more than they paid out, months below did the opposite. Polarity is the
 * whole point of the chart, so the encoding is diverging (two hues, neutral
 * baseline) rather than categorical.
 *
 * Tap a column to read its exact figures — the touch equivalent of a hover
 * tooltip, since the axis only carries compact values.
 */
export default function CashFlowChart({ data, height = 150 }: CashFlowChartProps) {
  const [width, setWidth] = useState(0);
  const [selected, setSelected] = useState<number | null>(null);

  const onLayout = (e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width);

  const peak = Math.max(...data.map((d) => Math.abs(d.net)), 1);
  const axisPad = S.xs;
  const innerH = height - axisPad * 2;
  const zeroY = axisPad + innerH / 2;
  const slot = width / Math.max(data.length, 1);
  const barW = Math.min(CHART.barMaxThickness, Math.max(slot - CHART.surfaceGap * 2, 6));

  // Only the largest month gets a direct label — labelling every column is noise.
  const extremeIdx = data.reduce(
    (best, d, i) => (Math.abs(d.net) > Math.abs(data[best].net) ? i : best),
    0
  );
  const active = selected !== null ? data[selected] : null;

  return (
    <View>
      <View style={styles.legend}>
        <LegendKey color={C.green} label="Surplus" />
        <LegendKey color={C.red} label="Deficit" />
      </View>

      <View onLayout={onLayout} style={{ height }}>
        {width > 0 && (
          <Svg width={width} height={height}>
            {/* Zero baseline — recessive hairline, solid. */}
            <Line x1={0} y1={zeroY} x2={width} y2={zeroY} stroke={C.line} strokeWidth={1} />
            {data.map((d, i) => {
              const cx = slot * i + slot / 2;
              const magnitude = (Math.abs(d.net) / peak) * (innerH / 2);
              const barH = Math.max(magnitude, d.net === 0 ? 0 : 2);
              const up = d.net >= 0;
              const color = up ? C.green : C.red;
              const dim = selected !== null && selected !== i;
              return (
                <Path
                  key={d.key}
                  d={columnPath(cx - barW / 2, zeroY, barW, barH, up, CHART.barRadius)}
                  fill={color}
                  fillOpacity={dim ? 0.35 : 1}
                />
              );
            })}
          </Svg>
        )}

        {/* Touch targets sit above the SVG and are full-height for easy tapping. */}
        <View style={StyleSheet.absoluteFill}>
          <View style={styles.hitRow}>
            {data.map((d, i) => (
              <Pressable
                key={d.key}
                style={styles.hit}
                onPress={() => {
                  haptics.tap();
                  setSelected(selected === i ? null : i);
                }}
              />
            ))}
          </View>
        </View>
      </View>

      <View style={styles.axis}>
        {data.map((d, i) => (
          <Text
            key={d.key}
            style={[
              styles.axisLabel,
              (selected === i || (selected === null && i === extremeIdx)) && styles.axisLabelOn,
            ]}
          >
            {d.label}
          </Text>
        ))}
      </View>

      <View style={styles.readout}>
        {active ? (
          <>
            <Text style={styles.readoutTitle}>{active.label}</Text>
            <View style={styles.readoutRow}>
              <ReadoutItem label="In" value={fmt(active.income)} color={C.green} />
              <ReadoutItem label="Out" value={fmt(active.expenses)} color={C.red} />
              <ReadoutItem
                label="Net"
                value={fmt(active.net)}
                color={active.net >= 0 ? C.green : C.red}
              />
            </View>
          </>
        ) : (
          <Text style={styles.hint}>
            Biggest month: {data[extremeIdx]?.label ?? "—"} at{" "}
            {fmtCompact(data[extremeIdx]?.net ?? 0)} · tap any column for detail
          </Text>
        )}
      </View>
    </View>
  );
}

function LegendKey({ color, label }: { color: string; label: string }) {
  return (
    <View style={styles.legendKey}>
      <View style={[styles.swatch, { backgroundColor: color }]} />
      <Text style={styles.legendLabel}>{label}</Text>
    </View>
  );
}

function ReadoutItem({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <View style={styles.readoutItem}>
      <View style={styles.readoutKey}>
        <View style={[styles.dot, { backgroundColor: color }]} />
        <Text style={styles.readoutLabel}>{label}</Text>
      </View>
      <Text style={styles.readoutValue}>{value}</Text>
    </View>
  );
}

/**
 * A column with its data-end rounded and its baseline end square, so every bar
 * visibly grows out of the same zero line.
 */
function columnPath(
  x: number,
  zeroY: number,
  w: number,
  h: number,
  up: boolean,
  radius: number
): string {
  const r = Math.min(radius, w / 2, h);
  if (h <= 0) return "";
  if (up) {
    const top = zeroY - h;
    return `M${x},${zeroY} L${x},${top + r} Q${x},${top} ${x + r},${top} L${x + w - r},${top} Q${
      x + w
    },${top} ${x + w},${top + r} L${x + w},${zeroY} Z`;
  }
  const bottom = zeroY + h;
  return `M${x},${zeroY} L${x},${bottom - r} Q${x},${bottom} ${x + r},${bottom} L${
    x + w - r
  },${bottom} Q${x + w},${bottom} ${x + w},${bottom - r} L${x + w},${zeroY} Z`;
}

const styles = StyleSheet.create({
  legend: { flexDirection: "row", gap: S.lg, marginBottom: S.md },
  legendKey: { flexDirection: "row", alignItems: "center", gap: S.xs + 2 },
  swatch: { width: 10, height: 10, borderRadius: 3 },
  legendLabel: { ...T.small, color: C.mute },
  hitRow: { flex: 1, flexDirection: "row" },
  hit: { flex: 1 },
  axis: { flexDirection: "row", marginTop: S.sm },
  axisLabel: { ...T.caption, color: C.mute, flex: 1, textAlign: "center" },
  axisLabelOn: { color: C.text },
  readout: { marginTop: S.md, minHeight: 46, justifyContent: "center" },
  readoutTitle: { ...T.label, color: C.mute, marginBottom: S.sm },
  readoutRow: { flexDirection: "row", justifyContent: "space-between" },
  readoutItem: { flex: 1 },
  readoutKey: { flexDirection: "row", alignItems: "center", gap: S.xs + 1 },
  dot: { width: 7, height: 7, borderRadius: 3.5 },
  readoutLabel: { ...T.small, color: C.mute },
  readoutValue: { ...T.amountSm, color: C.text, marginTop: 2 },
  hint: { ...T.small, color: C.mute, lineHeight: 18 },
});
