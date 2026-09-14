import React, { useMemo, useState } from "react";
import { FlatList, StyleSheet, Text, TextInput, View } from "react-native";
import { useNavigation } from "@react-navigation/native";
import { BookOpen, Search, X } from "lucide-react-native";
import { Pressable } from "react-native";
import Header from "../components/Header";
import TxnRow from "../components/TxnRow";
import SwipeableRow from "../components/SwipeableRow";
import SegmentedControl from "../components/SegmentedControl";
import EmptyState from "../components/EmptyState";
import { useToast } from "../components/Toast";
import { useLedger } from "../lib/LedgerContext";
import { Txn, filterByPeriod, searchTxns, sortByDateDesc } from "../lib/accounting";
import { PERIOD_OPTIONS, PeriodId, buildPeriod } from "../lib/period";
import { abs } from "../lib/format";
import { C, R, S, T } from "../lib/theme";
import { TabScreenNavigation } from "../navigation/routes";

type Flow = "all" | "in" | "out";

const FLOW_OPTIONS: { id: Flow; label: string }[] = [
  { id: "all", label: "All" },
  { id: "in", label: "Money in" },
  { id: "out", label: "Money out" },
];

export default function LedgerScreen() {
  const nav = useNavigation<TabScreenNavigation<"Ledger">>();
  const toast = useToast();
  const { accounts, txns, removeTxn, settings } = useLedger();

  const [query, setQuery] = useState("");
  const [flow, setFlow] = useState<Flow>("all");
  const [periodId, setPeriodId] = useState<PeriodId>("all");

  const period = useMemo(
    () => buildPeriod(periodId, settings.fyStartMonth),
    [periodId, settings.fyStartMonth]
  );

  const visible = useMemo(() => {
    let rows = filterByPeriod(txns, period);
    if (flow !== "all") {
      rows = rows.filter((t) => (flow === "in" ? t.debit === "bank" : t.credit === "bank"));
    }
    return sortByDateDesc(searchTxns(rows, accounts, query));
  }, [txns, period, flow, query, accounts]);

  const total = useMemo(
    () =>
      visible.reduce((sum, t) => sum + (t.debit === "bank" ? t.amount : -t.amount), 0),
    [visible]
  );

  const handleDelete = (txn: Txn) => {
    if (txn.sourceDoc) {
      toast.show("Edit the invoice instead — this entry belongs to it.", "warning");
      return;
    }
    removeTxn(txn.id);
    toast.show("Transaction deleted");
  };

  const handleEdit = (txn: Txn) => {
    if (txn.sourceDoc) {
      nav.navigate("DocDetail", { docId: txn.sourceDoc });
      return;
    }
    nav.navigate("Add", { editId: txn.id });
  };

  return (
    <View style={styles.screen}>
      <Header title="LEDGER" subtitle={`${visible.length} entries`} />

      <View style={styles.filters}>
        <View style={styles.searchField}>
          <Search color={C.mute} size={17} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Search description, account, amount"
            placeholderTextColor={C.mute}
            style={styles.searchInput}
            selectionColor={C.orange}
            autoCorrect={false}
          />
          {query.length > 0 && (
            <Pressable hitSlop={10} onPress={() => setQuery("")}>
              <X color={C.mute} size={16} />
            </Pressable>
          )}
        </View>

        <SegmentedControl options={FLOW_OPTIONS} value={flow} onChange={setFlow} />
        <SegmentedControl options={PERIOD_OPTIONS} value={periodId} onChange={setPeriodId} />

        <View style={styles.totalRow}>
          <Text style={styles.totalLabel}>NET IN VIEW</Text>
          <Text style={[styles.totalValue, { color: total >= 0 ? C.green : C.red }]}>
            {total >= 0 ? "+" : "−"} R {abs(total)}
          </Text>
        </View>
      </View>

      <FlatList
        data={visible}
        keyExtractor={(t) => t.id}
        contentContainerStyle={styles.list}
        ItemSeparatorComponent={() => <View style={styles.sep} />}
        showsVerticalScrollIndicator={false}
        renderItem={({ item }) => (
          <SwipeableRow onDelete={() => handleDelete(item)} enabled={!item.sourceDoc}>
            <TxnRow txn={item} accounts={accounts} onPress={() => handleEdit(item)} />
          </SwipeableRow>
        )}
        ListEmptyComponent={
          <EmptyState
            icon={<BookOpen color={C.mute} size={28} />}
            title={query || flow !== "all" ? "Nothing matches" : "No transactions yet"}
            body={
              query || flow !== "all"
                ? "Try a different search or clear the filters."
                : "Head to the Add tab to record your first transaction. Pick what happened and the app books the double entry for you."
            }
          />
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.bg },
  filters: { paddingHorizontal: S.lg, gap: S.md, paddingBottom: S.md },
  searchField: {
    flexDirection: "row",
    alignItems: "center",
    gap: S.sm,
    backgroundColor: C.panel2,
    borderRadius: R.md,
    borderWidth: 1,
    borderColor: C.line,
    paddingHorizontal: S.md,
  },
  searchInput: { ...T.body, color: C.text, flex: 1, paddingVertical: S.md },
  totalRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingTop: S.xs,
  },
  totalLabel: { ...T.label, color: C.mute },
  totalValue: { ...T.amount },
  list: { paddingHorizontal: S.lg, paddingBottom: S.huge, flexGrow: 1 },
  sep: { height: 1, backgroundColor: C.line },
});
