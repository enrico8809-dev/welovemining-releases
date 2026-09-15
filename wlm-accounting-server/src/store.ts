import { readFileSync, writeFileSync, renameSync, existsSync, mkdirSync, copyFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { StoredRecord, SingletonRecord } from "./merge";

/**
 * A JSON file store.
 *
 * Deliberately not SQLite: this runs on a Windows box the author can't reach,
 * and a native module that fails to compile there is a support problem with no
 * remote fix. A small business's books are tens of thousands of records at
 * most, which fits in memory with room to spare.
 *
 * Writes go to a temp file and are renamed into place, so a crash mid-write
 * leaves the previous good file rather than a truncated one.
 */

export interface User {
  id: string;
  email: string;
  name: string;
  role: "owner" | "bookkeeper" | "viewer";
  passwordHash: string;
  createdAt: number;
  lastSeenAt?: number;
  /** Set while an invite is outstanding; cleared on first sign-in. */
  inviteCode?: string;
}

export interface Database {
  version: number;
  users: User[];
  collections: {
    txns: Record<string, StoredRecord>;
    docs: Record<string, StoredRecord>;
    movements: Record<string, StoredRecord>;
    reconciliations: Record<string, StoredRecord>;
  };
  settings?: SingletonRecord<unknown>;
  openingBank?: SingletonRecord<number>;
  /** Signing secret for session tokens, generated on first run. */
  tokenSecret: string;
}

export type CollectionName = keyof Database["collections"];

export const COLLECTIONS: CollectionName[] = [
  "txns",
  "docs",
  "movements",
  "reconciliations",
];

export function emptyDatabase(tokenSecret: string): Database {
  return {
    version: 1,
    users: [],
    collections: { txns: {}, docs: {}, movements: {}, reconciliations: {} },
    tokenSecret,
  };
}

export class Store {
  private db: Database;

  constructor(
    private readonly path: string,
    makeSecret: () => string
  ) {
    const dir = dirname(path);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });

    if (existsSync(path)) {
      this.db = this.load(path, makeSecret);
    } else {
      this.db = emptyDatabase(makeSecret());
      this.flush();
    }
  }

  private load(path: string, makeSecret: () => string): Database {
    try {
      const parsed = JSON.parse(readFileSync(path, "utf8")) as Partial<Database>;
      const base = emptyDatabase(parsed.tokenSecret ?? makeSecret());
      return {
        ...base,
        ...parsed,
        users: Array.isArray(parsed.users) ? parsed.users : [],
        collections: { ...base.collections, ...(parsed.collections ?? {}) },
        tokenSecret: parsed.tokenSecret ?? base.tokenSecret,
      };
    } catch (e) {
      // A corrupt file is kept rather than overwritten — losing the books to a
      // bad parse would be far worse than refusing to start.
      const backup = `${path}.corrupt-${Date.now()}`;
      copyFileSync(path, backup);
      throw new Error(
        `Could not read ${path} (${(e as Error).message}). A copy was preserved at ${backup}. ` +
          `Fix or remove the file before starting again.`
      );
    }
  }

  /** Atomic: write a sibling temp file, then rename over the original. */
  private flush(): void {
    const tmp = `${this.path}.tmp`;
    writeFileSync(tmp, JSON.stringify(this.db), "utf8");
    renameSync(tmp, this.path);
  }

  read(): Database {
    return this.db;
  }

  /** Mutate under a callback so every change is persisted exactly once. */
  write<T>(fn: (db: Database) => T): T {
    const result = fn(this.db);
    this.flush();
    return result;
  }

  collection(name: CollectionName): Map<string, StoredRecord> {
    return new Map(Object.entries(this.db.collections[name]));
  }

  saveCollection(name: CollectionName, map: Map<string, StoredRecord>): void {
    this.db.collections[name] = Object.fromEntries(map);
  }

  stats() {
    return {
      users: this.db.users.length,
      txns: Object.keys(this.db.collections.txns).length,
      docs: Object.keys(this.db.collections.docs).length,
      movements: Object.keys(this.db.collections.movements).length,
      reconciliations: Object.keys(this.db.collections.reconciliations).length,
    };
  }
}

export function defaultDataPath(): string {
  const base =
    process.env.WLM_DATA_DIR ??
    join(process.env.APPDATA ?? process.env.HOME ?? ".", "wlm-accounting");
  return join(base, "ledger.json");
}
