"""Tests for the Coin Scanner (fake markets, no internet)."""
import json

import pytest

from bot.scanner import excluded_reason, filter_markets, load_saved, save, scan, spread_pct, ScanResult


def market(base, quote="USDT", spot=True, active=True):
    return {"base": base, "quote": quote, "spot": spot, "active": active}


def ticker(volume, bid=100.0, ask=100.05, change=1.0):
    return {"quoteVolume": volume, "bid": bid, "ask": ask, "percentage": change, "last": bid}


MARKETS = {
    "BTC/USDT": market("BTC"),
    "ETH/USDT": market("ETH"),
    "SOL/USDT": market("SOL"),
    "USDC/USDT": market("USDC"),                 # stablecoin
    "EUR/USDT": market("EUR"),                   # fiat
    "BTCUP/USDT": market("BTCUP"),               # leveraged token
    "SYRUP/USDT": market("SYRUP"),               # real coin that ends in 'UP'
    "TINY/USDT": market("TINY"),                 # low volume
    "WIDE/USDT": market("WIDE"),                 # wide spread
    "ETH/BTC": market("ETH", quote="BTC"),       # not a USDT pair
    "OLD/USDT": market("OLD", active=False),     # delisted
    "BTC/USDT:USDT": market("BTC", spot=False),  # futures - never
}
TICKERS = {
    "BTC/USDT": ticker(1_000_000_000),
    "ETH/USDT": ticker(500_000_000),
    "SOL/USDT": ticker(300_000_000),
    "USDC/USDT": ticker(2_000_000_000),
    "EUR/USDT": ticker(50_000_000),
    "BTCUP/USDT": ticker(40_000_000),
    "SYRUP/USDT": ticker(20_000_000),
    "TINY/USDT": ticker(1_000),
    "WIDE/USDT": ticker(90_000_000, bid=100, ask=101),     # 1% spread
    "ETH/BTC": ticker(900_000_000),
    "OLD/USDT": ticker(900_000_000),
    "BTC/USDT:USDT": ticker(9_000_000_000),
}


def test_keeps_only_liquid_normal_usdt_spot_pairs_ranked_by_volume():
    kept, dropped = filter_markets(MARKETS, TICKERS, min_volume=10_000_000, max_spread=0.1, top_n=20)
    assert [r.symbol for r in kept] == ["BTC/USDT", "ETH/USDT", "SOL/USDT", "SYRUP/USDT"]
    assert dropped == {"stablecoin": 1, "fiat": 1, "leveraged token": 1, "low volume": 1, "wide spread": 1}


def test_top_n_limit():
    kept, dropped = filter_markets(MARKETS, TICKERS, 10_000_000, 0.1, top_n=2)
    assert [r.symbol for r in kept] == ["BTC/USDT", "ETH/USDT"]
    assert dropped["below top N"] == 2


def test_never_returns_futures_or_non_usdt_pairs():
    kept, _ = filter_markets(MARKETS, TICKERS, 0, 100, top_n=100)
    symbols = {r.symbol for r in kept}
    assert "BTC/USDT:USDT" not in symbols and "ETH/BTC" not in symbols and "OLD/USDT" not in symbols


def test_exclusion_rules():
    known = {"BTC", "ETH"}
    assert excluded_reason("FDUSD", known) == "stablecoin"
    assert excluded_reason("TRY", known) == "fiat"
    assert excluded_reason("ETHDOWN", known) == "leveraged token"
    assert excluded_reason("BTC3L", known) == "leveraged token"
    assert excluded_reason("JUP", known) == ""            # 'J' is not a listed coin


def test_spread():
    assert spread_pct(99.95, 100.05) == pytest.approx(0.1)
    assert spread_pct(None, 100) is None
    assert spread_pct(101, 100) is None                   # crossed/broken book


class FakeExchange:
    """An exchange whose tickers have no bid/ask, so the scanner must ask the order book."""
    id = "fake"

    def __init__(self):
        self.books_asked = []

    def load_markets(self):
        return {"BTC/USDT": market("BTC"), "TINY/USDT": market("TINY")}

    def fetch_tickers(self):
        return {"BTC/USDT": {"quoteVolume": 1e9}, "TINY/USDT": {"quoteVolume": 5}}

    def fetch_order_book(self, symbol, limit):
        self.books_asked.append(symbol)
        return {"bids": [[100.0, 1]], "asks": [[100.02, 1]]}


def test_order_book_used_when_ticker_has_no_bid_ask_only_for_liquid_pairs():
    ex = FakeExchange()
    kept, _ = scan(ex, min_volume=1_000_000, max_spread=0.1, top_n=10)
    assert [r.symbol for r in kept] == ["BTC/USDT"]
    assert ex.books_asked == ["BTC/USDT"]                  # no wasted request for TINY


def test_save_and_load(tmp_path):
    path = tmp_path / "scan.json"
    save([ScanResult("BTC/USDT", 1e9, 0.01, 1.0, 100.0)], "binance", path)
    assert load_saved(path) == ["BTC/USDT"]
    assert json.loads(path.read_text())["exchange"] == "binance"
    assert load_saved(tmp_path / "missing.json") == []
