"""Tests for the performance numbers."""
import pandas as pd
import pytest

from backtest.engine import BacktestResult, Trade
from backtest.metrics import equity_stats, summarize, trade_stats


def curve(values, freq="1D"):
    return pd.Series(values, index=pd.date_range("2023-01-01", periods=len(values), freq=freq, tz="UTC"))


def test_total_return_and_max_drawdown():
    s = equity_stats(curve([1000, 1200, 900, 1100]), 1000)
    assert s["total_return_pct"] == pytest.approx(10)
    assert s["max_drawdown_pct"] == pytest.approx(-25)        # 1200 -> 900


def test_drawdown_counts_loss_from_starting_capital():
    s = equity_stats(curve([900, 950]), 1000)
    assert s["max_drawdown_pct"] == pytest.approx(-10)


def test_sharpe_scales_with_candle_size():
    daily = equity_stats(curve([1000, 1010, 1005, 1020, 1030]), 1000)["sharpe"]
    hourly = equity_stats(curve([1000, 1010, 1005, 1020, 1030], "1h"), 1000)["sharpe"]
    assert hourly == pytest.approx(daily * (8760 / 365) ** 0.5)


def test_win_rate_and_profit_factor():
    t = lambda pnl: Trade(entry_time=None, invested=100, returned=100 + pnl)
    s = trade_stats([t(30), t(10), t(-20)])
    assert s["trades"] == 3
    assert s["win_rate_pct"] == pytest.approx(66.67, abs=0.01)
    assert s["profit_factor"] == pytest.approx(2.0)          # 40 won / 20 lost


def test_warning_when_fewer_than_30_trades():
    eq = curve([1000, 1010])
    r = BacktestResult(eq, [], [], 0, eq, 1000)
    assert "not statistically meaningful" in summarize(r, 30)["warnings"][0]


def test_stock_market_days_are_annualised_as_trading_days():
    from backtest.metrics import periods_per_year
    weekdays = pd.bdate_range("2023-01-02", "2024-12-31", tz="UTC")   # no weekends, like stocks/Forex
    assert 255 < periods_per_year(weekdays) < 265
    every_day = pd.date_range("2023-01-01", "2024-12-31", freq="1D", tz="UTC")
    assert periods_per_year(every_day) == pytest.approx(365, rel=0.01)
