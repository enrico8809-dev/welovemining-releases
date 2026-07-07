import React from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { NavigationContainer, DarkTheme, Theme } from "@react-navigation/native";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { Home, BookOpen, Plus, BarChart3 } from "lucide-react-native";
import HomeScreen from "../screens/HomeScreen";
import LedgerScreen from "../screens/LedgerScreen";
import AddScreen from "../screens/AddScreen";
import ReportsScreen from "../screens/ReportsScreen";
import {
  BankImportScreen,
  ExportScreen,
  InventoryScreen,
  InvoicesScreen,
  ReconciliationScreen,
} from "../screens/comingsoon/screens";
import { RootStackParamList, TabParamList } from "./routes";
import { C, FONT_DISPLAY_BOLD, SHADOW } from "../lib/theme";

const Tab = createBottomTabNavigator<TabParamList>();
const Stack = createNativeStackNavigator<RootStackParamList>();

const navTheme: Theme = {
  ...DarkTheme,
  colors: {
    ...DarkTheme.colors,
    background: C.bg,
    card: C.panel,
    border: C.line,
    primary: C.orange,
    text: C.text,
  },
};

/** Raised circular Add button in the middle of the tab bar. */
function AddTabButton(props: any) {
  return (
    <Pressable
      onPress={props.onPress}
      accessibilityRole="button"
      accessibilityLabel="Add transaction"
      style={styles.fabWrap}
    >
      <View style={styles.fab}>
        <Plus color={C.ink} size={28} strokeWidth={2.6} />
      </View>
    </Pressable>
  );
}

function Tabs() {
  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: C.panel,
          borderTopColor: C.line,
          borderTopWidth: 1,
          height: 64,
          paddingTop: 6,
          paddingBottom: 8,
        },
        tabBarActiveTintColor: C.orange,
        tabBarInactiveTintColor: C.mute,
        tabBarLabelStyle: { fontFamily: FONT_DISPLAY_BOLD, fontSize: 11, letterSpacing: 0.5 },
      }}
    >
      <Tab.Screen
        name="Home"
        component={HomeScreen}
        options={{ tabBarIcon: ({ color, size }) => <Home color={color} size={size} /> }}
      />
      <Tab.Screen
        name="Ledger"
        component={LedgerScreen}
        options={{ tabBarIcon: ({ color, size }) => <BookOpen color={color} size={size} /> }}
      />
      <Tab.Screen
        name="Add"
        component={AddScreen}
        options={{
          tabBarLabel: () => null,
          tabBarIcon: () => null,
          tabBarButton: (props) => <AddTabButton {...props} />,
        }}
      />
      <Tab.Screen
        name="Reports"
        component={ReportsScreen}
        options={{ tabBarIcon: ({ color, size }) => <BarChart3 color={color} size={size} /> }}
      />
    </Tab.Navigator>
  );
}

export default function RootNavigator() {
  return (
    <NavigationContainer theme={navTheme}>
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        <Stack.Screen name="Tabs" component={Tabs} />
        <Stack.Screen name="BankImport" component={BankImportScreen} />
        <Stack.Screen name="Invoices" component={InvoicesScreen} />
        <Stack.Screen name="Inventory" component={InventoryScreen} />
        <Stack.Screen name="Reconciliation" component={ReconciliationScreen} />
        <Stack.Screen name="Export" component={ExportScreen} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}

const styles = StyleSheet.create({
  fabWrap: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  fab: {
    width: 52,
    height: 52,
    borderRadius: 26,
    marginTop: -26,
    backgroundColor: C.orange,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 4,
    borderColor: C.bg,
    ...SHADOW,
  },
});
