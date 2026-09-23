// The sync merge rule, shared in spirit with the app's copy in
// wlm-accounting/src/lib/sync.ts. Keep the two in step — the whole protocol
// rests on both sides resolving a conflict the same way.
//
// Model: offline-first, last-write-wins per record.
//
//   Every record carries `updatedAt` (client clock, milliseconds) and an
//   optional `deletedAt`. A record is deleted by stamping `deletedAt`, never by
//   dropping it, because a hard delete is invisible to a device that was
//   offline and would simply be resurrected on its next push.
//
// Clock skew is handled by separating two concerns that look like one:
//
//   `updatedAt` — the client's clock. Used ONLY to decide which version wins.
//   `_srv`      — the server's clock, stamped on receipt. Used ONLY as the
//                 pull cursor.
//
// Using the client clock as a cursor is the classic bug here: a device whose
// clock runs slow writes records "in the past", and every other device skips
// straight over them forever.

export interface SyncRecord {
  id: string;
  updatedAt: number;
  deletedAt?: number;
  [key: string]: unknown;
}

/** A record as held server-side, with the server's own receipt stamp. */
export interface StoredRecord extends SyncRecord {
  _srv: number;
}

/**
 * Does `incoming` replace `existing`?
 *
 * Ties keep the existing record, so a repeated push of the same data is a
 * no-op rather than a churn of identical writes.
 */
export function incomingWins(incoming: SyncRecord, existing: SyncRecord | undefined): boolean {
  if (!existing) return true;
  return incoming.updatedAt > existing.updatedAt;
}

/**
 * Merges a batch of incoming records into a collection keyed by id.
 * Returns the number actually applied, so a push can report what landed.
 */
export function mergeInto(
  collection: Map<string, StoredRecord>,
  incoming: SyncRecord[],
  serverNow: number
): number {
  let applied = 0;
  for (const record of incoming) {
    if (!record?.id || typeof record.updatedAt !== "number") continue;
    const existing = collection.get(record.id);
    if (!incomingWins(record, existing)) continue;
    collection.set(record.id, { ...record, _srv: serverNow });
    applied++;
  }
  return applied;
}

/** Everything the server has seen since the caller's cursor. */
export function changedSince(
  collection: Map<string, StoredRecord>,
  since: number
): StoredRecord[] {
  const out: StoredRecord[] = [];
  for (const record of collection.values()) {
    if (record._srv > since) out.push(record);
  }
  return out;
}

/** Strips the server's bookkeeping before sending a record to a client. */
export function forWire(record: StoredRecord): SyncRecord {
  const { _srv, ...rest } = record;
  return rest as SyncRecord;
}

/**
 * Tombstones are kept so deletions reach devices that were offline, but not
 * forever. Anything the server received longer ago than the retention window is
 * dropped — by then every device has long since seen it.
 *
 * Retention is measured against `_srv`, NOT the client's `deletedAt`. Using the
 * client clock here would let a device whose clock is wrong have its tombstone
 * purged on the very request that delivered it, so the deletion would never
 * reach anyone else and the next device to sync would resurrect the record.
 */
export const TOMBSTONE_RETENTION_MS = 90 * 24 * 60 * 60 * 1000;

export function purgeTombstones(
  collection: Map<string, StoredRecord>,
  now: number,
  retentionMs: number = TOMBSTONE_RETENTION_MS
): number {
  let purged = 0;
  for (const [id, record] of collection) {
    if (record.deletedAt && now - record._srv > retentionMs) {
      collection.delete(id);
      purged++;
    }
  }
  return purged;
}

/** A value that isn't a collection — settings, the opening balance. */
export interface SingletonRecord<T> {
  value: T;
  /** The writing device's clock. Decides which version wins. */
  updatedAt: number;
  /** This server's clock, set on receipt. Decides who still needs it. */
  _srv?: number;
}

export function mergeSingleton<T>(
  existing: SingletonRecord<T> | undefined,
  incoming: SingletonRecord<T> | undefined,
  now: number
): SingletonRecord<T> | undefined {
  if (!incoming) return existing;
  const stamped = { ...incoming, _srv: now };
  if (!existing) return stamped;
  return incoming.updatedAt > existing.updatedAt ? stamped : existing;
}

/**
 * Whether a singleton is newer than a caller's cursor.
 *
 * Compared against the server's receipt time, not the writer's `updatedAt`.
 * Those are different clocks: a device running slow writes settings stamped
 * before another device's cursor, and comparing the two directly means that
 * change is never delivered — the logo or the exchange rate simply never
 * arrives, with nothing to show for it. Records already work this way; this is
 * the same rule for the two values that aren't in a collection.
 *
 * A record stored before `_srv` existed falls back to `updatedAt`, which is the
 * behaviour it had when it was written.
 */
export function singletonChangedSince<T>(
  record: SingletonRecord<T> | undefined,
  since: number
): boolean {
  if (!record) return false;
  return (record._srv ?? record.updatedAt) > since;
}
