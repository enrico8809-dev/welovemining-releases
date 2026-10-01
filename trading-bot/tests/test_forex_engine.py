"""Forex backtester: shorts, spread, swap, stops, the 1:1 exposure cap, no look-ahead."""
import numpy as np
import pandas as pd
import pytest

from backtest.forex_engine import ForexSettings, run_forex_backtest, swap_nights
from bot.risk import RiskConfig
from bot.rules import LotRules
from strategies.base import Strategy
from tests.conftest import make_candles


class Fixed(Strategy):
    """Always long (1), always short (-1) or flat (0)."""
    name = "fixed"

    def __init__(self, values):
        super().__init__()
        self.values = values

    def target_exposure(self, candles):
        v = self.values
        return pd.Series(v if isinstance(v, (int, float)) else list(v), index=candles.index, dtype=float)


def rules(**kw):
    r = LotRules.default_for("EURUSD")
    for k, v in kw.items():
        setattr(r, k, v)
    return r


def run(closes, values, lot_rules=None, settings=None, **risk):
    candles = make_candles(closes, spread=0.002)
    candles["spread"] = 10                               # 10 points = 0.0001
    return run_forex_backtest(candles, Fixed(values), lot_rules or rules(), settings or ForexSettings(),
                              RiskConfig(**{"max_lots": 10, **risk}))


def test_short_makes_money_in_a_downtrend():
    result = run(np.linspace(1.30, 1.00, 200), -1)
    assert result.trades and all(o["side"] == "sell" for o in result.orders if o["reason"] == "signal")
    assert result.equity.iloc[-1] > 10_000


def test_long_makes_money_in_an_uptrend():
    assert run(np.linspace(1.00, 1.30, 200), 1).equity.iloc[-1] > 10_000


def test_exposure_never_exceeds_the_account():
    result = run(np.linspace(1.00, 1.30, 200), 1)
    for o in result.orders:
        if o["reason"] == "signal":
            assert o["amount"] * 100_000 * o["price"] <= 10_000 + 1e-6


def test_round_trip_in_a_flat_market_costs_the_spread_and_commission():
    closes = np.full(120, 1.1)
    signal = [0] * 30 + [1] * 30 + [0] * 60
    result = run(closes, signal, lot_rules=rules(swap_long=0, swap_short=0),
                 settings=ForexSettings(commission_per_lot=3.5))
    trade = result.trades[0]
    lots = result.orders[0]["amount"]
    expected = -(0.0001 * lots * 100_000) - 2 * 3.5 * lots
    assert trade.pnl == pytest.approx(expected)


def test_swap_is_charged_every_night_and_triple_on_wednesday():
    assert swap_nights(pd.Timestamp("2026-10-07"), 3) == 3      # Wednesday
    assert swap_nights(pd.Timestamp("2026-10-06"), 3) == 1
    assert swap_nights(pd.Timestamp("2026-10-10"), 3) == 0      # Saturday
    closes = np.full(80, 1.1)
    with_swap = run(closes, [0] * 30 + [1] * 50, lot_rules=rules(swap_long=-10))
    without = run(closes, [0] * 30 + [1] * 50, lot_rules=rules(swap_long=0))
    assert with_swap.equity.iloc[-1] < without.equity.iloc[-1]


def test_short_stop_is_hit_on_a_rally_with_a_gap_at_the_open():
    closes = np.concatenate([np.full(40, 1.10), [1.25], np.full(20, 1.25)])
    result = run(closes, -1)
    stop_trade = next(t for t in result.trades if t.exit_reason == "stop_loss")
    exit_order = next(o for o in result.orders if o["reason"] == "stop_loss")
    assert exit_order["price"] >= 1.10                           # bought back at/above the stop (gap)
    assert stop_trade.pnl < 0


def test_after_a_stop_the_same_side_waits_for_a_fresh_signal():
    closes = np.concatenate([np.full(40, 1.10), [1.25], np.linspace(1.25, 1.0, 60)])
    result = run(closes, -1)
    entries = [o for o in result.orders if o["reason"] == "signal" and o["side"] == "sell"]
    assert len(entries) == 1                                     # no re-short after the stop


def test_no_look_ahead_signal_acts_on_the_next_open():
    closes = np.linspace(1.0, 1.2, 60)
    result = run(closes, [0] * 30 + [1] * 30)
    first = result.orders[0]
    assert first["time"] == result.equity.index[31]              # decided at 30's close, filled at 31's open


def test_crosses_cannot_be_backtested_in_usd():
    with pytest.raises(ValueError, match="can't be converted"):
        run(np.full(60, 0.85), 1, lot_rules=LotRules.default_for("EURGBP"))


def test_too_small_account_skips_instead_of_rounding_up():
    result = run(np.linspace(1.0, 1.2, 100), 1, settings=ForexSettings(initial_capital=500))
    assert not result.trades and result.skipped_orders > 0
