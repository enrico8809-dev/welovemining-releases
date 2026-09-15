import { CompositeNavigationProp } from "@react-navigation/native";
import { BottomTabNavigationProp } from "@react-navigation/bottom-tabs";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";

export type RootStackParamList = {
  Tabs: undefined;
  AccountDetail: { accountId: string };
  DocEditor: { docId?: string; kind: "invoice" | "quote"; pickedProductId?: string };
  DocDetail: { docId: string };
  Settings: undefined;
  Catalogue: { mode?: "browse" | "stock-in" | "line-item"; docId?: string } | undefined;
  ProductDetail: { productId: string; mode?: "stock-in" | "line-item"; docId?: string };
  BankImport: undefined;
  Reconciliation: undefined;
};

export type TabParamList = {
  Home: undefined;
  Ledger: undefined;
  Add: { editId?: string } | undefined;
  Invoices: undefined;
  Stock: undefined;
  Reports: undefined;
};

/**
 * Tab screens sit inside the root stack, so they need to address both: sibling
 * tabs by name, and pushed screens like DocDetail on the stack above them.
 */
export type TabScreenNavigation<T extends keyof TabParamList> = CompositeNavigationProp<
  BottomTabNavigationProp<TabParamList, T>,
  NativeStackNavigationProp<RootStackParamList>
>;
