import React, { useMemo, useState } from "react";
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { RouteProp, useNavigation, useRoute } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { Minus, Plus, TrendingUp } from "lucide-react-native";
import Header from "../components/Header";
import Card from "../components/Card";
import Button from "../components/Button";
import Field from "../components/Field";
import DateField from "../components/DateField";
import { useToast } from "../components/Toast";
import { useLedger } from "../lib/LedgerContext";
import {
  computeLandedCost,
  computeStockLevels,
  newMovementId,
  StockMovement,
  suggestedPrice,
} from "../lib/inventory";
import { categoryLabel, findProduct, productLabel, unitPriceUsd } from "../lib/catalogue";
import { abs, fmt, todayISO } from "../lib/format";
import { C, R, S, T } from "../lib/theme";
import { RootStackParamList } from "../navigation/routes";
import * as haptics from "../lib/haptics";

type DetailRoute = RouteProp<RootStackParamList, "ProductDetail">;

export default function ProductDetailScreen() {
  const nav = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const route = useRoute<DetailRoute>();
  const toast = useToast();
  const { settings, movements, addMovement } = useLedger();

  const product = findProduct(route.params.productId);
  const [qty, setQty] = useState(1);
  const [hashrate, setHashrate] = useState<string>(
    product?.hashrate ? String(product.hashrate) : ""
  );
  const [date, setDate] = useState(todayISO());
  const [saving, setSaving] = useState(false);

  const level = useMemo(
    () => computeStockLevels(movements).get(route.params.productId),
    [movements, route.params.productId]
  );

  const productMovements = useMemo(
    () =>
      movements
        .filter((m) => m.productId === route.params.productId)
        .sort((a, b) => (a.date < b.date ? 1 : -1))
        .slice(0, 12),
    [movements, route.params.productId]
  );

  if (!product) {
    return (
      <View style={styles.screen}>
        <Header title="NOT FOUND" onBack={() => nav.goBack()} />
        <Text style={styles.missing}>That product is no longer in the price list.</Text>
      </View>
    );
  }

  const hashOverride = product.priceMode === "perTerahash" ? Number(hashrate) || undefined : undefined;
  const cost = computeLandedCost(product, qty, settings.landedCost, hashOverride);
  const onHand = level?.qty ?? 0;
  const suggested = suggestedPrice(cost.perUnitZar, settings.targetMarginPct);

  const rateMissing = !settings.landedCost.usdZarRate;

  const stockIn = async () => {
    if (rateMissing) {
      toast.show("Set the USD/ZAR rate in Settings first", "error");
      return;
    }
    setSaving(true);
    const movement: StockMovement = {
      id: newMovementId(),
      productId: product.id,
      kind: "in",
      qty,
      date,
      valueZar: cost.totalZar,
      note: `$${abs(cost.totalUsd)} @ ${settings.landedCost.usdZarRate}`,
    };
    await addMovement(movement);
    setSaving(false);
    toast.show(`Added ${qty} × ${productLabel(product)} at ${fmt(cost.totalZar)}`);
    nav.goBack();
  };

  const stockOut = (kind: "out" | "writeoff") => {
    if (onHand <= 0) {
      toast.show("No stock on hand to remove", "error");
      return;
    }
    const take = Math.min(qty, onHand);
    const value = (level?.avgCostZar ?? 0) * take;

    Alert.alert(
      kind === "out" ? "Mark as sold?" : "Write off stock?",
      kind === "out"
        ? `Releases ${fmt(value)} from Inventory to Cost of Sales for ${take} unit${take === 1 ? "" : "s"}.`
        : `Writes ${fmt(value)} off Inventory to General Expenses.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: kind === "out" ? "Mark sold" : "Write off",
          style: kind === "out" ? "default" : "destructive",
          onPress: async () => {
            haptics.success();
            await addMovement({
              id: newMovementId(),
              productId: product.id,
              kind,
              qty: take,
              date,
              valueZar: value,
            });
            toast.show(
              kind === "out"
                ? `${take} sold — cost moved to Cost of Sales`
                : `${take} written off`
            );
            nav.goBack();
          },
        },
      ]
    );
  };

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Header
        title={productLabel(product).toUpperCase()}
        subtitle={`${categoryLabel(product.category)} · ${product.supplier}`}
        onBack={() => nav.goBack()}
      />

      <View style={styles.body}>
        <Card index={0}>
          <View style={styles.headRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.label}>SUPPLIER PRICE</Text>
              <Text style={styles.usd}>
                ${abs(unitPriceUsd(product, hashOverride))}
              </Text>
              <Text style={styles.note}>
                {product.priceMode === "perTerahash"
                  ? `$${product.priceUsd}${product.priceUsdMax ? `–${product.priceUsdMax}` : ""}/T`
                  : "Flat unit price"}
                {product.watts ? ` · ${product.watts}${product.wattsMax ? `–${product.wattsMax}` : ""}W/T` : ""}
                {product.region === "USA" ? " · USA stock" : " · Hong Kong"}
              </Text>
            </View>
            <View style={[styles.stockBadge, onHand > 0 && styles.stockBadgeOn]}>
              <Text style={[styles.stockQty, onHand > 0 && { color: C.green }]}>{onHand}</Text>
              <Text style={styles.stockLabel}>ON HAND</Text>
            </View>
          </View>
          {!!product.note && <Text style={styles.productNote}>{product.note}</Text>}
          {!product.warranty && (
            <Text style={styles.warning}>Out of warranty — price reflects this.</Text>
          )}
        </Card>

        {product.priceMode === "perTerahash" && (
          <Card index={1} title="HASHRATE">
            <Text style={styles.note}>
              Price is per terahash, so the unit's actual hashrate sets the cost.
              {product.hashrateMax ? ` Supplier offers ${product.hashrate}–${product.hashrateMax}T.` : ""}
            </Text>
            <View style={{ height: S.md }} />
            <Field
              label="TERAHASH PER UNIT"
              value={hashrate}
              onChangeText={setHashrate}
              keyboardType="decimal-pad"
              mono
            />
          </Card>
        )}

        <Card index={2} title="QUANTITY">
          <View style={styles.qtyRow}>
            <Pressable
              style={styles.qtyBtn}
              onPress={() => {
                haptics.tap();
                setQty(Math.max(1, qty - 1));
              }}
            >
              <Minus color={C.text} size={18} />
            </Pressable>
            <Text style={styles.qtyValue}>{qty}</Text>
            <Pressable
              style={styles.qtyBtn}
              onPress={() => {
                haptics.tap();
                setQty(qty + 1);
              }}
            >
              <Plus color={C.text} size={18} />
            </Pressable>
          </View>
          <Text style={styles.shipNote}>
            Shipping is tiered: ${settings.landedCost.shippingTiers
              .map((t) => `${t.totalUsd} for ${t.upToQty}`)
              .join(", $")}
            , then ${settings.landedCost.extraShippingPerUnitUsd} per extra unit.
          </Text>
        </Card>

        <Card index={3} title="LANDED COST" accent="orange">
          {rateMissing ? (
            <Text style={styles.warning}>
              Set the USD/ZAR rate in Settings before costing stock.
            </Text>
          ) : (
            <>
              <CostRow label={`Goods (${qty} × $${abs(cost.unitUsd)})`} value={`$${abs(cost.goodsUsd)}`} />
              <CostRow label="Shipping" value={`$${abs(cost.shippingUsd)}`} />
              <CostRow label="Total USD" value={`$${abs(cost.totalUsd)}`} strong />
              <View style={styles.divider} />
              <CostRow
                label={`Converted @ R${settings.landedCost.usdZarRate}`}
                value={fmt(cost.totalUsd * settings.landedCost.usdZarRate)}
              />
              {cost.clearingZar > 0 && (
                <CostRow label="Clearing" value={fmt(cost.clearingZar)} />
              )}
              <View style={styles.divider} />
              <CostRow label="Total landed" value={fmt(cost.totalZar)} strong />
              <CostRow label="Per unit" value={fmt(cost.perUnitZar)} strong accent />
              <Text style={styles.dutyNote}>
                No customs duty on this class of electronics. Import VAT excluded while
                not VAT-registered.
              </Text>
            </>
          )}
        </Card>

        <Card index={4} title="SUGGESTED SELLING PRICE">
          <View style={styles.sellRow}>
            <TrendingUp color={C.green} size={18} />
            <View style={{ flex: 1 }}>
              <Text style={styles.sellValue}>{fmt(suggested)}</Text>
              <Text style={styles.note}>
                At {settings.targetMarginPct}% gross margin · {fmt(suggested - cost.perUnitZar)} profit
                per unit
              </Text>
            </View>
          </View>
        </Card>

        <Card index={5} title="MOVEMENT DATE">
          <DateField value={date} onChange={setDate} />
        </Card>

        <Button
          label={`Add ${qty} to stock`}
          onPress={stockIn}
          loading={saving}
          size="lg"
          icon={<Plus color={C.bg} size={18} />}
        />
        {onHand > 0 && (
          <>
            <Button
              label={`Mark ${Math.min(qty, onHand)} as sold`}
              variant="secondary"
              onPress={() => stockOut("out")}
            />
            <Button label="Write off" variant="danger" onPress={() => stockOut("writeoff")} />
          </>
        )}

        {productMovements.length > 0 && (
          <Card index={6} title="RECENT MOVEMENTS">
            {productMovements.map((m) => (
              <View key={m.id} style={styles.movementRow}>
                <View
                  style={[
                    styles.movementDot,
                    { backgroundColor: m.kind === "in" ? C.green : m.kind === "out" ? C.orange : C.red },
                  ]}
                />
                <Text style={styles.movementText}>
                  {m.kind === "in" ? "In" : m.kind === "out" ? "Sold" : "Write-off"} · {m.qty} unit
                  {m.qty === 1 ? "" : "s"}
                </Text>
                <Text style={styles.movementDate}>{m.date}</Text>
                <Text style={styles.movementValue}>{fmt(m.valueZar)}</Text>
              </View>
            ))}
          </Card>
        )}
      </View>
    </ScrollView>
  );
}

function CostRow({
  label,
  value,
  strong,
  accent,
}: {
  label: string;
  value: string;
  strong?: boolean;
  accent?: boolean;
}) {
  return (
    <View style={styles.costRow}>
      <Text style={[styles.costLabel, strong && styles.costLabelStrong]}>{label}</Text>
      <Text
        style={[
          styles.costValue,
          strong && styles.costValueStrong,
          accent && { color: C.orange },
        ]}
      >
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.bg },
  content: { paddingBottom: S.huge },
  body: { paddingHorizontal: S.lg, gap: S.lg },
  missing: { ...T.body, color: C.mute, padding: S.lg },
  headRow: { flexDirection: "row", gap: S.md },
  label: { ...T.label, color: C.mute },
  usd: { ...T.hero, fontSize: 30, color: C.text, marginTop: S.xs },
  note: { ...T.caption, color: C.mute, marginTop: S.xs, lineHeight: 16 },
  productNote: { ...T.small, color: C.textDim, marginTop: S.md },
  warning: { ...T.small, color: C.amber, marginTop: S.sm },
  stockBadge: {
    width: 64,
    height: 64,
    borderRadius: R.md,
    backgroundColor: C.panel2,
    borderWidth: 1,
    borderColor: C.line,
    alignItems: "center",
    justifyContent: "center",
  },
  stockBadgeOn: { borderColor: C.green },
  stockQty: { ...T.amountLg, color: C.mute },
  stockLabel: { ...T.label, fontSize: 8, color: C.mute },
  qtyRow: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: S.xl },
  qtyBtn: {
    width: 46,
    height: 46,
    borderRadius: R.md,
    backgroundColor: C.panel2,
    borderWidth: 1,
    borderColor: C.line,
    alignItems: "center",
    justifyContent: "center",
  },
  qtyValue: { ...T.hero, fontSize: 32, color: C.text, minWidth: 60, textAlign: "center" },
  shipNote: { ...T.caption, color: C.mute, marginTop: S.md, lineHeight: 16 },
  costRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 4 },
  costLabel: { ...T.small, color: C.mute, flex: 1 },
  costLabelStrong: { color: C.text, fontFamily: T.bodyBold.fontFamily },
  costValue: { ...T.amountSm, color: C.textDim },
  costValueStrong: { ...T.amount, color: C.text },
  divider: { height: 1, backgroundColor: C.line, marginVertical: S.sm },
  dutyNote: { ...T.caption, color: C.mute, marginTop: S.md, lineHeight: 16 },
  sellRow: { flexDirection: "row", alignItems: "center", gap: S.md },
  sellValue: { ...T.amountLg, color: C.green },
  movementRow: { flexDirection: "row", alignItems: "center", gap: S.sm, paddingVertical: S.sm },
  movementDot: { width: 7, height: 7, borderRadius: 3.5 },
  movementText: { ...T.small, color: C.text, flex: 1 },
  movementDate: { ...T.caption, color: C.mute },
  movementValue: { ...T.amountSm, color: C.textDim, minWidth: 84, textAlign: "right" },
});
