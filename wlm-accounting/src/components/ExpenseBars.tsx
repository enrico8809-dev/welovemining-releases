import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import Animated, { FadeIn } from "react-native-reanimated";
import { ChevronRight } from "lucide-react-native";
import { Account } from "../lib/accounting";
import { fmt } from "../lib/format";
import { C, CHART, R, S, T } from "../lib/theme";
import * as haptics from "../lib/haptics";

interface ExpenseBarsProps {
  data: { account: Account; amount: number }[];
  onSelect?: (account: Account) => void;
}

/**
 * Expense accounts ranked by spend. The categories are nominal — reordering them
 * wouldn't change their meaning — so every bar wears the same accent hue. Colouring
 * them by value would just re-encode what the bar length already shows, and would
 * spend the identity channel for nothing.
 */
export default function ExpenseBars({ data, onSelect }: ExpenseBarsProps) {
  if (!data.length) {
    return <Text style={styles.empty}>No expenses recorded in this period.</Text>;
  }
  const peak = Math.max(...data.map((d) => d.amount));

  return (
    <View style={styles.list}>
      {data.map(({ account, amount }, i) => {
        const pct = peak > 0 ? Math.max((amount / peak) * 100, 2) : 0;
        return (
          <Animated.View key={account.id} entering={FadeIn.delay(i * 50)}>
            <Pressable
              disabled={!onSelect}
              onPress={() => {
                haptics.tap();
                onSelect?.(account);
              }}
              style={({ pressed }) => [styles.row, pressed && styles.pressed]}
            >
              <View style={styles.head}>
                <Text style={styles.name} numberOfLines={1}>
                  {account.name}
                </Text>
                {/* Value rides the tip of the bar; the axis carries nothing else. */}
                <Text style={styles.value}>{fmt(amount)}</Text>
                {onSelect && <ChevronRight color={C.mute} size={14} />}
              </View>
              <View style={styles.track}>
                <View style={[styles.fill, { width: `${pct}%` }]} />
              </View>
            </Pressable>
          </Animated.View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  list: { gap: S.md },
  row: { gap: S.sm, paddingVertical: S.xs, borderRadius: R.sm },
  pressed: { opacity: 0.7 },
  head: { flexDirection: "row", alignItems: "center", gap: S.sm },
  name: { ...T.body, color: C.text, flex: 1 },
  value: { ...T.amountSm, color: C.textDim },
  track: {
    height: 8,
    borderRadius: CHART.barRadius,
    backgroundColor: C.panel2,
    overflow: "hidden",
  },
  fill: {
    height: "100%",
    borderTopRightRadius: CHART.barRadius,
    borderBottomRightRadius: CHART.barRadius,
    backgroundColor: C.orange,
  },
  empty: { ...T.small, color: C.mute },
});
