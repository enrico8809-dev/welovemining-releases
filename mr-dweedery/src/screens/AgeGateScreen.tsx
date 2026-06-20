import React from "react";
import { Image, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Button from "../components/Button";
import { useStore } from "../lib/StoreContext";
import { C } from "../lib/theme";

const ICON = require("../../assets/icon.png");

export default function AgeGateScreen() {
  const { verifyAge } = useStore();
  return (
    <SafeAreaView style={styles.screen}>
      <View style={styles.center}>
        <Image source={ICON} style={styles.logo} resizeMode="contain" />
        <Text style={styles.brand}>Mr Dweedery</Text>
        <Text style={styles.tagline}>Cannabis delivery, across South Africa</Text>

        <View style={styles.card}>
          <Text style={styles.heading}>Are you 18 or older?</Text>
          <Text style={styles.body}>
            You must be 18+ to use Mr Dweedery. By continuing you confirm you are of legal age and
            accept our terms. Products are for personal use only.
          </Text>
          <Button label="Yes, I am 18 or older" onPress={verifyAge} style={{ marginTop: 8 }} />
          <Text style={styles.disclaimer}>
            Please consume responsibly. Do not drive under the influence.
          </Text>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.green },
  center: { flex: 1, justifyContent: "center", padding: 24, gap: 8 },
  logo: { width: 96, height: 96, alignSelf: "center", borderRadius: 22 },
  brand: { color: C.onGreen, fontSize: 34, fontWeight: "900", textAlign: "center", marginTop: 12 },
  tagline: { color: "rgba(255,255,255,0.85)", fontSize: 15, textAlign: "center", marginBottom: 24 },
  card: { backgroundColor: C.panel, borderRadius: 18, padding: 22, gap: 14 },
  heading: { color: C.text, fontSize: 22, fontWeight: "800", textAlign: "center" },
  body: { color: C.mute, fontSize: 14, lineHeight: 21, textAlign: "center" },
  disclaimer: { color: C.mute, fontSize: 12, textAlign: "center", marginTop: 4 },
});
