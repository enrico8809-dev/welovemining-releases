// Crypto: taking payment in coins, paying suppliers in coins, and keeping the
// books honest about both.
//
// The one decision everything here follows from: **a coin is an asset, not a
// currency.** The business is South African, its books are in rands, and SARS
// treats a crypto asset as an asset — so an invoice is denominated in rands and
// the coins are merely how it gets settled. Revenue is the rand figure on the
// document; what arrives in Binance is an asset acquired at what it was worth
// the day it arrived.
//
// That has a consequence people miss, and it is the reason this module exists
// rather than a "Binance" line being added to the chart of accounts and left at
// that. Coins are bought at one rate and spent at another:
//
//   A customer pays R100 000 of USDT       -> 5 400 USDT carried at R100 000,
//                                             which is R18.5185 each
//   A supplier is paid 5 000 of that USDT  -> at R19.00 that is R95 000 of stock
//
// The 5 000 USDT given away is carried in the books at R92 592.59, not R95 000,
// so paying that supplier realises a gain of R2 407.41. Post only "Dr Stock /
// Cr Wallet R95 000" and the wallet's rand balance drifts away from the coins
// actually in it, a little further with every payment, and nothing ever
// reconciles against Binance again. So the gain or loss on every disposal is
// worked out and posted.
//
// It is *derived*, never stored — the same rule invoice and stock postings
// follow. A revaluation that could be edited by hand is a revaluation that can
// disagree with the movement it came from.
//
// The invariant that keeps it all straight, and the one the tests pin down:
//
//   the rand balance of the wallet account == units on hand x weighted average
//
// so the wallet's rand value and its coin count can never tell two stories, and
// the coin count is something the owner can check against Binance directly.

import { Txn } from "./accounting";
import { todayISO } from "./format";

/** The wallet — one asset account for everything held on the exchange. */
export const CRYPTO_ACCOUNT = "crypto";

/**
 * Gains and losses on disposal, in one account rather than two.
 *
 * It is an income account, so a bad year shows as negative income rather than
 * as an expense. That is how a foreign-exchange account behaves in every ledger
 * that has one, and it keeps a gain and a loss on the same line of the P&L
 * where they belong — they are the same thing with the rate moving the other
 * way.
 */
export const CRYPTO_GAINS_ACCOUNT = "crypto_gains";

/** The leg that says an entry moved coins rather than rands. */
export interface CryptoLeg {
  /** Asset symbol, e.g. "USDT". */
  asset: string;
  /** How many coins moved. Always positive; the entry's sides say which way. */
  units: number;
}

/**
 * One coin the business actually uses, and where customers send it.
 *
 * Note what is *not* here: a rate feed. Binance delisted its rand pairs, so
 * there is no USDT/ZAR price to fetch, and the rate that matters is the one the
 * owner actually got on the day — a P2P fill or a bank conversion, not a screen
 * price. So the rate is typed, and `rateSetOn` records when, which is the only
 * honest way to show that a rate has gone stale.
 */
export interface CryptoAsset {
  symbol: string;
  name: string;
  /**
   * The chain to send on. On the document this is not decoration: USDT sent to
   * a TRC20 address over ERC20 is gone, and the customer is the one who has to
   * get it right.
   */
  network: string;
  /** The deposit address, copied from Binance. */
  address: string;
  /** Some deposits need one alongside the address; most do not. */
  memo: string;
  /** Rands per coin, as last set by the owner. Zero means "not set". */
  rateZar: number;
  /** The day that rate was entered, so a stale one can be seen to be stale. */
  rateSetOn: string;
  /** Decimal places to show. 2 for a stablecoin, 8 for bitcoin. */
  decimals: number;
}

export interface CryptoSettings {
  /** Whether invoices and quotes offer crypto as a way to pay. */
  offerOnDocs: boolean;
  /** Where the coins land. Printed on the document so the customer knows. */
  platform: string;
  assets: CryptoAsset[];
}

export const DEFAULT_CRYPTO_ASSET: CryptoAsset = {
  symbol: "USDT",
  name: "Tether USD",
  network: "TRC20 (Tron)",
  address: "",
  memo: "",
  // Deliberately zero. A guessed rate would quote a real customer a real number
  // of coins for a real invoice, and be wrong by whatever the rand has done
  // since this file was written.
  rateZar: 0,
  rateSetOn: "",
  decimals: 2,
};

export const DEFAULT_CRYPTO: CryptoSettings = {
  offerOnDocs: true,
  platform: "Binance",
  assets: [DEFAULT_CRYPTO_ASSET],
};

export function newCryptoAsset(symbol = ""): CryptoAsset {
  return { ...DEFAULT_CRYPTO_ASSET, symbol, name: "", network: "" };
}

export function findAsset(settings: CryptoSettings, symbol: string): CryptoAsset | undefined {
  const wanted = symbol.trim().toUpperCase();
  return settings.assets.find((a) => a.symbol.trim().toUpperCase() === wanted);
}

/**
 * The assets a customer could actually be asked to pay in — one with no address
 * or no rate cannot be put on a document, and printing half of one is worse
 * than leaving it off.
 */
export function payableAssets(settings: CryptoSettings): CryptoAsset[] {
  return settings.assets.filter((a) => !!a.symbol.trim() && !!a.address.trim() && a.rateZar > 0);
}

export function canOfferCrypto(settings: CryptoSettings): boolean {
  return settings.offerOnDocs && payableAssets(settings).length > 0;
}

/** What is stopping an asset from being offered, in words the owner can act on. */
export function assetReadiness(asset: CryptoAsset): string | null {
  if (!asset.symbol.trim()) return "Give it a symbol, e.g. USDT.";
  if (!asset.address.trim()) return "Paste the deposit address from Binance.";
  if (asset.rateZar <= 0) return "Set the rand rate before quoting in it.";
  return null;
}

/**
 * Coins needed to settle a rand amount, rounded **up** to the asset's own
 * precision.
 *
 * Up, not nearest: rounding down quotes a customer slightly less value than
 * they were invoiced, and the shortfall then has to be chased or written off.
 * The most this costs anyone is one unit of the last decimal place.
 */
export function unitsForZar(zar: number, rateZar: number, decimals = 2): number {
  if (!(rateZar > 0) || !(zar > 0)) return 0;
  const step = Math.pow(10, Math.max(0, Math.min(18, Math.round(decimals))));
  return Math.ceil((zar / rateZar) * step) / step;
}

/** Rands those coins are worth at a given rate. */
export function zarForUnits(units: number, rateZar: number): number {
  if (!(rateZar > 0) || !(units > 0)) return 0;
  return units * rateZar;
}

/** The rate an entry actually went through at — derived, so it cannot disagree. */
export function rateOf(txn: Txn): number | null {
  if (!txn.crypto || !(txn.crypto.units > 0)) return null;
  return txn.amount / txn.crypto.units;
}

/** How many days old a rate is, or null if it was never dated. */
export function rateAgeDays(asset: CryptoAsset, today = todayISO()): number | null {
  if (!asset.rateSetOn) return null;
  const then = Date.parse(`${asset.rateSetOn}T00:00:00`);
  const now = Date.parse(`${today}T00:00:00`);
  if (Number.isNaN(then) || Number.isNaN(now)) return null;
  return Math.max(0, Math.round((now - then) / 86_400_000));
}

// ---------------------------------------------------------------------------
// Holdings
// ---------------------------------------------------------------------------

export interface CryptoHolding {
  asset: string;
  /** Coins on hand. This is the number to check against Binance. */
  units: number;
  /** Rands still carried in the books for those coins. */
  costZar: number;
  /** Rands per coin at weighted average. */
  avgCostZar: number;
}

/** Entries that moved coins, oldest first — the order disposals are costed in. */
export function cryptoTxns(txns: Txn[]): Txn[] {
  return txns
    .filter((t) => !!t.crypto && t.crypto.units > 0 && isCryptoEntry(t))
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.id.localeCompare(b.id)));
}

function isCryptoEntry(t: Txn): boolean {
  return t.debit === CRYPTO_ACCOUNT || t.credit === CRYPTO_ACCOUNT;
}

/**
 * Weighted-average costing, the same method the miners in the warehouse are
 * costed with: every receipt re-averages the pool, every payment leaves at the
 * average. Nobody can say which particular USDT went to which supplier, and
 * with an identical fungible asset it makes no difference.
 */
export function cryptoHoldings(txns: Txn[]): Map<string, CryptoHolding> {
  const holdings = new Map<string, CryptoHolding>();

  for (const t of cryptoTxns(txns)) {
    const leg = t.crypto!;
    const holding =
      holdings.get(leg.asset) ??
      { asset: leg.asset, units: 0, costZar: 0, avgCostZar: 0 };

    if (t.debit === CRYPTO_ACCOUNT) {
      holding.units += leg.units;
      holding.costZar += t.amount;
    } else {
      holding.costZar -= costOfDisposal(holding, leg.units);
      holding.units -= Math.min(leg.units, holding.units);
    }

    // A correction can otherwise leave a few cents carried against no coins,
    // which then reads as wallet value that does not exist.
    if (holding.units <= 0) {
      holding.units = 0;
      holding.costZar = 0;
    }
    holding.avgCostZar = holding.units > 0 ? holding.costZar / holding.units : 0;
    holdings.set(leg.asset, holding);
  }

  return holdings;
}

/** Rands to release from the wallet when `units` leave it, at weighted average. */
function costOfDisposal(holding: CryptoHolding, units: number): number {
  if (holding.units <= 0) return 0;
  if (units >= holding.units) return holding.costZar;
  return (holding.costZar / holding.units) * units;
}

export interface CryptoPosition extends CryptoHolding {
  /** What the coins are worth at the rate currently in settings. */
  marketZar: number;
  /** Market less carrying value. Information only — it is not in the books. */
  unrealisedZar: number;
  /** The rate used, or 0 when the asset has none set. */
  rateZar: number;
  /** Set when the asset is held but no longer configured. */
  unknownAsset?: boolean;
}

/**
 * Holdings priced at today's rate.
 *
 * The unrealised figure is shown and never posted. Writing an unrealised gain
 * into the books would book profit on a rate the business has not acted on, and
 * SARS taxes the disposal, not the screen. It is here so the owner can see the
 * wallet is worth more than it cost — not so the P&L can.
 */
export function cryptoPositions(txns: Txn[], settings: CryptoSettings): CryptoPosition[] {
  const out: CryptoPosition[] = [];

  for (const holding of cryptoHoldings(txns).values()) {
    if (holding.units <= 0) continue;
    const asset = findAsset(settings, holding.asset);
    const rateZar = asset?.rateZar ?? 0;
    const marketZar = zarForUnits(holding.units, rateZar);
    out.push({
      ...holding,
      rateZar,
      marketZar,
      unrealisedZar: rateZar > 0 ? marketZar - holding.costZar : 0,
      unknownAsset: !asset,
    });
  }

  return out.sort((a, b) => b.costZar - a.costZar);
}

export function decimalsFor(settings: CryptoSettings, symbol: string): number {
  return findAsset(settings, symbol)?.decimals ?? 2;
}

/**
 * Decimals for a quantity where the asset's own precision isn't to hand — a
 * ledger row, say, which knows the entry but not the settings.
 *
 * Two places when two places say everything, eight when they would not: a
 * stablecoin balance runs to thousands and wants the cents, while 0.0526 BTC
 * rounded to two places reads as 0.05 and is wrong by a fifth of its value.
 */
export function displayDecimals(units: number): number {
  return Math.abs(Math.round(units * 100) / 100 - units) < 1e-9 ? 2 : 8;
}

// ---------------------------------------------------------------------------
// The derived postings
// ---------------------------------------------------------------------------

export const CRYPTO_DISPOSAL_RECIPE = "crypto_disposal";

/**
 * The gain or loss on every disposal of coins.
 *
 * Each entry that pays coins out already says what they were worth on the day —
 * that is its rand amount, and it is what the thing bought with them cost. What
 * it does not say is what those coins are carried at, because that depends on
 * every receipt before it. So this walks the movements in order, costs each
 * disposal at the running weighted average, and posts the difference:
 *
 *   worth more than carried  ->  Dr Wallet         / Cr Crypto Gains
 *   worth less than carried  ->  Dr Crypto Gains   / Cr Wallet
 *
 * which leaves the wallet reduced by exactly the carrying value of the coins
 * that left it. Sub-cent differences are dropped: they are the rounding dust of
 * dividing rands by coins, not gains.
 */
export function cryptoDisposalPostings(txns: Txn[]): Txn[] {
  const out: Txn[] = [];
  const holdings = new Map<string, CryptoHolding>();

  for (const t of cryptoTxns(txns)) {
    const leg = t.crypto!;
    const holding =
      holdings.get(leg.asset) ??
      { asset: leg.asset, units: 0, costZar: 0, avgCostZar: 0 };

    if (t.debit === CRYPTO_ACCOUNT) {
      holding.units += leg.units;
      holding.costZar += t.amount;
    } else {
      const carried = costOfDisposal(holding, leg.units);
      const difference = t.amount - carried;

      if (Math.abs(difference) >= 0.005) {
        const gain = difference > 0;
        out.push({
          id: disposalPostingId(t.id),
          date: t.date,
          desc: `${gain ? "Gain" : "Loss"} on ${leg.asset} paid out — ${t.desc}`,
          amount: Math.abs(difference),
          debit: gain ? CRYPTO_ACCOUNT : CRYPTO_GAINS_ACCOUNT,
          credit: gain ? CRYPTO_GAINS_ACCOUNT : CRYPTO_ACCOUNT,
          recipe: CRYPTO_DISPOSAL_RECIPE,
          // Tagged to the entry it was worked out from, so the ledger can show
          // it as derived and refuse to let it be edited on its own.
          sourceDoc: `txn:${t.id}`,
        });
      }

      holding.costZar -= carried;
      holding.units -= Math.min(leg.units, holding.units);
    }

    if (holding.units <= 0) {
      holding.units = 0;
      holding.costZar = 0;
    }
    holding.avgCostZar = holding.units > 0 ? holding.costZar / holding.units : 0;
    holdings.set(leg.asset, holding);
  }

  return out;
}

export function disposalPostingId(txnId: string): string {
  return `cryptofx:${txnId}`;
}

/** True for the entries this module generates, which nothing should hand-edit. */
export function isDerivedCryptoPosting(txn: Txn): boolean {
  return txn.recipe === CRYPTO_DISPOSAL_RECIPE;
}
