"""Backtest WITH the Risk Manager, so you can see what it does on real history.

Differences from the plain engine (backtest/engine.py):
  * The strategy only decides WHEN to be in the market (exposure > 0 = in, 0 = out).
  * The Risk Manager decides HOW MUCH to buy (volatility / ATR sizing and the hard caps)
    and can refuse the buy (daily loss halt, max drawdown halt, cooldowns).
  * Every position gets a stop-loss and a trailing stop from the Risk Manager.

Same timing rules as the plain engine (no look-ahead):
  * buys/sells happen at the OPEN, using the ATR of the previous (closed) candle;
  * the stop is checked against the candle's LOW (gap below the stop = filled at the open);
  * the trailing stop is moved up after the candle CLOSES and applies from the next candle.
The absolute max order size (MAX_ORDER_USDT) is a live-trading cap and is not applied here.
"""
import math

import pandas as pd

from backtest.engine import BacktestResult, BacktestSettings, Trade, buy_and_hold, select_window
from bot.risk import RiskConfig, RiskManager
from strategies.base import Strategy
from strategies.indicators import atr as atr_indicator


def run_backtest_with_risk(candles: pd.DataFrame, strategy: Strategy, settings: BacktestSettings,
                           risk_config: RiskConfig, start: str | None = None,
                           end: str | None = None) -> BacktestResult:
    target = strategy.target_exposure(candles).reindex(candles.index).fillna(0)
    want_in = (target.shift(1).fillna(0) > 0)                  # decided at the previous close
    prev_atr = atr_indicator(candles, risk_config.atr_period).shift(1)

    window = select_window(candles, start, end)
    rm = RiskManager(risk_config, quiet=True)                  # fresh, in-memory state
    rules, slip = settings.rules, settings.slippage_pct / 100

    cash, qty = settings.initial_capital, 0.0
    stop = highest = 0.0
    wait_for_reset = False            # after a stop-loss: wait until the strategy goes flat
    current: Trade | None = None
    trades, orders, equity, notes = [], [], [], []
    skipped = 0
    last_block = ""

    def sell(time, raw_price, reason):
        nonlocal cash, qty, current, stop, highest
        price = raw_price * (1 - slip)
        decision = rm.check_sell(qty, price, rules)
        if not decision.approved:
            return False
        value = decision.amount * price
        fee = settings.fee_for(value)
        cash += value - fee
        qty -= decision.amount
        current.returned += value - fee
        current.orders += 1
        current.exit_time, current.exit_reason = time, reason
        orders.append(dict(time=time, side="sell", price=price, amount=decision.amount, fee=fee, reason=reason))
        trades.append(current)
        rm.record_closed_trade(current.pnl, stopped_out=(reason == "stop_loss"), now=time)
        current, stop, highest = None, 0.0, 0.0
        return True

    for time, want, a, o, h, l, c in zip(window.index, want_in.loc[window.index],
                                          prev_atr.loc[window.index], window["open"],
                                          window["high"], window["low"], window["close"]):
        now = time.to_pydatetime()
        rm.update_equity(cash + qty * o, now)

        # 1) At the open: exit on signal, or ask the Risk Manager for a new entry
        if not want:
            wait_for_reset = False
        if current is not None and not want:
            sell(time, o, "signal")
        elif current is None and want and not wait_for_reset:
            price = o * (1 + slip)
            decision = rm.check_buy(price, a if not math.isnan(a) else 0, cash + qty * o, cash,
                                    open_trades=0, rules=rules, now=now, max_order_value=math.inf)
            if decision.approved:
                cost = decision.amount * price
                fee = settings.fee_for(cost)
                if cost + fee <= cash:
                    cash -= cost + fee
                    qty += decision.amount
                    stop, highest = decision.stop_price, price
                    current = Trade(entry_time=time, invested=cost + fee, orders=1)
                    orders.append(dict(time=time, side="buy", price=price, amount=decision.amount,
                                       fee=fee, reason="signal"))
                else:
                    skipped += 1
            else:
                if decision.reason != last_block and ("halted" in decision.reason or "paused" in decision.reason):
                    notes.append(f"{time:%Y-%m-%d} buy blocked: {decision.reason}")
                last_block = decision.reason
                if "minimum" in decision.reason:
                    skipped += 1

        # 2) During the candle: stop-loss / trailing stop hit?
        if current is not None and l <= stop:
            if sell(time, min(o, stop), "stop_loss"):
                wait_for_reset = True

        # 3) At the close: move the trailing stop up for the next candle
        if current is not None:
            highest = max(highest, h)
            current_atr = a if not math.isnan(a) else 0
            stop = rm.trailing_stop(stop, highest, current_atr)
        equity.append(cash + qty * c)

    if current is not None:                                    # close what is left at the end
        last_time = window.index[-1]
        if not sell(last_time, window["close"].iloc[-1], "end_of_test"):
            current.returned += qty * window["close"].iloc[-1]
            current.exit_time, current.exit_reason = last_time, "end_of_test"
            trades.append(current)
        equity[-1] = cash + qty * window["close"].iloc[-1]

    return BacktestResult(
        equity=pd.Series(equity, index=window.index, name="equity"),
        trades=trades, orders=orders, skipped_orders=skipped,
        buy_hold_equity=buy_and_hold(window, settings),
        initial_capital=settings.initial_capital, notes=notes,
    )
