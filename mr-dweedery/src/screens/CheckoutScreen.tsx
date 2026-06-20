import React, { useMemo, useState } from "react";
import { Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { Check } from "lucide-react-native";
import Button from "../components/Button";
import { productById, shopById } from "../lib/data";
import { SERVICE_FEE, useStore } from "../lib/StoreContext";
import { charge, isLivePayment, PAYMENT_METHODS } from "../lib/payments";
import { fmt } from "../lib/format";
import { Order, PaymentMethodId } from "../lib/types";
import { C } from "../lib/theme";
import { RootStackParamList } from "../navigation/routes";

const TIPS = [0, 10, 20, 30];

function genId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36).slice(-5).toUpperCase()}`;
}

export default function CheckoutScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { cart, cartShopId, totals, address, setAddress, placeOrder } = useStore();
  const shop = cartShopId ? shopById(cartShopId) : undefined;

  const [addr, setAddr] = useState(address);
  const [tip, setTip] = useState(10);
  const [method, setMethod] = useState<PaymentMethodId>("card");
  const [submitting, setSubmitting] = useState(false);

  const deliveryFee = shop?.deliveryFee ?? 0;
  const total = useMemo(() => totals.subtotal + deliveryFee + SERVICE_FEE + tip, [totals.subtotal, deliveryFee, tip]);

  if (!shop || cart.length === 0) {
    return (
      <SafeAreaView style={styles.screen}>
        <Text style={styles.empty}>Your basket is empty.</Text>
      </SafeAreaView>
    );
  }

  async function handlePlaceOrder() {
    if (!addr.trim()) {
      Alert.alert("Delivery address needed", "Please enter where we should deliver your order.");
      return;
    }
    setSubmitting(true);
    await setAddress(addr.trim());
    const orderId = genId("MW");

    const order: Order = {
      id: orderId,
      shopId: shop!.id,
      shopName: shop!.name,
      lines: cart.map((l) => {
        const p = productById(l.productId)!;
        return { name: p.name, qty: l.qty, price: p.price };
      }),
      subtotal: totals.subtotal,
      deliveryFee,
      serviceFee: SERVICE_FEE,
      tip,
      total,
      paymentMethod: method,
      paymentRef: "",
      address: addr.trim(),
      createdAt: Date.now(),
      status: "placed",
      etaMin: shop!.etaMin,
      etaMax: shop!.etaMax,
    };

    try {
      // Live gateways (card/PayFast/Ozow/SnapScan): the Payment screen runs the
      // WebView flow, then persists the order and goes to tracking on success.
      if (isLivePayment(method)) {
        navigation.navigate("Payment", { order });
        return;
      }

      // Sandbox or cash on delivery: resolve locally.
      const result = await charge({ method, amount: total, orderId, reference: orderId });
      if (!result.ok) {
        Alert.alert("Payment failed", result.message);
        return;
      }
      await placeOrder({ ...order, paymentRef: result.reference });
      navigation.reset({
        index: 1,
        routes: [{ name: "Tabs" }, { name: "OrderTracking", params: { orderId } }],
      });
    } catch (e: any) {
      Alert.alert("Something went wrong", e?.message ?? "Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <SafeAreaView style={styles.screen} edges={["bottom"]}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.sectionTitle}>Delivery address</Text>
        <View style={styles.card}>
          <TextInput
            value={addr}
            onChangeText={setAddr}
            placeholder="e.g. 12 Main Road, Sea Point, Cape Town"
            placeholderTextColor={C.mute}
            style={styles.input}
            multiline
          />
        </View>

        <Text style={styles.sectionTitle}>Tip your driver</Text>
        <View style={styles.tipRow}>
          {TIPS.map((t) => {
            const active = tip === t;
            return (
              <Pressable key={t} style={[styles.tipChip, active && styles.tipChipActive]} onPress={() => setTip(t)}>
                <Text style={[styles.tipText, active && styles.tipTextActive]}>{t === 0 ? "No tip" : fmt(t)}</Text>
              </Pressable>
            );
          })}
        </View>

        <Text style={styles.sectionTitle}>Payment method</Text>
        <View style={styles.card}>
          {PAYMENT_METHODS.map((m, i) => {
            const active = method === m.id;
            return (
              <Pressable
                key={m.id}
                style={[styles.payRow, i > 0 && styles.payRowBorder]}
                onPress={() => setMethod(m.id)}
              >
                <Text style={styles.payEmoji}>{m.emoji}</Text>
                <View style={{ flex: 1 }}>
                  <View style={styles.payLabelRow}>
                    <Text style={styles.payLabel}>{m.label}</Text>
                    {!m.live && m.id !== "cash" ? (
                      <View style={styles.sandboxTag}>
                        <Text style={styles.sandboxText}>SANDBOX</Text>
                      </View>
                    ) : null}
                  </View>
                  <Text style={styles.payBlurb}>{m.blurb}</Text>
                </View>
                <View style={[styles.radio, active && styles.radioActive]}>
                  {active ? <Check color={C.onGreen} size={14} /> : null}
                </View>
              </Pressable>
            );
          })}
        </View>

        <Text style={styles.sectionTitle}>Order summary</Text>
        <View style={styles.card}>
          <Row label="Subtotal" value={fmt(totals.subtotal)} />
          <Row label="Delivery fee" value={fmt(deliveryFee)} />
          <Row label="Service fee" value={fmt(SERVICE_FEE)} />
          <Row label="Driver tip" value={fmt(tip)} />
          <View style={styles.divider} />
          <Row label="Total" value={fmt(total)} bold />
        </View>
      </ScrollView>

      <View style={styles.footer}>
        <Button
          label={submitting ? "Processing…" : "Place order"}
          right={fmt(total)}
          loading={submitting}
          onPress={handlePlaceOrder}
        />
      </View>
    </SafeAreaView>
  );
}

function Row({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <View style={styles.row}>
      <Text style={[styles.rowLabel, bold && styles.bold]}>{label}</Text>
      <Text style={[styles.rowValue, bold && styles.bold]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.bg },
  content: { padding: 16, gap: 8, paddingBottom: 24 },
  sectionTitle: { color: C.text, fontSize: 16, fontWeight: "800", marginTop: 10, marginBottom: 6 },
  card: { backgroundColor: C.panel, borderRadius: 14, borderWidth: 1, borderColor: C.line, padding: 14 },
  input: { color: C.text, fontSize: 15, minHeight: 48 },
  tipRow: { flexDirection: "row", gap: 8 },
  tipChip: {
    flex: 1,
    backgroundColor: C.panel,
    borderWidth: 1,
    borderColor: C.line,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: "center",
  },
  tipChipActive: { backgroundColor: C.greenSoft, borderColor: C.green },
  tipText: { color: C.text, fontSize: 14, fontWeight: "700" },
  tipTextActive: { color: C.green },
  payRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 12 },
  payRowBorder: { borderTopWidth: 1, borderTopColor: C.line },
  payEmoji: { fontSize: 24 },
  payLabelRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  payLabel: { color: C.text, fontSize: 15, fontWeight: "700" },
  payBlurb: { color: C.mute, fontSize: 12, marginTop: 2 },
  sandboxTag: { backgroundColor: C.panel2, borderRadius: 5, paddingHorizontal: 6, paddingVertical: 1 },
  sandboxText: { color: C.mute, fontSize: 9, fontWeight: "800" },
  radio: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: C.line,
    alignItems: "center",
    justifyContent: "center",
  },
  radioActive: { backgroundColor: C.green, borderColor: C.green },
  row: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 5 },
  rowLabel: { color: C.mute, fontSize: 14 },
  rowValue: { color: C.text, fontSize: 14, fontWeight: "600" },
  bold: { color: C.text, fontSize: 17, fontWeight: "800" },
  divider: { height: 1, backgroundColor: C.line, marginVertical: 8 },
  footer: { padding: 16, borderTopWidth: 1, borderTopColor: C.line, backgroundColor: C.bg },
  empty: { color: C.mute, textAlign: "center", marginTop: 40 },
});
