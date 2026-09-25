"""DCA (dollar-cost averaging) with capped safety orders and a hard stop-loss.

  1. Start a position with a base order, only when the price is above its trend SMA.
  2. Each time the price closes `step_pct` below the last buy, add a safety order,
     but at most `max_safety` times (no unlimited averaging down).
  3. Take profit when the price closes `take_profit_pct` above the average buy price.
  4. Hard stop-loss: sell everything when the price drops `stop_loss_pct` below the
     average buy price, then wait `cooldown` candles before starting again.

The budget is split into equal parts: 1 base order + max_safety safety orders.
Indicators used: 1 (SMA) plus the position's own average buy price.
"""
import pandas as pd

from strategies.base import Strategy
from strategies.indicators import sma


class Dca(Strategy):
    name = "dca"
    timeframe = "1d"

    def __init__(self, step_pct: float = 5, max_safety: int = 3, take_profit_pct: float = 6,
                 stop_loss_pct: float = 15, trend_period: int = 100, cooldown: int = 10):
        super().__init__(step_pct=step_pct, max_safety=max_safety, take_profit_pct=take_profit_pct,
                         stop_loss_pct=stop_loss_pct, trend_period=trend_period, cooldown=cooldown)
        self.step = step_pct / 100
        self.max_safety = max_safety
        self.take_profit = take_profit_pct / 100
        self.stop = stop_loss_pct / 100
        self.trend_period = trend_period
        self.cooldown = cooldown
        # The backtester also watches the stop DURING each candle (using the low),
        # measured from its real average entry price.
        self.stop_loss_pct = stop_loss_pct

    def target_exposure(self, candles: pd.DataFrame) -> pd.Series:
        close = candles["close"].to_numpy()
        low = candles["low"].to_numpy()
        trend = sma(candles["close"], self.trend_period).to_numpy()
        parts = 1 + self.max_safety

        out = []
        orders = 0                 # buys in the current position (0 = no position)
        avg_price = last_buy = 0.0
        wait_until = 0
        for i in range(len(close)):
            price = close[i]
            if orders:
                if low[i] <= avg_price * (1 - self.stop):             # hard stop hit during the candle
                    orders, wait_until = 0, i + self.cooldown
                elif price >= avg_price * (1 + self.take_profit):     # take profit
                    orders = 0
                elif price <= last_buy * (1 - self.step) and orders < parts:   # safety order
                    avg_price = (avg_price * orders + price) / (orders + 1)
                    orders += 1
                    last_buy = price
            elif i >= wait_until and price > trend[i]:                 # base order (trend is up)
                orders, avg_price, last_buy = 1, price, price
            out.append(orders / parts)
        return pd.Series(out, index=candles.index)
