import React from "react";
import { FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import Button from "../components/Button";
import { useStore } from "../lib/StoreContext";
import { fmt } from "../lib/format";
import { Order, OrderStatus } from "../lib/types";
import { C } from "../lib/theme";
import { RootStackParamList } from "../navigation/routes";

const STATUS_LABEL: Record<OrderStatus, string> = {
  placed: "Placed",
  accepted: "Accepted",
  preparing: "Preparing",
  on_the_way: "On the way",
  delivered: "Delivered",
  cancelled: "Cancelled",
};

function isActive(o: Order): boolean {
  return o.status !== "delivered" && o.status !== "cancelled";
}

export default function OrdersScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { orders, totals } = useStore();

  return (
    <SafeAreaView style={styles.screen} edges={["top"]}>
      <View style={styles.header}>
        <Text style={styles.title}>Your orders</Text>
        {totals.count > 0 ? (
          <Pressable onPress={() => navigation.navigate("Cart")} style={styles.basketLink}>
            <Text style={styles.basketLinkText}>Basket · {totals.count}</Text>
          </Pressable>
        ) : null}
      </View>

      <FlatList
        data={orders}
        keyExtractor={(o) => o.id}
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          <View style={styles.emptyWrap}>
            <Text style={styles.emptyEmoji}>🧾</Text>
            <Text style={styles.emptyTitle}>No orders yet</Text>
            <Text style={styles.emptyBody}>Your past and active orders will show up here.</Text>
            <Button label="Browse shops" variant="outline" onPress={() => navigation.navigate("Tabs")} style={{ marginTop: 16 }} />
          </View>
        }
        renderItem={({ item }) => (
          <Pressable
            style={styles.card}
            onPress={() => navigation.navigate("OrderTracking", { orderId: item.id })}
          >
            <View style={styles.cardTop}>
              <Text style={styles.shopName}>{item.shopName}</Text>
              <View style={[styles.statusPill, isActive(item) ? styles.statusActive : styles.statusDone]}>
                <Text style={[styles.statusText, isActive(item) ? styles.statusTextActive : styles.statusTextDone]}>
                  {STATUS_LABEL[item.status]}
                </Text>
              </View>
            </View>
            <Text style={styles.items} numberOfLines={1}>
              {item.lines.map((l) => `${l.qty}× ${l.name}`).join(", ")}
            </Text>
            <View style={styles.cardBottom}>
              <Text style={styles.date}>{new Date(item.createdAt).toLocaleDateString("en-ZA")}</Text>
              <Text style={styles.total}>{fmt(item.total)}</Text>
            </View>
          </Pressable>
        )}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.bg },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  title: { color: C.text, fontSize: 26, fontWeight: "900" },
  basketLink: { backgroundColor: C.greenSoft, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20 },
  basketLinkText: { color: C.green, fontWeight: "700", fontSize: 13 },
  list: { padding: 16, gap: 12 },
  card: { backgroundColor: C.panel, borderRadius: 14, borderWidth: 1, borderColor: C.line, padding: 16, gap: 8 },
  cardTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  shopName: { color: C.text, fontSize: 16, fontWeight: "800", flex: 1 },
  statusPill: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 },
  statusActive: { backgroundColor: C.greenSoft },
  statusDone: { backgroundColor: C.panel2 },
  statusText: { fontSize: 12, fontWeight: "800" },
  statusTextActive: { color: C.green },
  statusTextDone: { color: C.mute },
  items: { color: C.mute, fontSize: 13 },
  cardBottom: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  date: { color: C.mute, fontSize: 12 },
  total: { color: C.text, fontSize: 15, fontWeight: "800" },
  emptyWrap: { alignItems: "center", justifyContent: "center", paddingTop: 80, paddingHorizontal: 32 },
  emptyEmoji: { fontSize: 56, marginBottom: 12 },
  emptyTitle: { color: C.text, fontSize: 20, fontWeight: "800" },
  emptyBody: { color: C.mute, fontSize: 14, textAlign: "center", marginTop: 6 },
});
