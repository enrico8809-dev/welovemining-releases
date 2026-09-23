import { SyncSchedule } from "../syncSchedule";

const DEBOUNCE = 4_000;
const INTERVAL = 60_000;
const STALE = 30_000;

function schedule() {
  return new SyncSchedule({
    debounceMs: DEBOUNCE,
    intervalMs: INTERVAL,
    staleMs: STALE,
    maxBackoffMs: 300_000,
  });
}

/** A successful exchange at `at`, so tests can start from a known state. */
function synced(s: SyncSchedule, at: number): void {
  s.noteStarted(at);
  s.noteFinished(at, true);
}

describe("syncing when the app opens", () => {
  it("syncs on the first tick", () => {
    expect(schedule().due(1_000, true)).toBe("opened");
  });

  it("doesn't call it an opening again once it has run", () => {
    const s = schedule();
    synced(s, 1_000);
    expect(s.due(1_100, true)).toBeNull();
  });
});

describe("syncing after a change", () => {
  it("waits for the burst to finish rather than going per keystroke", () => {
    const s = schedule();
    synced(s, 0);

    s.noteChange(1_000);
    expect(s.due(2_000)).toBeNull();
    expect(s.due(1_000 + DEBOUNCE)).toBe("changed");
  });

  it("times the wait from the first change, not the last", () => {
    // Ten lines captured in a row shouldn't keep pushing the sync away.
    const s = schedule();
    synced(s, 0);

    s.noteChange(1_000);
    s.noteChange(2_000);
    s.noteChange(3_000);

    expect(s.due(1_000 + DEBOUNCE)).toBe("changed");
  });

  it("clears the debt once the exchange succeeds", () => {
    const s = schedule();
    synced(s, 0);
    s.noteChange(1_000);

    s.noteStarted(5_000);
    s.noteFinished(6_000, true);

    expect(s.hasUnsentWork).toBe(false);
    expect(s.due(7_000)).toBeNull();
  });

  it("keeps the debt when the exchange fails", () => {
    const s = schedule();
    synced(s, 0);
    s.noteChange(1_000);

    s.noteStarted(5_000);
    s.noteFinished(6_000, false);

    expect(s.hasUnsentWork).toBe(true);
  });
});

describe("syncing on a timer", () => {
  it("looks for the other device's work once the interval is up", () => {
    const s = schedule();
    synced(s, 0);

    expect(s.due(INTERVAL - 1)).toBeNull();
    expect(s.due(INTERVAL)).toBe("waited");
  });

  it("measures the interval from the last success, not the last attempt", () => {
    // Otherwise a server that is down resets the clock on every failure, and a
    // device that has not synced for an hour looks freshly synced.
    const s = schedule();
    synced(s, 0);

    s.noteStarted(10_000);
    s.noteFinished(11_000, false);

    expect(s.due(INTERVAL + 20_000)).not.toBeNull();
  });
});

describe("coming back to the window", () => {
  it("syncs when it has been sitting a while", () => {
    const s = schedule();
    synced(s, 0);
    expect(s.onReturn(STALE)).toBe("returned");
  });

  it("ignores flicking between two windows", () => {
    const s = schedule();
    synced(s, 0);
    expect(s.onReturn(2_000)).toBeNull();
  });
});

describe("a server that can't be reached", () => {
  it("backs off further with each failure", () => {
    const s = schedule();
    const first = failOnce(s, 1_000);
    const second = failOnce(s, 100_000);
    const third = failOnce(s, 200_000);

    expect(second).toBeGreaterThan(first);
    expect(third).toBeGreaterThan(second);
  });

  it("stops backing off at the ceiling", () => {
    const s = schedule();
    let at = 0;
    for (let i = 0; i < 20; i++) {
      at += 1_000_000;
      failOnce(s, at);
    }
    expect(s.backoffMs()).toBe(300_000);
  });

  it("holds off until the backoff has passed", () => {
    const s = schedule();
    synced(s, 0);
    s.noteChange(1_000);
    s.noteStarted(5_000);
    s.noteFinished(5_000, false);

    expect(s.due(5_000 + s.backoffMs() - 1)).toBeNull();
    expect(s.due(5_000 + s.backoffMs())).toBe("changed");
  });

  it("recovers completely once a sync goes through", () => {
    const s = schedule();
    failOnce(s, 1_000);
    failOnce(s, 100_000);
    synced(s, 200_000);

    expect(s.failing).toBe(false);
    expect(s.backoffMs()).toBe(0);
  });
});

describe("never two at once", () => {
  it("doesn't start another while one is running", () => {
    const s = schedule();
    s.noteChange(0);
    s.noteStarted(1_000);

    expect(s.due(1_000 + INTERVAL)).toBeNull();
    expect(s.onReturn(1_000 + INTERVAL)).toBeNull();
  });

  it("keeps work captured mid-exchange for the next one", () => {
    const s = schedule();
    synced(s, 0);

    s.noteStarted(10_000);
    s.noteChange(10_500); // typed while the request was in flight
    s.noteFinished(11_000, true);

    expect(s.hasUnsentWork).toBe(true);
  });
});

function failOnce(s: SyncSchedule, at: number): number {
  s.noteStarted(at);
  s.noteFinished(at, false);
  return s.backoffMs();
}
