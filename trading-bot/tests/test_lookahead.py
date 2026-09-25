"""Every strategy must only use closed candles: adding future candles must never
change a past decision. Runs automatically for every file in strategies/."""
import pandas as pd
import pytest

from strategies import available_strategies, load_strategy


@pytest.mark.parametrize("name", available_strategies())
def test_no_lookahead(name, random_candles):
    strategy = load_strategy(name)
    full = strategy.target_exposure(random_candles)
    for cut in (60, 200, 450, 700):
        partial = load_strategy(name).target_exposure(random_candles.iloc[:cut])
        pd.testing.assert_series_equal(partial, full.iloc[:cut], check_names=False)


@pytest.mark.parametrize("name", available_strategies())
def test_exposure_between_0_and_1(name, random_candles):
    values = load_strategy(name).target_exposure(random_candles).dropna()
    assert values.between(0, 1).all()
