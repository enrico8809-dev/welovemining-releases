import AsyncStorage from "@react-native-async-storage/async-storage";
import { Txn } from "./accounting";

const KEY = "wlm:ledger:v1";

export interface Ledger {
  txns: Txn[];
  openingBank: number;
}

const EMPTY_LEDGER: Ledger = { txns: [], openingBank: 0 };

export async function loadLedger(): Promise<Ledger> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (!raw) return EMPTY_LEDGER;
    const parsed = JSON.parse(raw);
    return {
      txns: Array.isArray(parsed.txns) ? parsed.txns : [],
      openingBank: typeof parsed.openingBank === "number" ? parsed.openingBank : 0,
    };
  } catch (e) {
    console.warn("Failed to load ledger from storage", e);
    return EMPTY_LEDGER;
  }
}

export async function saveLedger(ledger: Ledger): Promise<void> {
  try {
    await AsyncStorage.setItem(KEY, JSON.stringify(ledger));
  } catch (e) {
    console.warn("Failed to save ledger to storage", e);
  }
}
