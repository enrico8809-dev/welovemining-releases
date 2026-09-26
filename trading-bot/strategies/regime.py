"""Regime switcher: picks a strategy based on the market regime (bot/regime.py).

    trending up   -> `up` strategy        (default: sma_cross)
    sideways      -> `sideways` strategy  (default: sma_cross; grid and cash also possible)
    trending down -> stay in cash (0%)
Use "cash" as the strategy name to hold nothing in that regime too.

The sub-strategies run on the same candles; for each candle we take the exposure of
the one that matches that candle's regime. In a downtrend we always hold 0%.
"""
import pandas as pd

from bot.regime import DOWN, SIDEWAYS, UP, detect_regime
from strategies.base import Strategy


class Regime(Strategy):
    name = "regime"
    timeframe = "1d"

    def __init__(self, up: str = "sma_cross", sideways: str = "sma_cross", **regime_params):
        super().__init__(up=up, sideways=sideways, **regime_params)
        from strategies import load_strategy       # imported here to avoid a circular import
        # "cash" = hold nothing in that regime
        self.up = None if up == "cash" else load_strategy(up)
        self.sideways = None if sideways == "cash" else load_strategy(sideways)
        self.regime_params = regime_params
        self.stop_loss_pct = None

    def target_exposure(self, candles: pd.DataFrame) -> pd.Series:
        regime = detect_regime(candles, **self.regime_params)
        zero = pd.Series(0.0, index=candles.index)
        up = self.up.target_exposure(candles) if self.up else zero
        side = self.sideways.target_exposure(candles) if self.sideways else zero
        exposure = pd.Series(0.0, index=candles.index)
        exposure[regime == UP] = up[regime == UP]
        exposure[regime == SIDEWAYS] = side[regime == SIDEWAYS]
        exposure[regime == DOWN] = 0.0
        return exposure.fillna(0.0)
