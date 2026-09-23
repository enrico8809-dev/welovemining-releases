// Cloud sync client.
//
// The local AsyncStorage ledger stays the source of truth for this device. Sync
// is an exchange on top of it, so the app works identically with no signal —
// which matters when you're capturing a purchase at a mining site.
//
// The merge rule here must stay identical to the server's
// (wlm-accounting-server/src/merge.ts). Two sides resolving a conflict
// differently is how data quietly diverges.

import { Ledger, Settings, normaliseLedger } from "./ledgerModel";
import { Txn } from "./accounting";
import { BusinessDoc } from "./invoices";
import { StockMovement } from "./inventory";
import { Reconciliation } from "./reconcile";

/** Sync metadata every synced record carries. */
export interface Synced {
  updatedAt?: number;
  deletedAt?: number;
}

export type SyncedTxn = Txn & Synced;
export type SyncedDoc = BusinessDoc & Synced;
export type SyncedMovement = StockMovement & Synced;
export type SyncedReconciliation = Reconciliation & Synced;

export interface CloudSession {
  serverUrl: string;
  token: string;
  user: { id: string; email: string; name: string; role: string };
  /**
   * The pull cursor, on the SERVER's clock. Sent as `since`; the server answers
   * with everything it received after that moment.
   */
  lastSyncAt: number;
  /**
   * The push cursor, on THIS DEVICE's clock. Records carry `updatedAt` stamped
   * here, so deciding what still needs sending has to be judged here too.
   *
   * Using the server's cursor for this — which is what the first version did —
   * breaks the moment the two clocks disagree. A phone running two minutes slow
   * stamps every edit "in the past" relative to the server's cursor, so nothing
   * it does is ever pushed again, silently and permanently.
   */
  lastPushedAt?: number;
  lastSyncedIso?: string;
}

export interface SyncOutcome {
  ok: boolean;
  pushed: number;
  pulled: number;
  readOnly?: boolean;
  error?: string;
}

const COLLECTIONS = ["txns", "docs", "movements", "reconciliations"] as const;
type CollectionName = (typeof COLLECTIONS)[number];

/** Which ledger field each synced collection lives in. */
const FIELD: Record<CollectionName, keyof Ledger> = {
  txns: "txns",
  docs: "docs",
  movements: "movements",
  reconciliations: "reconciliations",
};

/**
 * The highest moment this device has either stamped or seen.
 *
 * Stamps have to go forwards. Wall clocks do not: a phone correcting itself
 * against network time steps backwards by a few seconds, and everything written
 * in the seconds that follow would carry a stamp older than work already sent.
 * Such a record is invisible to a cursor based on time — it is never pushed
 * again — and it would lose a last-write-wins comparison it should have won.
 *
 * So a stamp is the later of the clock and one past the highest moment seen.
 * Under a sane clock that is simply the clock; under a jumping one it keeps
 * going forwards. Anything arriving from another device raises the mark too, so
 * this device's next edit always outranks what it just received.
 */
let highWaterMark = 0;

export function observeTime(moment: number | undefined): void {
  if (typeof moment === "number" && moment > highWaterMark) highWaterMark = moment;
}

/** Seeds the mark from stored books at startup, so a restart can't go back. */
export function observeLedger(ledger: Ledger): void {
  for (const name of COLLECTIONS) {
    for (const record of (ledger[FIELD[name]] ?? []) as Synced[]) observeTime(record.updatedAt);
  }
  observeTime(ledger.settings?.updatedAt);
  observeTime(ledger.openingBankUpdatedAt);
}

function nextStamp(now: number): number {
  highWaterMark = Math.max(now, highWaterMark + 1);
  return highWaterMark;
}

export function stamp<T extends object>(record: T, now = Date.now()): T & Synced {
  return { ...record, updatedAt: nextStamp(now) };
}

/** A deletion that can travel: the record stays, marked. */
export function tombstone<T extends { id: string }>(record: T, now = Date.now()): T & Synced {
  const at = nextStamp(now);
  return { ...record, updatedAt: at, deletedAt: at };
}

export function isDeleted(record: Synced): boolean {
  return typeof record.deletedAt === "number";
}

/** Hides tombstones from the UI without dropping them from storage. */
export function live<T extends Synced>(records: T[]): T[] {
  return records.filter((r) => !isDeleted(r));
}

/**
 * Records created before sync existed have no `updatedAt`. Their ids embed the
 * creation time, so use that where possible — it keeps the ordering honest
 * rather than making every old record look like it changed just now.
 */
export function backfillUpdatedAt<T extends { id: string } & Synced>(record: T): T {
  if (typeof record.updatedAt === "number") return record;
  const match = /(\d{13})/.exec(record.id);
  const derived = match ? Number(match[1]) : 1;
  return { ...record, updatedAt: derived };
}

function mergeRecords<T extends { id: string } & Synced>(local: T[], incoming: T[]): {
  merged: T[];
  applied: number;
} {
  const byId = new Map(local.map((r) => [r.id, backfillUpdatedAt(r)]));
  let applied = 0;
  for (const record of incoming) observeTime(record.updatedAt);

  for (const record of incoming) {
    if (!record?.id || typeof record.updatedAt !== "number") continue;
    const existing = byId.get(record.id);
    // Same rule as the server: strictly newer wins, ties keep what we have.
    if (existing && (existing.updatedAt ?? 0) >= record.updatedAt) continue;
    byId.set(record.id, record);
    applied++;
  }
  return { merged: [...byId.values()], applied };
}

function changedSince<T extends { id: string } & Synced>(records: T[], since: number): T[] {
  return records.map(backfillUpdatedAt).filter((r) => (r.updatedAt ?? 0) > since);
}

interface SyncRequest {
  since: number;
  changes: Record<string, unknown>;
}

interface SyncResponse {
  serverTime: number;
  applied: number;
  readOnly?: boolean;
  changes: Record<string, unknown>;
}

async function call<T>(
  serverUrl: string,
  path: string,
  options: { method?: string; token?: string; body?: unknown } = {}
): Promise<T> {
  const base = serverUrl.replace(/\/+$/, "");
  const response = await fetch(`${base}${path}`, {
    method: options.method ?? "GET",
    headers: {
      "Content-Type": "application/json",
      ...(options.token ? { Authorization: `Bearer ${options.token}` } : {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  const text = await response.text();
  let payload: unknown;
  try {
    payload = text ? JSON.parse(text) : {};
  } catch {
    // A tunnel that's down returns Cloudflare's HTML error page, not JSON.
    throw new Error(
      response.ok ? "The server sent something unreadable." : `Server error (${response.status}).`
    );
  }

  if (!response.ok) {
    throw new Error((payload as { error?: string })?.error ?? `Request failed (${response.status}).`);
  }
  return payload as T;
}

export interface ServerHealth {
  ok: boolean;
  claimed: boolean;
  stats?: Record<string, number>;
}

export function checkServer(serverUrl: string): Promise<ServerHealth> {
  return call<ServerHealth>(serverUrl, "/api/health");
}

export function claimServer(
  serverUrl: string,
  email: string,
  password: string,
  name: string
): Promise<{ token: string; user: CloudSession["user"] }> {
  return call(serverUrl, "/api/claim", { method: "POST", body: { email, password, name } });
}

export function signIn(
  serverUrl: string,
  email: string,
  password: string,
  inviteCode?: string
): Promise<{ token: string; user: CloudSession["user"] }> {
  return call(serverUrl, "/api/login", {
    method: "POST",
    body: { email, password, inviteCode },
  });
}

export interface CloudUser {
  id: string;
  email: string;
  name: string;
  role: string;
  pendingInvite: boolean;
  lastSeenAt?: number;
}

export function listUsers(session: CloudSession): Promise<{ users: CloudUser[] }> {
  return call(session.serverUrl, "/api/users", { token: session.token });
}

export function inviteUser(
  session: CloudSession,
  email: string,
  name: string,
  role: "bookkeeper" | "viewer"
): Promise<{ user: CloudUser; inviteCode: string }> {
  return call(session.serverUrl, "/api/users", {
    method: "POST",
    token: session.token,
    body: { email, name, role },
  });
}

export function removeUser(session: CloudSession, userId: string): Promise<{ ok: boolean }> {
  return call(session.serverUrl, `/api/users/${userId}`, {
    method: "DELETE",
    token: session.token,
  });
}

/**
 * One exchange: push what changed here since the last sync, apply what the
 * server sends back. Returns the ledger to persist and the session cursor to
 * store alongside it.
 *
 * Settings carry the logo as a data URI, so a colleague signing in on another
 * phone gets branded invoices without doing anything.
 */
export async function syncOnce(
  session: CloudSession,
  ledger: Ledger
): Promise<{ outcome: SyncOutcome; ledger: Ledger; session: CloudSession }> {
  const since = session.lastSyncAt ?? 0;
  const pushedSince = session.lastPushedAt ?? 0;
  // The new cursor is the highest stamp this exchange carries, never a reading
  // of the clock: stamps are monotonic and the clock is not, so a wall-clock
  // cursor can sit above a stamp that was never sent and hide it for good.
  // Anything stamped while the request is in flight outranks this and is
  // therefore still due next time.
  let pushedAt = pushedSince;
  const note = (moment: number | undefined) => {
    if (typeof moment === "number" && moment > pushedAt) pushedAt = moment;
  };

  const changes: Record<string, unknown> = {};
  let pushed = 0;
  for (const name of COLLECTIONS) {
    const records = (ledger[FIELD[name]] ?? []) as ({ id: string } & Synced)[];
    const batch = changedSince(records, pushedSince);
    if (batch.length) {
      changes[name] = batch;
      pushed += batch.length;
      for (const record of batch) note(record.updatedAt);
    }
  }

  // The logo rides along as a data URI — it's the whole point of storing it
  // inline. Only the legacy file path is dropped, since a path from one device
  // means nothing on another.
  const { logoUri: _deadPath, ...syncableSettings } = ledger.settings;
  const settingsUpdatedAt = ledger.settings.updatedAt ?? 0;
  if (settingsUpdatedAt > pushedSince) {
    changes.settings = { value: syncableSettings, updatedAt: settingsUpdatedAt };
    note(settingsUpdatedAt);
    pushed++;
  }
  const openingUpdatedAt = ledger.openingBankUpdatedAt ?? 0;
  if (openingUpdatedAt > pushedSince) {
    changes.openingBank = { value: ledger.openingBank, updatedAt: openingUpdatedAt };
    note(openingUpdatedAt);
    pushed++;
  }

  let response: SyncResponse;
  try {
    response = await call<SyncResponse>(session.serverUrl, "/api/sync", {
      method: "POST",
      token: session.token,
      body: { since, changes } satisfies SyncRequest,
    });
  } catch (e) {
    return {
      outcome: { ok: false, pushed: 0, pulled: 0, error: (e as Error).message },
      ledger,
      session,
    };
  }

  let pulled = 0;
  const next: Ledger = { ...ledger };

  for (const name of COLLECTIONS) {
    const incoming = response.changes?.[name];
    if (!Array.isArray(incoming) || !incoming.length) continue;
    const field = FIELD[name];
    const { merged, applied } = mergeRecords(
      (next[field] ?? []) as ({ id: string } & Synced)[],
      incoming as ({ id: string } & Synced)[]
    );
    (next as unknown as Record<string, unknown>)[field] = merged;
    pulled += applied;
  }

  const incomingSettings = response.changes?.settings as
    | { value: Partial<Settings>; updatedAt: number }
    | undefined;
  if (incomingSettings && incomingSettings.updatedAt > (next.settings.updatedAt ?? 0)) {
    next.settings = {
      ...next.settings,
      ...incomingSettings.value,
      updatedAt: incomingSettings.updatedAt,
    };
    pulled++;
  }

  const incomingOpening = response.changes?.openingBank as
    | { value: number; updatedAt: number }
    | undefined;
  if (incomingOpening && incomingOpening.updatedAt > (next.openingBankUpdatedAt ?? 0)) {
    next.openingBank = incomingOpening.value;
    next.openingBankUpdatedAt = incomingOpening.updatedAt;
    pulled++;
  }

  return {
    outcome: {
      ok: true,
      pushed: response.applied,
      pulled,
      readOnly: response.readOnly,
    },
    ledger: normaliseLedger(next),
    session: {
      ...session,
      // The server's clock, never ours — the pull cursor has to come from the
      // side that stamps receipt, or a skewed device silently misses records.
      lastSyncAt: response.serverTime,
      // And ours, never the server's, for deciding what is left to send.
      lastPushedAt: pushedAt,
      lastSyncedIso: new Date().toISOString(),
    },
  };
}
