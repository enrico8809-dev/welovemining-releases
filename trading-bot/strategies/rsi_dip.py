"""RSI dip-buy with a trend filter.

Buy a short dip (RSI oversold) but ONLY while the long-term trend is up
(price above its 200-candle SMA), so we don't "catch falling knives" in a downtrend.
Sell when RSI has recovered, or when the price falls below the trend line.
Indicators used: 2 (RSI, SMA).
"""
import pandas as pd

from strategies.base import Strategy
from strategies.indicators import rsi, sma


class RsiDip(Strategy):
    name = "rsi_dip"
    timeframe = "1d"

    def __init__(self, rsi_period: int = 14, buy_below: float = 30, sell_above: float = 55,
                 trend_period: int = 200, stop_loss_pct: float | None = 8):
        super().__init__(rsi_period=rsi_period, buy_below=buy_below, sell_above=sell_above,
                         trend_period=trend_period, stop_loss_pct=stop_loss_pct)
        self.rsi_period, self.buy_below, self.sell_above = rsi_period, buy_below, sell_above
        self.trend_period = trend_period
        self.stop_loss_pct = stop_loss_pct      # the backtester/risk manager executes the stop

    def target_exposure(self, candles: pd.DataFrame) -> pd.Series:
        close = candles["close"]
        r = rsi(close, self.rsi_period)
        trend = sma(close, self.trend_period)

        entry = (r < self.buy_below) & (close > trend)
        exit_ = (r > self.sell_above) | (close < trend)

        # Walk through the candles: once in, stay in until an exit signal
        out, holding = [], False
        for e, x in zip(entry.to_numpy(), exit_.to_numpy()):
            if holding and x:
                holding = False
            elif not holding and e:
                holding = True
            out.append(1.0 if holding else 0.0)
        return pd.Series(out, index=candles.index)
