"""Base class every strategy plugs into.

A strategy looks at candles and answers one question per candle:
    "After this candle CLOSES, what share of my money should be in the coin?"
    0.0 = all in USDT, 1.0 = fully in the coin, 0.5 = half.

Rules (checked by tests/test_lookahead.py):
  * The value for candle i may only use candles 0..i (never future candles).
  * The backtester acts on it at the OPEN of candle i+1.
  * Spot markets (crypto, stocks): values are clipped to 0..1 - no shorting, no leverage.
  * Forex may also go SHORT: strategies that accept `allow_short=True` return -1.0 for
    "fully short". Only the Forex backtester and trader ever switch this on.
"""
import pandas as pd


class Strategy:
    name = "base"
    timeframe = "1d"
    stop_loss_pct: float | None = None   # e.g. 8 = sell if price drops 8% below entry

    def __init__(self, **params):
        self.params = params

    def target_exposure(self, candles: pd.DataFrame) -> pd.Series:
        """Return a Series (same index as candles) with values between 0 and 1."""
        raise NotImplementedError

    def __repr__(self):
        args = ", ".join(f"{k}={v}" for k, v in self.params.items())
        return f"{self.name}({args})"
