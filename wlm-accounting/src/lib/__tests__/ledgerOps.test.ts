import { Txn } from "../accounting";
import { EMPTY_LEDGER, Ledger } from "../ledgerModel";
import { LedgerWriter, addTxn, addTxns, removeTxn, updateTxn } from "../ledgerOps";
import { live } from "../sync";

function txn(id: string, amount: number): Txn {
  return {
    id,
    date: "2026-03-09",
    desc: `Entry ${id}`,
    amount,
    debit: "bank",
    credit: "sales",
    recipe: "sale_cash",
  };
}

function writerOn(initial: Ledger = EMPTY_LEDGER) {
  const saved: Ledger[] = [];
  const published: Ledger[] = [];
  const writer = new LedgerWriter(
    initial,
    (l) => published.push(l),
    async (l) => {
      saved.push(l);
    }
  );
  return { writer, saved, published };
}

describe("applying a run of changes", () => {
  it("keeps every entry when they are added one after another", async () => {
    // The bug this guards: posting an imported statement looped over the lines
    // calling addTxn for each. Every call rebuilt the ledger from the same
    // captured snapshot, so all but the last were silently dropped — and the
    // screen reported the full count as posted.
    const { writer } = writerOn();

    for (const id of ["a", "b", "c"]) {
      await writer.apply(addTxn(txn(id, 100)));
    }

    expect(writer.value.txns.map((t) => t.id).sort()).toEqual(["a", "b", "c"]);
  });

  it("keeps every entry even when the caller doesn't wait between them", async () => {
    const { writer } = writerOn();

    await Promise.all([
      writer.apply(addTxn(txn("a", 1))),
      writer.apply(addTxn(txn("b", 2))),
      writer.apply(addTxn(txn("c", 3))),
    ]);

    expect(writer.value.txns).toHaveLength(3);
  });

  it("saves the books after each change", async () => {
    const { writer, saved } = writerOn();

    await writer.apply(addTxn(txn("a", 1)));
    await writer.apply(addTxn(txn("b", 2)));

    expect(saved).toHaveLength(2);
    expect(saved[1].txns).toHaveLength(2);
  });

  it("saves in the order the changes were made", async () => {
    const { writer, saved } = writerOn();

    await Promise.all([
      writer.apply(addTxn(txn("a", 1))),
      writer.apply(addTxn(txn("b", 2))),
    ]);

    expect(saved.map((l) => l.txns.length)).toEqual([1, 2]);
  });

  it("publishes each new version for the screen to render", async () => {
    const { writer, published } = writerOn();

    await writer.apply(addTxn(txn("a", 1)));

    expect(published).toHaveLength(1);
    expect(published[0].txns[0].id).toBe("a");
  });

  it("takes a loaded or synced ledger as the new baseline", async () => {
    const { writer, saved, published } = writerOn();

    writer.adopt({ ...EMPTY_LEDGER, txns: [txn("loaded", 500)] });
    await writer.apply(addTxn(txn("new", 100)));

    expect(writer.value.txns.map((t) => t.id)).toEqual(["new", "loaded"]);
    // Adopting is not an edit, so it isn't written back.
    expect(saved).toHaveLength(1);
    expect(published).toHaveLength(2);
  });
});

describe("the changes themselves", () => {
  it("adds a whole import in one change", () => {
    const next = addTxns([txn("a", 1), txn("b", 2)])(EMPTY_LEDGER);
    expect(next.txns).toHaveLength(2);
  });

  it("stamps everything it writes, so sync can order it", () => {
    const next = addTxns([txn("a", 1), txn("b", 2)])(EMPTY_LEDGER);
    expect(next.txns.every((t) => typeof t.updatedAt === "number")).toBe(true);
  });

  it("replaces an entry in place when it is edited", () => {
    const start = addTxn(txn("a", 100))(EMPTY_LEDGER);
    const next = updateTxn({ ...txn("a", 250), desc: "Corrected" })(start);

    expect(next.txns).toHaveLength(1);
    expect(next.txns[0].amount).toBe(250);
    expect(next.txns[0].desc).toBe("Corrected");
  });

  it("marks a deletion instead of dropping it, so it can travel", () => {
    const start = addTxn(txn("a", 100))(EMPTY_LEDGER);
    const next = removeTxn("a")(start);

    expect(next.txns).toHaveLength(1);
    expect(next.txns[0].deletedAt).toBeDefined();
    expect(live(next.txns)).toHaveLength(0);
  });

  it("leaves the rest of the books alone", () => {
    const start: Ledger = { ...EMPTY_LEDGER, openingBank: 5000 };
    const next = addTxn(txn("a", 100))(start);

    expect(next.openingBank).toBe(5000);
    expect(next.settings).toBe(start.settings);
  });
});
