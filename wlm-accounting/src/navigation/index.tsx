import React from "react";
import { NavigationContainer, DarkTheme, Theme } from "@react-navigation/native";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { Home, BookOpen, PlusCircle, BarChart3 } from "lucide-react-native";
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
import { C, FONT_DISPLAY } from "../lib/theme";

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
      screenOptions={{
        headerShown: false,
        tabBarStyle: { backgroundColor: C.panel, borderTopColor: C.line },
        tabBarActiveTintColor: C.orange,
        tabBarInactiveTintColor: C.mute,
        tabBarLabelStyle: { fontFamily: FONT_DISPLAY, fontSize: 12 },
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
        options={{ tabBarIcon: ({ color, size }) => <PlusCircle color={color} size={size} /> }}
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
