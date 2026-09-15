import { Order } from "../lib/types";

export type TabParamList = {
  Discover: undefined;
  Orders: undefined;
  Account: undefined;
};

export type RootStackParamList = {
  Tabs: undefined;
  Shop: { shopId: string };
  Cart: undefined;
  Checkout: undefined;
  Payment: { order: Order; email?: string };
  OrderTracking: { orderId: string };
};
