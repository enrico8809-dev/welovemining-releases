import React from "react";
import { StyleSheet, View } from "react-native";
import { StatusBar } from "expo-status-bar";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { useFonts, Rajdhani_500Medium, Rajdhani_700Bold } from "@expo-google-fonts/rajdhani";
import { ShareTechMono_400Regular } from "@expo-google-fonts/share-tech-mono";
import { LedgerProvider } from "./src/lib/LedgerContext";
import { devicePersistence } from "./src/lib/persistence";
import { ToastProvider } from "./src/components/Toast";
import RootNavigator from "./src/navigation";
import { useSystemBars } from "./src/lib/systemBars";
import { C } from "./src/lib/theme";

export default function App() {
  useSystemBars();

  const [fontsLoaded] = useFonts({
    Rajdhani_500Medium,
    Rajdhani_700Bold,
    ShareTechMono_400Regular,
  });

  // Hold the splash until the brand faces are ready — swapping fonts in after
  // first paint is the cheapest way to look unfinished.
  if (!fontsLoaded) return <View style={styles.boot} />;

  return (
    <GestureHandlerRootView style={styles.root}>
      <SafeAreaProvider>
        <ToastProvider>
          <LedgerProvider persistence={devicePersistence}>
            <RootNavigator />
          </LedgerProvider>
        </ToastProvider>
        <StatusBar style="light" />
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },
  boot: { flex: 1, backgroundColor: C.bg },
});
