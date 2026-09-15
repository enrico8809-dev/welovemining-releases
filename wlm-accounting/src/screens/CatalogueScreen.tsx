import React, { useMemo, useState } from "react";
import { FlatList, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { RouteProp, useNavigation, useRoute } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { Search, X } from "lucide-react-native";
import Header from "../components/Header";
import SegmentedControl from "../components/SegmentedControl";
import { useLedger } from "../lib/LedgerContext";
import {
  CATEGORIES,
  Category,
  Product,
  productLabel,
  searchCatalogue,
  unitPriceUsd,
} from "../lib/catalogue";
import { computeLandedCost, computeStockLevels } from "../lib/inventory";
import { fmt, fmtWhole } from "../lib/format";
import { C, R, S, T } from "../lib/theme";
import { RootStackParamList } from "../navigation/routes";

type CatalogueRoute = RouteProp<RootStackParamList, "Catalogue">;

type Filter = Category | "all";

export default function CatalogueScreen() {
  const nav = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const route = useRoute<CatalogueRoute>();
  const { settings, movements } = useLedger();

  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");

  const mode = route.params?.mode ?? "browse";
  const levels = useMemo(() => computeStockLevels(movements), [movements]);

  const results = useMemo(
    () => searchCatalogue(query, filter === "all" ? undefined : filter),
    [query, filter]
  );

  const filters: { id: Filter; label: string }[] = [
    { id: "all", label: "All" },
    ...CATEGORIES.map((c) => ({ id: c.id as Filter, label: c.label })),
  ];

  return (
    <View style={styles.screen}>
      <Header
        title="PRICE LIST"
        subtitle={`${results.length} product${results.length === 1 ? "" : "s"}`}
        onBack={() => nav.goBack()}
      />

      <View style={styles.top}>
        <View style={styles.searchField}>
          <Search color={C.mute} size={17} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Search miners, e.g. S21 or L9"
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
        <SegmentedControl options={filters} value={filter} onChange={setFilter} scrollable />
      </View>

      <FlatList
        data={results}
        keyExtractor={(p) => p.id}
        contentContainerStyle={styles.list}
        ItemSeparatorComponent={() => <View style={styles.sep} />}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        renderItem={({ item }) => (
          <ProductRow
            product={item}
            onHand={levels.get(item.id)?.qty ?? 0}
            landedPerUnit={
              computeLandedCost(item, 1, settings.landedCost).perUnitZar
            }
            onPress={() => {
              // Picking for a document line hands the product straight back to
              // the editor rather than detouring through the detail screen.
              //
              // popTo, not navigate: in React Navigation 7 navigate only reuses
              // a route when it is the *current* one, so navigating back to the
              // editor would push a brand-new one — a fresh, empty invoice —
              // and abandon the half-typed document underneath it.
              if (mode === "line-item") {
                nav.popTo(
                  "DocEditor",
                  {
                    kind: route.params?.docKind ?? "invoice",
                    docId: route.params?.docId,
                    pickedProductId: item.id,
                  },
                  { merge: true }
                );
                return;
              }
              nav.navigate("ProductDetail", {
                productId: item.id,
                mode: mode === "stock-in" ? "stock-in" : undefined,
              });
            }}
          />
        )}
        ListEmptyComponent={
          <Text style={styles.empty}>No products match that search.</Text>
        }
      />
    </View>
  );
}

function ProductRow({
  product,
  onHand,
  landedPerUnit,
  onPress,
}: {
  product: Product;
  onHand: number;
  landedPerUnit: number;
  onPress: () => void;
}) {
  const usd = unitPriceUsd(product);
  const perT = product.priceMode === "perTerahash";

  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.row, pressed && styles.pressed]}>
      <View style={styles.rowMain}>
        <View style={styles.nameRow}>
          <Text style={styles.name} numberOfLines={1}>
            {productLabel(product)}
          </Text>
          {!product.warranty && (
            <View style={styles.noWarranty}>
              <Text style={styles.noWarrantyText}>NO WTY</Text>
            </View>
          )}
          {onHand > 0 && (
            <View style={styles.stockPill}>
              <Text style={styles.stockPillText}>{onHand} in stock</Text>
            </View>
          )}
        </View>
        <Text style={styles.meta} numberOfLines={1}>
          {product.supplier}
          {product.region === "USA" ? " · USA" : ""}
          {perT ? ` · $${product.priceUsd}/T` : ""}
          {product.note ? ` · ${product.note}` : ""}
        </Text>
      </View>

      <View style={styles.priceCol}>
        <Text style={styles.usd}>
          {usd > 0 ? `$${fmtWhole(usd)}` : "—"}
        </Text>
        <Text style={styles.landed}>
          {landedPerUnit > 0 ? fmt(landedPerUnit) : "set rate"}
        </Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.bg },
  top: { paddingHorizontal: S.lg, gap: S.md, paddingBottom: S.md },
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
  list: { paddingHorizontal: S.lg, paddingBottom: S.huge, flexGrow: 1 },
  sep: { height: 1, backgroundColor: C.line },
  row: { flexDirection: "row", alignItems: "center", gap: S.md, paddingVertical: S.md },
  pressed: { backgroundColor: C.panel },
  rowMain: { flex: 1 },
  nameRow: { flexDirection: "row", alignItems: "center", gap: S.sm, flexWrap: "wrap" },
  name: { ...T.bodyBold, color: C.text, flexShrink: 1 },
  noWarranty: {
    borderWidth: 1,
    borderColor: C.amber,
    borderRadius: R.sm,
    paddingHorizontal: 5,
    paddingVertical: 1,
  },
  noWarrantyText: { ...T.label, fontSize: 8, color: C.amber },
  stockPill: {
    backgroundColor: C.greenDim,
    borderRadius: R.sm,
    paddingHorizontal: 6,
    paddingVertical: 1,
  },
  stockPillText: { ...T.label, fontSize: 8, color: C.green },
  meta: { ...T.caption, color: C.mute, marginTop: 3 },
  priceCol: { alignItems: "flex-end" },
  usd: { ...T.amountSm, color: C.textDim },
  landed: { ...T.amount, color: C.orange, marginTop: 2 },
  empty: { ...T.small, color: C.mute, padding: S.lg, textAlign: "center" },
});
