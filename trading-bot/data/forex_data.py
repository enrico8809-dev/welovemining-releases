"""Forex history for the backtester, from MetaTrader 5 (best) or Yahoo Finance (fallback).

    python -m data.forex_data            download MT5 history + symbol specs (Windows, MT5 running)

MT5 history (data/cache/mt5/EURUSD_1d.csv) has your broker's real prices and the SPREAD of
every candle; data/cache/mt5/symbols.json has its lot sizes, stop levels and swap rates.
Without it (e.g. before MT5 is set up) backtests use Yahoo candles with the spreads and
swaps from config.yaml (forex: default_spread_points / default_swap).
"""
import json
from datetime import datetime, timezone
from pathlib import Path

import pandas as pd

from bot.logger import get_logger
from bot.rules import LotRules

log = get_logger("forex_data")
MT5_DIR = "mt5"


def mt5_path(cache_dir: Path, symbol: str, timeframe: str) -> Path:
    return Path(cache_dir) / MT5_DIR / f"{symbol}_{timeframe}.csv"


def yahoo_symbol(symbol: str, market_cfg: dict) -> str:
    """EURUSD -> EURUSD=X; XAUUSD -> GC=F (gold futures), configurable in config.yaml."""
    return (market_cfg.get("yahoo_symbols") or {}).get(symbol, f"{symbol}=X")


def load_lot_rules(cache_dir: Path, symbol: str, market_cfg: dict) -> tuple[LotRules, str]:
    """(rules, source): the broker's real specs if downloaded, else typical defaults + config swaps."""
    path = Path(cache_dir) / MT5_DIR / "symbols.json"
    specs = json.loads(path.read_text()) if path.exists() else {}
    if symbol in specs:
        return LotRules(**specs[symbol]), "mt5"
    rules = LotRules.default_for(symbol)
    swap = (market_cfg.get("default_swap") or {}).get(symbol)
    if swap:
        rules.swap_long, rules.swap_short = swap
    return rules, "defaults"


def load_forex_candles(cache_dir: Path, symbol: str, timeframe: str, market_cfg: dict) -> tuple[pd.DataFrame, str]:
    """(candles with a `spread` column in points, source)."""
    path = mt5_path(cache_dir, symbol, timeframe)
    if path.exists():
        df = pd.read_csv(path)
        df.index = pd.to_datetime(df["timestamp"], unit="ms", utc=True)
        return df[["open", "high", "low", "close", "volume", "spread"]].astype(float), "mt5"
    from data.downloader import load_candles
    df = load_candles(Path(cache_dir), "yahoo", yahoo_symbol(symbol, market_cfg), timeframe)
    df["spread"] = (market_cfg.get("default_spread_points") or {}).get(symbol, 15)
    return df, "yahoo"


def download_mt5(symbols: list[str], timeframes: list[str], start: str, cache_dir: Path,
                 suffix: str = "", broker=None) -> None:
    """Save MT5 candles and symbol specs to the cache (full refresh each time)."""
    from dataclasses import asdict
    from bot.brokers.mt5_broker import Mt5Broker
    broker = broker or Mt5Broker(live_allowed=True, suffix=suffix)    # read-only: no orders are sent
    folder = Path(cache_dir) / MT5_DIR
    folder.mkdir(parents=True, exist_ok=True)
    specs_path = folder / "symbols.json"
    specs = json.loads(specs_path.read_text()) if specs_path.exists() else {}
    start_dt = datetime.fromisoformat(start).replace(tzinfo=timezone.utc)
    for symbol in symbols:
        try:
            specs[symbol] = asdict(broker.lot_rules(symbol))
        except Exception as e:
            log.error("%s: no symbol info (%s) - is it in your broker's Market Watch?", symbol, e)
            continue
        for tf in timeframes:
            df = broker.history_rates(symbol, tf, start_dt)
            if df.empty:
                log.error("%s %s: MT5 returned no history", symbol, tf)
                continue
            out = df.copy()
            out.insert(0, "timestamp", (df.index - pd.Timestamp(0, tz="UTC")) // pd.Timedelta(milliseconds=1))
            out.to_csv(mt5_path(cache_dir, symbol, tf), index=False)
            log.info("%s %s: saved %d candles (%s -> %s)", symbol, tf, len(df),
                     df.index[0].date(), df.index[-1].date())
    specs_path.write_text(json.dumps(specs, indent=2))
    log.info("Saved symbol specs for %d symbols to %s", len(specs), specs_path)


def main():
    import argparse
    from bot.config import ROOT, load_config
    cfg = load_config()
    fx = cfg["markets"]["forex"]
    parser = argparse.ArgumentParser(description="Download Forex history from MetaTrader 5")
    parser.add_argument("--symbols", nargs="+", default=fx["symbols"])
    parser.add_argument("--timeframes", nargs="+", default=fx["timeframes"])
    parser.add_argument("--start", default=fx["history_start"])
    args = parser.parse_args()
    download_mt5(args.symbols, args.timeframes, args.start, ROOT / cfg["data"]["cache_dir"],
                 cfg.get("mt5", {}).get("symbol_suffix", ""))


if __name__ == "__main__":
    main()
