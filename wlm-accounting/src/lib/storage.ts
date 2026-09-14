import AsyncStorage from "@react-native-async-storage/async-storage";
import { Txn } from "./accounting";
import { BusinessDoc } from "./invoices";
import { DEFAULT_FY_START_MONTH } from "./period";

const KEY = "wlm:ledger:v2";
const LEGACY_KEY = "wlm:ledger:v1";

export interface Settings {
  companyName: string;
  registrationNumber: string;
  email: string;
  phone: string;
  address: string;
  fyStartMonth: number;
  defaultPaymentTermsDays: number;
}

export interface Ledger {
  txns: Txn[];
  docs: BusinessDoc[];
  openingBank: number;
  settings: Settings;
}

export const DEFAULT_SETTINGS: Settings = {
  companyName: "WeLoveMining Pty Ltd",
  registrationNumber: "",
  email: "",
  phone: "",
  address: "",
  fyStartMonth: DEFAULT_FY_START_MONTH,
  defaultPaymentTermsDays: 14,
};

export const EMPTY_LEDGER: Ledger = {
  txns: [],
  docs: [],
  openingBank: 0,
  settings: DEFAULT_SETTINGS,
};

/** Accepts anything and returns a Ledger — used for both storage and file import. */
export function normaliseLedger(parsed: unknown): Ledger {
  const raw = (parsed ?? {}) as Partial<Ledger>;
  return {
    txns: Array.isArray(raw.txns) ? raw.txns : [],
    docs: Array.isArray(raw.docs) ? raw.docs : [],
    openingBank: typeof raw.openingBank === "number" ? raw.openingBank : 0,
    settings: { ...DEFAULT_SETTINGS, ...(raw.settings ?? {}) },
  };
}

export async function loadLedger(): Promise<Ledger> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (raw) return normaliseLedger(JSON.parse(raw));

    // One-time migration from the v1 shape (txns + openingBank only).
    const legacy = await AsyncStorage.getItem(LEGACY_KEY);
    if (legacy) {
      const migrated = normaliseLedger(JSON.parse(legacy));
      await saveLedger(migrated);
      return migrated;
    }
    return EMPTY_LEDGER;
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

