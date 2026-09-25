"""Tests for backtesting with the Risk Manager (sizing, stops, halts)."""
import numpy as np
import pandas as pd
import pytest

from backtest.engine import BacktestSettings
from bot.rules import MarketRules
from backtest.risk_engine import run_backtest_with_risk
from bot.risk import RiskConfig
from strategies.base import Strategy
from tests.conftest import make_candles


class AlwaysIn(Strategy):
    name = "always_in"

    def target_exposure(self, candles):
        return pd.Series(1.0, index=candles.index)


class InAndOut(Strategy):
    """In for 4 candles, out for 1, repeat: keeps trying to re-enter after stops."""
    name = "in_and_out"

    def target_exposure(self, candles):
        return pd.Series([0.0 if i % 5 == 4 else 1.0 for i in range(len(candles))], index=candles.index)


def settings():
    return BacktestSettings(initial_capital=1000, fee_pct=0, slippage_pct=0,
                            rules=MarketRules(min_cost=1, amount_step=0.0001))


def test_position_is_sized_by_volatility_not_all_in():
    c = make_candles([100.0] * 40, spread=0.02)                    # ATR ~ 4
    r = run_backtest_with_risk(c, AlwaysIn(), settings(), RiskConfig(max_pct_per_trade=100))
    buy = r.orders[0]
    value = buy["amount"] * buy["price"]
    assert 100 < value < 200            # ~1% risk / (2 x ATR ~8%) = ~12% of the account


def test_stop_loss_limits_the_loss_to_about_one_percent():
    prices = [100.0] * 30 + [70.0] * 10                            # sudden -30% gap
    c = make_candles(prices, spread=0.01)
    r = run_backtest_with_risk(c, AlwaysIn(), settings(), RiskConfig(max_pct_per_trade=100))
    first_trade = r.trades[0]
    assert first_trade.exit_reason == "stop_loss"
    # The gap makes it worse than the planned 1%, but it is still small vs a -30% crash
    assert first_trade.pnl / 1000 > -0.05


def test_trailing_stop_locks_in_profit():
    up = list(np.linspace(100, 200, 60))
    c = make_candles(up + [150.0] * 5, spread=0.005)
    r = run_backtest_with_risk(c, AlwaysIn(), settings(), RiskConfig(max_pct_per_trade=100))
    assert r.trades[0].exit_reason == "stop_loss"                   # the trailing stop
    assert r.trades[0].pnl > 0                                      # but in profit


def test_max_drawdown_halt_stops_new_trades():
    rng = np.random.default_rng(3)
    prices = 100 * np.exp(np.cumsum(rng.normal(-0.01, 0.03, 300)))  # long, choppy decline
    c = make_candles(prices)
    rc = RiskConfig(max_pct_per_trade=100, risk_per_trade_pct=5, max_drawdown_pct=10,
                    daily_loss_limit_pct=100, losing_streak=999, max_stops=999)
    r = run_backtest_with_risk(c, InAndOut(), settings(), rc)
    assert any("max_drawdown" in n for n in r.notes)
    drawdown = (r.equity / r.equity.cummax() - 1).min()
    assert drawdown > -0.25             # halted instead of riding the whole decline down
