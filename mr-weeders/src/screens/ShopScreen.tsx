import React, { useLayoutEffect, useMemo } from "react";
import { Alert, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { RouteProp, useNavigation, useRoute } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import Stars from "../components/Stars";
import ProductRow from "../components/ProductRow";
import Button from "../components/Button";
import { CATEGORIES } from "../lib/data";
import { productsForShop, shopById } from "../lib/data";
import { useStore } from "../lib/StoreContext";
import { distanceLabel, etaLabel, fmt } from "../lib/format";
import { C } from "../lib/theme";
import { RootStackParamList } from "../navigation/routes";

export default function ShopScreen() {
  const route = useRoute<RouteProp<RootStackParamList, "Shop">>();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { shopId } = route.params;
  const shop = shopById(shopId);
  const { cart, cartShopId, totals, addToCart, setQty } = useStore();

  useLayoutEffect(() => {
    navigation.setOptions({ title: shop?.name ?? "Shop" });
  }, [navigation, shop]);

  const products = useMemo(() => productsForShop(shopId), [shopId]);
  const grouped = useMemo(
    () => CATEGORIES.map((c) => ({ category: c, items: products.filter((p) => p.category === c) })).filter((g) => g.items.length),
    [products]
  );

  function qtyFor(productId: string): number {
    if (cartShopId !== shopId) return 0;
    return cart.find((l) => l.productId === productId)?.qty ?? 0;
  }

  async function handleAdd(productId: string) {
    const res = await addToCart(productId, shopId);
    if (res.replaced) {
      Alert.alert("Basket cleared", "Your basket can only contain items from one shop, so we started a new one.");
    }
  }

  if (!shop) {
    return (
      <SafeAreaView style={styles.screen}>
        <Text style={styles.empty}>Shop not found.</Text>
      </SafeAreaView>
    );
  }

  const basketActive = cartShopId === shopId && totals.count > 0;

  return (
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.hero}>
          <Text style={styles.heroEmoji}>{shop.emoji}</Text>
        </View>
        <View style={styles.headerBlock}>
          <Text style={styles.name}>{shop.name}</Text>
          <Text style={styles.tagline}>{shop.tagline}</Text>
          <View style={styles.metaRow}>
            <Stars rating={shop.rating} count={shop.ratingCount} />
            <Text style={styles.dot}>·</Text>
            <Text style={styles.meta}>{shop.area}</Text>
          </View>
          <View style={styles.infoStrip}>
            <View style={styles.infoCell}>
              <Text style={styles.infoLabel}>Delivery</Text>
              <Text style={styles.infoValue}>{etaLabel(shop.etaMin, shop.etaMax)}</Text>
            </View>
            <View style={styles.infoCell}>
              <Text style={styles.infoLabel}>Distance</Text>
              <Text style={styles.infoValue}>{distanceLabel(shop.distanceKm)}</Text>
            </View>
            <View style={styles.infoCell}>
              <Text style={styles.infoLabel}>Fee</Text>
              <Text style={styles.infoValue}>{fmt(shop.deliveryFee)}</Text>
            </View>
            <View style={styles.infoCell}>
              <Text style={styles.infoLabel}>Min order</Text>
              <Text style={styles.infoValue}>{fmt(shop.minOrder)}</Text>
            </View>
          </View>
          {!shop.open ? (
            <View style={styles.closedBanner}>
              <Text style={styles.closedText}>This shop is currently closed — you can browse but not order.</Text>
            </View>
          ) : null}
        </View>

        {grouped.map((g) => (
          <View key={g.category} style={styles.section}>
            <Text style={styles.sectionTitle}>{g.category}</Text>
            {g.items.map((p) => (
              <ProductRow
                key={p.id}
                product={p}
                qty={qtyFor(p.id)}
                onAdd={() => handleAdd(p.id)}
                onInc={() => setQty(p.id, qtyFor(p.id) + 1)}
                onDec={() => setQty(p.id, qtyFor(p.id) - 1)}
              />
            ))}
          </View>
        ))}
      </ScrollView>

      {basketActive && shop.open ? (
        <SafeAreaView edges={["bottom"]} style={styles.basketBar}>
          <Button
            label={`View basket · ${totals.count} item${totals.count === 1 ? "" : "s"}`}
            right={fmt(totals.subtotal)}
            onPress={() => navigation.navigate("Cart")}
          />
        </SafeAreaView>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.bg },
  content: { paddingBottom: 120 },
  hero: { height: 140, backgroundColor: C.greenSoft, alignItems: "center", justifyContent: "center" },
  heroEmoji: { fontSize: 72 },
  headerBlock: { padding: 16, gap: 6, borderBottomWidth: 8, borderBottomColor: C.panel2 },
  name: { color: C.text, fontSize: 24, fontWeight: "900" },
  tagline: { color: C.mute, fontSize: 14 },
  metaRow: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 4 },
  meta: { color: C.text, fontSize: 13, fontWeight: "600" },
  dot: { color: C.mute },
  infoStrip: {
    flexDirection: "row",
    marginTop: 12,
    backgroundColor: C.panel,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: C.line,
    paddingVertical: 12,
  },
  infoCell: { flex: 1, alignItems: "center", gap: 2 },
  infoLabel: { color: C.mute, fontSize: 11, fontWeight: "600" },
  infoValue: { color: C.text, fontSize: 13, fontWeight: "800" },
  closedBanner: { marginTop: 12, backgroundColor: C.panel2, borderRadius: 10, padding: 12 },
  closedText: { color: C.mute, fontSize: 13 },
  section: { paddingHorizontal: 16, paddingTop: 8 },
  sectionTitle: { color: C.text, fontSize: 18, fontWeight: "800", marginTop: 8 },
  basketBar: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 16,
    paddingTop: 10,
    backgroundColor: C.bg,
    borderTopWidth: 1,
    borderTopColor: C.line,
  },
  empty: { color: C.mute, textAlign: "center", marginTop: 40 },
});
