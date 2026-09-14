import React from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { C, R, S, T } from "../lib/theme";
import * as haptics from "../lib/haptics";

interface Option<T extends string> {
  id: T;
  label: string;
}

interface SegmentedControlProps<T extends string> {
  options: Option<T>[];
  value: T;
  onChange: (id: T) => void;
  /** Lets many options scroll horizontally instead of squeezing. */
  scrollable?: boolean;
}

/** The filter row that sits above a chart or report. */
export default function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  scrollable,
}: SegmentedControlProps<T>) {
  const items = options.map((o) => {
    const active = o.id === value;
    return (
      <Pressable
        key={o.id}
        accessibilityRole="button"
        accessibilityState={{ selected: active }}
        onPress={() => {
          haptics.tap();
          onChange(o.id);
        }}
        style={[styles.segment, active && styles.segmentActive, scrollable && styles.segmentAuto]}
      >
        <Text style={[styles.label, active && styles.labelActive]}>{o.label}</Text>
      </Pressable>
    );
  });

  if (scrollable) {
    return (
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.scrollTrack}
      >
        {items}
      </ScrollView>
    );
  }
  return <View style={styles.track}>{items}</View>;
}

const styles = StyleSheet.create({
  track: {
    flexDirection: "row",
    backgroundColor: C.panel2,
    borderRadius: R.md,
    borderWidth: 1,
    borderColor: C.line,
    padding: 3,
    gap: 3,
  },
  scrollTrack: { flexDirection: "row", gap: S.sm, paddingRight: S.lg },
  segment: {
    flex: 1,
    paddingVertical: S.sm,
    paddingHorizontal: S.sm,
    borderRadius: R.sm,
    alignItems: "center",
  },
  segmentAuto: {
    flex: 0,
    paddingHorizontal: S.lg,
    backgroundColor: C.panel2,
    borderWidth: 1,
    borderColor: C.line,
  },
  segmentActive: { backgroundColor: C.orange, borderColor: C.orange },
  label: { ...T.small, color: C.mute },
  labelActive: { color: C.bg, fontFamily: T.bodyBold.fontFamily },
});
