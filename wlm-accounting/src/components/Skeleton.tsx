import React, { useEffect } from "react";
import { StyleSheet, View, ViewStyle, StyleProp } from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from "react-native-reanimated";
import { C, R, S } from "../lib/theme";

export function Skeleton({
  width,
  height = 14,
  radius = R.sm,
  style,
}: {
  width?: number | `${number}%`;
  height?: number;
  radius?: number;
  style?: StyleProp<ViewStyle>;
}) {
  const pulse = useSharedValue(0.4);

  useEffect(() => {
    pulse.value = withRepeat(
      withSequence(withTiming(0.9, { duration: 700 }), withTiming(0.4, { duration: 700 })),
      -1,
      true
    );
  }, [pulse]);

  const animated = useAnimatedStyle(() => ({ opacity: pulse.value }));

  return (
    <Animated.View
      style={[
        { width: width ?? "100%", height, borderRadius: radius, backgroundColor: C.panel2 },
        animated,
        style,
      ]}
    />
  );
}

/** Placeholder shown while the ledger loads, shaped like the dashboard. */
export function DashboardSkeleton() {
  return (
    <View style={styles.wrap}>
      <View style={styles.card}>
        <Skeleton width="40%" height={10} />
        <Skeleton width="70%" height={34} style={{ marginTop: S.md }} />
        <Skeleton width="50%" height={10} style={{ marginTop: S.md }} />
      </View>
      <View style={styles.row}>
        <View style={[styles.card, styles.half]}>
          <Skeleton width="50%" height={10} />
          <Skeleton width="80%" height={22} style={{ marginTop: S.md }} />
        </View>
        <View style={[styles.card, styles.half]}>
          <Skeleton width="50%" height={10} />
          <Skeleton width="80%" height={22} style={{ marginTop: S.md }} />
        </View>
      </View>
      <View style={styles.card}>
        <Skeleton width="35%" height={10} />
        <Skeleton height={140} style={{ marginTop: S.lg }} radius={R.md} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { padding: S.lg, gap: S.lg },
  card: {
    backgroundColor: C.panel,
    borderRadius: R.lg,
    borderWidth: 1,
    borderColor: C.line,
    padding: S.lg,
  },
  row: { flexDirection: "row", gap: S.lg },
  half: { flex: 1 },
});
