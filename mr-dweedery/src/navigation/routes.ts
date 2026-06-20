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
  OrderTracking: { orderId: string };
};
