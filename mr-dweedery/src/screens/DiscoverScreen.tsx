import React, { useMemo, useState } from "react";
import { FlatList, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { MapPin, Search } from "lucide-react-native";
import ShopCard from "../components/ShopCard";
import { CATEGORIES, CATEGORY_EMOJI, SHOPS } from "../lib/data";
import { useStore } from "../lib/StoreContext";
import { Category } from "../lib/types";
import { C } from "../lib/theme";
import { RootStackParamList } from "../navigation/routes";

export default function DiscoverScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { address } = useStore();
  const [query, setQuery] = useState("");
  const [activeCat, setActiveCat] = useState<Category | null>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return SHOPS.filter((s) => {
      const matchesQuery =
        !q || s.name.toLowerCase().includes(q) || s.area.toLowerCase().includes(q) || s.tagline.toLowerCase().includes(q);
      const matchesCat = !activeCat || s.categories.includes(activeCat);
      return matchesQuery && matchesCat;
    });
  }, [query, activeCat]);

  return (
    <SafeAreaView style={styles.screen} edges={["top"]}>
      <View style={styles.header}>
        <View style={styles.locationRow}>
          <MapPin color={C.green} size={16} />
          <Text style={styles.location} numberOfLines={1}>
            {address ? `Deliver to: ${address}` : "Set your delivery address"}
          </Text>
        </View>
        <Text style={styles.title}>Mr Dweedery</Text>
        <View style={styles.searchBox}>
          <Search color={C.mute} size={18} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Search shops, areas or strains"
            placeholderTextColor={C.mute}
            style={styles.searchInput}
          />
        </View>
      </View>

      <FlatList
        data={filtered}
        keyExtractor={(s) => s.id}
        ListHeaderComponent={
          <View>
            <FlatList
              data={CATEGORIES}
              keyExtractor={(c) => c}
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.chipRow}
              renderItem={({ item }) => {
                const active = activeCat === item;
                return (
                  <Pressable
                    style={[styles.chip, active && styles.chipActive]}
                    onPress={() => setActiveCat(active ? null : item)}
                  >
                    <Text style={styles.chipEmoji}>{CATEGORY_EMOJI[item]}</Text>
                    <Text style={[styles.chipText, active && styles.chipTextActive]}>{item}</Text>
                  </Pressable>
                );
              }}
            />
            <Text style={styles.sectionTitle}>
              {filtered.length} shop{filtered.length === 1 ? "" : "s"} near you
            </Text>
          </View>
        }
        renderItem={({ item }) => (
          <View style={styles.cardWrap}>
            <ShopCard shop={item} onPress={() => navigation.navigate("Shop", { shopId: item.id })} />
          </View>
        )}
        ListEmptyComponent={<Text style={styles.empty}>No shops match your search.</Text>}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.bg },
  header: { paddingHorizontal: 16, paddingTop: 6, paddingBottom: 8, gap: 8, backgroundColor: C.bg },
  locationRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  location: { color: C.mute, fontSize: 13, flexShrink: 1 },
  title: { color: C.text, fontSize: 28, fontWeight: "900" },
  searchBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: C.panel,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: C.line,
    paddingHorizontal: 12,
    height: 46,
  },
  searchInput: { flex: 1, color: C.text, fontSize: 15 },
  chipRow: { gap: 8, paddingVertical: 12, paddingRight: 16 },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: C.panel,
    borderWidth: 1,
    borderColor: C.line,
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  chipActive: { backgroundColor: C.greenSoft, borderColor: C.green },
  chipEmoji: { fontSize: 14 },
  chipText: { color: C.text, fontSize: 13, fontWeight: "600" },
  chipTextActive: { color: C.green },
  sectionTitle: { color: C.text, fontSize: 16, fontWeight: "800", marginBottom: 10, marginTop: 4 },
  listContent: { paddingHorizontal: 16, paddingBottom: 24 },
  cardWrap: { marginBottom: 14 },
  empty: { color: C.mute, textAlign: "center", marginTop: 40 },
});
