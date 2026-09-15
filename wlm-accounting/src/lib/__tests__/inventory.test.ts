import { SEED_ACCOUNTS, computeBalances, computeProfitAndLoss, computeTrialBalance } from "../accounting";
import { CATALOGUE, findProduct, unitPriceUsd } from "../catalogue";
import {
  DEFAULT_LANDED_COST,
  LandedCostSettings,
  StockMovement,
  computeLandedCost,
  computeStockLevels,
  postingsForMovements,
  shippingUsd,
  suggestedPrice,
  summariseInventory,
} from "../inventory";

const SETTINGS: LandedCostSettings = { ...DEFAULT_LANDED_COST, usdZarRate: 18 };

function mv(p: Partial<StockMovement> & Pick<StockMovement, "kind" | "qty" | "valueZar">): StockMovement {
  return {
    id: Math.random().toString(36).slice(2),
    productId: "let-s21pp-235",
    date: "2026-03-01",
    ...p,
  };
}

const label = () => "Test Miner";

describe("shipping tiers", () => {
  it("charges the quoted rate for one and two miners", () => {
    expect(shippingUsd(1, SETTINGS)).toBe(300);
    expect(shippingUsd(2, SETTINGS)).toBe(400);
  });

  it("extrapolates beyond the table at the per-extra-unit rate", () => {
    // 2 units = $400, then $100 for each additional unit.
    expect(shippingUsd(3, SETTINGS)).toBe(500);
    expect(shippingUsd(5, SETTINGS)).toBe(700);
  });

  it("is free for nothing", () => {
    expect(shippingUsd(0, SETTINGS)).toBe(0);
  });

  it("reads tiers in order even when they are listed out of sequence", () => {
    const jumbled: LandedCostSettings = {
      ...SETTINGS,
      shippingTiers: [
        { upToQty: 2, totalUsd: 400 },
        { upToQty: 1, totalUsd: 300 },
      ],
    };
    expect(shippingUsd(1, jumbled)).toBe(300);
  });
});

describe("landed cost", () => {
  it("adds shipping before converting to rand", () => {
    const product = findProduct("let-s21pp-235")!; // $1528 flat
    const cost = computeLandedCost(product, 1, SETTINGS);

    expect(cost.goodsUsd).toBe(1528);
    expect(cost.shippingUsd).toBe(300);
    expect(cost.totalUsd).toBe(1828);
    expect(cost.totalZar).toBeCloseTo(1828 * 18, 6);
    expect(cost.perUnitZar).toBeCloseTo(1828 * 18, 6);
  });

  it("spreads shipping across the units in the shipment", () => {
    const product = findProduct("let-s21pp-235")!;
    const two = computeLandedCost(product, 2, SETTINGS);

    // Two miners share $400 shipping, so each carries $200 rather than $300.
    expect(two.goodsUsd).toBe(3056);
    expect(two.shippingUsd).toBe(400);
    expect(two.perUnitZar).toBeCloseTo(((3056 + 400) / 2) * 18, 6);
    expect(two.perUnitZar).toBeLessThan(computeLandedCost(product, 1, SETTINGS).perUnitZar);
  });

  it("prices per-terahash products off the hashrate", () => {
    const product = findProduct("leed-s21pp-235")!; // $6.40/T at 235T
    const cost = computeLandedCost(product, 1, SETTINGS);
    expect(cost.unitUsd).toBeCloseTo(6.4 * 235, 6);
  });

  it("re-prices when the actual unit hashrate differs from the default", () => {
    const product = findProduct("leed-s21pp-235")!;
    const cost = computeLandedCost(product, 1, SETTINGS, 200);
    expect(cost.unitUsd).toBeCloseTo(6.4 * 200, 6);
  });

  it("includes the clearing fee once per shipment, not per unit", () => {
    const product = findProduct("let-s21pp-235")!;
    const withClearing = computeLandedCost(product, 2, { ...SETTINGS, clearingZar: 1000 });
    const without = computeLandedCost(product, 2, SETTINGS);
    expect(withClearing.totalZar - without.totalZar).toBe(1000);
  });
});

describe("stock levels", () => {
  it("tracks quantity in and out", () => {
    const levels = computeStockLevels([
      mv({ kind: "in", qty: 5, valueZar: 50000, date: "2026-03-01" }),
      mv({ kind: "out", qty: 2, valueZar: 20000, date: "2026-03-05" }),
    ]);
    expect(levels.get("let-s21pp-235")!.qty).toBe(3);
    expect(levels.get("let-s21pp-235")!.valueZar).toBe(30000);
  });

  it("averages cost across receipts at different prices", () => {
    const levels = computeStockLevels([
      mv({ kind: "in", qty: 2, valueZar: 20000, date: "2026-03-01" }), // R10 000 each
      mv({ kind: "in", qty: 2, valueZar: 30000, date: "2026-03-02" }), // R15 000 each
    ]);
    // Four units, R50 000 total -> R12 500 average.
    expect(levels.get("let-s21pp-235")!.avgCostZar).toBeCloseTo(12500, 6);
  });

  it("leaves no stranded value once the last unit is gone", () => {
    const levels = computeStockLevels([
      mv({ kind: "in", qty: 3, valueZar: 30000, date: "2026-03-01" }),
      mv({ kind: "out", qty: 3, valueZar: 30000, date: "2026-03-09" }),
    ]);
    const level = levels.get("let-s21pp-235")!;
    expect(level.qty).toBe(0);
    expect(level.valueZar).toBe(0);
    expect(level.avgCostZar).toBe(0);
  });

  it("applies movements in date order regardless of insertion order", () => {
    const levels = computeStockLevels([
      mv({ kind: "out", qty: 1, valueZar: 10000, date: "2026-03-05" }),
      mv({ kind: "in", qty: 2, valueZar: 20000, date: "2026-03-01" }),
    ]);
    expect(levels.get("let-s21pp-235")!.qty).toBe(1);
  });
});

describe("stock postings", () => {
  it("buying stock is an asset swap, never an expense", () => {
    const postings = postingsForMovements([mv({ kind: "in", qty: 1, valueZar: 33000 })], label);
    expect(postings[0].debit).toBe("inventory");
    expect(postings[0].credit).toBe("bank");

    const pnl = computeProfitAndLoss(
      SEED_ACCOUNTS,
      computeBalances(SEED_ACCOUNTS, postings, 0)
    );
    expect(pnl.expenses).toBe(0);
  });

  it("selling stock releases cost to Cost of Sales", () => {
    const postings = postingsForMovements(
      [
        mv({ kind: "in", qty: 2, valueZar: 60000, date: "2026-03-01" }),
        mv({ kind: "out", qty: 1, valueZar: 30000, date: "2026-03-08" }),
      ],
      label
    );
    const balances = computeBalances(SEED_ACCOUNTS, postings, 0);

    expect(balances.inventory).toBe(30000); // one unit left
    expect(balances.cos).toBe(30000); // one unit's cost expensed
  });

  it("gross profit is revenue less the cost actually released", () => {
    const stock = postingsForMovements(
      [
        mv({ kind: "in", qty: 1, valueZar: 30000, date: "2026-03-01" }),
        mv({ kind: "out", qty: 1, valueZar: 30000, date: "2026-03-08" }),
      ],
      label
    );
    // Sold for R45 000 cash.
    const sale = {
      id: "sale-1",
      date: "2026-03-08",
      desc: "Sale",
      amount: 45000,
      debit: "bank",
      credit: "sales",
      recipe: "sale_cash",
    };
    const pnl = computeProfitAndLoss(
      SEED_ACCOUNTS,
      computeBalances(SEED_ACCOUNTS, [...stock, sale], 0)
    );
    expect(pnl.income).toBe(45000);
    expect(pnl.expenses).toBe(30000);
    expect(pnl.net).toBe(15000);
  });

  it("a write-off leaves the books balanced", () => {
    const postings = postingsForMovements(
      [
        mv({ kind: "in", qty: 1, valueZar: 30000, date: "2026-03-01" }),
        mv({ kind: "writeoff", qty: 1, valueZar: 30000, date: "2026-03-20" }),
      ],
      label
    );
    const tb = computeTrialBalance(
      SEED_ACCOUNTS,
      computeBalances(SEED_ACCOUNTS, postings, 0)
    );
    expect(tb.balanced).toBe(true);
    expect(tb.totalDebit).toBeCloseTo(tb.totalCredit, 6);
  });

  it("ignores zero-value movements rather than posting empty entries", () => {
    expect(postingsForMovements([mv({ kind: "in", qty: 1, valueZar: 0 })], label)).toHaveLength(0);
  });
});

describe("inventory summary", () => {
  it("counts only lines that still have stock", () => {
    const summary = summariseInventory([
      mv({ kind: "in", qty: 2, valueZar: 20000, productId: "a", date: "2026-03-01" }),
      mv({ kind: "in", qty: 1, valueZar: 15000, productId: "b", date: "2026-03-01" }),
      mv({ kind: "out", qty: 1, valueZar: 15000, productId: "b", date: "2026-03-02" }),
    ]);
    expect(summary.totalUnits).toBe(2);
    expect(summary.totalValueZar).toBe(20000);
    expect(summary.productCount).toBe(1);
  });
});

describe("suggested price", () => {
  it("marks up to hit the target gross margin", () => {
    // 20% margin on R80 000 cost -> R100 000, of which R20 000 (20%) is profit.
    const price = suggestedPrice(80000, 20);
    expect(price).toBeCloseTo(100000, 6);
    expect((price - 80000) / price).toBeCloseTo(0.2, 6);
  });

  it("returns cost when the margin is nonsensical", () => {
    expect(suggestedPrice(1000, 100)).toBe(1000);
  });
});

describe("catalogue integrity", () => {
  it("has no duplicate ids", () => {
    const ids = CATALOGUE.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("gives every per-terahash product a hashrate to price against", () => {
    const broken = CATALOGUE.filter((p) => p.priceMode === "perTerahash" && !p.hashrate);
    // Whatsminer bands are quoted without a hashrate; those are the only ones
    // allowed through, and the UI makes the user enter one.
    expect(broken.every((p) => (p.note ?? "").includes("confirm per unit"))).toBe(true);
  });

  it("prices every flat-priced product above zero", () => {
    expect(CATALOGUE.filter((p) => p.priceMode === "unit" && p.priceUsd <= 0)).toHaveLength(0);
  });

  it("resolves a per-terahash unit price", () => {
    const s21 = findProduct("leed-s21-151")!;
    expect(unitPriceUsd(s21)).toBeCloseTo(5.3 * 151, 6);
  });
});
