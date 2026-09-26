"""Coin Scanner: finds the USDT spot pairs worth trading.

Steps
  1. Take every active SPOT market quoted in USDT.
  2. Remove stablecoins (USDC, FDUSD, DAI...), fiat (EUR, TRY...) and leveraged tokens
     (BTCUP, ETHDOWN, BTC3L...): their prices don't behave like normal coins.
  3. Keep only pairs with enough 24h trading volume and a tight bid/ask spread
     (a wide spread means you lose money every time you buy and sell).
  4. Rank by 24h volume and keep the top N.

One request (fetch_tickers) gets the prices of all pairs at once, so this is fast and
gentle on the exchange's rate limits. Public data only: no API keys needed.

    python -m bot.scanner                  (show the list and save it)
    python -m bot.scanner --download       (also download their candles for backtesting)
"""
import argparse
import json
import re
from dataclasses import asdict, dataclass
from datetime import datetime, timezone

from bot.config import ROOT, load_config
from bot.exchange import create_exchange, with_retry
from bot.logger import get_logger

log = get_logger("scanner")

STABLECOINS = {
    "USDT", "USDC", "BUSD", "TUSD", "FDUSD", "DAI", "USDP", "USDD", "PYUSD", "USDE", "USDS",
    "USD1", "GUSD", "FRAX", "LUSD", "SUSD", "UST", "USTC", "USDJ", "PAX", "RLUSD", "XUSD", "BFUSD",
}
FIAT = {"EUR", "GBP", "AUD", "TRY", "BRL", "RUB", "UAH", "ZAR", "NGN", "ARS", "JPY", "PLN",
        "RON", "CZK", "MXN", "COP", "IDR", "AEUR", "EURI"}
# BTCUP / BTCDOWN / ETHBULL / ETHBEAR / BTC3L / ETH5S ... (leveraged tokens)
LEVERAGED = re.compile(r"^(?P<coin>.+?)(UP|DOWN|BULL|BEAR|\d+[LS])$")
DEFAULT_SAVE_PATH = ROOT / "data" / "scanner_latest.json"


@dataclass
class ScanResult:
    symbol: str
    volume_24h: float        # traded value in USDT over the last 24 hours
    spread_pct: float        # (ask - bid) / mid, in %
    change_24h_pct: float
    last_price: float


def excluded_reason(base: str, all_bases: set[str] = frozenset()) -> str:
    """Why a coin is excluded by type ('' = allowed).

    A name only counts as a leveraged token if what is left after removing the ending is
    itself a listed coin: BTCUP -> BTC is listed, so excluded; SYRUP -> SYR is not, so kept.
    """
    base = base.upper()
    if base in STABLECOINS:
        return "stablecoin"
    if base in FIAT:
        return "fiat"
    match = LEVERAGED.match(base)
    if match and match.group("coin") in all_bases:
        return "leveraged token"
    return ""


def spread_pct(bid, ask) -> float | None:
    if not bid or not ask or bid <= 0 or ask < bid:
        return None
    return 100 * (ask - bid) / ((ask + bid) / 2)


def filter_markets(markets: dict, tickers: dict, min_volume: float, max_spread: float,
                   top_n: int, quote: str = "USDT") -> tuple[list[ScanResult], dict]:
    """The core scan logic (no network). Returns (kept pairs, counts of why pairs were dropped)."""
    kept, dropped = [], {}
    all_bases = {m.get("base", "").upper() for m in markets.values()}

    def drop(reason):
        dropped[reason] = dropped.get(reason, 0) + 1

    for symbol, m in markets.items():
        if not m.get("spot") or m.get("quote") != quote or m.get("active") is False:
            continue                                   # not a USDT spot pair: not counted
        reason = excluded_reason(m.get("base", ""), all_bases)
        if reason:
            drop(reason)
            continue
        t = tickers.get(symbol)
        if not t:
            drop("no ticker")
            continue
        volume = t.get("quoteVolume") or 0
        if volume < min_volume:
            drop("low volume")
            continue
        spread = spread_pct(t.get("bid"), t.get("ask"))
        if spread is None:
            drop("no bid/ask")
            continue
        if spread > max_spread:
            drop("wide spread")
            continue
        kept.append(ScanResult(symbol, volume, spread, t.get("percentage") or 0.0, t.get("last") or 0.0))

    kept.sort(key=lambda r: r.volume_24h, reverse=True)
    if len(kept) > top_n:
        dropped["below top N"] = len(kept) - top_n
    return kept[:top_n], dropped


def scan(exchange, min_volume: float, max_spread: float, top_n: int) -> tuple[list[ScanResult], dict]:
    """Scan a live exchange (public data)."""
    markets = with_retry(exchange.load_markets)
    tickers = with_retry(exchange.fetch_tickers)
    # Some exchanges don't include bid/ask in tickers: ask the order book, only for liquid pairs
    for symbol, t in tickers.items():
        m = markets.get(symbol, {})
        if (t.get("bid") is None or t.get("ask") is None) and m.get("spot") and m.get("quote") == "USDT" \
                and (t.get("quoteVolume") or 0) >= min_volume:
            try:
                book = with_retry(exchange.fetch_order_book, symbol, 5)
                t["bid"] = book["bids"][0][0] if book["bids"] else None
                t["ask"] = book["asks"][0][0] if book["asks"] else None
            except Exception as e:
                log.warning("No order book for %s: %s", symbol, e)
    return filter_markets(markets, tickers, min_volume, max_spread, top_n)


def save(results: list[ScanResult], exchange_id: str, path=DEFAULT_SAVE_PATH) -> None:
    """Save the list so the auto-trader (Phase 7) can use it."""
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps({
        "exchange": exchange_id,
        "scanned_at": datetime.now(timezone.utc).isoformat(),
        "symbols": [asdict(r) for r in results],
    }, indent=2))


def load_saved(path=DEFAULT_SAVE_PATH) -> list[str]:
    """Symbols from the last scan ([] if there is none yet)."""
    if not path.exists():
        return []
    return [r["symbol"] for r in json.loads(path.read_text())["symbols"]]


def main():
    cfg = load_config()
    sc = cfg.get("scanner", {})
    parser = argparse.ArgumentParser(description="Find liquid USDT spot pairs")
    parser.add_argument("--exchange", help="CCXT exchange id (default: EXCHANGE in .env)")
    parser.add_argument("--min-volume", type=float, default=sc.get("min_volume_usdt", 10_000_000))
    parser.add_argument("--max-spread", type=float, default=sc.get("max_spread_pct", 0.1))
    parser.add_argument("--top", type=int, default=sc.get("top_n", 20))
    parser.add_argument("--public-url", help="other public API address for market data")
    parser.add_argument("--download", action="store_true", help="download 1d candles for the results")
    args = parser.parse_args()

    exchange = create_exchange(args.exchange)
    if args.public_url:
        exchange.urls["api"]["public"] = args.public_url
    results, dropped = scan(exchange, args.min_volume, args.max_spread, args.top)

    print(f"\n=== {exchange.id}: top {len(results)} USDT pairs | 24h volume >= {args.min_volume:,.0f} USDT"
          f" | spread <= {args.max_spread}% ===")
    print(f"{'#':>3}  {'symbol':<14}{'24h volume (USDT)':>20}{'spread %':>10}{'24h %':>9}")
    for i, r in enumerate(results, 1):
        print(f"{i:>3}  {r.symbol:<14}{r.volume_24h:>20,.0f}{r.spread_pct:>10.3f}{r.change_24h_pct:>9.1f}")
    print("Dropped:", ", ".join(f"{k}: {v}" for k, v in sorted(dropped.items())) or "none")

    save(results, exchange.id)
    print(f"Saved to {DEFAULT_SAVE_PATH.relative_to(ROOT)}")

    if args.download and results:
        from data.downloader import download_crypto
        download_crypto([r.symbol for r in results], ["1d"], cfg["markets"]["crypto"]["history_start"],
                        ROOT / cfg["data"]["cache_dir"], args.exchange, args.public_url)


if __name__ == "__main__":
    main()
