"""Forex backtest: long AND short, sized in lots by the Risk Manager, with real Forex costs.

Same timing rules as the other engines (no look-ahead):
  * the strategy decides at a candle's CLOSE; we act at the next candle's OPEN, using the ATR
    of the previous (closed) candle;
  * candles are BID prices (like MetaTrader): a buy fills at the ASK = bid + spread,
    a short is closed at the ASK too;
  * the stop-loss is checked inside the candle (long: the LOW, short: the HIGH + spread);
    a gap past the stop fills at the open, not at the stop;
  * the trailing stop moves after the candle CLOSES and applies from the next candle.

Costs
  * spread: from the candles' `spread` column (MT5 history), else a default per symbol
  * commission: per lot per side (ECN accounts), in the account currency
  * swap: the overnight interest per lot per night (positive = you earn it), with the
    3-night charge on the broker's triple-swap day (Wednesday) and none on weekends

Every trade must have a stop-loss and the exposure is capped (default 1:1), exactly like live.

Day-trading mode (`day=` settings, intraday candles): new trades only inside the trading
session, at most N per day, and everything is closed shortly before the daily 17:00 New York
rollover - so no overnight swap and nothing is held over the weekend.
"""
import math
from dataclasses import dataclass

import numpy as np
import pandas as pd

from backtest.engine import BacktestResult, Trade, select_window
from bot.forex_hours import day_entry_block, must_be_flat, trading_day
from bot.risk import RiskConfig, RiskManager
from bot.rules import LotRules
from strategies.base import Strategy
from strategies.indicators import atr as atr_indicator


@dataclass
class ForexSettings:
    initial_capital: float = 10_000.0
    account_currency: str = "USD"
    commission_per_lot: float = 0.0       # per lot per side (e.g. 3.5 on an ECN account)
    default_spread_points: float = 15.0   # used when the candles have no spread column
    slippage_points: float = 0.0          # extra cost per fill, in points


def swap_nights(day: pd.Timestamp, triple_day_mt5: int) -> int:
    """Nights of swap charged for holding through this candle's close.
    MT5 counts weekdays from Sunday=0; Python from Monday=0."""
    if day.weekday() >= 5:                       # no rollover on weekend candles
        return 0
    return 3 if day.weekday() == (triple_day_mt5 - 1) % 7 else 1


def run_forex_backtest(candles: pd.DataFrame, strategy: Strategy, lot_rules: LotRules,
                       settings: ForexSettings, risk_config: RiskConfig, start: str | None = None,
                       end: str | None = None, target: pd.Series | None = None,
                       day: dict | None = None) -> BacktestResult:
    """day: day-trading settings (forex_day in config.yaml) or None for swing trading."""
    if target is None:
        target = strategy.target_exposure(candles)
    direction = np.sign(target.reindex(candles.index).fillna(0)).shift(1).fillna(0)   # previous close
    prev_atr = atr_indicator(candles, risk_config.atr_period).shift(1)
    cur_atr = atr_indicator(candles, risk_config.atr_period)
    points = candles["spread"] if "spread" in candles else pd.Series(settings.default_spread_points, candles.index)
    spreads = (points.fillna(settings.default_spread_points) + settings.slippage_points) * lot_rules.point

    window = select_window(candles, start, end)
    rm = RiskManager(risk_config, quiet=True)
    contract, ccy = lot_rules.contract_size, settings.account_currency
    if lot_rules.to_account(float(window["close"].iloc[0]), ccy) is None:
        raise ValueError(f"{lot_rules.symbol}: P&L in {lot_rules.profit_currency} can't be converted to {ccy} "
                         "in a backtest (only pairs with the account currency, e.g. EURUSD or USDJPY)")

    def conv(price):
        return lot_rules.to_account(price, ccy)

    balance = settings.initial_capital
    pos = None                       # dict: side (+1 long / -1 short), lots, entry, stop, best, trade
    wait_side = 0                    # after a stop-loss: don't re-enter this side until the signal changes
    trades, orders, equity, notes = [], [], [], []
    skipped, last_block = 0, ""
    entries_per_day: dict[str, int] = {}

    def close(time, price, reason):
        nonlocal balance, pos
        lots, side = pos["lots"], pos["side"]
        commission = settings.commission_per_lot * lots
        pnl = side * (price - pos["entry"]) * lots * contract * conv(price) - commission
        balance += pnl
        t = pos["trade"]
        t.returned += pnl
        t.orders += 1
        t.exit_time, t.exit_reason = time, reason
        orders.append(dict(time=time, side="sell" if side > 0 else "buy", price=price, amount=lots,
                           fee=commission, reason=reason))
        trades.append(t)
        rm.record_closed_trade(t.pnl, stopped_out=(reason == "stop_loss"), now=time.to_pydatetime())
        pos = None

    def floating(price_bid, spread):
        if pos is None:
            return 0.0
        exit_price = price_bid if pos["side"] > 0 else price_bid + spread
        return pos["side"] * (exit_price - pos["entry"]) * pos["lots"] * contract * conv(exit_price)

    rows = zip(window.index, direction.loc[window.index], prev_atr.loc[window.index], cur_atr.loc[window.index],
               spreads.loc[window.index], window["open"], window["high"], window["low"], window["close"])
    for time, want, a_prev, a_now, sp, o, h, l, c in rows:
        now = time.to_pydatetime()
        want = int(want)
        rm.update_equity(balance + floating(o, sp), now)
        if want != wait_side:
            wait_side = 0

        # 1) At the open: close on a changed signal (or end of day), or open a new position
        if pos is not None and day is not None and must_be_flat(now, day):
            close(time, o if pos["side"] > 0 else o + sp, "end_of_day")
        if pos is not None and want != pos["side"]:
            close(time, o if pos["side"] > 0 else o + sp, "signal")
        may_enter = True
        if day is not None:
            may_enter = not day_entry_block(now, day) and \
                entries_per_day.get(trading_day(now), 0) < day.get("max_trades_per_day", 6)
        if pos is None and want != 0 and want != wait_side and may_enter:
            side = "buy" if want > 0 else "sell"
            entry = o + sp if want > 0 else o
            a = a_prev if not math.isnan(a_prev) else 0
            decision = rm.check_forex_entry(side, entry, a, balance, 0.0, 0, lot_rules, conv(entry), now, sp)
            if decision.approved:
                commission = settings.commission_per_lot * decision.amount
                balance -= commission
                trade = Trade(entry_time=time, invested=decision.amount * contract * entry * conv(entry), orders=1)
                trade.returned = trade.invested - commission
                pos = dict(side=want, lots=decision.amount, entry=entry, stop=decision.stop_price,
                           best=entry, trade=trade)
                entries_per_day[trading_day(now)] = entries_per_day.get(trading_day(now), 0) + 1
                orders.append(dict(time=time, side=side, price=entry, amount=decision.amount,
                                   fee=commission, reason="signal"))
            else:
                if decision.reason != last_block and ("halted" in decision.reason or "paused" in decision.reason):
                    notes.append(f"{time:%Y-%m-%d} entry blocked: {decision.reason}")
                last_block = decision.reason
                if "too small" in decision.reason:
                    skipped += 1

        # 2) During the candle: the broker's stop-loss
        if pos is not None:
            if pos["side"] > 0 and l <= pos["stop"]:
                close(time, min(o, pos["stop"]), "stop_loss")
                wait_side = 1
            elif pos["side"] < 0 and h + sp >= pos["stop"]:
                close(time, max(o + sp, pos["stop"]), "stop_loss")
                wait_side = -1

        # 3) At the close: overnight swap, then move the trailing stop for the next candle
        if pos is not None:
            nights = swap_nights(time, lot_rules.swap_triple_day) if day is None else 0   # day mode: flat
            if nights:
                rate = lot_rules.swap_long if pos["side"] > 0 else lot_rules.swap_short
                swap = rate * lot_rules.point * contract * pos["lots"] * conv(c) * nights
                balance += swap
                pos["trade"].returned += swap
            side = "buy" if pos["side"] > 0 else "sell"
            pos["best"] = max(pos["best"], h) if pos["side"] > 0 else min(pos["best"], l + sp)
            if not math.isnan(a_now):
                pos["stop"] = rm.trailing_stop(pos["stop"], pos["best"], a_now, side)
        equity.append(balance + floating(c, sp))

    if pos is not None:                                    # close what is left at the end
        last_c, last_sp = window["close"].iloc[-1], spreads.loc[window.index[-1]]
        close(window.index[-1], last_c if pos["side"] > 0 else last_c + last_sp, "end_of_test")
        equity[-1] = balance

    return BacktestResult(
        equity=pd.Series(equity, index=window.index, name="equity"),
        trades=trades, orders=orders, skipped_orders=skipped,
        buy_hold_equity=forex_buy_and_hold(window, spreads.loc[window.index], lot_rules, settings),
        initial_capital=settings.initial_capital, notes=notes,
    )


def forex_buy_and_hold(window: pd.DataFrame, spreads: pd.Series, lot_rules: LotRules,
                       settings: ForexSettings) -> pd.Series:
    """Benchmark: one long position worth the whole account (1:1), held from the first open
    to the last close (spread paid, swap ignored)."""
    entry = window["open"].iloc[0] + spreads.iloc[0]
    to_acc = lambda p: lot_rules.to_account(p, settings.account_currency)
    units = settings.initial_capital / (entry * to_acc(entry))
    pnl = units * (window["close"] - entry) * window["close"].map(to_acc)
    return (settings.initial_capital + pnl).rename("buy_hold")
