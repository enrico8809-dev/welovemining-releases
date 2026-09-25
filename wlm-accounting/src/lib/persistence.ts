import { LedgerPersistence } from "./LedgerContext";
import { loadLedger, saveLedger } from "./storage";
import { clearSession, loadSession, saveSession } from "./cloudSession";

/** Where this app keeps the books: AsyncStorage on the device. */
export const devicePersistence: LedgerPersistence = {
  loadLedger,
  saveLedger,
  loadSession,
  saveSession,
  clearSession,
};
