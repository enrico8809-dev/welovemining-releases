import React, { useMemo, useState } from "react";
import { FlatList, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { useNavigation } from "@react-navigation/native";
import { Boxes, ChevronRight, Package, Plus, Search, X } from "lucide-react-native";
import Header from "../components/Header";
import StatTile from "../components/StatTile";
import SegmentedControl from "../components/SegmentedControl";
import EmptyState from "../components/EmptyState";
import Button from "../components/Button";
import { useLedger } from "../lib/LedgerContext";
import { computeStockLevels, summariseInventory } from "../lib/inventory";
import { findProduct, productLabel, categoryLabel } from "../lib/catalogue";
import { fmt } from "../lib/format";
import { C, R, S, T } from "../lib/theme";
import { TabScreenNavigation } from "../navigation/routes";

type View_ = "onhand" | "catalogue";

const VIEWS: { id: View_; label: string }[] = [
  { id: "onhand", label: "On hand" },
  { id: "catalogue", label: "Price list" },
];

export default function StockScreen() {
  const nav = useNavigation<TabScreenNavigation<"Stock">>();
  const { movements } = useLedger();
  const [view, setView] = useState<View_>("onhand");
  const [query, setQuery] = useState("");

  const summary = useMemo(() => summariseInventory(movements), [movements]);

  const onHand = useMemo(() => {
    const levels = [...computeStockLevels(movements).values()].filter((l) => l.qty > 0);
    const q = query.trim().toLowerCase();
    return levels
      .map((l) => ({ level: l, product: findProduct(l.productId) }))
      .filter(({ product }) => {
        if (!q) return true;
        return product ? productLabel(product).toLowerCase().includes(q) : false;
      })
      .sort((a, b) => b.level.valueZar - a.level.valueZar);
  }, [movements, query]);

  return (
    <View style={styles.screen}>
      <Header
        title="STOCK"
        subtitle={`${summary.totalUnits} unit${summary.totalUnits === 1 ? "" : "s"} on hand`}
        action={
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Add stock"
            hitSlop={10}
            onPress={() => nav.navigate("Catalogue", { mode: "stock-in" })}
            style={styles.addBtn}
          >
            <Plus color={C.bg} size={20} />
          </Pressable>
        }
      />

      <View style={styles.top}>
        <View style={styles.stats}>
          <StatTile label="STOCK VALUE" value={fmt(summary.totalValueZar)} compact />
          <StatTile
            label="LINES"
            value={String(summary.productCount)}
            compact
            color={C.textDim}
          />
        </View>

        <SegmentedControl options={VIEWS} value={view} onChange={setView} />

        {view === "onhand" && (
          <View style={styles.searchField}>
            <Search color={C.mute} size={17} />
            <TextInput
              value={query}
              onChangeText={setQuery}
              placeholder="Search stock on hand"
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
        )}
      </View>

      {view === "catalogue" ? (
        <View style={styles.cataloguePrompt}>
          <EmptyState
            icon={<Package color={C.mute} size={28} />}
            title="Supplier price list"
            body="Browse every miner from LeedMiner and Letine, with landed cost worked out in Rand including shipping and clearing."
            actionLabel="Open price list"
            onAction={() => nav.navigate("Catalogue", { mode: "browse" })}
          />
        </View>
      ) : (
        <FlatList
          data={onHand}
          keyExtractor={(row) => row.level.productId}
          contentContainerStyle={styles.list}
          ItemSeparatorComponent={() => <View style={styles.sep} />}
          showsVerticalScrollIndicator={false}
          renderItem={({ item }) => (
            <Pressable
              onPress={() =>
                nav.navigate("ProductDetail", { productId: item.level.productId })
              }
              style={({ pressed }) => [styles.row, pressed && styles.pressed]}
            >
              <View style={styles.qtyBadge}>
                <Text style={styles.qtyText}>{item.level.qty}</Text>
              </View>
              <View style={styles.rowMain}>
                <Text style={styles.name} numberOfLines={1}>
                  {item.product ? productLabel(item.product) : item.level.productId}
                </Text>
                <Text style={styles.meta} numberOfLines={1}>
                  {item.product
                    ? `${categoryLabel(item.product.category)} · ${item.product.supplier}`
                    : "Unknown product"}
                  {" · "}
                  {fmt(item.level.avgCostZar)} each
                </Text>
              </View>
              <View style={styles.valueCol}>
                <Text style={styles.value}>{fmt(item.level.valueZar)}</Text>
                <ChevronRight color={C.mute} size={14} />
              </View>
            </Pressable>
          )}
          ListEmptyComponent={
            <EmptyState
              icon={<Boxes color={C.mute} size={28} />}
              title={query ? "Nothing matches" : "No stock on hand"}
              body={
                query
                  ? "Try a different search."
                  : "Add stock from the price list. Buying stock posts Dr Inventory / Cr Bank at landed cost — it isn't an expense until you sell it."
              }
              actionLabel={query ? undefined : "Add stock"}
              onAction={query ? undefined : () => nav.navigate("Catalogue", { mode: "stock-in" })}
            />
          }
        />
      )}

      {view === "onhand" && onHand.length > 0 && (
        <View style={styles.footer}>
          <Button
            label="Add stock"
            onPress={() => nav.navigate("Catalogue", { mode: "stock-in" })}
            icon={<Plus color={C.bg} size={18} />}
          />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.bg },
  addBtn: {
    width: 38,
    height: 38,
    borderRadius: R.md,
    backgroundColor: C.orange,
    alignItems: "center",
    justifyContent: "center",
  },
  top: { paddingHorizontal: S.lg, gap: S.md, paddingBottom: S.md },
  stats: { flexDirection: "row", gap: S.md },
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
  cataloguePrompt: { flex: 1 },
  list: { paddingHorizontal: S.lg, paddingBottom: S.huge, flexGrow: 1 },
  sep: { height: 1, backgroundColor: C.line },
  row: { flexDirection: "row", alignItems: "center", gap: S.md, paddingVertical: S.md },
  pressed: { backgroundColor: C.panel },
  qtyBadge: {
    minWidth: 36,
    height: 36,
    borderRadius: R.sm,
    paddingHorizontal: S.sm,
    backgroundColor: C.panel2,
    borderWidth: 1,
    borderColor: C.orange,
    alignItems: "center",
    justifyContent: "center",
  },
  qtyText: { ...T.amount, color: C.orange },
  rowMain: { flex: 1 },
  name: { ...T.bodyBold, color: C.text },
  meta: { ...T.caption, color: C.mute, marginTop: 3 },
  valueCol: { flexDirection: "row", alignItems: "center", gap: S.xs },
  value: { ...T.amountSm, color: C.text },
  footer: {
    padding: S.lg,
    borderTopWidth: 1,
    borderTopColor: C.line,
    backgroundColor: C.bg,
  },
});
