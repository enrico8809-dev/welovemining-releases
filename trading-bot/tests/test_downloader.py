"""Tests for the candle downloader, using a fake exchange (no internet needed)."""
import ccxt
import pandas as pd

from data.downloader import download_symbol, load_candles

HOUR = 3_600_000


class FakeExchange:
    """Pretends to be Binance: serves hourly candles, at most 1000 per call."""
    id = "fake"
    parse_timeframe = staticmethod(ccxt.Exchange.parse_timeframe)

    def __init__(self, n_candles):
        self.candles = [[i * HOUR, 1, 2, 0.5, 1.5, 10] for i in range(n_candles)]
        self.calls = 0

    def fetch_ohlcv(self, symbol, timeframe, since=None, limit=1000):
        self.calls += 1
        return [c for c in self.candles if c[0] >= since][:limit]


def test_downloads_in_pages_and_drops_unclosed_candle(tmp_path):
    ex = FakeExchange(2500)
    now = 2499 * HOUR + HOUR // 2          # the candle at 2499h is still open
    df = download_symbol(ex, "BTC/USDT", "1h", 0, tmp_path, now_ms=now)
    assert len(df) == 2499
    assert ex.calls == 3
    assert df["timestamp"].is_monotonic_increasing


def test_second_run_only_fetches_new_candles(tmp_path):
    ex = FakeExchange(1500)
    download_symbol(ex, "BTC/USDT", "1h", 0, tmp_path, now_ms=1200 * HOUR)
    ex.calls = 0
    df = download_symbol(ex, "BTC/USDT", "1h", 0, tmp_path, now_ms=1500 * HOUR)
    assert len(df) == 1500 and df["timestamp"].is_unique
    assert ex.calls == 1

    loaded = load_candles(tmp_path, "fake", "BTC/USDT", "1h")
    assert loaded.index[0] == pd.Timestamp(0, unit="ms", tz="UTC")
    assert list(loaded.columns) == ["open", "high", "low", "close", "volume"]
