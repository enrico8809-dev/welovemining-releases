"""Shared test helpers: makes the project importable and builds fake candles."""
import sys
from pathlib import Path

import numpy as np
import pandas as pd
import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))


def make_candles(closes, start="2022-01-01", freq="1D", spread=0.01) -> pd.DataFrame:
    """Candles where each open = previous close, high/low = close +/- spread."""
    closes = np.asarray(closes, dtype=float)
    opens = np.concatenate([[closes[0]], closes[:-1]])
    idx = pd.date_range(start, periods=len(closes), freq=freq, tz="UTC")
    return pd.DataFrame({
        "open": opens,
        "high": np.maximum(opens, closes) * (1 + spread),
        "low": np.minimum(opens, closes) * (1 - spread),
        "close": closes,
        "volume": 1.0,
    }, index=idx)


@pytest.fixture
def random_candles():
    """800 days of a random walk with an up, down and flat phase."""
    rng = np.random.default_rng(42)
    drift = np.concatenate([np.full(300, 0.003), np.full(250, -0.003), np.zeros(250)])
    closes = 100 * np.exp(np.cumsum(drift + rng.normal(0, 0.02, 800)))
    return make_candles(closes)
