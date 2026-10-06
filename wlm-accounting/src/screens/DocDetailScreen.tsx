import React, { useMemo, useState } from "react";
import { Alert, ScrollView, StyleSheet, Text, View } from "react-native";
import { RouteProp, useNavigation, useRoute } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { ArrowRight, CheckCircle2, Coins, Share2 } from "lucide-react-native";
import Header from "../components/Header";
import Card from "../components/Card";
import Button from "../components/Button";
import StatusBadge from "../components/StatusBadge";
import { useToast } from "../components/Toast";
import { useLedger } from "../lib/LedgerContext";
import Field from "../components/Field";
import CurrencyInput from "../components/CurrencyInput";
import {
  buildIssuePosting,
  buildPaymentPosting,
  buildSettlementPosting,
  convertQuoteToInvoice,
  cryptoDue,
  cryptoOption,
  docTotal,
  lineTotal,
} from "../lib/invoices";
import { accountName } from "../lib/accounting";
import { CRYPTO_ACCOUNT, displayDecimals, findAsset, zarForUnits } from "../lib/crypto";
import { buildDocHtml, sharePdf } from "../lib/pdf";
import { abs, fmt, fmtDate, fmtUnits, parseAmount, todayISO } from "../lib/format";
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

  const [settling, setSettling] = useState(false);
  const [unitsIn, setUnitsIn] = useState("");
  const [zarIn, setZarIn] = useState("");

  const postings = useMemo(() => {
    if (!doc) return [];
    return [
      buildIssuePosting(doc),
      buildPaymentPosting(doc),
      buildSettlementPosting(doc),
    ].filter(Boolean);
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

  const cryptoAsset = doc.crypto ? findAsset(settings.crypto, doc.crypto.asset) : undefined;
  const coinsDue = doc.crypto ? cryptoDue(doc) : 0;
  const canSettleInCrypto = settings.crypto.assets.some((a) => !!a.symbol.trim());

  const markPaid = () => {
    saveDoc({ ...doc, status: "paid", paidDate: todayISO(), settlement: undefined });
    toast.show("Marked paid — receivable cleared, no new income booked");
  };

  /** Opens the coin panel, pre-filled with what was asked for at today's rate. */
  const startCryptoSettlement = () => {
    const units = coinsDue > 0 ? coinsDue : 0;
    const rate = cryptoAsset?.rateZar ?? settings.crypto.assets[0]?.rateZar ?? 0;
    setUnitsIn(units > 0 ? String(units) : "");
    setZarIn(units > 0 && rate > 0 ? abs(zarForUnits(units, rate)) : abs(total));
    setSettling(true);
  };

  const confirmCryptoSettlement = () => {
    const units = parseAmount(unitsIn);
    const zar = parseAmount(zarIn);
    if (!Number.isFinite(units) || units <= 0) {
      toast.show("Enter how many coins arrived", "error");
      return;
    }
    if (!Number.isFinite(zar) || zar <= 0) {
      toast.show("Enter what those coins were worth in rands", "error");
      return;
    }

    const symbol = doc.crypto?.asset ?? settings.crypto.assets[0]?.symbol ?? "";
    saveDoc({
      ...doc,
      status: "paid",
      paidDate: todayISO(),
      settlement: { account: CRYPTO_ACCOUNT, asset: symbol, units, zar },
    });
    setSettling(false);

    const difference = total - zar;
    toast.show(
      Math.abs(difference) < 0.005
        ? "Marked paid — coins in the wallet, receivable cleared"
        : `Marked paid — receivable cleared, R ${abs(difference)} ${
            difference > 0 ? "rate loss" : "rate gain"
          } posted`
    );
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
    // Re-fix the coin rate on the way through: a quote accepted three weeks
    // later should not bill coins at a three-week-old rate.
    const asset = doc.crypto ? findAsset(settings.crypto, doc.crypto.asset) : undefined;
    const invoice = convertQuoteToInvoice(
      doc,
      docs,
      asset && asset.rateZar > 0 ? cryptoOption(asset) : undefined
    );
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
            {!!doc.crypto && doc.status !== "paid" && coinsDue > 0 && (
              <MetaRow
                label={`Or in ${doc.crypto.asset}`}
                value={`${fmtUnits(coinsDue, doc.crypto.decimals)} at R ${abs(doc.crypto.rateZar)}`}
              />
            )}
            {!!doc.settlement?.units && (
              <MetaRow
                label="Settled in"
                value={`${fmtUnits(
                  doc.settlement.units,
                  displayDecimals(doc.settlement.units)
                )} ${doc.settlement.asset ?? ""}`}
              />
            )}
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

        {isInvoice && doc.status === "sent" && !settling && (
          <>
            <Button
              label={canSettleInCrypto ? "Mark as paid — into FNB" : "Mark as paid"}
              variant="secondary"
              onPress={markPaid}
            />
            {canSettleInCrypto && (
              <Button
                label="Mark as paid — in crypto"
                variant="secondary"
                onPress={startCryptoSettlement}
                icon={<Coins color={C.text} size={16} />}
              />
            )}
          </>
        )}

        {/* What actually arrived, rather than what was asked for. The rate moves
            between issuing an invoice and being paid for it, and the wallet has
            to carry the coins that turned up or it will never agree with the
            exchange again. */}
        {isInvoice && doc.status === "sent" && settling && (
          <Card index={3} title="PAID IN CRYPTO">
            <Text style={styles.settleNote}>
              {coinsDue > 0
                ? `This invoice asked for ${fmtUnits(coinsDue, doc.crypto!.decimals)} ${
                    doc.crypto!.asset
                  }. Enter what actually landed.`
                : "Enter what landed in the wallet."}
            </Text>
            <View style={styles.settleSpacer} />
            <Field
              label={`COINS RECEIVED${doc.crypto ? ` (${doc.crypto.asset})` : ""}`}
              value={unitsIn}
              onChangeText={setUnitsIn}
              placeholder="0.00"
              keyboardType="decimal-pad"
              mono
            />
            <View style={styles.settleSpacer} />
            <Text style={styles.settleLabel}>WORTH IN RANDS ON THE DAY</Text>
            <CurrencyInput value={zarIn} onChangeText={setZarIn} />
            <Text style={styles.settleNote}>
              Invoiced {fmt(total)}. Any difference is the rate moving, and is
              posted to Crypto Gains / (Losses) — the receivable still clears in
              full, because the customer sent what they were asked for.
            </Text>
            <Button
              label="Confirm payment"
              onPress={confirmCryptoSettlement}
              style={{ marginTop: S.md }}
            />
            <Button
              label="Cancel"
              variant="ghost"
              onPress={() => setSettling(false)}
              style={{ marginTop: S.sm }}
            />
          </Card>
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
  settleNote: { ...T.small, color: C.mute, lineHeight: 19, marginTop: S.sm },
  settleLabel: { ...T.label, color: C.mute, marginBottom: S.sm },
  settleSpacer: { height: S.lg },
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
