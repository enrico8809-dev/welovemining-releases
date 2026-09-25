"""Performance numbers for a backtest.

Sharpe and Sortino use a 0% risk-free rate and are annualised with the number
of candles per year found in the data.
"""
import math

import numpy as np
import pandas as pd

from backtest.engine import BacktestResult, Trade


def periods_per_year(index: pd.DatetimeIndex) -> float:
    """How many candles there are per year in this data.

    Counted from the data itself, so it is right for every market: crypto trades
    24/7 (365 daily candles a year), stocks ~252 days, Forex ~260 days.
    """
    years = (index[-1] - index[0]) / pd.Timedelta(days=365)
    if years <= 0:
        return 365.0
    return (len(index) - 1) / years


def equity_stats(equity: pd.Series, initial: float) -> dict:
    """Return, drawdown and risk-adjusted numbers from an equity curve."""
    returns = equity.pct_change().fillna(equity.iloc[0] / initial - 1)
    n_per_year = periods_per_year(equity.index)
    years = (equity.index[-1] - equity.index[0]) / pd.Timedelta(days=365)

    total_return = equity.iloc[-1] / initial - 1
    cagr = (equity.iloc[-1] / initial) ** (1 / years) - 1 if years > 0 and equity.iloc[-1] > 0 else float("nan")

    peak = np.maximum(equity.cummax(), initial)
    max_dd = (equity / peak - 1).min()

    std = returns.std()
    sharpe = returns.mean() / std * math.sqrt(n_per_year) if std > 0 else float("nan")
    downside = math.sqrt((returns.clip(upper=0) ** 2).mean())
    sortino = returns.mean() / downside * math.sqrt(n_per_year) if downside > 0 else float("nan")
    calmar = cagr / abs(max_dd) if max_dd < 0 else float("nan")

    return {
        "total_return_pct": 100 * total_return,
        "cagr_pct": 100 * cagr,
        "max_drawdown_pct": 100 * max_dd,
        "sharpe": sharpe,
        "sortino": sortino,
        "calmar": calmar,
    }


def trade_stats(trades: list[Trade]) -> dict:
    pnls = [t.pnl for t in trades]
    wins = [p for p in pnls if p > 0]
    losses = [p for p in pnls if p <= 0]
    gross_loss = -sum(losses)
    return {
        "trades": len(trades),
        "win_rate_pct": 100 * len(wins) / len(trades) if trades else float("nan"),
        "profit_factor": sum(wins) / gross_loss if gross_loss > 0 else float("nan"),
        "avg_trade_pct": float(np.mean([t.return_pct for t in trades])) if trades else float("nan"),
    }


def summarize(result: BacktestResult, min_trades: int = 30) -> dict:
    """All numbers for one backtest, plus buy-and-hold and warnings."""
    strat = equity_stats(result.equity, result.initial_capital)
    bh = equity_stats(result.buy_hold_equity, result.initial_capital)
    summary = {
        **strat,
        **trade_stats(result.trades),
        "skipped_orders": result.skipped_orders,
        "bh_total_return_pct": bh["total_return_pct"],
        "bh_max_drawdown_pct": bh["max_drawdown_pct"],
        "bh_sharpe": bh["sharpe"],
        "vs_bh_pct": strat["total_return_pct"] - bh["total_return_pct"],
        "warnings": [],
    }
    if summary["trades"] < min_trades:
        summary["warnings"].append(
            f"Only {summary['trades']} trades (< {min_trades}): not statistically meaningful")
    return summary
