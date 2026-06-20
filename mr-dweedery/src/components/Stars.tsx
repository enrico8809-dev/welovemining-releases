import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { C } from "../lib/theme";

export default function Stars({ rating, count }: { rating: number; count?: number }) {
  return (
    <View style={styles.row}>
      <Text style={styles.star}>★</Text>
      <Text style={styles.rating}>{rating.toFixed(1)}</Text>
      {count != null ? <Text style={styles.count}>({count.toLocaleString("en-ZA")})</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: 4 },
  star: { color: C.amber, fontSize: 13 },
  rating: { color: C.text, fontSize: 13, fontWeight: "700" },
  count: { color: C.mute, fontSize: 12 },
});
