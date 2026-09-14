import React, { useEffect, useMemo, useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { RouteProp, useNavigation, useRoute } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { Package, Plus, Trash2 } from "lucide-react-native";
import Header from "../components/Header";
import Card from "../components/Card";
import Button from "../components/Button";
import Field from "../components/Field";
import CurrencyInput from "../components/CurrencyInput";
import DateField from "../components/DateField";
import { useToast } from "../components/Toast";
import { useLedger } from "../lib/LedgerContext";
import {
  BusinessDoc,
  LineItem,
  docTotal,
  lineTotal,
  newDoc,
  newLineItem,
} from "../lib/invoices";
import { computeLandedCost, suggestedPrice } from "../lib/inventory";
import { findProduct, productLabel } from "../lib/catalogue";
import { fmt, parseAmount, toISO, todayISO } from "../lib/format";
import { C, R, S, T } from "../lib/theme";
import { RootStackParamList } from "../navigation/routes";
import * as haptics from "../lib/haptics";

type EditorRoute = RouteProp<RootStackParamList, "DocEditor">;

export default function DocEditorScreen() {
  const nav = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const route = useRoute<EditorRoute>();
  const toast = useToast();
  const { accounts, docs, saveDoc, settings } = useLedger();

  const existing = route.params.docId
    ? docs.find((d) => d.id === route.params.docId)
    : undefined;

  const [doc, setDoc] = useState<BusinessDoc>(
    () => existing ?? withDefaultDue(newDoc(route.params.kind, docs), settings.defaultPaymentTermsDays)
  );

  const incomeAccounts = useMemo(
    () => accounts.filter((a) => a.type === "income"),
    [accounts]
  );

  // Coming back from the catalogue: turn the picked product into a line at the
  // suggested selling price, so a quote can be built straight off the price list.
  useEffect(() => {
    const pickedId = route.params?.pickedProductId;
    if (!pickedId) return;
    const product = findProduct(pickedId);
    if (!product) return;

    const cost = computeLandedCost(product, 1, settings.landedCost);
    const price = Math.round(suggestedPrice(cost.perUnitZar, settings.targetMarginPct));

    setDoc((d) => {
      const blank = d.items.find((i) => !i.description && !i.unitPrice);
      const line = {
        ...(blank ?? newLineItem()),
        description: productLabel(product),
        qty: 1,
        unitPrice: price,
      };
      return {
        ...d,
        items: blank
          ? d.items.map((i) => (i.id === blank.id ? line : i))
          : [...d.items, line],
      };
    });
    nav.setParams({ pickedProductId: undefined });
  }, [route.params?.pickedProductId, settings.landedCost, settings.targetMarginPct, nav]);
  const total = docTotal(doc);
  const isInvoice = doc.kind === "invoice";

  const patch = (p: Partial<BusinessDoc>) => setDoc((d) => ({ ...d, ...p }));

  const patchItem = (id: string, p: Partial<LineItem>) =>
    setDoc((d) => ({
      ...d,
      items: d.items.map((i) => (i.id === id ? { ...i, ...p } : i)),
    }));

  const addItem = () => {
    haptics.tap();
    setDoc((d) => ({ ...d, items: [...d.items, newLineItem()] }));
  };

  const removeItem = (id: string) => {
    haptics.tap();
    setDoc((d) => ({
      ...d,
      items: d.items.length === 1 ? d.items : d.items.filter((i) => i.id !== id),
    }));
  };

  const save = (status: BusinessDoc["status"]) => {
    if (!doc.customer.trim()) {
      toast.show("Add a customer name", "error");
      return;
    }
    if (total <= 0) {
      toast.show("Add at least one line with an amount", "error");
      return;
    }
    saveDoc({ ...doc, customer: doc.customer.trim(), status });
    toast.show(
      status === "draft"
        ? `${doc.number} saved as draft`
        : isInvoice
          ? `${doc.number} issued — Dr Receivables / Cr Sales`
          : `${doc.number} sent`
    );
    nav.goBack();
  };

  return (
    <KeyboardAvoidingView
      style={styles.screen}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <Header
          title={doc.number}
          subtitle={isInvoice ? "New invoice" : "New quote"}
          onBack={() => nav.goBack()}
        />

        <View style={styles.body}>
          <Card index={0}>
            <Field
              label="CUSTOMER"
              value={doc.customer}
              onChangeText={(v) => patch({ customer: v })}
              placeholder="e.g. Mining Co (Pty) Ltd"
              autoCapitalize="words"
            />
            <View style={styles.spacer} />
            <DateField
              label={isInvoice ? "INVOICE DATE" : "QUOTE DATE"}
              value={doc.date}
              onChange={(iso) => patch({ date: iso })}
            />
            {isInvoice && (
              <>
                <View style={styles.spacer} />
                <DateField
                  label="DUE DATE"
                  value={doc.dueDate ?? todayISO()}
                  onChange={(iso) => patch({ dueDate: iso })}
                />
              </>
            )}
          </Card>

          <Card index={1} title="LINE ITEMS">
            <View style={styles.items}>
              {doc.items.map((item, idx) => (
                <View key={item.id} style={styles.item}>
                  <View style={styles.itemHead}>
                    <Text style={styles.itemIndex}>ITEM {idx + 1}</Text>
                    {doc.items.length > 1 && (
                      <Pressable hitSlop={10} onPress={() => removeItem(item.id)}>
                        <Trash2 color={C.mute} size={15} />
                      </Pressable>
                    )}
                  </View>

                  <Field
                    value={item.description}
                    onChangeText={(v) => patchItem(item.id, { description: v })}
                    placeholder="e.g. Antminer S21 Hydro — 335 TH/s"
                  />

                  <View style={styles.itemRow}>
                    <View style={styles.qty}>
                      <Text style={styles.miniLabel}>QTY</Text>
                      <Field
                        value={String(item.qty)}
                        onChangeText={(v) => {
                          const n = Number(v.replace(/[^0-9]/g, ""));
                          patchItem(item.id, { qty: Number.isFinite(n) ? n : 0 });
                        }}
                        keyboardType="number-pad"
                        mono
                      />
                    </View>
                    <View style={styles.price}>
                      <Text style={styles.miniLabel}>UNIT PRICE</Text>
                      <CurrencyInput
                        value={item.unitPrice ? String(item.unitPrice) : ""}
                        onChangeText={(v) => {
                          const n = parseAmount(v);
                          patchItem(item.id, { unitPrice: Number.isFinite(n) ? n : 0 });
                        }}
                      />
                    </View>
                  </View>

                  <Text style={styles.lineTotal}>Line total {fmt(lineTotal(item))}</Text>
                </View>
              ))}
            </View>

            <Button
              label="Pick from price list"
              onPress={() =>
                nav.navigate("Catalogue", { mode: "line-item", docId: doc.id })
              }
              icon={<Package color={C.bg} size={16} />}
              style={{ marginTop: S.md }}
            />
            <Button
              label="Add blank line"
              variant="secondary"
              onPress={addItem}
              icon={<Plus color={C.text} size={16} />}
              style={{ marginTop: S.sm }}
            />
          </Card>

          <Card index={2} title="INCOME ACCOUNT">
            <Text style={styles.note}>
              The sale is credited here when the {isInvoice ? "invoice is issued" : "quote becomes an invoice"}.
            </Text>
            <View style={styles.chips}>
              {incomeAccounts.map((a) => {
                const active = a.id === doc.incomeAccount;
                return (
                  <Pressable
                    key={a.id}
                    onPress={() => patch({ incomeAccount: a.id })}
                    style={[styles.chip, active && styles.chipOn]}
                  >
                    <Text style={[styles.chipLabel, active && styles.chipLabelOn]}>{a.name}</Text>
                  </Pressable>
                );
              })}
            </View>
          </Card>

          <Card index={3} accent="orange">
            <View style={styles.totalRow}>
              <Text style={styles.totalLabel}>TOTAL</Text>
              <Text style={styles.totalValue}>{fmt(total)}</Text>
            </View>
            <Text style={styles.vatNote}>
              No VAT — WeLoveMining is not VAT-registered yet.
            </Text>
          </Card>

          <Button
            label={isInvoice ? "Issue invoice" : "Send quote"}
            onPress={() => save("sent")}
            size="lg"
          />
          <Button label="Save as draft" variant="secondary" onPress={() => save("draft")} />
          <Text style={styles.footNote}>
            {isInvoice
              ? "Issuing posts Dr Trade Receivables / Cr Sales once. Marking it paid later posts Dr Bank / Cr Trade Receivables — it never books income again."
              : "Quotes post nothing to the books until you convert them to an invoice."}
          </Text>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function withDefaultDue(doc: BusinessDoc, termsDays: number): BusinessDoc {
  if (doc.kind !== "invoice") return doc;
  const due = new Date();
  due.setDate(due.getDate() + termsDays);
  return { ...doc, dueDate: toISO(due) };
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.bg },
  content: { paddingBottom: S.huge },
  body: { paddingHorizontal: S.lg, gap: S.lg },
  spacer: { height: S.lg },
  items: { gap: S.lg },
  item: {
    gap: S.sm,
    paddingBottom: S.md,
    borderBottomWidth: 1,
    borderBottomColor: C.line,
  },
  itemHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  itemIndex: { ...T.label, color: C.mute },
  itemRow: { flexDirection: "row", gap: S.md },
  qty: { width: 88 },
  price: { flex: 1 },
  miniLabel: { ...T.label, fontSize: 9, color: C.mute, marginBottom: S.xs + 2 },
  lineTotal: { ...T.caption, color: C.mute, textAlign: "right" },
  note: { ...T.small, color: C.mute, marginBottom: S.md, lineHeight: 19 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: S.sm },
  chip: {
    paddingVertical: S.sm,
    paddingHorizontal: S.md,
    borderRadius: R.pill,
    backgroundColor: C.panel2,
    borderWidth: 1,
    borderColor: C.line,
  },
  chipOn: { borderColor: C.orange, backgroundColor: C.panel3 },
  chipLabel: { ...T.small, color: C.mute },
  chipLabelOn: { color: C.orange },
  totalRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  totalLabel: { ...T.label, color: C.mute },
  totalValue: { ...T.amountLg, color: C.text },
  vatNote: { ...T.caption, color: C.mute, marginTop: S.sm },
  footNote: { ...T.caption, color: C.mute, lineHeight: 17, paddingHorizontal: S.xs },
});
