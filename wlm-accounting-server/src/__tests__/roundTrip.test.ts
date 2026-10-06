// Two devices, one server, over real HTTP.
//
// Every other test here stops at the edge of one side: the client's merge rules,
// or the server's, each with the other stubbed out. This one starts the actual
// server on a socket and drives the actual client the apps ship with — the same
// syncOnce the phone and the Windows app call — so that "whatever I do on one
// shows up on the other" is something that has been observed rather than
// assumed.
//
// It also pins the two clock separations, because both failures are silent. A
// device whose clock runs behind the server's must still push its work, and a
// change it makes to settings must still reach everyone else.
//
// One caveat worth knowing when reading these: both "devices" run in this one
// process, so they share the module-level stamping clock that keeps stamps
// moving forwards. Real devices each have their own. That makes the ordering
// here strictly the order the calls are made, which is what the tests assert.

import { AddressInfo } from "node:net";
import { Server } from "node:http";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createApp } from "../server";
import { Store } from "../store";
import { newSecret } from "../auth";

import { SEED_ACCOUNTS, Txn, computeBalances } from "../../../wlm-accounting/src/lib/accounting";
import {
  CRYPTO_ACCOUNT,
  CRYPTO_GAINS_ACCOUNT,
  DEFAULT_CRYPTO,
  cryptoDisposalPostings,
  cryptoHoldings,
} from "../../../wlm-accounting/src/lib/crypto";
import { BusinessDoc, postingsForDocs } from "../../../wlm-accounting/src/lib/invoices";
import { EMPTY_LEDGER, Ledger } from "../../../wlm-accounting/src/lib/ledgerModel";
import { live, stamp, tombstone } from "../../../wlm-accounting/src/lib/sync";
import {
  CloudSession,
  claimServer,
  signIn,
  syncOnce,
} from "../../../wlm-accounting/src/lib/sync";

const OWNER = {
  email: "enrico@welovemining.co.za",
  password: "correct horse battery",
  name: "Enrico",
};

let server: Server;
let dir: string;
let url: string;

beforeEach(async () => {
  dir = mkdtempSync(join(tmpdir(), "wlm-e2e-"));
  const store = new Store(join(dir, "ledger.json"), newSecret);
  server = createApp(store).listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterEach(async () => {
  await new Promise((resolve) => server.close(resolve));
  rmSync(dir, { recursive: true, force: true });
});

/** A device: its own copy of the books and its own session. */
class Device {
  ledger: Ledger = EMPTY_LEDGER;

  constructor(public session: CloudSession) {}

  /** Captures something locally, exactly as the ledger writer would. */
  capture(txn: Txn, at = Date.now()): void {
    this.ledger = { ...this.ledger, txns: [stamp(txn, at), ...this.ledger.txns] };
  }

  edit(id: string, patch: Partial<Txn>, at = Date.now()): void {
    this.ledger = {
      ...this.ledger,
      txns: this.ledger.txns.map((t) => (t.id === id ? stamp({ ...t, ...patch }, at) : t)),
    };
  }

  delete(id: string, at = Date.now()): void {
    this.ledger = {
      ...this.ledger,
      txns: this.ledger.txns.map((t) => (t.id === id ? tombstone(t, at) : t)),
    };
  }

  changeSettings(patch: Partial<Ledger["settings"]>, at = Date.now()): void {
    this.ledger = {
      ...this.ledger,
      settings: { ...this.ledger.settings, ...patch, updatedAt: at },
    };
  }

  async sync(): Promise<{ pushed: number; pulled: number }> {
    const result = await syncOnce(this.session, this.ledger);
    expect(result.outcome.ok).toBe(true);
    this.ledger = result.ledger;
    this.session = result.session;
    return { pushed: result.outcome.pushed, pulled: result.outcome.pulled };
  }

  get entries(): Txn[] {
    return live(this.ledger.txns);
  }

  find(id: string): Txn | undefined {
    return this.entries.find((t) => t.id === id);
  }
}

function txn(id: string, amount: number, desc = `entry ${id}`): Txn {
  return {
    id,
    date: "2026-03-09",
    desc,
    amount,
    debit: "bank",
    credit: "sales",
    recipe: "sale_cash",
  };
}

/** The phone and the Windows machine, both signed in to the same server. */
async function twoDevices(): Promise<{ phone: Device; windows: Device }> {
  const claim = await claimServer(url, OWNER.email, OWNER.password, OWNER.name);
  const phone = new Device({
    serverUrl: url,
    token: claim.token,
    user: claim.user,
    lastSyncAt: 0,
  });

  const second = await signIn(url, OWNER.email, OWNER.password);
  const windows = new Device({
    serverUrl: url,
    token: second.token,
    user: second.user,
    lastSyncAt: 0,
  });

  return { phone, windows };
}

describe("one device to the other", () => {
  it("carries what was captured on the phone to Windows", async () => {
    const { phone, windows } = await twoDevices();

    phone.capture(txn("a", 1200.5, "S21 sale — Mining Co"));
    await phone.sync();
    await windows.sync();

    expect(windows.find("a")?.amount).toBe(1200.5);
    expect(windows.find("a")?.desc).toBe("S21 sale — Mining Co");
  });

  it("carries it back the other way", async () => {
    const { phone, windows } = await twoDevices();

    windows.capture(txn("w", 400));
    await windows.sync();
    await phone.sync();

    expect(phone.find("w")?.amount).toBe(400);
  });

  it("carries an edit", async () => {
    const { phone, windows } = await twoDevices();

    phone.capture(txn("a", 100));
    await phone.sync();
    await windows.sync();

    windows.edit("a", { amount: 250, desc: "Corrected" });
    await windows.sync();
    await phone.sync();

    expect(phone.find("a")?.amount).toBe(250);
    expect(phone.find("a")?.desc).toBe("Corrected");
  });

  it("carries a deletion, and it stays deleted", async () => {
    const { phone, windows } = await twoDevices();

    phone.capture(txn("a", 100));
    await phone.sync();
    await windows.sync();
    expect(windows.find("a")).toBeDefined();

    windows.delete("a");
    await windows.sync();
    await phone.sync();

    expect(phone.find("a")).toBeUndefined();

    // And doesn't come back on the next exchange, which is what a tombstone is
    // for: a deletion that is simply absent looks like a record the other side
    // has never seen.
    await phone.sync();
    await windows.sync();
    expect(phone.find("a")).toBeUndefined();
    expect(windows.find("a")).toBeUndefined();
  });

  it("carries the company details and the logo", async () => {
    const { phone, windows } = await twoDevices();

    phone.changeSettings({ companyName: "WeLoveMining Pty Ltd", logo: "data:image/png;base64,AAAA" });
    await phone.sync();
    await windows.sync();

    expect(windows.ledger.settings.companyName).toBe("WeLoveMining Pty Ltd");
    expect(windows.ledger.settings.logo).toBe("data:image/png;base64,AAAA");
  });

  it("carries the opening balance", async () => {
    const { phone, windows } = await twoDevices();

    phone.ledger = { ...phone.ledger, openingBank: 50_000, openingBankUpdatedAt: Date.now() };
    await phone.sync();
    await windows.sync();

    expect(windows.ledger.openingBank).toBe(50_000);
  });

  it("keeps both sides' work when they capture at the same time", async () => {
    const { phone, windows } = await twoDevices();

    phone.capture(txn("p", 100));
    windows.capture(txn("w", 200));

    await phone.sync();
    await windows.sync();
    await phone.sync();

    expect(phone.entries.map((t) => t.id).sort()).toEqual(["p", "w"]);
    expect(windows.entries.map((t) => t.id).sort()).toEqual(["p", "w"]);
  });

  it("settles on the later edit when both edited the same entry", async () => {
    const { phone, windows } = await twoDevices();

    phone.capture(txn("a", 100));
    await phone.sync();
    await windows.sync();

    // Both edit the same entry while apart; the phone's is made second.
    windows.edit("a", { desc: "windows first" });
    phone.edit("a", { desc: "phone second" });

    await windows.sync();
    await phone.sync();
    await windows.sync();

    expect(phone.find("a")?.desc).toBe("phone second");
    expect(windows.find("a")?.desc).toBe("phone second");
  });

  it("sends nothing when nothing has changed", async () => {
    const { phone } = await twoDevices();

    phone.capture(txn("a", 100));
    await phone.sync();

    const second = await phone.sync();
    expect(second.pushed).toBe(0);
    expect(second.pulled).toBe(0);
  });

  it("brings a device that has been off for a while fully up to date", async () => {
    const { phone, windows } = await twoDevices();

    for (const id of ["a", "b", "c", "d", "e"]) {
      phone.capture(txn(id, 100));
      await phone.sync();
    }

    await windows.sync();
    expect(windows.entries).toHaveLength(5);
  });
});

describe("a device whose clock disagrees with the server's", () => {
  // Every failure here is silent: nothing errors, the sync reports success, and
  // the work simply never arrives.
  const TWO_MINUTES = 2 * 60_000;
  const AN_HOUR = 60 * 60_000;

  it("pushes its work when the server's clock is well ahead of its own", async () => {
    const { phone, windows } = await twoDevices();
    await phone.sync();

    // As if the server's clock — and so the cursor it handed back — were an
    // hour ahead of the phone's. Deciding what to send by that cursor means the
    // phone's own stamps all look like the past, and it never sends anything
    // again.
    phone.session = { ...phone.session, lastSyncAt: Date.now() + AN_HOUR };

    phone.capture(txn("slow", 750));
    await phone.sync();
    await windows.sync();

    expect(windows.find("slow")?.amount).toBe(750);
  });

  it("gets its settings change out even though its clock runs behind", async () => {
    const { phone, windows } = await twoDevices();
    await phone.sync();
    await windows.sync();

    phone.changeSettings({ companyName: "Renamed on a slow phone" }, Date.now() - TWO_MINUTES);
    await phone.sync();
    await windows.sync();

    expect(windows.ledger.settings.companyName).toBe("Renamed on a slow phone");
  });

  it("keeps sending after its clock steps backwards", async () => {
    // What a network-time correction looks like from inside the app.
    const { phone, windows } = await twoDevices();

    phone.capture(txn("before", 100));
    await phone.sync();

    const realNow = Date.now;
    Date.now = () => realNow() - 30_000;
    try {
      phone.capture(txn("after", 200));
      await phone.sync();
    } finally {
      Date.now = realNow;
    }

    await windows.sync();
    expect(windows.find("after")?.amount).toBe(200);
  });

  it("an edit made after the clock stepped back still wins", async () => {
    const { phone, windows } = await twoDevices();

    phone.capture(txn("a", 100));
    await phone.sync();
    await windows.sync();

    const realNow = Date.now;
    Date.now = () => realNow() - 30_000;
    try {
      phone.edit("a", { desc: "corrected after the clock jumped" });
    } finally {
      Date.now = realNow;
    }

    await phone.sync();
    await windows.sync();

    expect(windows.find("a")?.desc).toBe("corrected after the clock jumped");
  });

  it("still receives records when its own clock runs fast", async () => {
    const { phone, windows } = await twoDevices();

    windows.capture(txn("w", 300));
    await windows.sync();

    // The pull cursor has to stay the server's, or a fast phone decides it is
    // already up to date and quietly stops receiving.
    phone.session = { ...phone.session, lastPushedAt: Date.now() + AN_HOUR };
    await phone.sync();

    expect(phone.find("w")?.amount).toBe(300);
  });
});

describe("what a viewer can do", () => {
  it("receives everything but changes nothing", async () => {
    const { phone } = await twoDevices();

    phone.capture(txn("a", 100));
    await phone.sync();

    // Invite a view-only account and sign it in.
    const invited = await fetch(`${url}/api/users`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${phone.session.token}`,
      },
      body: JSON.stringify({ email: "bookkeeper@example.com", name: "Thandi", role: "viewer" }),
    }).then((r) => r.json() as Promise<{ inviteCode: string }>);

    const viewerLogin = await signIn(
      url,
      "bookkeeper@example.com",
      "a password of their own",
      invited.inviteCode
    );
    const viewer = new Device({
      serverUrl: url,
      token: viewerLogin.token,
      user: viewerLogin.user,
      lastSyncAt: 0,
    });

    await viewer.sync();
    expect(viewer.find("a")?.amount).toBe(100);

    viewer.capture(txn("v", 999));
    await viewer.sync();

    // The phone should never see the viewer's entry.
    await phone.sync();
    expect(phone.find("v")).toBeUndefined();
  });
});

/**
 * Coins across two devices.
 *
 * Worth its own section because a crypto entry carries something no other entry
 * does — the units — and because the gain or loss on paying coins out is never
 * synced at all. It is worked out from the entries on each device, so the two
 * machines agree only if they are working from the same entries in the same
 * order. If they ever disagree, the two apps show two different profits for the
 * same month, which is exactly the class of bug the whole ledger is built to
 * make impossible.
 */
describe("crypto across devices", () => {
  const received: Txn = {
    id: "c1",
    date: "2026-01-10",
    desc: "USDT from Mining Co",
    amount: 100_000,
    debit: CRYPTO_ACCOUNT,
    credit: "sales",
    recipe: "crypto_in",
    crypto: { asset: "USDT", units: 5_400 },
  };

  const paidOut: Txn = {
    id: "c2",
    date: "2026-02-10",
    desc: "Deposit to supplier",
    amount: 95_000,
    debit: "inventory",
    credit: CRYPTO_ACCOUNT,
    recipe: "crypto_buy_stock",
    crypto: { asset: "USDT", units: 5_000 },
  };

  it("carries the units, not just the rands", async () => {
    const { phone, windows } = await twoDevices();

    phone.capture(received);
    await phone.sync();
    await windows.sync();

    expect(windows.find("c1")?.crypto).toEqual({ asset: "USDT", units: 5_400 });
    expect(windows.find("c1")?.amount).toBe(100_000);
  });

  it("works the gain out to the same cent on both machines", async () => {
    const { phone, windows } = await twoDevices();

    phone.capture(received);
    phone.capture(paidOut);
    await phone.sync();
    await windows.sync();

    const onPhone = cryptoDisposalPostings(phone.entries);
    const onWindows = cryptoDisposalPostings(windows.entries);

    expect(onWindows).toEqual(onPhone);
    expect(onWindows).toHaveLength(1);
    expect(onWindows[0].amount).toBeCloseTo(2_407.41, 2);

    // And the same wallet balance, which is the figure checked against Binance.
    for (const device of [phone, windows]) {
      const books = [...device.entries, ...cryptoDisposalPostings(device.entries)];
      const wallet = computeBalances(SEED_ACCOUNTS, books, 0)[CRYPTO_ACCOUNT];
      const holding = cryptoHoldings(books).get("USDT")!;
      expect(wallet).toBeCloseTo(holding.costZar, 6);
      expect(holding.units).toBe(400);
    }
  });

  it("is not itself synced — nothing stores a revaluation", async () => {
    const { phone, windows } = await twoDevices();

    phone.capture(received);
    phone.capture(paidOut);
    await phone.sync();
    await windows.sync();

    // Two entries went over the wire, not three. The gain exists on both
    // devices because both compute it, not because one sent it.
    expect(windows.entries.map((t) => t.id).sort()).toEqual(["c1", "c2"]);
  });

  it("carries an invoice settled in coins, difference and all", async () => {
    const { phone, windows } = await twoDevices();

    const invoice: BusinessDoc = {
      id: "d1",
      kind: "invoice",
      number: "INV-0001",
      customer: "Mining Co",
      date: "2026-03-01",
      items: [{ id: "li1", description: "Antminer S21", qty: 1, unitPrice: 100_000 }],
      status: "paid",
      paidDate: "2026-03-05",
      incomeAccount: "sales",
      crypto: { asset: "USDT", rateZar: 18.52, decimals: 2 },
      settlement: { account: CRYPTO_ACCOUNT, asset: "USDT", units: 5_399.57, zar: 99_500 },
    };

    phone.ledger = { ...phone.ledger, docs: [stamp(invoice, Date.now())] };
    await phone.sync();
    await windows.sync();

    const landed = live(windows.ledger.docs)[0] as BusinessDoc;
    expect(landed.settlement).toEqual(invoice.settlement);
    expect(landed.crypto).toEqual(invoice.crypto);

    const balances = computeBalances(SEED_ACCOUNTS, postingsForDocs([landed]), 0);
    expect(balances[CRYPTO_ACCOUNT]).toBeCloseTo(99_500, 6);
    expect(balances.receivables).toBeCloseTo(0, 6);
    expect(-balances.sales).toBeCloseTo(100_000, 6);
    expect(-balances[CRYPTO_GAINS_ACCOUNT]).toBeCloseTo(-500, 6);
  });

  it("carries a coin set up on one device to the other", async () => {
    const { phone, windows } = await twoDevices();

    windows.changeSettings({
      crypto: {
        offerOnDocs: true,
        platform: "Binance",
        assets: [
          {
            ...DEFAULT_CRYPTO.assets[0],
            address: "TXkJ9f2Qexample",
            rateZar: 19.2,
            rateSetOn: "2026-03-01",
          },
        ],
      },
    });
    await windows.sync();
    await phone.sync();

    const asset = phone.ledger.settings.crypto.assets[0];
    expect(asset.address).toBe("TXkJ9f2Qexample");
    expect(asset.rateZar).toBe(19.2);
    expect(asset.network).toBe("TRC20 (Tron)");
  });
});
