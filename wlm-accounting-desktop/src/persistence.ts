import type { LedgerPersistence } from "@engine/LedgerContext";
import { EMPTY_LEDGER, Ledger, normaliseLedger } from "@engine/ledgerModel";
import type { CloudSession } from "@engine/sync";
import { api } from "./api";

const SESSION_KEY = "wlm:cloud:v1";

/**
 * Where this app keeps the books: a JSON file the main process owns, written
 * atomically, in the user's app data.
 *
 * `normaliseLedger` is the same function the phone runs on load, so a file
 * written by an older version — or pulled down from the server — is brought up
 * to the current shape the same way on both.
 */
export const desktopPersistence: LedgerPersistence = {
  async loadLedger(): Promise<Ledger> {
    const raw = await api.ledger.read();
    return raw === null ? EMPTY_LEDGER : normaliseLedger(raw);
  },

  async saveLedger(ledger: Ledger): Promise<void> {
    await api.ledger.write(ledger);
  },

  // The session is a credential, not part of the books: it stays out of the
  // ledger file so a restored backup can't carry someone else's login, and so
  // signing out never touches the accounts.
  async loadSession(): Promise<CloudSession | null> {
    try {
      const raw = window.localStorage.getItem(SESSION_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw) as CloudSession;
      return parsed?.token && parsed?.serverUrl ? parsed : null;
    } catch {
      return null;
    }
  },

  async saveSession(session: CloudSession): Promise<void> {
    window.localStorage.setItem(SESSION_KEY, JSON.stringify(session));
  },

  async clearSession(): Promise<void> {
    window.localStorage.removeItem(SESSION_KEY);
  },
};
