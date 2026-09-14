// Inventory: landed cost, stock levels, and the ledger entries stock moves make.
//
// Landed cost is what a miner actually costs by the time it's in Johannesburg,
// not what the supplier invoiced. Gross margin is meaningless without it.
//
//   goods (USD)  = unit price x quantity
//   shipping     = tiered by quantity ($300 for one, $400 for two, editable)
//   -> converted to ZAR at the rate you set
//   + clearing   = flat ZAR per shipment
//
// No customs duty: this class of electronics enters SA duty-free. Import VAT is
// excluded while the company isn't VAT-registered — when it registers, import
// VAT becomes claimable and belongs here as a separate, recoverable line rather
// than part of cost.

import { Txn } from "./accounting";
import { Product, unitPriceUsd } from "./catalogue";

export interface ShippingTier {
  /** Applies when quantity is at most this. */
  upToQty: number;
  totalUsd: number;
}

export interface LandedCostSettings {
  usdZarRate: number;
  shippingTiers: ShippingTier[];
  /** Added per unit beyond the largest tier. */
  extraShippingPerUnitUsd: number;
  clearingZar: number;
}

export const DEFAULT_LANDED_COST: LandedCostSettings = {
  usdZarRate: 18.5,
  shippingTiers: [
    { upToQty: 1, totalUsd: 300 },
    { upToQty: 2, totalUsd: 400 },
  ],
  extraShippingPerUnitUsd: 100,
  clearingZar: 0,
};

/** Shipping in USD for a given quantity, extrapolating past the last tier. */
export function shippingUsd(qty: number, s: LandedCostSettings): number {
  if (qty <= 0) return 0;
  const tiers = [...s.shippingTiers].sort((a, b) => a.upToQty - b.upToQty);
  if (!tiers.length) return qty * s.extraShippingPerUnitUsd;

  const match = tiers.find((t) => qty <= t.upToQty);
  if (match) return match.totalUsd;

  const last = tiers[tiers.length - 1];
  return last.totalUsd + (qty - last.upToQty) * s.extraShippingPerUnitUsd;
}

export interface LandedCost {
  qty: number;
  unitUsd: number;
  goodsUsd: number;
  shippingUsd: number;
  totalUsd: number;
  clearingZar: number;
  totalZar: number;
  perUnitZar: number;
}

export function computeLandedCost(
  product: Product,
  qty: number,
  s: LandedCostSettings,
  hashrateOverride?: number
): LandedCost {
  const unitUsd = unitPriceUsd(product, hashrateOverride);
  const goodsUsd = unitUsd * qty;
  const ship = shippingUsd(qty, s);
  const totalUsd = goodsUsd + ship;
  const totalZar = totalUsd * s.usdZarRate + s.clearingZar;

  return {
    qty,
    unitUsd,
    goodsUsd,
    shippingUsd: ship,
    totalUsd,
    clearingZar: s.clearingZar,
    totalZar,
    perUnitZar: qty > 0 ? totalZar / qty : 0,
  };
}

// ---------------------------------------------------------------------------
// Stock movements
// ---------------------------------------------------------------------------

export type MovementKind = "in" | "out" | "writeoff";

export interface StockMovement {
  id: string;
  productId: string;
  kind: MovementKind;
  qty: number;
  date: string;
  /** Total ZAR: landed cost for "in", cost released for "out"/"writeoff". */
  valueZar: number;
  note?: string;
  /** Links a sale back to the invoice it belongs to, when there is one. */
  docId?: string;
}

export function newMovementId(): string {
  return `mv-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

export interface StockLevel {
  productId: string;
  qty: number;
  /** Total ZAR cost still sitting in inventory for this product. */
  valueZar: number;
  /** Weighted average cost per unit on hand. */
  avgCostZar: number;
}

/**
 * Weighted-average costing. Each receipt re-averages the pool; each issue
 * leaves at the average. It's the standard approach for identical goods and
 * avoids having to track which physical miner came from which shipment.
 */
export function computeStockLevels(movements: StockMovement[]): Map<string, StockLevel> {
  const levels = new Map<string, StockLevel>();
  const ordered = [...movements].sort((a, b) =>
    a.date < b.date ? -1 : a.date > b.date ? 1 : a.id.localeCompare(b.id)
  );

  for (const m of ordered) {
    const level =
      levels.get(m.productId) ??
      { productId: m.productId, qty: 0, valueZar: 0, avgCostZar: 0 };

    if (m.kind === "in") {
      level.qty += m.qty;
      level.valueZar += m.valueZar;
    } else {
      level.qty -= m.qty;
      level.valueZar -= m.valueZar;
    }

    // Clamp: a count correction can otherwise leave a few cents of value
    // stranded against zero units, which then shows as phantom stock value.
    if (level.qty <= 0) {
      level.qty = Math.max(level.qty, 0);
      level.valueZar = level.qty === 0 ? 0 : level.valueZar;
    }
    level.avgCostZar = level.qty > 0 ? level.valueZar / level.qty : 0;
    levels.set(m.productId, level);
  }

  return levels;
}

/** Cost to release when issuing `qty` of a product, at weighted average. */
export function costOfIssue(
  movements: StockMovement[],
  productId: string,
  qty: number
): number {
  const level = computeStockLevels(movements).get(productId);
  if (!level || level.qty <= 0) return 0;
  const perUnit = level.avgCostZar;
  return perUnit * Math.min(qty, level.qty);
}

export interface InventorySummary {
  totalUnits: number;
  totalValueZar: number;
  productCount: number;
}

export function summariseInventory(movements: StockMovement[]): InventorySummary {
  let totalUnits = 0;
  let totalValueZar = 0;
  let productCount = 0;

  for (const level of computeStockLevels(movements).values()) {
    if (level.qty <= 0) continue;
    totalUnits += level.qty;
    totalValueZar += level.valueZar;
    productCount++;
  }
  return { totalUnits, totalValueZar, productCount };
}

/**
 * The ledger entries stock movements make. Derived from the movements rather
 * than stored, for the same reason invoice postings are: a movement and its
 * entry can then never disagree.
 *
 *   in       Dr Inventory      / Cr Bank            (asset swap, not an expense)
 *   out      Dr Cost of Sales  / Cr Inventory       (cost matched to the sale)
 *   writeoff Dr General Expenses / Cr Inventory     (stock that's gone)
 */
export function postingsForMovements(
  movements: StockMovement[],
  labelFor: (productId: string) => string
): Txn[] {
  const out: Txn[] = [];

  for (const m of movements) {
    if (m.valueZar <= 0) continue;
    const label = labelFor(m.productId);

    if (m.kind === "in") {
      out.push({
        id: `stock:${m.id}`,
        date: m.date,
        desc: `Stock in — ${m.qty} × ${label}`,
        amount: m.valueZar,
        debit: "inventory",
        credit: "bank",
        recipe: "stock_in",
        sourceDoc: `movement:${m.id}`,
      });
    } else if (m.kind === "out") {
      out.push({
        id: `stock:${m.id}`,
        date: m.date,
        desc: `Sold — ${m.qty} × ${label}`,
        amount: m.valueZar,
        debit: "cos",
        credit: "inventory",
        recipe: "stock_out",
        sourceDoc: `movement:${m.id}`,
      });
    } else {
      out.push({
        id: `stock:${m.id}`,
        date: m.date,
        desc: `Write-off — ${m.qty} × ${label}`,
        amount: m.valueZar,
        debit: "general",
        credit: "inventory",
        recipe: "stock_writeoff",
        sourceDoc: `movement:${m.id}`,
      });
    }
  }
  return out;
}

/** Suggested selling price from landed cost and a target margin percentage. */
export function suggestedPrice(perUnitZar: number, marginPct: number): number {
  if (marginPct >= 100) return perUnitZar;
  return perUnitZar / (1 - marginPct / 100);
}
