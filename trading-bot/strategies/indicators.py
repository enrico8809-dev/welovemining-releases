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


def _wilder(series: pd.Series, period: int) -> pd.Series:
    """Wilder's smoothing (an exponential average), as used by ATR and ADX."""
    return series.ewm(alpha=1 / period, adjust=False, min_periods=period).mean()


def atr(candles: pd.DataFrame, period: int = 14) -> pd.Series:
    """Average True Range: the typical candle size, in price units. Bigger = more volatile."""
    prev_close = candles["close"].shift(1)
    true_range = pd.concat([
        candles["high"] - candles["low"],
        (candles["high"] - prev_close).abs(),
        (candles["low"] - prev_close).abs(),
    ], axis=1).max(axis=1)
    return _wilder(true_range, period)


def adx(candles: pd.DataFrame, period: int = 14) -> pd.DataFrame:
    """Average Directional Index. Returns columns adx, plus_di, minus_di.

    adx above ~20-25 = the market is trending (either way); below = no clear trend.
    plus_di > minus_di = buyers are stronger; minus_di > plus_di = sellers are stronger.
    """
    up_move = candles["high"].diff()
    down_move = -candles["low"].diff()
    plus_dm = up_move.where((up_move > down_move) & (up_move > 0), 0.0)
    minus_dm = down_move.where((down_move > up_move) & (down_move > 0), 0.0)

    avg_range = atr(candles, period)
    plus_di = 100 * _wilder(plus_dm, period) / avg_range
    minus_di = 100 * _wilder(minus_dm, period) / avg_range
    dx = 100 * (plus_di - minus_di).abs() / (plus_di + minus_di)
    return pd.DataFrame({"adx": _wilder(dx, period), "plus_di": plus_di, "minus_di": minus_di})
