"""Tests for the backtest engine: costs, timing, exchange minimums and stops."""
import pandas as pd
import pytest

from backtest.engine import BacktestSettings, MarketRules, run_backtest
from strategies.base import Strategy
from tests.conftest import make_candles


class Fixed(Strategy):
    """Test strategy that returns a pre-set exposure list."""
    name = "fixed"

    def __init__(self, values, stop_loss_pct=None):
        super().__init__()
        self.values, self.stop_loss_pct = values, stop_loss_pct

    def target_exposure(self, candles):
        return pd.Series(self.values, index=candles.index, dtype=float)


def settings(**kw):
    base = dict(initial_capital=1000, fee_pct=0.1, slippage_pct=0.05,
                rules=MarketRules(min_cost=5, amount_step=0.00001))
    base.update(kw)
    return BacktestSettings(**base)


def test_flat_strategy_never_trades():
    c = make_candles([100] * 10)
    r = run_backtest(c, Fixed([0] * 10), settings())
    assert r.orders == [] and r.trades == []
    assert r.equity.iloc[-1] == 1000


def test_signal_is_executed_at_next_candle_open():
    # Price jumps at candle 3. Signal says "buy" after candle 2 closes -> fill at candle 3 OPEN.
    c = make_candles([100, 100, 100, 150, 150])
    r = run_backtest(c, Fixed([0, 0, 1, 1, 1]), settings(fee_pct=0, slippage_pct=0))
    first = r.orders[0]
    assert first["time"] == c.index[3]
    assert first["price"] == pytest.approx(c["open"].iloc[3])   # 100, the close of candle 2


def test_round_trip_at_flat_price_loses_exactly_fees_and_slippage():
    c = make_candles([100] * 6, spread=0)
    r = run_backtest(c, Fixed([1, 1, 0, 0, 0, 0]), settings())
    assert len(r.trades) == 1
    # Buy at 100.05 incl. 0.1% fee, sell at 99.95 minus 0.1% fee  ->  about -0.3%
    expected = 1000 * (99.95 * 0.999) / (100.05 * 1.001) - 1000
    assert r.trades[0].pnl == pytest.approx(expected, abs=0.01)
    assert r.equity.iloc[-1] == pytest.approx(1000 + expected, abs=0.01)


def test_cash_never_negative_and_exposure_clipped():
    c = make_candles([100, 110, 120, 130, 140])
    r = run_backtest(c, Fixed([5, 5, 5, 5, 5]), settings())   # asks for 500% -> clipped to 100%
    buys = [o for o in r.orders if o["side"] == "buy"]
    spent = sum(o["amount"] * o["price"] + o["fee"] for o in buys)
    assert spent <= 1000 + 1e-9


def test_order_below_exchange_minimum_is_skipped():
    c = make_candles([100] * 5)
    r = run_backtest(c, Fixed([1] * 5), settings(initial_capital=4))   # 4 USDT < 5 USDT minimum
    assert r.orders == []
    assert r.skipped_orders > 0


def test_amount_is_rounded_down_to_exchange_step():
    c = make_candles([100] * 5)
    r = run_backtest(c, Fixed([1] * 5), settings(rules=MarketRules(min_cost=5, amount_step=0.1)))
    amount = r.orders[0]["amount"]
    assert round(amount / 0.1, 9).is_integer()
    assert amount == pytest.approx(9.9)       # 1000 USDT / ~100.15 = 9.98 -> rounded down to 9.9


def test_stop_loss_sells_at_stop_price_and_waits_for_reset():
    closes = [100, 100, 100, 95, 88, 90, 95, 100]
    c = make_candles(closes, spread=0)
    s = settings(fee_pct=0, slippage_pct=0)
    r = run_backtest(c, Fixed([1] * 8, stop_loss_pct=10), s)
    stops = [o for o in r.orders if o["reason"] == "stop_loss"]
    assert len(stops) == 1
    assert stops[0]["price"] == pytest.approx(90)            # 10% below entry of 100
    assert len([o for o in r.orders if o["side"] == "buy"]) == 1   # no re-entry while signal stays 1


def test_stop_loss_gap_fills_at_open():
    # Opens at 80 (candle 3), already below the 90 stop -> fill at 80, not 90
    c = make_candles([100, 100, 100, 80, 80], spread=0)
    c.loc[c.index[3], "open"] = 80
    r = run_backtest(c, Fixed([1] * 5, stop_loss_pct=10), settings(fee_pct=0, slippage_pct=0))
    stop = [o for o in r.orders if o["reason"] == "stop_loss"][0]
    assert stop["price"] == pytest.approx(80)


def test_period_window_uses_earlier_candles_for_warmup(random_candles):
    from strategies.sma_cross import SmaCross
    r = run_backtest(random_candles, SmaCross(10, 40), settings(), start="2022-06-01", end="2022-12-31")
    assert r.equity.index[0] == pd.Timestamp("2022-06-01", tz="UTC")
    assert r.equity.index[-1] == pd.Timestamp("2022-12-31", tz="UTC")


def test_open_position_is_closed_at_end_with_costs():
    c = make_candles([100] * 5, spread=0)
    r = run_backtest(c, Fixed([1] * 5), settings())
    assert r.trades[-1].exit_reason == "end_of_test"
    assert r.equity.iloc[-1] < 1000                        # fees + slippage were paid


def test_buy_and_hold_benchmark_pays_costs():
    c = make_candles([100] * 5, spread=0)
    r = run_backtest(c, Fixed([0] * 5), settings())
    assert r.buy_hold_equity.iloc[-1] == pytest.approx(1000 * 99.95 * 0.999 / (100.05 * 1.001), abs=0.01)
