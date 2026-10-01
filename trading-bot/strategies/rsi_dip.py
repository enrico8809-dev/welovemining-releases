"""RSI dip-buy with a trend filter.

Buy a short dip (RSI oversold) but ONLY while the long-term trend is up
(price above its 200-candle SMA), so we don't "catch falling knives" in a downtrend.
Sell when RSI has recovered, or when the price falls below the trend line.
With allow_short=True (Forex only) the mirror image too: short a spike (RSI overbought)
while the price is BELOW the trend line, cover when RSI has cooled or the price breaks above it.
Indicators used: 2 (RSI, SMA).
"""
import pandas as pd

from strategies.base import Strategy
from strategies.indicators import rsi, sma


class RsiDip(Strategy):
    name = "rsi_dip"
    timeframe = "1d"

    def __init__(self, rsi_period: int = 14, buy_below: float = 30, sell_above: float = 55,
                 trend_period: int = 200, stop_loss_pct: float | None = 8, allow_short: bool = False):
        super().__init__(rsi_period=rsi_period, buy_below=buy_below, sell_above=sell_above,
                         trend_period=trend_period, stop_loss_pct=stop_loss_pct)
        self.allow_short = allow_short
        self.rsi_period, self.buy_below, self.sell_above = rsi_period, buy_below, sell_above
        self.trend_period = trend_period
        self.stop_loss_pct = stop_loss_pct      # the backtester/risk manager executes the stop

    def target_exposure(self, candles: pd.DataFrame) -> pd.Series:
        close = candles["close"]
        r = rsi(close, self.rsi_period)
        trend = sma(close, self.trend_period)

        long_in = ((r < self.buy_below) & (close > trend)).to_numpy()
        long_out = ((r > self.sell_above) | (close < trend)).to_numpy()
        short_in = ((r > 100 - self.buy_below) & (close < trend)).to_numpy() if self.allow_short else None
        short_out = ((r < 100 - self.sell_above) | (close > trend)).to_numpy() if self.allow_short else None

        # Walk through the candles: once in, stay in until an exit signal
        out, position = [], 0.0
        for i in range(len(close)):
            if position > 0 and long_out[i] or position < 0 and short_out[i]:
                position = 0.0
            elif position == 0 and long_in[i]:
                position = 1.0
            elif position == 0 and self.allow_short and short_in[i]:
                position = -1.0
            out.append(position)
        return pd.Series(out, index=candles.index)
