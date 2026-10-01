"""Channel breakout (Donchian): trade the break of the recent range.

Long when the close breaks ABOVE the highest high of the last `entry` candles; out when it
falls below the lowest low of the last `exit` candles. With allow_short=True (Forex only)
the mirror image: short below the `entry`-candle low, cover above the `exit`-candle high.
Works on any timeframe; used by Forex day-trading mode on hourly candles.
Indicators used: 2 (entry channel, exit channel).
"""
import pandas as pd

from strategies.base import Strategy


class Breakout(Strategy):
    name = "breakout"
    timeframe = "1h"

    def __init__(self, entry: int = 20, exit: int = 10, stop_loss_pct: float | None = None,
                 allow_short: bool = False):
        if exit >= entry:
            raise ValueError("exit must be shorter than entry")
        super().__init__(entry=entry, exit=exit, stop_loss_pct=stop_loss_pct)
        self.entry, self.exit, self.allow_short = entry, exit, allow_short
        self.stop_loss_pct = stop_loss_pct

    def target_exposure(self, candles: pd.DataFrame) -> pd.Series:
        close = candles["close"].to_numpy()
        # Channels of the PREVIOUS candles (shift 1), so a candle never compares with itself
        hi_in = candles["high"].rolling(self.entry).max().shift(1).to_numpy()
        lo_in = candles["low"].rolling(self.entry).min().shift(1).to_numpy()
        hi_out = candles["high"].rolling(self.exit).max().shift(1).to_numpy()
        lo_out = candles["low"].rolling(self.exit).min().shift(1).to_numpy()

        out, position = [], 0.0
        for i in range(len(close)):
            c = close[i]
            if position > 0 and c < lo_out[i] or position < 0 and c > hi_out[i]:
                position = 0.0
            if position == 0:
                if c > hi_in[i]:
                    position = 1.0
                elif self.allow_short and c < lo_in[i]:
                    position = -1.0
            out.append(position)
        return pd.Series(out, index=candles.index)
