import React, { useState } from "react";
import { Alert, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { MapPin, CreditCard, ShieldCheck, Info } from "lucide-react-native";
import Button from "../components/Button";
import { useStore } from "../lib/StoreContext";
import { PAYMENT_METHODS } from "../lib/payments";
import { C } from "../lib/theme";

export default function AccountScreen() {
  const { address, setAddress, orders } = useStore();
  const [addr, setAddr] = useState(address);

  function save() {
    setAddress(addr.trim());
    Alert.alert("Saved", "Your default delivery address has been updated.");
  }

  const liveMethods = PAYMENT_METHODS.filter((m) => m.live).length;

  return (
    <SafeAreaView style={styles.screen} edges={["top"]}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title}>Account</Text>

        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <MapPin color={C.green} size={18} />
            <Text style={styles.cardTitle}>Default delivery address</Text>
          </View>
          <TextInput
            value={addr}
            onChangeText={setAddr}
            placeholder="e.g. 12 Main Road, Sea Point, Cape Town"
            placeholderTextColor={C.mute}
            style={styles.input}
            multiline
          />
          <Button label="Save address" onPress={save} style={{ marginTop: 12 }} />
        </View>

        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <CreditCard color={C.green} size={18} />
            <Text style={styles.cardTitle}>Payment methods</Text>
          </View>
          {PAYMENT_METHODS.map((m) => (
            <View key={m.id} style={styles.payRow}>
              <Text style={styles.payEmoji}>{m.emoji}</Text>
              <Text style={styles.payLabel}>{m.label}</Text>
              <Text style={[styles.payState, m.live ? styles.live : styles.sandbox]}>
                {m.live ? "Live" : m.id === "cash" ? "Live" : "Sandbox"}
              </Text>
            </View>
          ))}
          <Text style={styles.note}>
            {liveMethods} of {PAYMENT_METHODS.length} gateways have live keys. Add merchant keys in
            src/lib/payments.ts to accept real payments.
          </Text>
        </View>

        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <ShieldCheck color={C.green} size={18} />
            <Text style={styles.cardTitle}>Status</Text>
          </View>
          <Text style={styles.statusLine}>Age verified · 18+</Text>
          <Text style={styles.statusLine}>{orders.length} order{orders.length === 1 ? "" : "s"} placed</Text>
        </View>

        <View style={[styles.card, styles.infoCard]}>
          <View style={styles.cardHeader}>
            <Info color={C.mute} size={18} />
            <Text style={[styles.cardTitle, { color: C.mute }]}>Mr Dweedery</Text>
          </View>
          <Text style={styles.disclaimer}>
            Cannabis delivery for adults (18+) across South Africa. Please consume responsibly and
            never drive under the influence. Availability depends on local regulations.
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.bg },
  content: { padding: 16, gap: 14, paddingBottom: 32 },
  title: { color: C.text, fontSize: 26, fontWeight: "900", marginBottom: 4 },
  card: { backgroundColor: C.panel, borderRadius: 14, borderWidth: 1, borderColor: C.line, padding: 16 },
  infoCard: { backgroundColor: C.panel2 },
  cardHeader: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 12 },
  cardTitle: { color: C.text, fontSize: 16, fontWeight: "800" },
  input: { backgroundColor: C.panel2, borderRadius: 10, padding: 12, color: C.text, fontSize: 15, minHeight: 48 },
  payRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 8 },
  payEmoji: { fontSize: 20 },
  payLabel: { color: C.text, fontSize: 14, fontWeight: "600", flex: 1 },
  payState: { fontSize: 12, fontWeight: "800" },
  live: { color: C.green },
  sandbox: { color: C.mute },
  note: { color: C.mute, fontSize: 12, marginTop: 8, lineHeight: 18 },
  statusLine: { color: C.text, fontSize: 14, paddingVertical: 3 },
  disclaimer: { color: C.mute, fontSize: 13, lineHeight: 20 },
});
