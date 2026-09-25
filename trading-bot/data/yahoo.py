"""Historical candles for Forex, stocks, ETFs and gold from Yahoo Finance (free, no account).

Used for backtesting traditional markets. Symbols use Yahoo's names:
    Forex:  EURUSD=X, USDZAR=X      Stocks/ETFs: SPY, AAPL, GLD (gold ETF)
Yahoo keeps only the last ~730 days of hourly data, so hourly history grows
over time as you re-run the downloader (old candles are kept in the cache).
"""
from datetime import datetime, timedelta, timezone
from pathlib import Path

import pandas as pd

from data.downloader import COLUMNS, cache_path, merge_and_save

HOURLY_DAYS_LIMIT = 729


def fetch_yahoo(symbol: str, interval: str, start: str) -> pd.DataFrame:
    """Download from Yahoo. Returns columns Open/High/Low/Close/Volume, indexed by time."""
    import yfinance as yf
    return yf.download(symbol, start=start, interval=interval, auto_adjust=True,
                       progress=False, multi_level_index=False)


def download_yahoo(symbol: str, timeframe: str, start: str, cache_dir: Path,
                   now: datetime | None = None, fetch=fetch_yahoo) -> pd.DataFrame:
    """Download one symbol/timeframe ('1d' or '1h') and add it to the cache."""
    if timeframe not in ("1d", "1h"):
        raise ValueError("Yahoo data supports timeframes 1d and 1h")
    now = now or datetime.now(timezone.utc)
    if timeframe == "1h":
        # Yahoo refuses hourly requests older than ~730 days
        oldest = (now - timedelta(days=HOURLY_DAYS_LIMIT)).strftime("%Y-%m-%d")
        start = max(start, oldest)

    raw = fetch(symbol, timeframe, start)
    if raw is None or raw.empty:
        raise ValueError(f"Yahoo returned no data for {symbol} (check the symbol name)")

    index = raw.index
    # Daily bars come without a timezone (dates only): treat them as UTC midnight
    index = index.tz_localize("UTC") if index.tz is None else index.tz_convert("UTC")
    df = pd.DataFrame({
        "timestamp": (index - pd.Timestamp(0, tz="UTC")) // pd.Timedelta(milliseconds=1),
        "open": raw["Open"].to_numpy(),
        "high": raw["High"].to_numpy(),
        "low": raw["Low"].to_numpy(),
        "close": raw["Close"].to_numpy(),
        "volume": raw["Volume"].to_numpy(),
    })[COLUMNS].dropna(subset=["open", "high", "low", "close"])

    tf_ms = 86_400_000 if timeframe == "1d" else 3_600_000
    now_ms = int(now.timestamp() * 1000)
    path = cache_path(cache_dir, "yahoo", symbol, timeframe)
    return merge_and_save(path, df, tf_ms, now_ms)
