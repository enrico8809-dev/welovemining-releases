import AsyncStorage from "@react-native-async-storage/async-storage";
import { File } from "expo-file-system";
import {
  DEFAULT_SETTINGS,
  EMPTY_LEDGER,
  Ledger,
  normaliseLedger,
} from "./ledgerModel";

// The shape of the books lives in ledgerModel, which has no Expo imports and so
// can be shared with the desktop app. Re-exported here so every caller that
// already imports from storage keeps working.
export * from "./ledgerModel";

const KEY = "wlm:ledger:v2";
const LEGACY_KEY = "wlm:ledger:v1";

/**
 * Earlier versions stored the logo as a file path, which can't sync and which
 * the OS is free to reclaim. Read it in once and keep it inline from then on.
 */
async function migrateLogo(ledger: Ledger): Promise<Ledger> {
  const legacy = ledger.settings.logoUri;
  if (ledger.settings.logo || !legacy) return ledger;

  try {
    const file = new File(legacy);
    if (!file.exists) return { ...ledger, settings: { ...ledger.settings, logoUri: undefined } };

    const base64 = file.base64Sync();
    const mime = /\.png(\?|$)/i.test(legacy) ? "image/png" : "image/jpeg";
    return {
      ...ledger,
      settings: {
        ...ledger.settings,
        logo: `data:${mime};base64,${base64}`,
        logoUri: undefined,
        updatedAt: Date.now(),
      },
    };
  } catch {
    // A logo that can't be read isn't worth failing the whole load over.
    return { ...ledger, settings: { ...ledger.settings, logoUri: undefined } };
  }
}

export async function loadLedger(): Promise<Ledger> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (raw) return migrateLogo(normaliseLedger(JSON.parse(raw)));

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

