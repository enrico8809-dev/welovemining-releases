import React from "react";
import { ActivityIndicator, StyleSheet, View } from "react-native";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { StoreProvider, useStore } from "./src/lib/StoreContext";
import RootNavigator from "./src/navigation";
import AgeGateScreen from "./src/screens/AgeGateScreen";
import { C } from "./src/lib/theme";

function AppContent() {
  const { loading, ageVerified } = useStore();

  if (loading) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator color={C.green} size="large" />
      </View>
    );
  }

  return ageVerified ? <RootNavigator /> : <AgeGateScreen />;
}

export default function App() {
  return (
    <SafeAreaProvider>
      <StoreProvider>
        <AppContent />
      </StoreProvider>
      <StatusBar style="dark" />
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
