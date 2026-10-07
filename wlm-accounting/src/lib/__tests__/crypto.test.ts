import {
  SEED_ACCOUNTS,
  Txn,
  computeBalances,
  computeProfitAndLoss,
  computeTrialBalance,
  txnFlow,
} from "../accounting";
import {
  CRYPTO_ACCOUNT,
  CRYPTO_GAINS_ACCOUNT,
  DEFAULT_CRYPTO,
  CryptoSettings,
  cryptoDisposalPostings,
  cryptoHoldings,
  cryptoPositions,
  findAsset,
  payableAssets,
  rateOf,
  unitsForZar,
} from "../crypto";
import { BusinessDoc, postingsForDocs } from "../invoices";
import { StockMovement, postingsForMovements } from "../inventory";

/** Coins arriving: the wallet is debited, something else is credited. */
function received(p: {
  id: string;
  date?: string;
  units: number;
  zar: number;
  asset?: string;
  from?: string;
}): Txn {
  return {
    id: p.id,
    date: p.date ?? "2026-01-10",
    desc: `Received ${p.units}`,
    amount: p.zar,
    debit: CRYPTO_ACCOUNT,
    credit: p.from ?? "sales",
    recipe: "crypto_in",
    crypto: { asset: p.asset ?? "USDT", units: p.units },
  };
}

/** Coins leaving: the wallet is credited for what they were worth that day. */
function paid(p: {
  id: string;
  date?: string;
  units: number;
  zar: number;
  asset?: string;
  to?: string;
}): Txn {
  return {
    id: p.id,
    date: p.date ?? "2026-02-10",
    desc: `Paid ${p.units}`,
    amount: p.zar,
    debit: p.to ?? "inventory",
    credit: CRYPTO_ACCOUNT,
    recipe: "crypto_buy_stock",
    crypto: { asset: p.asset ?? "USDT", units: p.units },
  };
}

/** The books as the app computes them: entries plus everything derived. */
function books(entered: Txn[]): Txn[] {
  return [...entered, ...cryptoDisposalPostings(entered)];
}

function walletBalance(entered: Txn[]): number {
  return computeBalances(SEED_ACCOUNTS, books(entered), 0)[CRYPTO_ACCOUNT] ?? 0;
}

/** Gains carry a credit balance, so flip it: positive is a gain. */
function gains(entered: Txn[]): number {
  return -(computeBalances(SEED_ACCOUNTS, books(entered), 0)[CRYPTO_GAINS_ACCOUNT] ?? 0);
}

function settings(partial: Partial<CryptoSettings> = {}): CryptoSettings {
  return {
    ...DEFAULT_CRYPTO,
    ...partial,
    assets: partial.assets ?? [
      { ...DEFAULT_CRYPTO.assets[0], address: "TXk...9fQ", rateZar: 19, rateSetOn: "2026-02-10" },
    ],
  };
}

describe("quoting a rand amount in coins", () => {
  it("rounds up to the asset's own precision", () => {
    // R100 000 at R18.52 is 5 399.5680... USDT. Quoting 5 399.56 asks the
    // customer for less value than they were invoiced, and the shortfall then
    // has to be chased for a cent.
    expect(unitsForZar(100_000, 18.52, 2)).toBeCloseTo(5399.57, 6);
  });

  it("keeps bitcoin's precision rather than a stablecoin's", () => {
    expect(unitsForZar(100_000, 1_900_000, 8)).toBeCloseTo(0.05263158, 8);
  });

  it("refuses to quote without a rate", () => {
    expect(unitsForZar(100_000, 0, 2)).toBe(0);
  });

  it("will not offer an asset with no address or no rate", () => {
    const half = settings({
      assets: [
        { ...DEFAULT_CRYPTO.assets[0], address: "", rateZar: 19 },
        { ...DEFAULT_CRYPTO.assets[0], symbol: "BTC", address: "bc1...", rateZar: 0 },
        { ...DEFAULT_CRYPTO.assets[0], symbol: "USDC", address: "0xabc", rateZar: 18.9 },
      ],
    });
    expect(payableAssets(half).map((a) => a.symbol)).toEqual(["USDC"]);
  });

  it("finds an asset however the symbol was typed", () => {
    expect(findAsset(settings(), "usdt")?.symbol).toBe("USDT");
  });
});

describe("the rate on an entry", () => {
  it("is the rands divided by the coins, never stored separately", () => {
    expect(rateOf(received({ id: "a", units: 5_400, zar: 100_000 }))).toBeCloseTo(18.5185, 4);
  });

  it("is nothing at all for an entry that moved rands", () => {
    expect(rateOf({ ...received({ id: "a", units: 1, zar: 1 }), crypto: undefined })).toBeNull();
  });
});

describe("holdings", () => {
  it("re-averages on every receipt", () => {
    const entered = [
      received({ id: "a", units: 1_000, zar: 18_000, date: "2026-01-01" }),
      received({ id: "b", units: 1_000, zar: 20_000, date: "2026-01-20" }),
    ];
    const holding = cryptoHoldings(entered).get("USDT")!;
    expect(holding.units).toBe(2_000);
    expect(holding.costZar).toBeCloseTo(38_000, 6);
    expect(holding.avgCostZar).toBeCloseTo(19, 6);
  });

  it("leaves the average untouched when coins are paid out", () => {
    const entered = [
      received({ id: "a", units: 5_400, zar: 100_000, date: "2026-01-01" }),
      paid({ id: "b", units: 5_000, zar: 95_000, date: "2026-02-01" }),
    ];
    const holding = cryptoHoldings(entered).get("USDT")!;
    expect(holding.units).toBe(400);
    expect(holding.avgCostZar).toBeCloseTo(100_000 / 5_400, 6);
    expect(holding.costZar).toBeCloseTo(400 * (100_000 / 5_400), 6);
  });

  it("costs disposals in date order, not the order they were entered", () => {
    const backwards = [
      paid({ id: "z", units: 500, zar: 10_000, date: "2026-02-01" }),
      received({ id: "a", units: 1_000, zar: 18_000, date: "2026-01-01" }),
    ];
    expect(cryptoHoldings(backwards).get("USDT")!.units).toBe(500);
    expect(cryptoHoldings(backwards).get("USDT")!.costZar).toBeCloseTo(9_000, 6);
  });

  it("keeps two assets in two pools", () => {
    const entered = [
      received({ id: "a", units: 1_000, zar: 18_000, asset: "USDT" }),
      received({ id: "b", units: 0.5, zar: 900_000, asset: "BTC" }),
    ];
    const holdings = cryptoHoldings(entered);
    expect(holdings.get("USDT")!.avgCostZar).toBeCloseTo(18, 6);
    expect(holdings.get("BTC")!.avgCostZar).toBeCloseTo(1_800_000, 6);
  });

  it("cannot be driven below zero by paying out more than is held", () => {
    const entered = [
      received({ id: "a", units: 100, zar: 1_800, date: "2026-01-01" }),
      paid({ id: "b", units: 250, zar: 4_750, date: "2026-02-01" }),
    ];
    const holding = cryptoHoldings(entered).get("USDT")!;
    expect(holding.units).toBe(0);
    expect(holding.costZar).toBe(0);
  });

  it("ignores entries that never touched the wallet", () => {
    const stray: Txn = {
      id: "x",
      date: "2026-01-01",
      desc: "Cash sale",
      amount: 500,
      debit: "bank",
      credit: "sales",
      recipe: "sale_cash",
      crypto: { asset: "USDT", units: 27 },
    };
    expect(cryptoHoldings([stray]).size).toBe(0);
  });
});

describe("the gain or loss on paying coins out", () => {
  // The worked example from the top of lib/crypto.
  const entered = [
    received({ id: "a", units: 5_400, zar: 100_000, date: "2026-01-10" }),
    paid({ id: "b", units: 5_000, zar: 95_000, date: "2026-02-10" }),
  ];

  it("is the difference between what they were worth and what they cost", () => {
    const derived = cryptoDisposalPostings(entered);
    expect(derived).toHaveLength(1);
    expect(derived[0].amount).toBeCloseTo(95_000 - 5_000 * (100_000 / 5_400), 4);
    expect(derived[0].amount).toBeCloseTo(2_407.41, 2);
    // A gain: the wallet goes up, gains are credited.
    expect(derived[0].debit).toBe(CRYPTO_ACCOUNT);
    expect(derived[0].credit).toBe(CRYPTO_GAINS_ACCOUNT);
  });

  it("goes the other way when the rate fell", () => {
    const fell = [
      received({ id: "a", units: 5_000, zar: 95_000, date: "2026-01-10" }),
      paid({ id: "b", units: 5_000, zar: 90_000, date: "2026-02-10" }),
    ];
    const derived = cryptoDisposalPostings(fell);
    expect(derived[0].amount).toBeCloseTo(5_000, 6);
    expect(derived[0].debit).toBe(CRYPTO_GAINS_ACCOUNT);
    expect(derived[0].credit).toBe(CRYPTO_ACCOUNT);
    expect(gains(fell)).toBeCloseTo(-5_000, 6);
  });

  it("posts nothing when the rate hasn't moved", () => {
    const flat = [
      received({ id: "a", units: 1_000, zar: 19_000, date: "2026-01-10" }),
      paid({ id: "b", units: 1_000, zar: 19_000, date: "2026-02-10" }),
    ];
    expect(cryptoDisposalPostings(flat)).toHaveLength(0);
    expect(walletBalance(flat)).toBeCloseTo(0, 6);
  });

  it("ignores rounding dust rather than posting a cent of profit", () => {
    // 3 coins at R10 000 is R3 333.333... each; paying one out at R3 333.33
    // is not a gain of a third of a cent.
    const dust = [
      received({ id: "a", units: 3, zar: 10_000, date: "2026-01-10" }),
      paid({ id: "b", units: 1, zar: 3_333.33, date: "2026-02-10" }),
    ];
    expect(cryptoDisposalPostings(dust)).toHaveLength(0);
  });

  it("is worked out again from the entries, never stored", () => {
    // Same input, same ids, same figures — so a sync that replaces the books
    // cannot end up with two revaluations of one payment.
    const first = cryptoDisposalPostings(entered);
    const second = cryptoDisposalPostings(books(entered));
    expect(second).toEqual(first);
    expect(first[0].id).toBe("cryptofx:b");
  });

  it("prices each disposal at the average as it stood that day", () => {
    const entered = [
      received({ id: "a", units: 1_000, zar: 18_000, date: "2026-01-01" }),
      paid({ id: "b", units: 500, zar: 9_500, date: "2026-01-15" }), // avg still 18
      received({ id: "c", units: 1_000, zar: 20_000, date: "2026-02-01" }),
      paid({ id: "d", units: 500, zar: 10_000, date: "2026-02-15" }), // avg now 19.333
    ];
    const derived = cryptoDisposalPostings(entered);
    expect(derived).toHaveLength(2);
    expect(derived[0].amount).toBeCloseTo(500, 6); // 9 500 − 9 000
    // After the first payment: 500 left at 18 = 9 000, plus 1 000 at 20, so
    // 29 000 over 1 500 coins — 19.3333 each, not the 18 of the first batch.
    expect(derived[1].amount).toBeCloseTo(10_000 - 500 * (29_000 / 1_500), 4);
    expect(derived[1].amount).toBeCloseTo(333.33, 2);
    expect(derived[1].debit).toBe(CRYPTO_ACCOUNT); // still a gain, a smaller one
  });
});

describe("the invariant that keeps the wallet honest", () => {
  // The whole point of the module: the rand balance of the wallet account is
  // always the coins on hand at weighted average. Break that and the books and
  // Binance stop agreeing, with nothing to say which one is wrong.
  const run: Txn[] = [
    received({ id: "1", units: 5_400, zar: 100_000, date: "2026-01-10" }),
    paid({ id: "2", units: 5_000, zar: 95_000, date: "2026-02-10" }),
    received({ id: "3", units: 2_000, zar: 39_000, date: "2026-03-01", from: "bank" }),
    paid({ id: "4", units: 1_500, zar: 28_000, date: "2026-03-20", to: "general" }),
    paid({ id: "5", units: 400, zar: 7_900, date: "2026-04-01", to: "bank" }),
    received({ id: "6", units: 10, zar: 195, date: "2026-04-02", asset: "BTC" }),
  ];

  it("holds after every single step", () => {
    for (let n = 1; n <= run.length; n++) {
      const entered = run.slice(0, n);
      const carried = [...cryptoHoldings(entered).values()].reduce(
        (sum, h) => sum + h.costZar,
        0
      );
      expect(walletBalance(entered)).toBeCloseTo(carried, 6);

      for (const holding of cryptoHoldings(entered).values()) {
        expect(holding.costZar).toBeCloseTo(holding.units * holding.avgCostZar, 6);
      }
    }
  });

  it("leaves the trial balance balanced", () => {
    const balances = computeBalances(SEED_ACCOUNTS, books(run), 0);
    expect(computeTrialBalance(SEED_ACCOUNTS, balances).balanced).toBe(true);
  });

  it("ends with an empty wallet when every coin has gone", () => {
    const emptied = [
      ...run,
      paid({ id: "7", units: 500, zar: 9_800, date: "2026-05-01", to: "bank" }),
      paid({ id: "8", units: 10, zar: 200, date: "2026-05-01", asset: "BTC", to: "bank" }),
    ];
    expect(walletBalance(emptied)).toBeCloseTo(0, 6);
    expect(cryptoPositions(books(emptied), settings())).toEqual([]);
  });
});

describe("what the wallet is worth today", () => {
  const entered = [received({ id: "a", units: 1_000, zar: 18_000, date: "2026-01-10" })];

  it("prices the coins at the rate in settings", () => {
    const [position] = cryptoPositions(books(entered), settings());
    expect(position.units).toBe(1_000);
    expect(position.costZar).toBeCloseTo(18_000, 6);
    expect(position.marketZar).toBeCloseTo(19_000, 6);
    expect(position.unrealisedZar).toBeCloseTo(1_000, 6);
  });

  it("keeps the unrealised gain out of the books", () => {
    // It is shown, not posted. Booking it would recognise profit on a rate the
    // business has not acted on, and the tax follows the disposal, not the screen.
    expect(gains(entered)).toBeCloseTo(0, 6);
    expect(computeProfitAndLoss(SEED_ACCOUNTS, computeBalances(SEED_ACCOUNTS, books(entered), 0)).income)
      .toBeCloseTo(18_000, 6); // the sale only
  });

  it("says so rather than guessing when an asset has no rate", () => {
    const rateless = settings({
      assets: [{ ...DEFAULT_CRYPTO.assets[0], address: "TXk...9fQ", rateZar: 0 }],
    });
    const [position] = cryptoPositions(books(entered), rateless);
    expect(position.marketZar).toBe(0);
    expect(position.unrealisedZar).toBe(0);
  });

  it("flags coins held in an asset that is no longer set up", () => {
    const [position] = cryptoPositions(
      books([received({ id: "a", units: 1, zar: 900_000, asset: "BTC" })]),
      settings()
    );
    expect(position.unknownAsset).toBe(true);
  });
});

describe("an invoice settled in coins", () => {
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

  const posted = postingsForDocs([invoice]);
  const balances = computeBalances(SEED_ACCOUNTS, books(posted), 0);

  it("recognises the sale once, at the rand figure on the document", () => {
    expect(-balances.sales).toBeCloseTo(100_000, 6);
  });

  it("puts in the wallet what actually arrived, not what was invoiced", () => {
    expect(balances[CRYPTO_ACCOUNT]).toBeCloseTo(99_500, 6);
    const payment = posted.find((t) => t.id === "doc:d1:payment")!;
    expect(payment.crypto).toEqual({ asset: "USDT", units: 5_399.57 });
    expect(payment.debit).toBe(CRYPTO_ACCOUNT);
    expect(payment.credit).toBe("receivables");
  });

  it("clears the receivable in full — the customer owes nothing more", () => {
    // The customer sent the coins they were asked for. The R500 is the rate
    // moving between issuing the invoice and being paid, not a part-payment.
    expect(balances.receivables).toBeCloseTo(0, 6);
  });

  it("books the rate difference as a loss, not as lost revenue", () => {
    expect(gains(posted)).toBeCloseTo(-500, 6);
    const difference = posted.find((t) => t.id === "doc:d1:settlement")!;
    expect(difference.amount).toBeCloseTo(500, 6);
    expect(difference.debit).toBe(CRYPTO_GAINS_ACCOUNT);
    expect(difference.credit).toBe("receivables");
  });

  it("goes the other way when the coins were worth more than the invoice", () => {
    const over = {
      ...invoice,
      settlement: { account: CRYPTO_ACCOUNT, asset: "USDT", units: 5_399.57, zar: 100_800 },
    };
    const entries = postingsForDocs([over]);
    expect(computeBalances(SEED_ACCOUNTS, books(entries), 0).receivables).toBeCloseTo(0, 6);
    expect(gains(entries)).toBeCloseTo(800, 6);
  });

  it("posts no difference at all when the value landed on the total", () => {
    const exact = {
      ...invoice,
      settlement: { account: CRYPTO_ACCOUNT, asset: "USDT", units: 5_399.57, zar: 100_000 },
    };
    expect(postingsForDocs([exact]).map((t) => t.id)).toEqual([
      "doc:d1:issue",
      "doc:d1:payment",
    ]);
  });

  it("still goes to the bank when there is no crypto settlement", () => {
    const toBank = { ...invoice, settlement: undefined };
    const entries = postingsForDocs([toBank]);
    const payment = entries.find((t) => t.id === "doc:d1:payment")!;
    expect(payment.debit).toBe("bank");
    expect(payment.amount).toBeCloseTo(100_000, 6);
    expect(payment.crypto).toBeUndefined();
  });

  it("leaves the trial balance balanced either way", () => {
    expect(computeTrialBalance(SEED_ACCOUNTS, balances).balanced).toBe(true);
  });
});

describe("stock paid for in coins", () => {
  const entered = [received({ id: "a", units: 5_400, zar: 100_000, date: "2026-01-10" })];

  const movement: StockMovement = {
    id: "m1",
    productId: "s21",
    kind: "in",
    qty: 1,
    date: "2026-02-10",
    valueZar: 95_000,
    paidFrom: CRYPTO_ACCOUNT,
    crypto: { asset: "USDT", units: 5_000 },
  };

  const posted = [...entered, ...postingsForMovements([movement], () => "Antminer S21")];
  const balances = computeBalances(SEED_ACCOUNTS, books(posted), 0);

  it("values the miners at what the coins were worth the day they were sent", () => {
    expect(balances.inventory).toBeCloseTo(95_000, 6);
  });

  it("takes the coins out of the wallet at what they cost", () => {
    expect(balances[CRYPTO_ACCOUNT]).toBeCloseTo(100_000 - 5_000 * (100_000 / 5_400), 4);
  });

  it("realises the gain on the coins that were spent", () => {
    expect(gains(posted)).toBeCloseTo(2_407.41, 2);
  });

  it("leaves the bank alone", () => {
    expect(balances.bank).toBe(0);
  });

  it("still credits the bank for stock bought with rands", () => {
    const withRands: StockMovement = {
      ...movement,
      paidFrom: undefined,
      crypto: undefined,
    };
    const [posting] = postingsForMovements([withRands], () => "Antminer S21");
    expect(posting.credit).toBe("bank");
    expect(posting.crypto).toBeUndefined();
  });
});

describe("which way an entry went", () => {
  it("counts coins in as money in", () => {
    expect(txnFlow(received({ id: "a", units: 1, zar: 19 }))).toBe("in");
  });

  it("counts coins paid to a supplier as money out", () => {
    expect(txnFlow(paid({ id: "a", units: 1, zar: 19 }))).toBe("out");
  });

  it("counts rands moved into coins as neither", () => {
    // The business is no richer for having bought USDT, and a transfer shown as
    // money in is how a set of books starts overstating its own revenue.
    expect(txnFlow(received({ id: "a", units: 1, zar: 19, from: "bank" }))).toBe("move");
    expect(txnFlow(paid({ id: "a", units: 1, zar: 19, to: "bank" }))).toBe("move");
  });
});
