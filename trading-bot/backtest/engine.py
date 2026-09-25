"""Backtest engine: replays history candle by candle, like the live bot would.

How one candle is processed:
  1. At the candle's OPEN we trade towards the exposure the strategy asked for
     after the PREVIOUS candle closed (so no look-ahead).
  2. During the candle, a stop-loss is hit if the LOW touches the stop price.
  3. At the CLOSE we record the equity (cash + coins valued at close).

Every fill pays the fee and slippage, and orders below the exchange minimum
or with too many decimals are rounded down or skipped - just like a real exchange.
"""
import json
import math
from dataclasses import dataclass, field
from pathlib import Path

import pandas as pd

from strategies.base import Strategy


@dataclass
class MarketRules:
    """Exchange limits for one trading pair."""
    min_cost: float = 5.0          # minimum order value in USDT
    min_amount: float = 0.0        # minimum coin amount
    amount_step: float = 0.00001   # coin amount must be a multiple of this

    def round_amount(self, amount: float) -> float:
        """Round DOWN to the allowed step (rounding up could spend money we don't have)."""
        if not self.amount_step:
            return amount
        steps = math.floor(amount / self.amount_step + 1e-9)
        return round(steps * self.amount_step, 12)

    def is_valid(self, amount: float, price: float) -> bool:
        return amount > 0 and amount >= self.min_amount and amount * price >= self.min_cost


def load_market_rules(cache_dir: Path, exchange_id: str, symbol: str,
                      default_min_cost: float, default_step: float) -> MarketRules:
    """Read the rules saved by the downloader, or fall back to the defaults in config.yaml."""
    path = Path(cache_dir) / exchange_id / "markets.json"
    rules = json.loads(path.read_text()).get(symbol, {}) if path.exists() else {}
    return MarketRules(
        min_cost=rules.get("min_cost") or default_min_cost,
        min_amount=rules.get("min_amount") or 0.0,
        amount_step=rules.get("amount_step") or default_step,
    )


@dataclass
class BacktestSettings:
    initial_capital: float = 1000.0
    fee_pct: float = 0.1
    min_fee: float = 0.0           # minimum fee per order (stock/Forex brokers charge one)
    slippage_pct: float = 0.05
    rules: MarketRules = field(default_factory=MarketRules)
    # Ignore tiny rebalances (e.g. 0.50 -> 0.52 exposure) to avoid paying fees for nothing
    rebalance_threshold: float = 0.05

    def fee_for(self, value: float) -> float:
        """Fee for an order of this value: a percentage, but never less than min_fee."""
        return max(value * self.fee_pct / 100, self.min_fee)


@dataclass
class Trade:
    """One round trip: from 'no position' to 'no position' again."""
    entry_time: pd.Timestamp
    exit_time: pd.Timestamp | None = None
    invested: float = 0.0        # money paid for all buys, fees included
    returned: float = 0.0        # money received from all sells, after fees
    orders: int = 0
    exit_reason: str = ""

    @property
    def pnl(self) -> float:
        return self.returned - self.invested

    @property
    def return_pct(self) -> float:
        return 100 * self.pnl / self.invested if self.invested else 0.0


@dataclass
class BacktestResult:
    equity: pd.Series                 # equity at each candle close
    trades: list[Trade]
    orders: list[dict]
    skipped_orders: int               # orders not placed because they were below the minimum
    buy_hold_equity: pd.Series
    initial_capital: float


def run_backtest(candles: pd.DataFrame, strategy: Strategy, settings: BacktestSettings,
                 start: str | None = None, end: str | None = None) -> BacktestResult:
    """Run one strategy on one coin. start/end (YYYY-MM-DD, inclusive) limit the trading window;
    candles before 'start' are still used to warm up the indicators."""
    # Strategy decides using the whole history, then we shift by 1 candle:
    # the decision made at candle i's close is executed at candle i+1's open.
    target = strategy.target_exposure(candles).reindex(candles.index)
    target = target.fillna(0).clip(0, 1)          # spot only: never short, never leverage
    wanted = target.shift(1).fillna(0)

    window = candles
    if start:
        window = window[window.index >= pd.Timestamp(start, tz="UTC")]
    if end:
        window = window[window.index < pd.Timestamp(end, tz="UTC") + pd.Timedelta(days=1)]
    if len(window) < 2:
        raise ValueError("Not enough candles in the selected period")
    wanted = wanted.loc[window.index]

    fee = settings.fee_pct / 100
    slip = settings.slippage_pct / 100
    rules = settings.rules

    cash, qty = settings.initial_capital, 0.0
    avg_entry = 0.0            # average buy price of the current position (for the stop-loss)
    stopped_out = False        # after a stop, wait for the strategy to go flat before re-entering
    trades: list[Trade] = []
    orders: list[dict] = []
    skipped = 0
    equity = []
    current: Trade | None = None

    def is_flat(price: float) -> bool:
        # Leftover "dust" below the exchange minimum counts as no position
        return qty * price < rules.min_cost

    def buy(time, price_before_slip, usdt, reason):
        nonlocal cash, qty, avg_entry, current, skipped
        price = price_before_slip * (1 + slip)
        amount = rules.round_amount(usdt / (price * (1 + fee)))
        if settings.fee_for(amount * price) > amount * price * fee:   # minimum fee applies
            amount = rules.round_amount((usdt - settings.min_fee) / price)
        if not rules.is_valid(amount, price):
            skipped += 1
            return
        cost = amount * price
        order_fee = settings.fee_for(cost)
        paid = cost + order_fee
        if current is None:
            current = Trade(entry_time=time)
            avg_entry = price          # any leftover dust is treated as bought at this price
        avg_entry = (avg_entry * qty + price * amount) / (qty + amount)
        cash -= paid
        qty += amount
        current.invested += paid
        current.orders += 1
        orders.append(dict(time=time, side="buy", price=price, amount=amount, fee=order_fee, reason=reason))

    def sell(time, price_before_slip, amount, reason):
        nonlocal cash, qty, avg_entry, current, skipped
        price = price_before_slip * (1 - slip)
        amount = rules.round_amount(min(amount, qty))
        value = amount * price
        order_fee = settings.fee_for(value)
        if not rules.is_valid(amount, price) or order_fee >= value:
            skipped += 1
            return
        received = value - order_fee
        cash += received
        qty -= amount
        if current is not None:
            current.returned += received
            current.orders += 1
        orders.append(dict(time=time, side="sell", price=price, amount=amount, fee=order_fee, reason=reason))
        if is_flat(price):
            # Round trip finished. Any dust left is simply kept and valued in equity.
            if current is not None:
                current.exit_time, current.exit_reason = time, reason
                trades.append(current)
            current, avg_entry = None, 0.0

    # Plain lists are much faster to loop over than DataFrame rows
    rows = zip(window.index, wanted.to_numpy(), window["open"].to_numpy(),
               window["low"].to_numpy(), window["close"].to_numpy())
    for time, want, o, l, c in rows:
        want = float(want)

        # 1) Trade at the open towards the wanted exposure
        if stopped_out and want == 0:
            stopped_out = False
        if stopped_out:
            want = 0.0
        equity_open = cash + qty * o
        exposure = qty * o / equity_open if equity_open > 0 else 0.0
        if want == 0 and not is_flat(o):
            sell(time, o, qty, "signal")
        elif want > 0 and abs(want - exposure) >= settings.rebalance_threshold:
            diff_usdt = (want - exposure) * equity_open
            if diff_usdt > 0:
                buy(time, o, min(diff_usdt, cash), "signal")
            else:
                sell(time, o, -diff_usdt / o, "rebalance")

        # 2) Stop-loss during the candle (checked with the LOW, the worst case)
        if strategy.stop_loss_pct and not is_flat(l) and avg_entry > 0:
            stop_price = avg_entry * (1 - strategy.stop_loss_pct / 100)
            if l <= stop_price:
                # If the candle already opened below the stop (a gap), we get the open price
                sell(time, min(o, stop_price), qty, "stop_loss")
                stopped_out = True

        # 3) Record equity at the close
        equity.append(cash + qty * c)

    # Close any open position at the last close so results include the exit costs
    last_time, last_close = window.index[-1], window["close"].iloc[-1]
    if current is not None:
        sell(last_time, last_close, qty, "end_of_test")
        if current is not None:          # sell was below minimum: book the dust at market value
            current.returned += qty * last_close
            current.exit_time, current.exit_reason = last_time, "end_of_test"
            trades.append(current)
            current = None
        equity[-1] = cash + qty * last_close

    equity_series = pd.Series(equity, index=window.index, name="equity")
    return BacktestResult(
        equity=equity_series,
        trades=trades,
        orders=orders,
        skipped_orders=skipped,
        buy_hold_equity=buy_and_hold(window, settings),
        initial_capital=settings.initial_capital,
    )


def buy_and_hold(window: pd.DataFrame, settings: BacktestSettings) -> pd.Series:
    """Benchmark: buy with all cash at the first open, sell at the last close (same costs)."""
    fee = settings.fee_pct / 100
    slip = settings.slippage_pct / 100
    entry = window["open"].iloc[0] * (1 + slip)
    capital = settings.initial_capital - settings.min_fee   # keep room for a minimum fee
    qty = settings.rules.round_amount(capital / (entry * (1 + fee)))
    cash = settings.initial_capital - qty * entry - settings.fee_for(qty * entry)
    curve = cash + qty * window["close"]
    # Pay the exit costs on the final candle
    exit_value = qty * window["close"].iloc[-1] * (1 - slip)
    curve.iloc[-1] = cash + exit_value - settings.fee_for(exit_value)
    return curve.rename("buy_hold")
