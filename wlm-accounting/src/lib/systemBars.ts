import { useEffect } from "react";
import { Platform } from "react-native";
import * as NavigationBar from "expo-navigation-bar";
import * as SystemUI from "expo-system-ui";
import { C } from "./theme";

/**
 * Makes the Android system bars part of the app rather than a stripe of someone
 * else's colour at the bottom. The app draws edge-to-edge, so the nav bar sits
 * over our content — painting it to match the tab bar and forcing light icons
 * keeps it from looking like a foreign object on Samsung devices.
 */
export function useSystemBars() {
  useEffect(() => {
    SystemUI.setBackgroundColorAsync(C.bg).catch(() => {});

    if (Platform.OS !== "android") return;
    // "light" = light-coloured buttons, which is what a near-black app needs.
    NavigationBar.setStyle("light");
  }, []);
}
