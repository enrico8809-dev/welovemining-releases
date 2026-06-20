import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Product } from "../lib/types";
import { fmt } from "../lib/format";
import { C } from "../lib/theme";

interface ProductRowProps {
  product: Product;
  qty: number;
  onAdd: () => void;
  onInc: () => void;
  onDec: () => void;
}

export default function ProductRow({ product, qty, onAdd, onInc, onDec }: ProductRowProps) {
  return (
    <View style={styles.row}>
      <View style={styles.thumb}>
        <Text style={styles.thumbEmoji}>{product.emoji}</Text>
      </View>
      <View style={styles.info}>
        <Text style={styles.name}>{product.name}</Text>
        <Text style={styles.desc} numberOfLines={2}>
          {product.description}
        </Text>
        <View style={styles.tagRow}>
          {product.thc ? (
            <View style={styles.tag}>
              <Text style={styles.tagText}>{product.thc}</Text>
            </View>
          ) : null}
          {product.popular ? (
            <View style={[styles.tag, styles.popTag]}>
              <Text style={[styles.tagText, { color: C.green }]}>Popular</Text>
            </View>
          ) : null}
        </View>
        <Text style={styles.price}>{fmt(product.price)}</Text>
      </View>
      <View style={styles.actions}>
        {qty > 0 ? (
          <View style={styles.stepper}>
            <Pressable style={styles.stepBtn} onPress={onDec} hitSlop={6}>
              <Text style={styles.stepText}>−</Text>
            </Pressable>
            <Text style={styles.qty}>{qty}</Text>
            <Pressable style={styles.stepBtn} onPress={onInc} hitSlop={6}>
              <Text style={styles.stepText}>+</Text>
            </Pressable>
          </View>
        ) : (
          <Pressable style={styles.addBtn} onPress={onAdd} hitSlop={6}>
            <Text style={styles.addText}>＋</Text>
          </Pressable>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    gap: 12,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: C.line,
  },
  thumb: {
    width: 64,
    height: 64,
    borderRadius: 12,
    backgroundColor: C.greenSoft,
    alignItems: "center",
    justifyContent: "center",
  },
  thumbEmoji: { fontSize: 30 },
  info: { flex: 1, gap: 3 },
  name: { color: C.text, fontSize: 15, fontWeight: "700" },
  desc: { color: C.mute, fontSize: 13, lineHeight: 18 },
  tagRow: { flexDirection: "row", gap: 6, marginTop: 2 },
  tag: {
    backgroundColor: C.panel2,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  popTag: { backgroundColor: C.greenSoft },
  tagText: { color: C.mute, fontSize: 11, fontWeight: "700" },
  price: { color: C.text, fontSize: 15, fontWeight: "800", marginTop: 4 },
  actions: { justifyContent: "center" },
  addBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: C.green,
    alignItems: "center",
    justifyContent: "center",
  },
  addText: { color: C.onGreen, fontSize: 20, fontWeight: "700", lineHeight: 22 },
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
});
