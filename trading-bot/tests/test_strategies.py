"""Behaviour tests for each strategy, on small hand-made price series."""
import numpy as np

from strategies.dca import Dca
from strategies.grid import Grid
from strategies.rsi_dip import RsiDip
from tests.conftest import make_candles


# ---------- RSI dip-buy ----------

def test_rsi_dip_buys_a_dip_in_an_uptrend():
    up = list(np.linspace(100, 130, 60))
    dip = [126, 122, 119]                        # sharp drop, still above the 50-SMA (~118)
    c = make_candles(up + dip)
    exposure = RsiDip(rsi_period=5, trend_period=50).target_exposure(c)
    assert exposure.iloc[:60].max() == 0          # no dip -> no buy
    assert exposure.iloc[-1] == 1                  # dip in an uptrend -> buy


def test_rsi_dip_ignores_dips_in_a_downtrend():
    down = list(np.linspace(200, 100, 60))
    dip = [95, 90, 85, 80, 75]
    c = make_candles(down + dip)
    assert RsiDip(rsi_period=5, trend_period=50).target_exposure(c).max() == 0


# ---------- Grid ----------

def sideways(n=60, low=100, high=110):
    """Price bouncing between low and high."""
    return [low + (high - low) * (0.5 + 0.5 * np.sin(i / 3)) for i in range(n)]


def test_grid_holds_more_near_the_bottom_than_the_top():
    c = make_candles(sideways(), spread=0)
    exposure = Grid(lookback=20, levels=5, min_width_pct=5).target_exposure(c)
    closes = c["close"]
    later = closes.index[25:]
    near_bottom = exposure[later][closes[later] < 102]
    near_top = exposure[later][closes[later] > 108]
    assert near_bottom.min() >= 0.6
    assert near_top.max() <= 0.2


def test_grid_stops_out_when_price_breaks_below_and_waits():
    prices = sideways(40) + [90, 85, 80, 80, 80, 80]   # breakdown far below the 100 floor
    c = make_candles(prices, spread=0)
    g = Grid(lookback=20, levels=5, stop_pct=5, min_width_pct=5)
    exposure = g.target_exposure(c)
    assert exposure.iloc[40:].max() == 0             # out after the break, no new grid for 20 candles


def test_grid_does_not_start_in_a_too_narrow_range():
    c = make_candles([100 + 0.1 * (i % 2) for i in range(40)], spread=0)
    assert Grid(lookback=20, min_width_pct=8).target_exposure(c).max() == 0


# ---------- DCA ----------

def dca_prices():
    up = list(np.linspace(80, 100, 30))              # above the trend SMA -> base order at the end
    return up + [94, 89, 84, 79, 74, 70, 66]         # keeps falling


def test_dca_safety_orders_are_capped():
    c = make_candles(dca_prices(), spread=0)
    exposure = Dca(step_pct=5, max_safety=2, stop_loss_pct=90, trend_period=10).target_exposure(c)
    assert exposure.max() == 1.0                       # base + 2 safety = everything
    levels = sorted(set(exposure.round(4)))
    assert levels == [0.0, 0.3333, 0.6667, 1.0]        # never more than 3 parts


def test_dca_hard_stop_sells_everything():
    c = make_candles(dca_prices(), spread=0)
    exposure = Dca(step_pct=5, max_safety=3, stop_loss_pct=15, trend_period=10, cooldown=50).target_exposure(c)
    assert exposure.iloc[30:].max() > 0                # it was in
    assert exposure.iloc[-1] == 0                       # stopped out and waiting


def test_dca_takes_profit():
    prices = list(np.linspace(80, 100, 30)) + [101, 104, 107, 108]
    c = make_candles(prices, spread=0)
    exposure = Dca(take_profit_pct=6, trend_period=10, cooldown=0).target_exposure(c)
    # Bought at 100 (start of the dip-free uptrend), 107 is +7% -> sold
    i107 = prices.index(107)
    assert exposure.iloc[i107] == 0 or exposure.iloc[i107 - 1] > exposure.iloc[i107]
