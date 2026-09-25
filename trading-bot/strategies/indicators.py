"""Indicators shared by the strategies. All of them only look backwards (no future data)."""
import pandas as pd


def sma(series: pd.Series, period: int) -> pd.Series:
    """Simple moving average of the last `period` values."""
    return series.rolling(period).mean()


def rsi(close: pd.Series, period: int = 14) -> pd.Series:
    """Relative Strength Index (Wilder's version), 0-100. Below 30 = oversold, above 70 = overbought."""
    change = close.diff()
    gain = change.clip(lower=0).ewm(alpha=1 / period, adjust=False, min_periods=period).mean()
    loss = (-change.clip(upper=0)).ewm(alpha=1 / period, adjust=False, min_periods=period).mean()
    rs = gain / loss
    return 100 - 100 / (1 + rs)
