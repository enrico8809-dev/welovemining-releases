import React, { useEffect } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { RouteProp, useNavigation, useRoute } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { Check } from "lucide-react-native";
import Button from "../components/Button";
import { useStore } from "../lib/StoreContext";
import { fmt } from "../lib/format";
import { OrderStatus } from "../lib/types";
import { C } from "../lib/theme";
import { RootStackParamList } from "../navigation/routes";

const STEPS: { status: OrderStatus; title: string; body: string }[] = [
  { status: "placed", title: "Order placed", body: "We've received your order." },
  { status: "accepted", title: "Shop accepted", body: "The shop confirmed your order." },
  { status: "preparing", title: "Preparing", body: "Your order is being packed." },
  { status: "on_the_way", title: "On the way", body: "Your driver is heading to you." },
  { status: "delivered", title: "Delivered", body: "Enjoy! Thanks for ordering." },
];

const ORDER_INDEX: Record<OrderStatus, number> = {
  placed: 0,
  accepted: 1,
  preparing: 2,
  on_the_way: 3,
  delivered: 4,
  cancelled: -1,
};

export default function OrderTrackingScreen() {
  const route = useRoute<RouteProp<RootStackParamList, "OrderTracking">>();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { orders, advanceOrder } = useStore();
  const order = orders.find((o) => o.id === route.params.orderId);

  const currentIndex = order ? ORDER_INDEX[order.status] : -1;

  // Simulate the order progressing through its stages.
  useEffect(() => {
    if (!order || currentIndex < 0 || currentIndex >= STEPS.length - 1) return;
    const next = STEPS[currentIndex + 1].status;
    const timer = setTimeout(() => advanceOrder(order.id, next), 6000);
    return () => clearTimeout(timer);
  }, [order, currentIndex, advanceOrder]);

  if (!order) {
    return (
      <SafeAreaView style={styles.screen}>
        <Text style={styles.empty}>Order not found.</Text>
      </SafeAreaView>
    );
  }

  const delivered = order.status === "delivered";

  return (
    <SafeAreaView style={styles.screen} edges={["bottom"]}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.banner}>
          <Text style={styles.bannerEmoji}>{delivered ? "✅" : "🛵"}</Text>
          <Text style={styles.bannerTitle}>
            {delivered ? "Delivered" : `Arriving in ${order.etaMin}–${order.etaMax} min`}
          </Text>
          <Text style={styles.bannerSub}>
            {order.shopName} · Order {order.id}
          </Text>
        </View>

        <View style={styles.card}>
          {STEPS.map((step, i) => {
            const done = i <= currentIndex;
            const active = i === currentIndex;
            return (
              <View key={step.status} style={styles.stepRow}>
                <View style={styles.timeline}>
                  <View style={[styles.bullet, done && styles.bulletDone, active && styles.bulletActive]}>
                    {done ? <Check color={C.onGreen} size={12} /> : null}
                  </View>
                  {i < STEPS.length - 1 ? <View style={[styles.connector, done && styles.connectorDone]} /> : null}
                </View>
                <View style={styles.stepText}>
                  <Text style={[styles.stepTitle, done && styles.stepTitleDone]}>{step.title}</Text>
                  <Text style={styles.stepBody}>{step.body}</Text>
                </View>
              </View>
            );
          })}
        </View>

        <View style={styles.card}>
          <Text style={styles.cardHeading}>Delivery to</Text>
          <Text style={styles.addr}>{order.address}</Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardHeading}>Order</Text>
          {order.lines.map((l, i) => (
            <View key={i} style={styles.line}>
              <Text style={styles.lineQty}>{l.qty}×</Text>
              <Text style={styles.lineName}>{l.name}</Text>
              <Text style={styles.linePrice}>{fmt(l.price * l.qty)}</Text>
            </View>
          ))}
          <View style={styles.divider} />
          <View style={styles.line}>
            <Text style={[styles.lineName, styles.bold]}>Total paid</Text>
            <Text style={[styles.linePrice, styles.bold]}>{fmt(order.total)}</Text>
          </View>
          <Text style={styles.payNote}>
            Paid via {order.paymentMethod.toUpperCase()} · ref {order.paymentRef}
          </Text>
        </View>
      </ScrollView>

      <View style={styles.footer}>
        <Button label="Back to home" variant="outline" onPress={() => navigation.navigate("Tabs")} />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.bg },
  content: { padding: 16, gap: 14, paddingBottom: 24 },
  banner: { backgroundColor: C.greenSoft, borderRadius: 16, padding: 22, alignItems: "center" },
  bannerEmoji: { fontSize: 44 },
  bannerTitle: { color: C.text, fontSize: 22, fontWeight: "900", marginTop: 8 },
  bannerSub: { color: C.mute, fontSize: 13, marginTop: 4 },
  card: { backgroundColor: C.panel, borderRadius: 14, borderWidth: 1, borderColor: C.line, padding: 16 },
  stepRow: { flexDirection: "row", gap: 12 },
  timeline: { alignItems: "center", width: 24 },
  bullet: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: C.line,
    backgroundColor: C.panel,
    alignItems: "center",
    justifyContent: "center",
  },
  bulletDone: { backgroundColor: C.green, borderColor: C.green },
  bulletActive: { borderColor: C.green },
  connector: { width: 2, flex: 1, minHeight: 22, backgroundColor: C.line },
  connectorDone: { backgroundColor: C.green },
  stepText: { flex: 1, paddingBottom: 18 },
  stepTitle: { color: C.mute, fontSize: 15, fontWeight: "700" },
  stepTitleDone: { color: C.text },
  stepBody: { color: C.mute, fontSize: 13, marginTop: 2 },
  cardHeading: { color: C.text, fontSize: 15, fontWeight: "800", marginBottom: 8 },
  addr: { color: C.mute, fontSize: 14, lineHeight: 20 },
  line: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 4 },
  lineQty: { color: C.green, fontSize: 14, fontWeight: "800" },
  lineName: { color: C.text, fontSize: 14, flex: 1 },
  linePrice: { color: C.text, fontSize: 14, fontWeight: "600" },
  bold: { fontWeight: "800", fontSize: 16 },
  divider: { height: 1, backgroundColor: C.line, marginVertical: 8 },
  payNote: { color: C.mute, fontSize: 12, marginTop: 8 },
  footer: { padding: 16, borderTopWidth: 1, borderTopColor: C.line, backgroundColor: C.bg },
  empty: { color: C.mute, textAlign: "center", marginTop: 40 },
});
