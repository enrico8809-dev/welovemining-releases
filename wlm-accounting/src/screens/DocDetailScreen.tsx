import React, { useMemo, useState } from "react";
import { Alert, ScrollView, StyleSheet, Text, View } from "react-native";
import { RouteProp, useNavigation, useRoute } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { ArrowRight, CheckCircle2, Share2 } from "lucide-react-native";
import Header from "../components/Header";
import Card from "../components/Card";
import Button from "../components/Button";
import StatusBadge from "../components/StatusBadge";
import { useToast } from "../components/Toast";
import { useLedger } from "../lib/LedgerContext";
import {
  buildIssuePosting,
  buildPaymentPosting,
  convertQuoteToInvoice,
  docTotal,
  lineTotal,
} from "../lib/invoices";
import { accountName } from "../lib/accounting";
import { buildDocHtml, sharePdf } from "../lib/pdf";
import { abs, fmt, fmtDate, todayISO } from "../lib/format";
import { C, R, S, T } from "../lib/theme";
import { RootStackParamList } from "../navigation/routes";

type DetailRoute = RouteProp<RootStackParamList, "DocDetail">;

export default function DocDetailScreen() {
  const nav = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const route = useRoute<DetailRoute>();
  const toast = useToast();
  const { accounts, docs, saveDoc, removeDoc, settings } = useLedger();
  const [sharing, setSharing] = useState(false);

  const doc = docs.find((d) => d.id === route.params.docId);

  const postings = useMemo(() => {
    if (!doc) return [];
    return [buildIssuePosting(doc), buildPaymentPosting(doc)].filter(Boolean);
  }, [doc]);

  if (!doc) {
    return (
      <View style={styles.screen}>
        <Header title="NOT FOUND" onBack={() => nav.goBack()} />
        <Text style={styles.missing}>That document no longer exists.</Text>
      </View>
    );
  }

  const total = docTotal(doc);
  const isInvoice = doc.kind === "invoice";

  const markPaid = () => {
    saveDoc({ ...doc, status: "paid", paidDate: todayISO() });
    toast.show("Marked paid — receivable cleared, no new income booked");
  };

  const sharePdfDoc = async () => {
    setSharing(true);
    try {
      await sharePdf(buildDocHtml(doc, settings), `${doc.number}.pdf`);
    } catch {
      toast.show("Couldn't generate the PDF", "error");
    } finally {
      setSharing(false);
    }
  };

  const convert = () => {
    const invoice = convertQuoteToInvoice(doc, docs);
    saveDoc({ ...doc, status: "accepted", convertedToId: invoice.id });
    saveDoc(invoice);
    toast.show(`Converted to ${invoice.number}`);
    nav.replace("DocDetail", { docId: invoice.id });
  };

  const confirmDelete = () => {
    Alert.alert(
      `Delete ${doc.number}?`,
      "Its ledger entries will be removed too. This can't be undone.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: () => {
            removeDoc(doc.id);
            toast.show(`${doc.number} deleted`);
            nav.goBack();
          },
        },
      ]
    );
  };

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      <Header title={doc.number} subtitle={doc.customer} onBack={() => nav.goBack()} />

      <View style={styles.body}>
        <Card index={0}>
          <View style={styles.headRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.label}>TOTAL</Text>
              <Text style={styles.total}>{fmt(total)}</Text>
            </View>
            <StatusBadge doc={doc} />
          </View>
          <View style={styles.meta}>
            <MetaRow label={isInvoice ? "Invoice date" : "Quote date"} value={fmtDate(doc.date)} />
            {doc.dueDate && <MetaRow label="Due" value={fmtDate(doc.dueDate)} />}
            {doc.paidDate && <MetaRow label="Paid" value={fmtDate(doc.paidDate)} />}
            <MetaRow label="Income account" value={accountName(accounts, doc.incomeAccount)} />
          </View>
        </Card>

        <Card index={1} title="LINE ITEMS">
          {doc.items.map((item) => (
            <View key={item.id} style={styles.item}>
              <View style={{ flex: 1 }}>
                <Text style={styles.itemDesc}>{item.description || "—"}</Text>
                <Text style={styles.itemQty}>
                  {item.qty} × {fmt(item.unitPrice)}
                </Text>
              </View>
              <Text style={styles.itemTotal}>{abs(lineTotal(item))}</Text>
            </View>
          ))}
          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>Total</Text>
            <Text style={styles.totalValue}>{fmt(total)}</Text>
          </View>
        </Card>

        {/* The audit trail: exactly what this document put in the books. */}
        <Card index={2} title="LEDGER POSTINGS">
          {postings.length === 0 ? (
            <Text style={styles.none}>
              {doc.status === "draft"
                ? "Nothing posted yet — this is still a draft."
                : "Quotes post nothing until they become an invoice."}
            </Text>
          ) : (
            postings.map((p) => (
              <View key={p!.id} style={styles.posting}>
                <View style={styles.postingHead}>
                  <Text style={styles.postingDate}>{fmtDate(p!.date)}</Text>
                  <Text style={styles.postingAmount}>{fmt(p!.amount)}</Text>
                </View>
                <Text style={styles.postingEntry}>
                  Dr {accountName(accounts, p!.debit)} · Cr {accountName(accounts, p!.credit)}
                </Text>
              </View>
            ))
          )}
          {doc.status === "paid" && (
            <View style={styles.guard}>
              <CheckCircle2 color={C.green} size={14} />
              <Text style={styles.guardText}>
                The payment cleared Trade Receivables. Income was recognised once, when the
                invoice was issued.
              </Text>
            </View>
          )}
        </Card>

        <Button
          label={`Send ${isInvoice ? "invoice" : "quote"} as PDF`}
          onPress={sharePdfDoc}
          loading={sharing}
          size="lg"
          icon={<Share2 color={C.bg} size={18} />}
        />

        {isInvoice && doc.status === "sent" && (
          <Button label="Mark as paid" variant="secondary" onPress={markPaid} />
        )}
        {isInvoice && doc.status === "draft" && (
          <Button
            label="Issue invoice"
            onPress={() => {
              saveDoc({ ...doc, status: "sent" });
              toast.show(`${doc.number} issued`);
            }}
            size="lg"
          />
        )}
        {!isInvoice && (doc.status === "sent" || doc.status === "draft") && (
          <Button
            label="Convert to invoice"
            onPress={convert}
            size="lg"
            icon={<ArrowRight color={C.bg} size={18} />}
          />
        )}

        <Button
          label="Edit"
          variant="secondary"
          onPress={() => nav.navigate("DocEditor", { docId: doc.id, kind: doc.kind })}
        />
        <Button label="Delete" variant="danger" onPress={confirmDelete} />
      </View>
    </ScrollView>
  );
}

function MetaRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.metaRow}>
      <Text style={styles.metaLabel}>{label}</Text>
      <Text style={styles.metaValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.bg },
  content: { paddingBottom: S.huge },
  body: { paddingHorizontal: S.lg, gap: S.lg },
  missing: { ...T.body, color: C.mute, padding: S.lg },
  headRow: { flexDirection: "row", alignItems: "flex-start", gap: S.md },
  label: { ...T.label, color: C.mute },
  total: { ...T.hero, fontSize: 32, color: C.text, marginTop: S.xs },
  meta: { marginTop: S.lg, gap: S.sm },
  metaRow: { flexDirection: "row", justifyContent: "space-between" },
  metaLabel: { ...T.small, color: C.mute },
  metaValue: { ...T.amountSm, color: C.textDim },
  item: {
    flexDirection: "row",
    alignItems: "center",
    gap: S.md,
    paddingVertical: S.sm,
    borderBottomWidth: 1,
    borderBottomColor: C.line,
  },
  itemDesc: { ...T.body, color: C.text },
  itemQty: { ...T.caption, color: C.mute, marginTop: 2 },
  itemTotal: { ...T.amountSm, color: C.text },
  totalRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingTop: S.md,
  },
  totalLabel: { ...T.bodyBold, color: C.text },
  totalValue: { ...T.amount, color: C.text },
  none: { ...T.small, color: C.mute, lineHeight: 19 },
  posting: {
    backgroundColor: C.panel2,
    borderRadius: R.md,
    padding: S.md,
    marginBottom: S.sm,
    borderWidth: 1,
    borderColor: C.line,
  },
  postingHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  postingDate: { ...T.caption, color: C.mute },
  postingAmount: { ...T.amountSm, color: C.text },
  postingEntry: { ...T.small, color: C.textDim, marginTop: S.xs },
  guard: {
    flexDirection: "row",
    gap: S.sm,
    marginTop: S.sm,
    padding: S.md,
    borderRadius: R.md,
    backgroundColor: C.greenDim + "33",
    borderWidth: 1,
    borderColor: C.greenDim,
  },
  guardText: { ...T.caption, color: C.textDim, flex: 1, lineHeight: 16 },
});
