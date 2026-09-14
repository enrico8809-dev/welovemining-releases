import React, { useMemo, useState } from "react";
import { FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import { useNavigation } from "@react-navigation/native";
import { FileText, Plus } from "lucide-react-native";
import Header from "../components/Header";
import StatTile from "../components/StatTile";
import SegmentedControl from "../components/SegmentedControl";
import StatusBadge from "../components/StatusBadge";
import EmptyState from "../components/EmptyState";
import Button from "../components/Button";
import { useLedger } from "../lib/LedgerContext";
import { BusinessDoc, docTotal, isOverdue, summariseReceivables } from "../lib/invoices";
import { fmt, fmtDateShort } from "../lib/format";
import { C, R, S, T } from "../lib/theme";
import { TabScreenNavigation } from "../navigation/routes";

type Tab = "invoices" | "quotes";

const TABS: { id: Tab; label: string }[] = [
  { id: "invoices", label: "Invoices" },
  { id: "quotes", label: "Quotes" },
];

export default function InvoicesScreen() {
  const nav = useNavigation<TabScreenNavigation<"Invoices">>();
  const { docs } = useLedger();
  const [tab, setTab] = useState<Tab>("invoices");

  const kind = tab === "invoices" ? "invoice" : "quote";
  const visible = useMemo(
    () =>
      docs
        .filter((d) => d.kind === kind)
        .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0)),
    [docs, kind]
  );
  const summary = useMemo(() => summariseReceivables(docs), [docs]);

  return (
    <View style={styles.screen}>
      <Header
        title="INVOICING"
        subtitle={`${visible.length} ${kind}${visible.length === 1 ? "" : "s"}`}
        action={
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`New ${kind}`}
            hitSlop={10}
            onPress={() => nav.navigate("DocEditor", { kind })}
            style={styles.newBtn}
          >
            <Plus color={C.bg} size={20} />
          </Pressable>
        }
      />

      <View style={styles.top}>
        <SegmentedControl options={TABS} value={tab} onChange={setTab} />

        {tab === "invoices" && (
          <View style={styles.stats}>
            <StatTile
              label="OUTSTANDING"
              value={fmt(summary.outstanding)}
              color={summary.outstanding > 0 ? C.amber : C.text}
              compact
            />
            <StatTile
              label="OVERDUE"
              value={fmt(summary.overdue)}
              color={summary.overdue > 0 ? C.red : C.text}
              compact
            />
          </View>
        )}
      </View>

      <FlatList
        data={visible}
        keyExtractor={(d) => d.id}
        contentContainerStyle={styles.list}
        showsVerticalScrollIndicator={false}
        ItemSeparatorComponent={() => <View style={styles.sep} />}
        renderItem={({ item }) => <DocRow doc={item} onPress={() => nav.navigate("DocDetail", { docId: item.id })} />}
        ListEmptyComponent={
          <EmptyState
            icon={<FileText color={C.mute} size={28} />}
            title={`No ${kind}s yet`}
            body={
              kind === "invoice"
                ? "Issue an invoice and it books Dr Receivables / Cr Sales. When the customer pays, marking it paid clears the receivable — income is never counted twice."
                : "Quotes post nothing to the books. Convert one to an invoice when the customer accepts."
            }
            actionLabel={`Create ${kind}`}
            onAction={() => nav.navigate("DocEditor", { kind })}
          />
        }
      />

      {visible.length > 0 && (
        <View style={styles.footer}>
          <Button
            label={`New ${kind}`}
            onPress={() => nav.navigate("DocEditor", { kind })}
            icon={<Plus color={C.bg} size={18} />}
          />
        </View>
      )}
    </View>
  );
}

function DocRow({ doc, onPress }: { doc: BusinessDoc; onPress: () => void }) {
  const total = docTotal(doc);
  const overdue = isOverdue(doc);

  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.row, pressed && styles.pressed]}>
      <View style={styles.rowMain}>
        <View style={styles.rowHead}>
          <Text style={styles.number}>{doc.number}</Text>
          <StatusBadge doc={doc} />
        </View>
        <Text style={styles.customer} numberOfLines={1}>
          {doc.customer || "No customer name"}
        </Text>
        <Text style={styles.date}>
          {fmtDateShort(doc.date)}
          {doc.dueDate ? ` · due ${fmtDateShort(doc.dueDate)}` : ""}
        </Text>
      </View>
      <Text style={[styles.total, overdue && { color: C.red }]}>{fmt(total)}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.bg },
  newBtn: {
    width: 38,
    height: 38,
    borderRadius: R.md,
    backgroundColor: C.orange,
    alignItems: "center",
    justifyContent: "center",
  },
  top: { paddingHorizontal: S.lg, gap: S.md, paddingBottom: S.md },
  stats: { flexDirection: "row", gap: S.md },
  list: { paddingHorizontal: S.lg, paddingBottom: S.huge, flexGrow: 1 },
  sep: { height: 1, backgroundColor: C.line },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: S.md,
    paddingVertical: S.md,
    paddingHorizontal: S.xs,
  },
  pressed: { backgroundColor: C.panel },
  rowMain: { flex: 1, gap: 3 },
  rowHead: { flexDirection: "row", alignItems: "center", gap: S.sm },
  number: { ...T.amountSm, color: C.orange },
  customer: { ...T.bodyBold, color: C.text },
  date: { ...T.caption, color: C.mute },
  total: { ...T.amount, color: C.text },
  footer: {
    padding: S.lg,
    borderTopWidth: 1,
    borderTopColor: C.line,
    backgroundColor: C.bg,
  },
});
