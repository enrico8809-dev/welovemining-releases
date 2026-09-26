"""Tests for the walk-forward optimizer: windows, grids and the ACCEPT/REJECT rules."""
import pandas as pd
import pytest

from backtest.optimize import BAD, grid_combinations, optimize, walk_forward_windows


def test_windows_never_overlap_train_and_test():
    index = pd.date_range("2021-01-01", "2026-01-01", freq="1D", tz="UTC")
    windows = walk_forward_windows(index, train_days=730, test_days=180)
    assert len(windows) == 6
    for train_start, train_end, test_start, test_end in windows:
        assert train_end < test_start                       # test data is never seen in training
        assert (train_end - train_start).days + 1 == 730
        assert (test_end - test_start).days + 1 == 180
        assert test_end <= index[-1]
    # Each test window starts right after the previous one: continuous out-of-sample history
    assert all(windows[i + 1][2] == windows[i][3] + pd.Timedelta(days=1) for i in range(len(windows) - 1))


def test_grid_combinations():
    combos = grid_combinations({"fast": [5, 10], "slow": [40, 60]})
    assert combos == [{"fast": 5, "slow": 40}, {"fast": 5, "slow": 60},
                      {"fast": 10, "slow": 40}, {"fast": 10, "slow": 60}]


class FakeEvaluator:
    """Returns pre-set scores: (params, 'train'|'test') -> score. No real backtests."""
    data = {}

    def __init__(self, scores):
        self.scores = scores
        self.test_starts = set()

    def score(self, params, start, end):
        phase = "test" if start in self.test_starts else "train"
        key = (params.get("x"), phase)
        return self.scores.get(key, BAD), 10


def windows_and_evaluator(scores):
    index = pd.date_range("2021-01-01", "2024-12-31", freq="1D", tz="UTC")
    windows = walk_forward_windows(index, 365, 180)
    ev = FakeEvaluator(scores)
    ev.test_starts = {w[2] for w in windows}
    return windows, ev


def test_accepts_settings_that_hold_up_on_unseen_data():
    windows, ev = windows_and_evaluator({
        (1, "train"): 1.0, (1, "test"): 0.8,       # the best setting: still good on unseen data
        (2, "train"): 0.5, (2, "test"): 0.4,
        (None, "test"): 0.3,                         # defaults
    })
    report = optimize(ev, {"x": [1, 2]}, windows, min_efficiency=0.5)
    assert report["verdict"] == "ACCEPT"
    assert report["recommended"] == {"x": 1}
    assert report["efficiency"] == pytest.approx(0.8)


def test_rejects_settings_that_only_work_on_training_data():
    windows, ev = windows_and_evaluator({
        (1, "train"): 2.0, (1, "test"): -0.5,      # great in training, loses on unseen data
        (2, "train"): 0.5, (2, "test"): 0.4,
        (None, "test"): 0.3,
    })
    report = optimize(ev, {"x": [1, 2]}, windows, min_efficiency=0.5)
    assert report["verdict"] == "REJECT"
    assert report["overfit_folds"] == len(report["folds"])
    assert any("not positive" in r for r in report["reasons"])
    assert any("unseen data" in r for r in report["reasons"])


def test_rejects_when_not_better_than_defaults():
    windows, ev = windows_and_evaluator({
        (1, "train"): 1.0, (1, "test"): 0.6,
        (None, "test"): 0.9,                         # defaults did better
    })
    report = optimize(ev, {"x": [1]}, windows, min_efficiency=0.5)
    assert report["verdict"] == "REJECT"
    assert any("default" in r for r in report["reasons"])
