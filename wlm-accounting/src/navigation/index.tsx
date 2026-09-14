import React from "react";
import { NavigationContainer, DarkTheme, Theme } from "@react-navigation/native";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import TabBar from "../components/TabBar";
import HomeScreen from "../screens/HomeScreen";
import LedgerScreen from "../screens/LedgerScreen";
import AddScreen from "../screens/AddScreen";
import InvoicesScreen from "../screens/InvoicesScreen";
import ReportsScreen from "../screens/ReportsScreen";
import SettingsScreen from "../screens/SettingsScreen";
import AccountDetailScreen from "../screens/AccountDetailScreen";
import DocEditorScreen from "../screens/DocEditorScreen";
import DocDetailScreen from "../screens/DocDetailScreen";
import {
  BankImportScreen,
  ExportScreen,
  InventoryScreen,
  ReconciliationScreen,
} from "../screens/comingsoon/screens";
import { RootStackParamList, TabParamList } from "./routes";
import { C } from "../lib/theme";

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

function Tabs() {
  return (
    <Tab.Navigator
      screenOptions={{ headerShown: false }}
      tabBar={(props) => <TabBar {...props} />}
    >
      <Tab.Screen name="Home" component={HomeScreen} options={{ title: "Home" }} />
      <Tab.Screen name="Ledger" component={LedgerScreen} options={{ title: "Ledger" }} />
      <Tab.Screen name="Add" component={AddScreen} options={{ title: "Add" }} />
      <Tab.Screen name="Invoices" component={InvoicesScreen} options={{ title: "Invoices" }} />
      <Tab.Screen name="Reports" component={ReportsScreen} options={{ title: "Reports" }} />
    </Tab.Navigator>
  );
}

export default function RootNavigator() {
  return (
    <NavigationContainer theme={navTheme}>
      <Stack.Navigator
        screenOptions={{ headerShown: false, animation: "slide_from_right" }}
      >
        <Stack.Screen name="Tabs" component={Tabs} />
        <Stack.Screen name="AccountDetail" component={AccountDetailScreen} />
        <Stack.Screen name="DocEditor" component={DocEditorScreen} />
        <Stack.Screen name="DocDetail" component={DocDetailScreen} />
        <Stack.Screen name="Settings" component={SettingsScreen} />
        <Stack.Screen name="BankImport" component={BankImportScreen} />
        <Stack.Screen name="Inventory" component={InventoryScreen} />
        <Stack.Screen name="Reconciliation" component={ReconciliationScreen} />
        <Stack.Screen name="Export" component={ExportScreen} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
