import {
  SyncRecord,
  StoredRecord,
  changedSince,
  forWire,
  incomingWins,
  mergeInto,
  mergeSingleton,
  purgeTombstones,
  singletonChangedSince,
} from "../merge";

function rec(id: string, updatedAt: number, extra: Partial<SyncRecord> = {}): SyncRecord {
  return { id, updatedAt, desc: `entry ${id}`, ...extra };
}

function collection(...records: StoredRecord[]): Map<string, StoredRecord> {
  return new Map(records.map((r) => [r.id, r]));
}

describe("which version wins", () => {
  it("accepts anything the server has never seen", () => {
    expect(incomingWins(rec("a", 100), undefined)).toBe(true);
  });

  it("accepts a newer version", () => {
    expect(incomingWins(rec("a", 200), rec("a", 100))).toBe(true);
  });

  it("rejects an older version", () => {
    expect(incomingWins(rec("a", 50), rec("a", 100))).toBe(false);
  });

  it("keeps what it has on a tie, so a repeated push is a no-op", () => {
    expect(incomingWins(rec("a", 100), rec("a", 100))).toBe(false);
  });
});

describe("merging a push", () => {
  it("stamps the server's own clock on receipt", () => {
    const store = collection();
    mergeInto(store, [rec("a", 100)], 5000);
    expect(store.get("a")!._srv).toBe(5000);
    expect(store.get("a")!.updatedAt).toBe(100); // client clock preserved
  });

  it("counts only what it actually applied", () => {
    const store = collection({ ...rec("a", 200), _srv: 1 });
    const applied = mergeInto(store, [rec("a", 100), rec("b", 100)], 5000);
    expect(applied).toBe(1);
  });

  it("ignores malformed records rather than corrupting the store", () => {
    const store = collection();
    const applied = mergeInto(
      store,
      [{ id: "", updatedAt: 1 }, { updatedAt: 1 } as SyncRecord, { id: "c" } as SyncRecord],
      5000
    );
    expect(applied).toBe(0);
    expect(store.size).toBe(0);
  });

  it("lets a later push overwrite an earlier one", () => {
    const store = collection();
    mergeInto(store, [rec("a", 100, { desc: "first" })], 1000);
    mergeInto(store, [rec("a", 200, { desc: "second" })], 2000);
    expect(store.get("a")!.desc).toBe("second");
  });

  it("does not let a stale device clobber a newer edit", () => {
    // Phone edits at t=200 and syncs. Laptop was offline holding t=100.
    const store = collection();
    mergeInto(store, [rec("a", 200, { desc: "phone" })], 1000);
    mergeInto(store, [rec("a", 100, { desc: "stale laptop" })], 2000);
    expect(store.get("a")!.desc).toBe("phone");
  });
});

describe("the pull cursor", () => {
  it("returns everything the caller hasn't seen", () => {
    const store = collection(
      { ...rec("a", 1), _srv: 1000 },
      { ...rec("b", 1), _srv: 2000 },
      { ...rec("c", 1), _srv: 3000 }
    );
    expect(changedSince(store, 1500).map((r) => r.id).sort()).toEqual(["b", "c"]);
  });

  it("returns nothing when the caller is up to date", () => {
    const store = collection({ ...rec("a", 1), _srv: 1000 });
    expect(changedSince(store, 1000)).toHaveLength(0);
  });

  it("returns everything from a cursor of zero", () => {
    const store = collection({ ...rec("a", 1), _srv: 1 }, { ...rec("b", 1), _srv: 2 });
    expect(changedSince(store, 0)).toHaveLength(2);
  });

  it("still delivers a record written by a device whose clock is far behind", () => {
    // This is the bug the _srv/updatedAt split exists to prevent: a slow client
    // clock must not make its records invisible to everyone else.
    const store = collection();
    const serverNow = 10_000;
    mergeInto(store, [rec("slow", 5)], serverNow); // client thinks it's 1970
    expect(changedSince(store, 9_000).map((r) => r.id)).toEqual(["slow"]);
  });

  it("does not deliver a record written by a device whose clock is far ahead", () => {
    // Equally: a fast clock must not let a record skip the cursor of others.
    const store = collection();
    mergeInto(store, [rec("fast", 99_999_999_999)], 10_000);
    expect(changedSince(store, 20_000)).toHaveLength(0);
  });
});

describe("deletions", () => {
  it("travels as a tombstone, not a disappearance", () => {
    const store = collection({ ...rec("a", 100), _srv: 1000 });
    mergeInto(store, [rec("a", 200, { deletedAt: 200 })], 2000);

    const pulled = changedSince(store, 1500);
    expect(pulled).toHaveLength(1);
    expect(pulled[0].deletedAt).toBe(200);
  });

  it("cannot be undone by a device that never saw the delete", () => {
    const store = collection();
    mergeInto(store, [rec("a", 300, { deletedAt: 300 })], 2000);
    mergeInto(store, [rec("a", 100)], 3000); // offline device still has it
    expect(store.get("a")!.deletedAt).toBe(300);
  });

  it("can be undone by a genuinely later edit", () => {
    const store = collection();
    mergeInto(store, [rec("a", 100, { deletedAt: 100 })], 1000);
    mergeInto(store, [rec("a", 500, { desc: "restored" })], 2000);
    expect(store.get("a")!.deletedAt).toBeUndefined();
    expect(store.get("a")!.desc).toBe("restored");
  });
});

describe("tombstone purging", () => {
  const DAY = 24 * 60 * 60 * 1000;

  it("drops tombstones the server received long ago", () => {
    const now = 200 * DAY;
    const store = collection({ ...rec("old", 1, { deletedAt: 1 * DAY }), _srv: 1 * DAY });
    expect(purgeTombstones(store, now)).toBe(1);
    expect(store.size).toBe(0);
  });

  it("keeps recent tombstones, so offline devices still learn of the delete", () => {
    const now = 100 * DAY;
    const store = collection({ ...rec("recent", 1, { deletedAt: 99 * DAY }), _srv: 99 * DAY });
    expect(purgeTombstones(store, now)).toBe(0);
    expect(store.size).toBe(1);
  });

  it("keeps a tombstone from a device whose clock is wrong", () => {
    // deletedAt claims 1970; the server received it a moment ago. Purging on
    // the client clock here would drop the tombstone before it ever reached
    // another device, and the record would come back from the dead.
    const now = 200 * DAY;
    const store = collection({ ...rec("skewed", 1, { deletedAt: 2000 }), _srv: now - 1000 });
    expect(purgeTombstones(store, now)).toBe(0);
    expect(store.size).toBe(1);
  });

  it("never purges a live record", () => {
    const store = collection({ ...rec("live", 1), _srv: 1 });
    expect(purgeTombstones(store, 9_999_999_999_999)).toBe(0);
    expect(store.size).toBe(1);
  });
});

describe("singletons", () => {
  const SERVER_NOW = 9_000;

  it("takes the newer of the two", () => {
    expect(
      mergeSingleton({ value: "old", updatedAt: 1 }, { value: "new", updatedAt: 2 }, SERVER_NOW)
    ).toEqual({ value: "new", updatedAt: 2, _srv: SERVER_NOW });
  });

  it("keeps the existing value on a tie", () => {
    expect(
      mergeSingleton(
        { value: "held", updatedAt: 5 },
        { value: "other", updatedAt: 5 },
        SERVER_NOW
      )!.value
    ).toBe("held");
  });

  it("accepts a first value", () => {
    expect(
      mergeSingleton(undefined, { value: "first", updatedAt: 1 }, SERVER_NOW)!.value
    ).toBe("first");
  });

  it("leaves the existing value alone when nothing is pushed", () => {
    expect(mergeSingleton({ value: "held", updatedAt: 1 }, undefined, SERVER_NOW)!.value).toBe(
      "held"
    );
  });

  it("stamps what it accepts with its own clock", () => {
    const stored = mergeSingleton(undefined, { value: "x", updatedAt: 1 }, SERVER_NOW);
    expect(stored!._srv).toBe(SERVER_NOW);
  });
});

describe("delivering singletons to a device that is behind", () => {
  it("sends a value the device hasn't seen", () => {
    expect(singletonChangedSince({ value: "x", updatedAt: 1, _srv: 500 }, 400)).toBe(true);
  });

  it("doesn't resend one it already has", () => {
    expect(singletonChangedSince({ value: "x", updatedAt: 1, _srv: 500 }, 500)).toBe(false);
  });

  it("delivers a change written by a device whose clock runs slow", () => {
    // The whole point of the second clock. A phone two minutes behind stamps
    // settings with an `updatedAt` older than every other device's cursor;
    // judged on that, the new logo or exchange rate would never be handed out,
    // and nothing would show that it hadn't been.
    const slowDevice = { value: "new logo", updatedAt: 1_000, _srv: 8_000 };
    expect(singletonChangedSince(slowDevice, 5_000)).toBe(true);
  });

  it("falls back to updatedAt for a value stored before the server stamped them", () => {
    expect(singletonChangedSince({ value: "legacy", updatedAt: 700 }, 400)).toBe(true);
    expect(singletonChangedSince({ value: "legacy", updatedAt: 300 }, 400)).toBe(false);
  });

  it("has nothing to send when there is no value", () => {
    expect(singletonChangedSince(undefined, 0)).toBe(false);
  });
});

describe("the wire format", () => {
  it("hides the server's cursor stamp from clients", () => {
    const wire = forWire({ ...rec("a", 100), _srv: 5000 });
    expect(wire).not.toHaveProperty("_srv");
    expect(wire.id).toBe("a");
    expect(wire.updatedAt).toBe(100);
  });
});

describe("a full round trip", () => {
  it("converges two devices that edited offline", () => {
    const server = collection();

    // Phone captures two entries offline, then syncs.
    mergeInto(server, [rec("t1", 1000), rec("t2", 1100)], 10_000);

    // Laptop, which had synced at cursor 5000, pulls.
    const forLaptop = changedSince(server, 5_000).map(forWire);
    expect(forLaptop.map((r) => r.id).sort()).toEqual(["t1", "t2"]);

    // Laptop edits t1 and adds t3, then pushes.
    mergeInto(server, [rec("t1", 2000, { desc: "edited" }), rec("t3", 2100)], 20_000);

    // Phone pulls from its own cursor and sees both.
    const forPhone = changedSince(server, 10_000).map(forWire);
    expect(forPhone.map((r) => r.id).sort()).toEqual(["t1", "t3"]);
    expect(forPhone.find((r) => r.id === "t1")!.desc).toBe("edited");

    // Nothing was lost along the way.
    expect(server.size).toBe(3);
  });

  it("survives the same batch being pushed twice", () => {
    const server = collection();
    const batch = [rec("a", 100), rec("b", 200)];
    mergeInto(server, batch, 1000);
    const appliedAgain = mergeInto(server, batch, 2000);

    expect(appliedAgain).toBe(0);
    expect(server.size).toBe(2);
    // A retry must not bump the cursor stamp, or every device re-pulls the lot.
    expect(server.get("a")!._srv).toBe(1000);
  });
});
