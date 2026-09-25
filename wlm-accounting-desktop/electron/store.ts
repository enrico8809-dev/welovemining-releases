import { promises as fs } from "node:fs";
import path from "node:path";

/**
 * The books on disk: one JSON file in the user's app data.
 *
 * Written the same way the sync server writes its store — to a temporary file
 * in the same directory, then renamed over the target. A rename within a
 * directory is atomic, so a crash or a power cut during a save leaves either
 * the old file or the new one, never a half-written ledger. The previous
 * version is kept alongside as .bak for the same reason.
 */
export class LedgerStore {
  private readonly file: string;
  private readonly backup: string;
  private writing: Promise<void> = Promise.resolve();

  constructor(directory: string) {
    this.file = path.join(directory, "ledger.json");
    this.backup = path.join(directory, "ledger.bak.json");
  }

  get path(): string {
    return this.file;
  }

  async read(): Promise<unknown | null> {
    const fromMain = await readJson(this.file);
    if (fromMain !== undefined) return fromMain;

    // The main file is missing or unreadable. A backup that parses is a far
    // better answer than an empty set of books.
    const fromBackup = await readJson(this.backup);
    return fromBackup === undefined ? null : fromBackup;
  }

  /**
   * Saves are serialised. The renderer saves on every change, so two writes can
   * otherwise overlap and interleave their renames, leaving the backup newer
   * than the file it is meant to be backing up.
   */
  write(ledger: unknown): Promise<void> {
    this.writing = this.writing
      .catch(() => undefined)
      .then(() => this.writeNow(ledger));
    return this.writing;
  }

  private async writeNow(ledger: unknown): Promise<void> {
    const body = JSON.stringify(ledger, null, 2);
    const temp = `${this.file}.${process.pid}.tmp`;

    await fs.mkdir(path.dirname(this.file), { recursive: true });
    await fs.copyFile(this.file, this.backup).catch(() => undefined);
    await fs.writeFile(temp, body, "utf8");
    await fs.rename(temp, this.file);
  }
}

async function readJson(file: string): Promise<unknown | undefined> {
  try {
    return JSON.parse(await fs.readFile(file, "utf8"));
  } catch {
    // Missing, unreadable or corrupt all mean the same thing to the caller, and
    // a file that fails to parse is left exactly as it is rather than replaced.
    return undefined;
  }
}
