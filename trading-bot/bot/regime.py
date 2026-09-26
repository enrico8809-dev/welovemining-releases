"""Market Regime Detector: is a coin/stock trending UP, trending DOWN, or moving SIDEWAYS?

For every closed candle it uses 3 measures:
  1. ADX           - how strong the trend is (either direction)
  2. Moving average - which side of its long-term average the price is on, and its slope
  3. Volatility    - how big the candles are compared with normal for this market

Rules (checked in this order):
  up       strong trend (ADX >= adx_trend), buyers stronger (+DI > -DI),
           price above the moving average and the average is rising (by >= min_slope_pct)
  down     price below the moving average and the average is falling,
           OR a strong trend with sellers stronger (-DI > +DI) and price below the average
  down     volatility far above normal (a crash or panic): treated as "down", i.e. stay in cash
  sideways everything else (no strong trend, calm market)

A new regime is only accepted after it has shown up `confirm` candles in a row,
so the label does not flip back and forth every day.

See how it classifies your markets:
    python -m bot.regime                      (crypto)
    python -m bot.regime --market stocks
"""
import argparse

import numpy as np
import pandas as pd

from strategies.indicators import adx, atr, sma

UP, DOWN, SIDEWAYS = "up", "down", "sideways"


def detect_regime(candles: pd.DataFrame, adx_period: int = 14, adx_trend: float = 20,
                  ma_period: int = 100, slope_period: int = 10, min_slope_pct: float = 1.0,
                  vol_period: int = 14,
                  vol_lookback: int = 365, vol_high: float = 2.0, confirm: int = 3) -> pd.Series:
    """Return a Series with 'up' / 'down' / 'sideways' for every candle (no future data used)."""
    close = candles["close"]
    d = adx(candles, adx_period)
    ma = sma(close, ma_period)
    # The average must move at least min_slope_pct over slope_period candles to count as a direction
    slope = ma / ma.shift(slope_period) - 1
    ma_rising = slope > min_slope_pct / 100
    ma_falling = slope < -min_slope_pct / 100

    # Volatility = candle size in % of price, compared with its median over the last year
    vol = atr(candles, vol_period) / close
    normal_vol = vol.rolling(vol_lookback, min_periods=vol_period * 4).median()
    panic = vol > vol_high * normal_vol

    trending = d["adx"] >= adx_trend
    up = trending & (d["plus_di"] > d["minus_di"]) & (close > ma) & ma_rising
    down = ((close < ma) & ma_falling) | (trending & (d["minus_di"] > d["plus_di"]) & (close < ma)) | panic

    raw = np.where(up, UP, np.where(down, DOWN, SIDEWAYS))
    # Not enough history for the indicators yet: call it "down" (stay in cash) to be safe
    not_ready = ma.isna() | d["adx"].isna()
    raw = np.where(not_ready, DOWN, raw)
    return pd.Series(_confirm(raw, confirm), index=candles.index, name="regime")


def _confirm(raw, confirm: int) -> list[str]:
    """Only switch to a new regime after it appeared `confirm` candles in a row.
    Exception: switching TO 'down' happens at once (getting out fast is the safe side)."""
    out, current, streak, candidate = [], DOWN, 0, None
    for label in raw:
        if label == current:
            candidate, streak = None, 0
        elif label == DOWN:
            current, candidate, streak = DOWN, None, 0
        else:
            streak = streak + 1 if label == candidate else 1
            candidate = label
            if streak >= confirm:
                current, candidate, streak = label, None, 0
        out.append(current)
    return out


def regime_report(candles: pd.DataFrame, regime: pd.Series, horizon: int = 30) -> pd.DataFrame:
    """How often each regime occurred, and what the price did in the `horizon` candles AFTER it.
    (This looks into the future on purpose: it only checks the detector, it never trades.)"""
    future = candles["close"].shift(-horizon) / candles["close"] - 1
    df = pd.DataFrame({"regime": regime, "future": future}).dropna()
    rows = {}
    for name in (UP, SIDEWAYS, DOWN):
        f = df.loc[df["regime"] == name, "future"]
        rows[name] = {
            "time %": 100 * len(f) / len(df) if len(df) else float("nan"),
            f"avg next {horizon} %": 100 * f.mean() if len(f) else float("nan"),
            f"% rising after": 100 * (f > 0).mean() if len(f) else float("nan"),
        }
    return pd.DataFrame(rows).T


def main():
    from backtest.run import source_of
    from bot.config import ROOT, load_config
    from data.downloader import load_candles

    cfg = load_config()
    parser = argparse.ArgumentParser(description="Show the market regime per symbol")
    parser.add_argument("--market", default="crypto", choices=list(cfg["markets"]))
    parser.add_argument("--symbols", nargs="+")
    parser.add_argument("--timeframe", default="1d")
    args = parser.parse_args()

    market = cfg["markets"][args.market]
    params = {k: v for k, v in cfg.get("regime", {}).items() if k != "routes"}
    for symbol in args.symbols or market["symbols"]:
        try:
            candles = load_candles(ROOT / cfg["data"]["cache_dir"], source_of(market), symbol, args.timeframe)
        except FileNotFoundError as e:
            print(f"\n{symbol}: {e}")
            continue
        regime = detect_regime(candles, **params)
        since = regime[regime != regime.iloc[-1]].index
        since = since[-1].strftime("%Y-%m-%d") if len(since) else "start"
        print(f"\n=== {symbol}: now {regime.iloc[-1].upper()} (since {since}), "
              f"last close {candles['close'].iloc[-1]:.6g} ===")
        print(regime_report(candles, regime).round(1).to_string())


if __name__ == "__main__":
    main()
