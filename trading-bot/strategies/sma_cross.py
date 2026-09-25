"""Trend-following: moving-average crossover on daily candles.

In the coin when the fast SMA is above the slow SMA, otherwise in USDT.
Indicators used: 2 (fast SMA, slow SMA).
"""
import pandas as pd

from strategies.base import Strategy


class SmaCross(Strategy):
    name = "sma_cross"
    timeframe = "1d"

    def __init__(self, fast: int = 10, slow: int = 40, stop_loss_pct: float | None = None):
        if fast >= slow:
            raise ValueError("fast must be smaller than slow")
        super().__init__(fast=fast, slow=slow, stop_loss_pct=stop_loss_pct)
        self.fast, self.slow = fast, slow
        self.stop_loss_pct = stop_loss_pct

    def target_exposure(self, candles: pd.DataFrame) -> pd.Series:
        close = candles["close"]
        # rolling() only looks backwards, so no future data is used
        fast = close.rolling(self.fast).mean()
        slow = close.rolling(self.slow).mean()
        # Before 'slow' candles exist the SMA is NaN -> comparison is False -> stay in USDT
        return (fast > slow).astype(float)
