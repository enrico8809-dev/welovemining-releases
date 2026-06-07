import React, { useMemo } from "react";
import { Alert, FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import { Trash2 } from "lucide-react-native";
import Header from "../components/Header";
import { useLedger } from "../lib/LedgerContext";
import { Txn, findAccount } from "../lib/accounting";
import { fmt } from "../lib/format";
import { C, FONT_DISPLAY, FONT_DISPLAY_BOLD, FONT_MONO } from "../lib/theme";

export default function LedgerScreen() {
  const { accounts, txns, removeTxn } = useLedger();

  const sorted = useMemo(
    () => [...txns].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : b.id.localeCompare(a.id))),
    [txns]
  );

  function confirmDelete(txn: Txn) {
    Alert.alert("Delete transaction?", `${txn.desc} — ${fmt(txn.amount)}`, [
      { text: "Cancel", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: () => removeTxn(txn.id) },
    ]);
  }

  function renderItem({ item }: { item: Txn }) {
    const isMoneyIn = item.debit === "bank";
    const otherAccountId = item.debit === "bank" ? item.credit : item.debit;
    const otherAccount = findAccount(accounts, otherAccountId);
    const signed = isMoneyIn ? item.amount : -item.amount;

    return (
      <View style={styles.row}>
        <View style={styles.rowMain}>
          <Text style={styles.desc} numberOfLines={1}>
            {item.desc}
          </Text>
          <Text style={styles.meta} numberOfLines={1}>
            {item.date} · {otherAccount?.name ?? otherAccountId}
          </Text>
        </View>
        <Text style={[styles.amount, { color: isMoneyIn ? C.green : C.red }]}>
          {isMoneyIn ? "+" : "−"} {fmt(Math.abs(signed)).replace("R ", "")}
        </Text>
        <Pressable onPress={() => confirmDelete(item)} hitSlop={10} style={styles.trash}>
          <Trash2 color={C.mute} size={18} />
        </Pressable>
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <Header />
      <FlatList
        data={sorted}
        keyExtractor={(t) => t.id}
        renderItem={renderItem}
        contentContainerStyle={styles.listContent}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyText}>No transactions yet. Add your first one from the Add tab.</Text>
          </View>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.bg },
  listContent: { paddingHorizontal: 16, paddingBottom: 40, flexGrow: 1 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 14,
    gap: 12,
  },
  rowMain: { flex: 1 },
  desc: { color: C.text, fontFamily: FONT_DISPLAY_BOLD, fontSize: 16 },
  meta: { color: C.mute, fontFamily: FONT_MONO, fontSize: 12, marginTop: 4 },
  amount: { fontFamily: FONT_MONO, fontSize: 15 },
  trash: { padding: 4 },
  separator: { height: 1, backgroundColor: C.line },
  empty: { paddingTop: 60, alignItems: "center" },
  emptyText: {
    color: C.mute,
    fontFamily: FONT_DISPLAY,
    fontSize: 14,
    textAlign: "center",
    paddingHorizontal: 32,
  },
});
