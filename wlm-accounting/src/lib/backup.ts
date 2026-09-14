import * as FileSystem from "expo-file-system";
import * as Sharing from "expo-sharing";
import * as DocumentPicker from "expo-document-picker";
import { Ledger, normaliseLedger } from "./storage";
import { todayISO } from "./format";

export interface BackupFile {
  app: "wlm-accounting";
  version: 2;
  exportedAt: string;
  ledger: Ledger;
}

export function buildBackup(ledger: Ledger): BackupFile {
  return {
    app: "wlm-accounting",
    version: 2,
    exportedAt: new Date().toISOString(),
    ledger,
  };
}

/** Writes the ledger to a JSON file and opens the OS share sheet. */
export async function exportLedger(ledger: Ledger): Promise<string> {
  const json = JSON.stringify(buildBackup(ledger), null, 2);
  const name = `wlm-accounting-backup-${todayISO()}.json`;
  const file = new FileSystem.File(FileSystem.Paths.cache, name);

  if (file.exists) file.delete();
  file.create();
  file.write(json);

  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(file.uri, {
      mimeType: "application/json",
      dialogTitle: "Export WLM Accounting backup",
      UTI: "public.json",
    });
  }
  return name;
}

export type ImportResult =
  | { ok: true; ledger: Ledger }
  | { ok: false; reason: string };

/** Prompts for a backup file and parses it. Never writes — the caller decides. */
export async function importLedger(): Promise<ImportResult | null> {
  const picked = await DocumentPicker.getDocumentAsync({
    type: ["application/json", "*/*"],
    copyToCacheDirectory: true,
  });
  if (picked.canceled || !picked.assets?.length) return null;

  try {
    const file = new FileSystem.File(picked.assets[0].uri);
    const parsed = JSON.parse(file.textSync());

    // Accept both the wrapped backup envelope and a bare ledger object.
    const body = parsed?.app === "wlm-accounting" ? parsed.ledger : parsed;
    if (!body || typeof body !== "object") {
      return { ok: false, reason: "That file isn't a WLM Accounting backup." };
    }
    const ledger = normaliseLedger(body);
    if (!ledger.txns.length && !ledger.docs.length && !ledger.openingBank) {
      return { ok: false, reason: "That backup is empty — nothing to restore." };
    }
    return { ok: true, ledger };
  } catch {
    return { ok: false, reason: "Couldn't read that file. Is it a valid backup?" };
  }
}
