import React from "react";
import { ImageBackground, Pressable, StyleSheet, Text, View } from "react-native";
import Stars from "./Stars";
import { Shop } from "../lib/types";
import { shopImage } from "../lib/images";
import { distanceLabel, etaLabel, fmt } from "../lib/format";
import { C } from "../lib/theme";

export default function ShopCard({ shop, onPress }: { shop: Shop; onPress: () => void }) {
  return (
    <Pressable
      style={({ pressed }) => [styles.card, pressed && { opacity: 0.9 }]}
      onPress={onPress}
    >
      <ImageBackground source={shopImage(shop.id)} style={styles.banner} imageStyle={styles.bannerImg}>
        <Text style={styles.bannerEmoji}>{shop.emoji}</Text>
        {shop.featured ? (
          <View style={styles.badge}>
            <Text style={styles.badgeText}>FEATURED</Text>
          </View>
        ) : null}
        {!shop.open ? (
          <View style={styles.closedOverlay}>
            <Text style={styles.closedText}>Closed</Text>
          </View>
        ) : null}
      </ImageBackground>
      <View style={styles.body}>
        <View style={styles.titleRow}>
          <Text style={styles.name} numberOfLines={1}>
            {shop.name}
          </Text>
          <Stars rating={shop.rating} count={shop.ratingCount} />
        </View>
        <Text style={styles.tagline} numberOfLines={1}>
          {shop.tagline}
        </Text>
        <View style={styles.metaRow}>
          <Text style={styles.meta}>{etaLabel(shop.etaMin, shop.etaMax)}</Text>
          <Text style={styles.dot}>·</Text>
          <Text style={styles.meta}>{distanceLabel(shop.distanceKm)}</Text>
          <Text style={styles.dot}>·</Text>
          <Text style={styles.meta}>{fmt(shop.deliveryFee)} delivery</Text>
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: C.panel,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: C.line,
    overflow: "hidden",
  },
  banner: {
    height: 110,
    backgroundColor: C.greenSoft,
    alignItems: "center",
    justifyContent: "center",
  },
  bannerImg: { resizeMode: "cover" },
  bannerEmoji: { fontSize: 56, textShadowColor: "rgba(0,0,0,0.25)", textShadowRadius: 6 },
  badge: {
    position: "absolute",
    top: 10,
    left: 10,
    backgroundColor: C.green,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  badgeText: { color: C.onGreen, fontSize: 10, fontWeight: "800", letterSpacing: 0.5 },
  closedOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(30,37,34,0.45)",
    alignItems: "center",
    justifyContent: "center",
  },
  closedText: { color: "#fff", fontWeight: "800", fontSize: 16, letterSpacing: 1 },
  body: { padding: 14, gap: 4 },
  titleRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 },
  name: { color: C.text, fontSize: 16, fontWeight: "800", flexShrink: 1 },
  tagline: { color: C.mute, fontSize: 13 },
  metaRow: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 4 },
  meta: { color: C.text, fontSize: 12, fontWeight: "600" },
  dot: { color: C.mute, fontSize: 12 },
});
