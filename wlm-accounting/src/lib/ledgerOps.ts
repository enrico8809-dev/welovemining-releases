// Every change the books can undergo, as a pure function of the books.
//
// These exist apart from the context for two reasons. They can be tested
// without rendering anything, and — more importantly — they force each change
// to be written as a function of the *current* ledger rather than of whatever
// ledger a React closure happened to capture.
//
// That distinction was not academic. Posting an imported statement looped over
// the selected lines calling the context's `addTxn` for each one. Every call
// rebuilt the ledger from the same captured snapshot, so each overwrote the
// last: fifty statement lines posted one transaction, and the screen reported
// that it had posted fifty. LedgerWriter below is the fix — it always applies a
// change to the value it last produced.

import { Txn } from "./accounting";
import { BusinessDoc } from "./invoices";
import { StockMovement } from "./inventory";
import { Reconciliation } from "./reconcile";
import { Ledger, Settings } from "./ledgerModel";
import { stamp, tombstone } from "./sync";

export type LedgerChange = (ledger: Ledger) => Ledger;

export const addTxn = (txn: Txn): LedgerChange => (l) => ({
  ...l,
  txns: [stamp(txn), ...l.txns],
});

/** A whole statement import in one change, and so in one save. */
export const addTxns = (txns: Txn[]): LedgerChange => (l) => ({
  ...l,
  txns: [...txns.map((t) => stamp(t)), ...l.txns],
});

export const updateTxn = (txn: Txn): LedgerChange => (l) => ({
  ...l,
  txns: l.txns.map((t) => (t.id === txn.id ? stamp(txn) : t)),
});

// Deleting marks rather than drops, so the deletion can reach other devices.
// Tombstones are filtered out of everything the UI reads.
export const removeTxn = (id: string): LedgerChange => (l) => ({
  ...l,
  txns: l.txns.map((t) => (t.id === id ? tombstone(t) : t)),
});

export const saveDoc = (doc: BusinessDoc): LedgerChange => (l) => ({
  ...l,
  docs: l.docs.some((d) => d.id === doc.id)
    ? l.docs.map((d) => (d.id === doc.id ? stamp(doc) : d))
    : [stamp(doc), ...l.docs],
});

export const removeDoc = (id: string): LedgerChange => (l) => ({
  ...l,
  docs: l.docs.map((d) => (d.id === id ? tombstone(d) : d)),
});

export const addMovement = (movement: StockMovement): LedgerChange => (l) => ({
  ...l,
  movements: [stamp(movement), ...l.movements],
});

export const removeMovement = (id: string): LedgerChange => (l) => ({
  ...l,
  movements: l.movements.map((m) => (m.id === id ? tombstone(m) : m)),
});

export const addReconciliation = (rec: Reconciliation): LedgerChange => (l) => ({
  ...l,
  reconciliations: [stamp(rec), ...l.reconciliations],
});

export const removeReconciliation = (id: string): LedgerChange => (l) => ({
  ...l,
  reconciliations: l.reconciliations.map((r) => (r.id === id ? tombstone(r) : r)),
});

export const setOpeningBank = (amount: number): LedgerChange => (l) => ({
  ...l,
  openingBank: amount,
  openingBankUpdatedAt: Date.now(),
});

export const updateSettings = (patch: Partial<Settings>): LedgerChange => (l) => ({
  ...l,
  settings: { ...l.settings, ...patch, updatedAt: Date.now() },
});

export const replace = (ledger: Ledger): LedgerChange => () => ledger;

/**
 * Holds the current books and applies changes to them in order.
 *
 * `publish` hands the new value to React; `save` writes it to wherever this
 * platform keeps it. Saves are chained rather than awaited in place, so a burst
 * of edits cannot reorder on disk, and a caller that doesn't await still gets
 * its change applied to the right base.
 */
export class LedgerWriter {
  private current: Ledger;
  private saving: Promise<void> = Promise.resolve();

  constructor(
    initial: Ledger,
    private readonly publish: (ledger: Ledger) => void,
    private readonly save: (ledger: Ledger) => Promise<void>
  ) {
    this.current = initial;
  }

  get value(): Ledger {
    return this.current;
  }

  /** Loading from disk or finishing a sync: a new baseline, not an edit. */
  adopt(ledger: Ledger): void {
    this.current = ledger;
    this.publish(ledger);
  }

  apply(change: LedgerChange): Promise<Ledger> {
    const next = change(this.current);
    this.current = next;
    this.publish(next);

    this.saving = this.saving.catch(() => undefined).then(() => this.save(next));
    return this.saving.then(() => next);
  }
}
