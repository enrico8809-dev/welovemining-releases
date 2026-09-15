import React from "react";
import { ImageBackground, ScrollView, StyleSheet, Text, View, Pressable } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { Trash2 } from "lucide-react-native";
import Button from "../components/Button";
import { productById, shopById } from "../lib/data";
import { productImage } from "../lib/images";
import { SERVICE_FEE, useStore } from "../lib/StoreContext";
import { fmt } from "../lib/format";
import { C } from "../lib/theme";
import { RootStackParamList } from "../navigation/routes";

export default function CartScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { cart, cartShopId, totals, setQty, clearCart } = useStore();
  const shop = cartShopId ? shopById(cartShopId) : undefined;

  if (!shop || cart.length === 0) {
    return (
      <SafeAreaView style={styles.screen} edges={["bottom"]}>
        <View style={styles.emptyWrap}>
          <Text style={styles.emptyEmoji}>🛒</Text>
          <Text style={styles.emptyTitle}>Your basket is empty</Text>
          <Text style={styles.emptyBody}>Browse shops and add some products to get started.</Text>
          <Button label="Browse shops" variant="outline" onPress={() => navigation.navigate("Tabs")} style={{ marginTop: 16 }} />
        </View>
      </SafeAreaView>
    );
  }

  const deliveryFee = shop.deliveryFee;
  const total = totals.subtotal + deliveryFee + SERVICE_FEE;
  const belowMin = totals.subtotal < shop.minOrder;

  return (
    <SafeAreaView style={styles.screen} edges={["bottom"]}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.shopRow}>
          <Text style={styles.shopEmoji}>{shop.emoji}</Text>
          <View style={{ flex: 1 }}>
            <Text style={styles.shopName}>{shop.name}</Text>
            <Text style={styles.shopArea}>{shop.area}</Text>
          </View>
          <Pressable onPress={clearCart} hitSlop={8}>
            <Trash2 color={C.red} size={20} />
          </Pressable>
        </View>

        <View style={styles.card}>
          {cart.map((line) => {
            const p = productById(line.productId);
            if (!p) return null;
            return (
              <View key={line.productId} style={styles.line}>
                <ImageBackground source={productImage(p.id)} style={styles.lineThumb} imageStyle={styles.lineThumbImg}>
                  <Text style={styles.lineEmoji}>{p.emoji}</Text>
                </ImageBackground>
                <View style={{ flex: 1 }}>
                  <Text style={styles.lineName}>{p.name}</Text>
                  <Text style={styles.linePrice}>{fmt(p.price)}</Text>
                </View>
                <View style={styles.stepper}>
                  <Pressable style={styles.stepBtn} onPress={() => setQty(line.productId, line.qty - 1)} hitSlop={6}>
                    <Text style={styles.stepText}>−</Text>
                  </Pressable>
                  <Text style={styles.qty}>{line.qty}</Text>
                  <Pressable style={styles.stepBtn} onPress={() => setQty(line.productId, line.qty + 1)} hitSlop={6}>
                    <Text style={styles.stepText}>+</Text>
                  </Pressable>
                </View>
              </View>
            );
          })}
        </View>

        <View style={styles.card}>
          <Row label="Subtotal" value={fmt(totals.subtotal)} />
          <Row label="Delivery fee" value={fmt(deliveryFee)} />
          <Row label="Service fee" value={fmt(SERVICE_FEE)} />
          <View style={styles.divider} />
          <Row label="Total" value={fmt(total)} bold />
        </View>

        {belowMin ? (
          <Text style={styles.minWarn}>
            Add {fmt(shop.minOrder - totals.subtotal)} more to reach the {fmt(shop.minOrder)} minimum order.
          </Text>
        ) : null}
      </ScrollView>

      <View style={styles.footer}>
        <Button
          label="Go to checkout"
          right={fmt(total)}
          disabled={belowMin}
          onPress={() => navigation.navigate("Checkout")}
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
  content: { padding: 16, gap: 14, paddingBottom: 24 },
  shopRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  shopEmoji: { fontSize: 32 },
  shopName: { color: C.text, fontSize: 18, fontWeight: "800" },
  shopArea: { color: C.mute, fontSize: 13 },
  card: { backgroundColor: C.panel, borderRadius: 14, borderWidth: 1, borderColor: C.line, padding: 14 },
  line: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 8 },
  lineThumb: { width: 44, height: 44, borderRadius: 10, overflow: "hidden", alignItems: "center", justifyContent: "center", backgroundColor: C.greenSoft },
  lineThumbImg: { borderRadius: 10, resizeMode: "cover" },
  lineEmoji: { fontSize: 24, textShadowColor: "rgba(0,0,0,0.2)", textShadowRadius: 4 },
  lineName: { color: C.text, fontSize: 15, fontWeight: "700" },
  linePrice: { color: C.mute, fontSize: 13, marginTop: 2 },
  stepper: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: C.greenSoft,
    borderRadius: 18,
    paddingHorizontal: 4,
    gap: 4,
  },
  stepBtn: { width: 30, height: 32, alignItems: "center", justifyContent: "center" },
  stepText: { color: C.green, fontSize: 20, fontWeight: "800" },
  qty: { color: C.text, fontSize: 15, fontWeight: "800", minWidth: 18, textAlign: "center" },
  row: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 5 },
  rowLabel: { color: C.mute, fontSize: 14 },
  rowValue: { color: C.text, fontSize: 14, fontWeight: "600" },
  bold: { color: C.text, fontSize: 17, fontWeight: "800" },
  divider: { height: 1, backgroundColor: C.line, marginVertical: 8 },
  minWarn: { color: C.red, fontSize: 13, textAlign: "center" },
  footer: { padding: 16, borderTopWidth: 1, borderTopColor: C.line, backgroundColor: C.bg },
  emptyWrap: { flex: 1, alignItems: "center", justifyContent: "center", padding: 32 },
  emptyEmoji: { fontSize: 56, marginBottom: 12 },
  emptyTitle: { color: C.text, fontSize: 20, fontWeight: "800" },
  emptyBody: { color: C.mute, fontSize: 14, textAlign: "center", marginTop: 6 },
});
