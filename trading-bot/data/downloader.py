"""Download historical OHLCV candles and cache them as CSV files.

Run it from the trading-bot folder:
    python -m data.downloader                        (every market in config.yaml)
    python -m data.downloader --market crypto        (only crypto; or forex / stocks)
    python -m data.downloader --market crypto --symbols BTC/USDT --timeframes 1d

Crypto comes from the exchange in .env (via CCXT); Forex and stocks from Yahoo Finance.
Running it again only adds the new candles since the last run.
Only CLOSED candles are saved, so the backtester can never see an unfinished candle.
"""
import argparse
import json
from datetime import datetime, timezone
from pathlib import Path

import ccxt
import pandas as pd

from bot.config import ROOT, load_config
from bot.exchange import create_exchange, with_retry
from bot.logger import get_logger

log = get_logger("downloader")

COLUMNS = ["timestamp", "open", "high", "low", "close", "volume"]


def cache_path(cache_dir: Path, source_id: str, symbol: str, timeframe: str) -> Path:
    """data/cache/binance/BTC-USDT_1d.csv or data/cache/yahoo/EURUSD=X_1d.csv"""
    return Path(cache_dir) / source_id / f"{symbol.replace('/', '-')}_{timeframe}.csv"


def load_candles(cache_dir: Path, source_id: str, symbol: str, timeframe: str) -> pd.DataFrame:
    """Load cached candles. Index = candle OPEN time (UTC)."""
    path = cache_path(cache_dir, source_id, symbol, timeframe)
    if not path.exists():
        raise FileNotFoundError(f"No cached data at {path}. Run: python -m data.downloader")
    df = pd.read_csv(path)
    df.index = pd.to_datetime(df["timestamp"], unit="ms", utc=True)
    df.index.name = "time"
    return df[["open", "high", "low", "close", "volume"]].astype(float)


def download_symbol(exchange, symbol: str, timeframe: str, since_ms: int,
                    cache_dir: Path, now_ms: int | None = None) -> pd.DataFrame:
    """Download (or top up) one symbol/timeframe and save to CSV. Returns all cached candles."""
    path = cache_path(cache_dir, exchange.id, symbol, timeframe)
    old = pd.read_csv(path) if path.exists() else pd.DataFrame(columns=COLUMNS)
    if len(old):
        since_ms = int(old["timestamp"].max()) + 1   # continue after the last saved candle

    tf_ms = exchange.parse_timeframe(timeframe) * 1000
    now_ms = now_ms or exchange.milliseconds()
    rows = []
    while since_ms < now_ms:
        batch = with_retry(exchange.fetch_ohlcv, symbol, timeframe, since=since_ms, limit=1000)
        if not batch:
            break
        rows.extend(batch)
        last_ts = batch[-1][0]
        if last_ts < since_ms:          # exchange returned old data - avoid looping forever
            break
        since_ms = last_ts + tf_ms
        log.info("%s %s: got %d candles up to %s", symbol, timeframe, len(rows),
                 datetime.fromtimestamp(last_ts / 1000, tz=timezone.utc).strftime("%Y-%m-%d %H:%M"))

    return merge_and_save(path, pd.DataFrame(rows, columns=COLUMNS), tf_ms, now_ms)


def merge_and_save(path: Path, new: pd.DataFrame, tf_ms: int, now_ms: int) -> pd.DataFrame:
    """Add new candles to the cached CSV (keeping older history) and save it."""
    # Drop the still-open candle: it closes at open_time + timeframe, which is in the future
    new = new[new["timestamp"] + tf_ms <= now_ms]
    old = pd.read_csv(path) if path.exists() else pd.DataFrame(columns=COLUMNS)

    frames = [f for f in (old, new) if len(f)]
    df = pd.concat(frames) if frames else pd.DataFrame(columns=COLUMNS)
    # keep="last": if a candle was downloaded again, the newest copy wins
    df = df.drop_duplicates("timestamp", keep="last").sort_values("timestamp")
    path.parent.mkdir(parents=True, exist_ok=True)
    df.to_csv(path, index=False)
    log.info("%s: %d candles cached", path.name, len(df))
    return df


def save_market_rules(exchange, symbols: list[str], cache_dir: Path) -> Path:
    """Save each symbol's minimum order size and precision, so backtests use real exchange rules."""
    markets = with_retry(exchange.load_markets)
    rules = {}
    for symbol in symbols:
        m = markets.get(symbol)
        if not m:
            log.warning("%s not listed on %s - skipped", symbol, exchange.id)
            continue
        rules[symbol] = {
            "min_amount": (m.get("limits", {}).get("amount") or {}).get("min"),
            "min_cost": (m.get("limits", {}).get("cost") or {}).get("min"),
            "amount_step": amount_step(exchange, m),
        }
    path = Path(cache_dir) / exchange.id / "markets.json"
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(rules, indent=2))
    return path


def amount_step(exchange, market: dict) -> float | None:
    """Smallest amount increment. CCXT stores precision either as a step (0.001) or decimals (3)."""
    p = (market.get("precision") or {}).get("amount")
    if p is None:
        return None
    if exchange.precisionMode == ccxt.DECIMAL_PLACES:
        return 10 ** -int(p)
    return float(p)


def download_crypto(symbols, timeframes, start, cache_dir, exchange_name=None,
                    public_url=None):
    exchange = create_exchange(exchange_name)   # public data: no API keys needed
    if public_url:
        # e.g. https://data-api.binance.vision/api/v3 (Binance's public market-data mirror)
        exchange.urls["api"]["public"] = public_url
    since_ms = exchange.parse8601(f"{start}T00:00:00Z")
    try:
        log.info("Saved exchange rules to %s", save_market_rules(exchange, symbols, cache_dir))
    except Exception as e:
        log.error("Could not load exchange rules (%s). Backtests will use the defaults in config.yaml", e)
    for symbol in symbols:
        for tf in timeframes:
            try:
                download_symbol(exchange, symbol, tf, since_ms, cache_dir)
            except Exception as e:   # one bad symbol should not stop the rest
                log.error("Failed %s %s: %s", symbol, tf, e)


def main():
    cfg = load_config()
    markets = cfg["markets"]
    parser = argparse.ArgumentParser(description="Download historical candles")
    parser.add_argument("--market", default="all", choices=["all", *markets])
    parser.add_argument("--symbols", nargs="+", help="default: the market's symbols in config.yaml")
    parser.add_argument("--timeframes", nargs="+", help="default: the market's timeframes")
    parser.add_argument("--start", help="YYYY-MM-DD (default: the market's history_start)")
    parser.add_argument("--exchange", help="crypto only: CCXT exchange id (default: EXCHANGE in .env)")
    parser.add_argument("--public-url", help="crypto only: other public API address for market data")
    args = parser.parse_args()

    cache_dir = ROOT / cfg["data"]["cache_dir"]
    chosen = markets if args.market == "all" else {args.market: markets[args.market]}
    for name, market in chosen.items():
        symbols = args.symbols or market["symbols"]
        timeframes = args.timeframes or market["timeframes"]
        start = args.start or market["history_start"]
        log.info("=== %s: %d symbols from %s ===", name, len(symbols), market["source"])
        if market["source"] == "ccxt":
            download_crypto(symbols, timeframes, start, cache_dir, args.exchange, args.public_url)
        elif market["source"] == "yahoo":
            from data.yahoo import download_yahoo   # (imported here to avoid a circular import)
            for symbol in symbols:
                for tf in timeframes:
                    try:
                        download_yahoo(symbol, tf, start, cache_dir)
                    except Exception as e:
                        log.error("Failed %s %s: %s", symbol, tf, e)
        else:
            log.error("Unknown source '%s' for market %s", market["source"], name)


if __name__ == "__main__":
    main()
