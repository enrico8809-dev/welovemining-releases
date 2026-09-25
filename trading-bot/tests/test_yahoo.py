"""Tests for the Yahoo Finance downloader, with a fake download function (no internet)."""
from datetime import datetime, timezone

import pandas as pd

from data.downloader import load_candles
from data.yahoo import download_yahoo


def fake_fetch(days):
    def fetch(symbol, interval, start):
        idx = pd.date_range("2024-01-01", periods=days, freq="1D")      # no timezone, like Yahoo daily
        return pd.DataFrame({"Open": 1.1, "High": 1.2, "Low": 1.0, "Close": 1.15, "Volume": 0}, index=idx)
    return fetch


def test_daily_forex_is_cached_and_todays_candle_dropped(tmp_path):
    now = datetime(2024, 1, 10, 12, tzinfo=timezone.utc)                   # Jan 10 is not finished yet
    df = download_yahoo("EURUSD=X", "1d", "2024-01-01", tmp_path, now=now, fetch=fake_fetch(10))
    assert len(df) == 9
    c = load_candles(tmp_path, "yahoo", "EURUSD=X", "1d")
    assert c.index[0] == pd.Timestamp("2024-01-01", tz="UTC")
    assert c["close"].iloc[-1] == 1.15


def test_hourly_request_is_limited_to_yahoos_730_days(tmp_path):
    asked = {}

    def fetch(symbol, interval, start):
        asked["start"] = start
        return fake_fetch(3)(symbol, interval, start)

    download_yahoo("SPY", "1h", "2015-01-01", tmp_path, now=datetime(2026, 1, 1, tzinfo=timezone.utc), fetch=fetch)
    assert asked["start"] > "2023-12-31"
