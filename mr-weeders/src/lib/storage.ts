import AsyncStorage from "@react-native-async-storage/async-storage";
import { CartLine, Order } from "./types";

const KEY = "mrweeders:state:v1";

export interface PersistedState {
  ageVerified: boolean;
  address: string;
  cartShopId: string | null;
  cart: CartLine[];
  orders: Order[];
}

export const EMPTY_STATE: PersistedState = {
  ageVerified: false,
  address: "",
  cartShopId: null,
  cart: [],
  orders: [],
};

export async function loadState(): Promise<PersistedState> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (!raw) return EMPTY_STATE;
    const parsed = JSON.parse(raw);
    return {
      ageVerified: !!parsed.ageVerified,
      address: typeof parsed.address === "string" ? parsed.address : "",
      cartShopId: parsed.cartShopId ?? null,
      cart: Array.isArray(parsed.cart) ? parsed.cart : [],
      orders: Array.isArray(parsed.orders) ? parsed.orders : [],
    };
  } catch (e) {
    console.warn("Failed to load state", e);
    return EMPTY_STATE;
  }
}

export async function saveState(state: PersistedState): Promise<void> {
  try {
    await AsyncStorage.setItem(KEY, JSON.stringify(state));
  } catch (e) {
    console.warn("Failed to save state", e);
  }
}
