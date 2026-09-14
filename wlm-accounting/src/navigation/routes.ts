import { CompositeNavigationProp } from "@react-navigation/native";
import { BottomTabNavigationProp } from "@react-navigation/bottom-tabs";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";

export type RootStackParamList = {
  Tabs: undefined;
  AccountDetail: { accountId: string };
  DocEditor: { docId?: string; kind: "invoice" | "quote" };
  DocDetail: { docId: string };
  Settings: undefined;
  BankImport: undefined;
  Inventory: undefined;
  Reconciliation: undefined;
  Export: undefined;
};

export type TabParamList = {
  Home: undefined;
  Ledger: undefined;
  Add: { editId?: string } | undefined;
  Invoices: undefined;
  Reports: undefined;
};

export type ComingSoonRoute = "BankImport" | "Inventory" | "Reconciliation" | "Export";

/**
 * Tab screens sit inside the root stack, so they need to address both: sibling
 * tabs by name, and pushed screens like DocDetail on the stack above them.
 */
export type TabScreenNavigation<T extends keyof TabParamList> = CompositeNavigationProp<
  BottomTabNavigationProp<TabParamList, T>,
  NativeStackNavigationProp<RootStackParamList>
>;
