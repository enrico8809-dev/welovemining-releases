import React, { useMemo } from "react";
import { Alert, FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import { ArrowDownLeft, ArrowUpRight, BookOpen, Trash2 } from "lucide-react-native";
import Header from "../components/Header";
import { EmptyState, IconBadge } from "../components/ui";
import { useLedger } from "../lib/LedgerContext";
import { Txn, findAccount } from "../lib/accounting";
import { fmt } from "../lib/format";
import { C, FONT_DISPLAY_BOLD, FONT_MONO, R } from "../lib/theme";

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

    return (
      <View style={styles.card}>
        <IconBadge tint={isMoneyIn ? C.greenSoft : C.redSoft} size={38}>
          {isMoneyIn ? (
            <ArrowDownLeft color={C.green} size={19} />
          ) : (
            <ArrowUpRight color={C.red} size={19} />
          )}
        </IconBadge>
        <View style={styles.rowMain}>
          <Text style={styles.desc} numberOfLines={1}>
            {item.desc}
          </Text>
          <Text style={styles.meta} numberOfLines={1}>
            {item.date} · {otherAccount?.name ?? otherAccountId}
          </Text>
        </View>
        <Text style={[styles.amount, { color: isMoneyIn ? C.green : C.red }]}>
          {isMoneyIn ? "+" : "−"} {fmt(item.amount).replace("R ", "R")}
        </Text>
        <Pressable onPress={() => confirmDelete(item)} hitSlop={10} style={styles.trash}>
          <Trash2 color={C.mute} size={17} />
        </Pressable>
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <Header subtitle={`${txns.length} transaction${txns.length === 1 ? "" : "s"}`} />
      <FlatList
        data={sorted}
        keyExtractor={(t) => t.id}
        renderItem={renderItem}
        contentContainerStyle={styles.listContent}
        ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
        ListEmptyComponent={
          <EmptyState
            icon={<BookOpen color={C.mute} size={24} />}
            title="No transactions yet"
            hint="Tap the orange + button to record your first sale or expense."
          />
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.bg },
  listContent: { paddingHorizontal: 16, paddingBottom: 48, flexGrow: 1 },
  card: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: C.panel,
    borderWidth: 1,
    borderColor: C.lineSoft,
    borderRadius: R.md,
    paddingVertical: 12,
    paddingHorizontal: 14,
  },
  rowMain: { flex: 1 },
  desc: { color: C.text, fontFamily: FONT_DISPLAY_BOLD, fontSize: 15 },
  meta: { color: C.mute, fontFamily: FONT_MONO, fontSize: 11, marginTop: 3 },
  amount: { fontFamily: FONT_MONO, fontSize: 14 },
  trash: { padding: 4 },
});
