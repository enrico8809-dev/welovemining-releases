import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { productById } from "./data";
import { EMPTY_STATE, loadState, PersistedState, saveState } from "./storage";
import { CartLine, Order, OrderStatus } from "./types";

export const SERVICE_FEE = 9.0; // flat platform service fee (ZAR)

export interface CartTotals {
  count: number;
  subtotal: number;
}

interface StoreContextValue {
  loading: boolean;
  ageVerified: boolean;
  address: string;
  cartShopId: string | null;
  cart: CartLine[];
  orders: Order[];
  totals: CartTotals;

  verifyAge: () => Promise<void>;
  setAddress: (address: string) => Promise<void>;
  addToCart: (productId: string, shopId: string) => Promise<{ replaced: boolean }>;
  setQty: (productId: string, qty: number) => Promise<void>;
  clearCart: () => Promise<void>;
  placeOrder: (order: Order) => Promise<void>;
  advanceOrder: (orderId: string, status: OrderStatus) => Promise<void>;
}

const StoreContext = createContext<StoreContextValue | undefined>(undefined);

export function StoreProvider({ children }: { children: React.ReactNode }) {
  const [loading, setLoading] = useState(true);
  const [state, setState] = useState<PersistedState>(EMPTY_STATE);

  useEffect(() => {
    let cancelled = false;
    loadState().then((loaded) => {
      if (!cancelled) {
        setState(loaded);
        setLoading(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const persist = useCallback(async (next: PersistedState) => {
    setState(next);
    await saveState(next);
  }, []);

  const verifyAge = useCallback(() => persist({ ...state, ageVerified: true }), [state, persist]);

  const setAddress = useCallback(
    (address: string) => persist({ ...state, address }),
    [state, persist]
  );

  const addToCart = useCallback(
    async (productId: string, shopId: string) => {
      // Cart is single-shop, like Mr D — switching shops clears the cart.
      if (state.cartShopId && state.cartShopId !== shopId) {
        await persist({ ...state, cartShopId: shopId, cart: [{ productId, qty: 1 }] });
        return { replaced: true };
      }
      const existing = state.cart.find((l) => l.productId === productId);
      const cart = existing
        ? state.cart.map((l) => (l.productId === productId ? { ...l, qty: l.qty + 1 } : l))
        : [...state.cart, { productId, qty: 1 }];
      await persist({ ...state, cartShopId: shopId, cart });
      return { replaced: false };
    },
    [state, persist]
  );

  const setQty = useCallback(
    async (productId: string, qty: number) => {
      const cart =
        qty <= 0
          ? state.cart.filter((l) => l.productId !== productId)
          : state.cart.map((l) => (l.productId === productId ? { ...l, qty } : l));
      const cartShopId = cart.length ? state.cartShopId : null;
      await persist({ ...state, cart, cartShopId });
    },
    [state, persist]
  );

  const clearCart = useCallback(
    () => persist({ ...state, cart: [], cartShopId: null }),
    [state, persist]
  );

  const placeOrder = useCallback(
    (order: Order) => persist({ ...state, orders: [order, ...state.orders], cart: [], cartShopId: null }),
    [state, persist]
  );

  const advanceOrder = useCallback(
    (orderId: string, status: OrderStatus) =>
      persist({
        ...state,
        orders: state.orders.map((o) => (o.id === orderId ? { ...o, status } : o)),
      }),
    [state, persist]
  );

  const totals = useMemo<CartTotals>(() => {
    let count = 0;
    let subtotal = 0;
    for (const line of state.cart) {
      const p = productById(line.productId);
      if (!p) continue;
      count += line.qty;
      subtotal += p.price * line.qty;
    }
    return { count, subtotal };
  }, [state.cart]);

  const value = useMemo<StoreContextValue>(
    () => ({
      loading,
      ageVerified: state.ageVerified,
      address: state.address,
      cartShopId: state.cartShopId,
      cart: state.cart,
      orders: state.orders,
      totals,
      verifyAge,
      setAddress,
      addToCart,
      setQty,
      clearCart,
      placeOrder,
      advanceOrder,
    }),
    [loading, state, totals, verifyAge, setAddress, addToCart, setQty, clearCart, placeOrder, advanceOrder]
  );

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore(): StoreContextValue {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error("useStore must be used within a StoreProvider");
  return ctx;
}
