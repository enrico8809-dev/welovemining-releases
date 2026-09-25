"""Tests for the Market Regime Detector and the regime-switching strategy."""
import numpy as np
import pandas as pd

from bot.regime import DOWN, SIDEWAYS, UP, _confirm, detect_regime
from strategies.regime import Regime
from tests.conftest import make_candles

rng = np.random.default_rng(1)


def trend(start, daily_pct, n=300, noise=0.01):
    steps = daily_pct / 100 + rng.normal(0, noise, n)
    return list(start * np.exp(np.cumsum(steps)))


def test_steady_rise_is_up():
    c = make_candles(trend(100, +0.5))
    assert (detect_regime(c).iloc[-50:] == UP).mean() > 0.8


def test_steady_fall_is_down():
    c = make_candles(trend(100, -0.5))
    assert (detect_regime(c).iloc[-50:] == DOWN).all()


def test_flat_range_is_sideways():
    # Random moves that keep getting pulled back to 100, like a real sideways market
    prices = [100.0]
    for _ in range(399):
        prices.append(prices[-1] + 0.1 * (100 - prices[-1]) + rng.normal(0, 1.5))
    c = make_candles(prices)
    assert (detect_regime(c).iloc[-150:] == SIDEWAYS).mean() > 0.75


def test_panic_volatility_means_cash():
    calm = [100 * (1 + 0.03 * np.sin(i / 5)) for i in range(250)]
    wild = [100 * (1 + 0.25 * (-1) ** i) for i in range(10)]         # huge swings
    c = make_candles(calm + wild, spread=0.002)
    assert detect_regime(c).iloc[-1] == DOWN


def test_not_enough_history_is_cash():
    c = make_candles(trend(100, +1, n=50))
    assert (detect_regime(c) == DOWN).all()


def test_confirm_waits_before_switching_but_exits_to_down_at_once():
    raw = [UP, UP, UP, SIDEWAYS, UP, SIDEWAYS, SIDEWAYS, SIDEWAYS, DOWN, UP]
    out = _confirm(raw, confirm=3)
    assert out[:3] == [DOWN, DOWN, UP]          # starts in cash; UP accepted on its 3rd day
    assert out[3:7] == [UP] * 4                  # single SIDEWAYS blips are ignored
    assert out[7] == SIDEWAYS                    # 3 in a row -> switch
    assert out[8] == DOWN                        # DOWN is immediate
    assert out[9] == DOWN                        # one UP day is not enough


def test_regime_strategy_holds_nothing_in_a_downtrend():
    c = make_candles(trend(100, +0.5) + trend(400, -0.8))
    exposure = Regime().target_exposure(c)
    regime = detect_regime(c)
    assert (exposure[regime == DOWN] == 0).all()
    assert exposure.iloc[-50:].max() == 0
