"""Forex history: MT5 cache with real spreads and specs, Yahoo fallback with config defaults."""
import pandas as pd

from bot.brokers.mt5_broker import Mt5Broker
from data.forex_data import download_mt5, load_forex_candles, load_lot_rules
from tests.conftest import make_candles
from tests.fake_mt5 import FakeMT5

MARKET = {"default_spread_points": {"EURUSD": 12}, "default_swap": {"EURUSD": [-8, 3]}}


def test_mt5_download_saves_candles_and_specs(tmp_path):
    mt5 = FakeMT5()
    mt5.copy_rates_range = lambda name, tf, start, end: mt5.copy_rates_from_pos(name, tf, 1, 300)
    download_mt5(["EURUSD"], ["1d"], "2020-01-01", tmp_path, broker=Mt5Broker(mt5_module=mt5))
    candles, source = load_forex_candles(tmp_path, "EURUSD", "1d", MARKET)
    rules, spec_source = load_lot_rules(tmp_path, "EURUSD", MARKET)
    assert source == "mt5" and len(candles) == 300 and (candles["spread"] == 12).all()
    assert spec_source == "mt5" and rules.stops_level == 10 and rules.swap_long == -7.0


def test_yahoo_fallback_uses_config_spread_and_swap(tmp_path):
    folder = tmp_path / "yahoo"
    folder.mkdir()
    c = make_candles([1.1] * 10)
    c.insert(0, "timestamp", (c.index - pd.Timestamp(0, tz="UTC")) // pd.Timedelta(milliseconds=1))
    c.to_csv(folder / "EURUSD=X_1d.csv", index=False)
    candles, source = load_forex_candles(tmp_path, "EURUSD", "1d", MARKET)
    rules, spec_source = load_lot_rules(tmp_path, "EURUSD", MARKET)
    assert source == "yahoo" and (candles["spread"] == 12).all()
    assert spec_source == "defaults" and (rules.swap_long, rules.swap_short) == (-8, 3)
