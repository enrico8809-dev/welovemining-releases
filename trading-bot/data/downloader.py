"""Download historical OHLCV candles and cache them as CSV files.

Run it from the trading-bot folder:
    python -m data.downloader                 (all symbols/timeframes in config.yaml)
    python -m data.downloader --symbols BTC/USDT --timeframes 1d

Running it again only downloads the new candles since the last run.
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


def cache_path(cache_dir: Path, exchange_id: str, symbol: str, timeframe: str) -> Path:
    """data/cache/binance/BTC-USDT_1d.csv"""
    return Path(cache_dir) / exchange_id / f"{symbol.replace('/', '-')}_{timeframe}.csv"


def load_candles(cache_dir: Path, exchange_id: str, symbol: str, timeframe: str) -> pd.DataFrame:
    """Load cached candles. Index = candle OPEN time (UTC)."""
    path = cache_path(cache_dir, exchange_id, symbol, timeframe)
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
    path.parent.mkdir(parents=True, exist_ok=True)

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

    new = pd.DataFrame(rows, columns=COLUMNS)
    # Drop the still-open candle: it closes at open_time + timeframe, which is in the future
    new = new[new["timestamp"] + tf_ms <= now_ms]

    frames = [f for f in (old, new) if len(f)]
    df = pd.concat(frames) if frames else pd.DataFrame(columns=COLUMNS)
    df = df.drop_duplicates("timestamp").sort_values("timestamp")
    df.to_csv(path, index=False)
    log.info("%s %s: %d candles cached in %s", symbol, timeframe, len(df), path)
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


def main():
    cfg = load_config()
    parser = argparse.ArgumentParser(description="Download historical candles")
    parser.add_argument("--exchange", default=None, help="CCXT exchange id (default: EXCHANGE in .env)")
    parser.add_argument("--symbols", nargs="+", default=cfg["data"]["symbols"])
    parser.add_argument("--timeframes", nargs="+", default=cfg["data"]["timeframes"])
    parser.add_argument("--start", default=cfg["data"]["history_start"], help="YYYY-MM-DD")
    args = parser.parse_args()

    exchange = create_exchange(args.exchange)   # public data: no API keys needed
    cache_dir = ROOT / cfg["data"]["cache_dir"]
    since_ms = exchange.parse8601(f"{args.start}T00:00:00Z")

    try:
        log.info("Saved exchange rules to %s", save_market_rules(exchange, args.symbols, cache_dir))
    except Exception as e:
        log.error("Could not load exchange rules (%s). Backtests will use the defaults in config.yaml", e)
    for symbol in args.symbols:
        for tf in args.timeframes:
            try:
                download_symbol(exchange, symbol, tf, since_ms, cache_dir)
            except Exception as e:   # one bad symbol should not stop the rest
                log.error("Failed %s %s: %s", symbol, tf, e)


if __name__ == "__main__":
    main()
