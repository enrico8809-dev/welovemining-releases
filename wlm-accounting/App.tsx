import React from "react";
import { ActivityIndicator, StyleSheet, View } from "react-native";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { useFonts, Rajdhani_500Medium, Rajdhani_700Bold } from "@expo-google-fonts/rajdhani";
import { ShareTechMono_400Regular } from "@expo-google-fonts/share-tech-mono";
import { LedgerProvider, useLedger } from "./src/lib/LedgerContext";
import RootNavigator from "./src/navigation";
import { C } from "./src/lib/theme";

function AppContent() {
  const { loading } = useLedger();

  if (loading) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator color={C.orange} size="large" />
      </View>
    );
  }

  return <RootNavigator />;
}

export default function App() {
  const [fontsLoaded] = useFonts({
    Rajdhani_500Medium,
    Rajdhani_700Bold,
    ShareTechMono_400Regular,
  });

  if (!fontsLoaded) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator color={C.orange} size="large" />
      </View>
    );
  }

  return (
    <SafeAreaProvider>
      <LedgerProvider>
        <AppContent />
      </LedgerProvider>
      <StatusBar style="light" />
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  loading: {
    flex: 1,
    backgroundColor: C.bg,
    alignItems: "center",
    justifyContent: "center",
  },
});
