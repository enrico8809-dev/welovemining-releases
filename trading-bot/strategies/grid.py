"""Grid trading for sideways markets, with a stop when price breaks below the grid.

How it works:
  1. Take the highest high and lowest low of the last `lookback` candles: that range is the grid.
     Only start if the range is a sensible size (not too narrow, not too wide).
  2. Split the grid into `levels` steps. The lower the price sits in the grid, the more we hold:
     at the bottom 100% in the coin, at the top 0%. So we buy dips and sell rises, step by step.
  3. If price CLOSES more than `stop_pct` below the grid, sell everything (the range broke down)
     and wait `lookback` candles before drawing a new grid.
     If price closes above the grid, we are already out (0% at the top); a new grid is drawn.

Note: real grid bots fill orders at each level during the candle; this version trades at
the next open after a close, which is simpler and slightly more conservative.
Indicators used: 1 (the price range).
"""
import math

import pandas as pd

from strategies.base import Strategy


class Grid(Strategy):
    name = "grid"
    timeframe = "1d"

    def __init__(self, lookback: int = 30, levels: int = 5, stop_pct: float = 5,
                 min_width_pct: float = 8, max_width_pct: float = 40):
        super().__init__(lookback=lookback, levels=levels, stop_pct=stop_pct,
                         min_width_pct=min_width_pct, max_width_pct=max_width_pct)
        self.lookback, self.levels, self.stop_pct = lookback, levels, stop_pct
        self.min_width, self.max_width = min_width_pct / 100, max_width_pct / 100

    def target_exposure(self, candles: pd.DataFrame) -> pd.Series:
        high = candles["high"].to_numpy()
        low = candles["low"].to_numpy()
        close = candles["close"].to_numpy()

        out = []
        lower = upper = None          # the current grid (None = no grid)
        wait_until = 0                # candle index before which no new grid may start
        for i in range(len(close)):
            # Draw a new grid from the last `lookback` candles (candle i included: it is closed)
            if lower is None and i >= self.lookback - 1 and i >= wait_until:
                lo = low[i - self.lookback + 1:i + 1].min()
                hi = high[i - self.lookback + 1:i + 1].max()
                if self.min_width <= hi / lo - 1 <= self.max_width:
                    lower, upper = lo, hi

            exposure = 0.0
            if lower is not None:
                if close[i] < lower * (1 - self.stop_pct / 100):      # broke down: stop out
                    lower = upper = None
                    wait_until = i + self.lookback
                elif close[i] > upper:                                # broke out upwards: new grid
                    lower = upper = None
                else:
                    # 0 at the top of the grid, 1 at the bottom, in whole steps
                    position = (upper - close[i]) / (upper - lower)
                    exposure = min(1.0, max(0.0, math.floor(position * self.levels + 1e-9) / self.levels))
            out.append(exposure)
        return pd.Series(out, index=candles.index)
