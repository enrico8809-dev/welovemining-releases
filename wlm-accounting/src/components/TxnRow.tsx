import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { ArrowDownLeft, ArrowUpRight, Lock } from "lucide-react-native";
import { Account, Txn, accountName, counterAccountId, isMoneyIn } from "../lib/accounting";
import { abs, fmtDateShort } from "../lib/format";
import { C, R, S, T } from "../lib/theme";
import * as haptics from "../lib/haptics";

interface TxnRowProps {
  txn: Txn;
  accounts: Account[];
  onPress?: () => void;
}

export default function TxnRow({ txn, accounts, onPress }: TxnRowProps) {
  const moneyIn = isMoneyIn(txn);
  const color = moneyIn ? C.green : C.red;
  const Arrow = moneyIn ? ArrowDownLeft : ArrowUpRight;
  const locked = !!txn.sourceDoc;

  return (
    <Pressable
      disabled={!onPress}
      onPress={() => {
        haptics.tap();
        onPress?.();
      }}
      style={({ pressed }) => [styles.row, pressed && styles.pressed]}
    >
      <View style={[styles.icon, { borderColor: color }]}>
        <Arrow color={color} size={16} />
      </View>

      <View style={styles.main}>
        <Text style={styles.desc} numberOfLines={1}>
          {txn.desc}
        </Text>
        <View style={styles.metaRow}>
          <Text style={styles.meta} numberOfLines={1}>
            {fmtDateShort(txn.date)} · {accountName(accounts, counterAccountId(txn))}
          </Text>
          {locked && <Lock color={C.mute} size={10} />}
        </View>
      </View>

      <Text style={[styles.amount, { color }]}>
        {moneyIn ? "+" : "−"} {abs(txn.amount)}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: S.md,
    paddingVertical: S.md,
    paddingHorizontal: S.xs,
    backgroundColor: C.bg,
  },
  pressed: { backgroundColor: C.panel },
  icon: {
    width: 34,
    height: 34,
    borderRadius: R.pill,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  main: { flex: 1 },
  desc: { ...T.bodyBold, color: C.text },
  metaRow: { flexDirection: "row", alignItems: "center", gap: S.xs + 2, marginTop: 3 },
  meta: { ...T.caption, color: C.mute, flexShrink: 1 },
  amount: { ...T.amount },
});
