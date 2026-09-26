"""Optimizer: tune strategy settings with WALK-FORWARD testing, so we don't fool ourselves.

How it works
  1. Cut history into windows: TRAIN on 2 years, then TEST on the next 6 months.
     Slide forward 6 months and repeat until today.
  2. In each train window, try every combination in the grid (config.yaml -> optimizer.grids)
     and pick the one with the best risk-adjusted score (Sharpe or Calmar, averaged over all
     symbols, so a setting can't win by fitting one lucky coin).
  3. Run that pick on the TEST window it has never seen. Only these out-of-sample results count.
  4. Verdict. The tuned settings are REJECTED (keep the defaults) when:
       - the out-of-sample score is not positive, or
       - walk-forward efficiency (test score / train score) is below min_efficiency
         -> the settings mostly worked on the training data (overfitting), or
       - the pick was good in training but lost on the test window in more than half the windows, or
       - they do no better out-of-sample than the default settings.

    python -m backtest.optimize --strategy sma_cross
    python -m backtest.optimize --strategy regime --symbols BTC/USDT ETH/USDT SOL/USDT --risk
    python -m backtest.optimize --market stocks --strategy sma_cross --objective calmar
"""
import argparse
import itertools
import json
import math
from collections import Counter

import numpy as np
import pandas as pd

from backtest.engine import run_backtest
from backtest.metrics import equity_stats
from backtest.risk_engine import run_backtest_with_risk
from backtest.run import config_params, market_settings, source_of
from bot.config import ROOT, load_config
from bot.risk import RiskConfig
from data.downloader import load_candles
from strategies import available_strategies, load_strategy

BAD = -math.inf     # score for combinations that can't be judged (too few trades, no data)


def walk_forward_windows(index: pd.DatetimeIndex, train_days: int, test_days: int) -> list[tuple]:
    """[(train_start, train_end, test_start, test_end), ...] as Timestamps, sliding by test_days."""
    windows = []
    start = index[0]
    while True:
        train_end = start + pd.Timedelta(days=train_days) - pd.Timedelta(days=1)
        test_start = train_end + pd.Timedelta(days=1)
        test_end = test_start + pd.Timedelta(days=test_days) - pd.Timedelta(days=1)
        if test_end > index[-1]:
            break
        windows.append((start, train_end, test_start, test_end))
        start += pd.Timedelta(days=test_days)
    return windows


def grid_combinations(grid: dict) -> list[dict]:
    """{'fast': [5, 10], 'slow': [40]} -> [{'fast': 5, 'slow': 40}, {'fast': 10, 'slow': 40}]"""
    keys = list(grid)
    return [dict(zip(keys, values)) for values in itertools.product(*grid.values())]


class Evaluator:
    """Runs backtests for many settings/windows, caching each strategy's signals per symbol."""

    def __init__(self, data: dict, settings: dict, strategy_name: str, base_params: dict,
                 objective: str, min_trades: int, risk_config: RiskConfig | None = None):
        self.data, self.settings = data, settings
        self.strategy_name, self.base_params = strategy_name, base_params
        self.objective, self.min_trades = objective, min_trades
        self.risk_config = risk_config
        self._signals = {}

    def signals(self, symbol: str, params: dict):
        key = (symbol, tuple(sorted(params.items())))
        if key not in self._signals:
            strategy = load_strategy(self.strategy_name, **{**self.base_params, **params})
            self._signals[key] = (strategy, strategy.target_exposure(self.data[symbol]))
        return self._signals[key]

    def run(self, symbol: str, params: dict, start, end):
        candles = self.data[symbol]
        if candles.index[0] > start:          # coin did not exist yet at the start of this window
            return None
        strategy, target = self.signals(symbol, params)
        s, e = start.strftime("%Y-%m-%d"), end.strftime("%Y-%m-%d")
        if self.risk_config:
            return run_backtest_with_risk(candles, strategy, self.settings[symbol], self.risk_config, s, e, target)
        return run_backtest(candles, strategy, self.settings[symbol], s, e, target)

    def score(self, params: dict, start, end) -> tuple[float, int]:
        """Average objective over all symbols in [start, end], and the total number of trades."""
        scores, trades = [], 0
        for symbol in self.data:
            try:
                result = self.run(symbol, params, start, end)
            except ValueError:            # invalid combination (e.g. fast >= slow) or no candles
                return BAD, 0
            if result is None:
                continue
            stats = equity_stats(result.equity, result.initial_capital)
            value = stats[self.objective]
            scores.append(0.0 if math.isnan(value) else value)     # never traded = score 0
            trades += len(result.trades)
        if not scores or trades < self.min_trades:
            return BAD, trades
        return float(np.mean(scores)), trades


def stitched_stats(results: list) -> dict:
    """Glue the test windows together into one out-of-sample equity curve and measure it."""
    returns = pd.concat([r.equity.pct_change().fillna(r.equity.iloc[0] / r.initial_capital - 1)
                         for r in results])
    equity = 1000 * (1 + returns).cumprod()
    stats = equity_stats(equity, 1000)
    stats["trades"] = sum(len(r.trades) for r in results)
    bh = pd.concat([r.buy_hold_equity.pct_change().fillna(r.buy_hold_equity.iloc[0] / r.initial_capital - 1)
                    for r in results])
    stats["bh_return_pct"] = 100 * ((1 + bh).prod() - 1)
    return stats


def optimize(ev: Evaluator, grid: dict, windows: list, min_efficiency: float) -> dict:
    combos = grid_combinations(grid)
    folds = []
    for train_start, train_end, test_start, test_end in windows:
        scored = [(ev.score(c, train_start, train_end)[0], c) for c in combos]
        best_score, best = max(scored, key=lambda x: x[0])
        if best_score == BAD:
            continue
        test_score, test_trades = ev.score(best, test_start, test_end)
        default_score, _ = ev.score({}, test_start, test_end)
        folds.append(dict(
            train=f"{train_start:%Y-%m-%d}..{train_end:%Y-%m-%d}",
            test=f"{test_start:%Y-%m-%d}..{test_end:%Y-%m-%d}",
            params=best, train_score=best_score,
            test_score=test_score if test_score != BAD else 0.0, test_trades=test_trades,
            default_test_score=default_score if default_score != BAD else 0.0,
            overfit=best_score > 0 and test_score <= 0,
            _window=(test_start, test_end),
        ))
    if not folds:
        return {"folds": [], "verdict": "REJECT", "reasons": ["not enough data or trades"]}

    # Out-of-sample curves per symbol: tuned (each window uses its own pick) vs. defaults
    per_symbol = {}
    for symbol in ev.data:
        tuned, default = [], []
        for f in folds:
            s, e = f["_window"]
            t = ev.run(symbol, f["params"], s, e)
            d = ev.run(symbol, {}, s, e)
            if t is not None and d is not None:
                tuned.append(t)
                default.append(d)
        if tuned:
            per_symbol[symbol] = {"tuned": stitched_stats(tuned), "default": stitched_stats(default)}

    mean_train = float(np.mean([f["train_score"] for f in folds]))
    mean_test = float(np.mean([f["test_score"] for f in folds]))
    mean_default = float(np.mean([f["default_test_score"] for f in folds]))
    efficiency = mean_test / mean_train if mean_train > 0 else float("nan")

    reasons = []
    if mean_test <= 0:
        reasons.append(f"out-of-sample score {mean_test:.2f} is not positive")
    if not efficiency >= min_efficiency:
        reasons.append(f"walk-forward efficiency {efficiency:.3f} < {min_efficiency} (works mainly on training data)")
    overfit = sum(f["overfit"] for f in folds)
    if overfit > len(folds) / 2:
        reasons.append(f"failed on unseen data in {overfit} of {len(folds)} windows")
    if mean_test <= mean_default:
        reasons.append(f"not better than the default settings out-of-sample ({mean_test:.2f} vs {mean_default:.2f})")

    picks = Counter(json.dumps(f["params"], sort_keys=True) for f in folds)
    most_common, times = picks.most_common(1)[0]
    for f in folds:
        f.pop("_window")
    return {
        "folds": folds, "per_symbol": per_symbol,
        "mean_train_score": mean_train, "mean_test_score": mean_test,
        "mean_default_test_score": mean_default, "efficiency": efficiency,
        "overfit_folds": sum(f["overfit"] for f in folds),
        "recommended": json.loads(most_common), "recommended_count": times,
        "verdict": "REJECT" if reasons else "ACCEPT", "reasons": reasons,
    }


def print_report(report: dict, strategy: str, objective: str, symbols: list[str]):
    print(f"\n=== Walk-forward optimization: {strategy} | objective: {objective} | {', '.join(symbols)} ===")
    if not report["folds"]:
        print("No usable windows:", "; ".join(report["reasons"]))
        return
    table = pd.DataFrame([{
        "test window": f["test"],
        "chosen on the 2 years before": " ".join(f"{k}={v}" for k, v in f["params"].items()),
        "train": f"{f['train_score']:.2f}",
        "TEST": f"{f['test_score']:.2f}",
        "defaults TEST": f"{f['default_test_score']:.2f}",
        "trades": f["test_trades"],
        "": "OVERFIT" if f["overfit"] else "",
    } for f in report["folds"]])
    print(table.to_string(index=False))

    print(f"\nAverage {objective}: train {report['mean_train_score']:.2f} | "
          f"TEST {report['mean_test_score']:.2f} | defaults TEST {report['mean_default_test_score']:.2f} | "
          f"efficiency {report['efficiency']:.3f} | overfit windows {report['overfit_folds']}/{len(report['folds'])}")

    print("\nOut-of-sample result per symbol (all test windows glued together):")
    per = {s: {"tuned return %": f"{v['tuned']['total_return_pct']:.1f}",
               "tuned Sharpe": f"{v['tuned']['sharpe']:.2f}",
               "tuned maxDD %": f"{v['tuned']['max_drawdown_pct']:.1f}",
               "default return %": f"{v['default']['total_return_pct']:.1f}",
               "default Sharpe": f"{v['default']['sharpe']:.2f}",
               "B&H return %": f"{v['tuned']['bh_return_pct']:.1f}"}
           for s, v in report["per_symbol"].items()}
    print(pd.DataFrame(per).T.to_string())

    rec = " ".join(f"{k}={v}" for k, v in report["recommended"].items())
    print(f"\nMost often chosen: {rec} ({report['recommended_count']} of {len(report['folds'])} windows)")
    if report["verdict"] == "ACCEPT":
        print(f"VERDICT: ACCEPT. Settings that held up on unseen data: {rec}")
    else:
        print("VERDICT: REJECT, keep the default settings. Reasons:")
        for r in report["reasons"]:
            print(f"  - {r}")


def main():
    cfg = load_config()
    oc = cfg.get("optimizer", {})
    parser = argparse.ArgumentParser(description="Walk-forward optimization")
    parser.add_argument("--market", default="crypto", choices=list(cfg["markets"]))
    parser.add_argument("--strategy", default="sma_cross", choices=available_strategies())
    parser.add_argument("--symbols", nargs="+", help="default: all symbols of the market")
    parser.add_argument("--timeframe", default="1d")
    parser.add_argument("--objective", default=oc.get("objective", "sharpe"), choices=["sharpe", "calmar"])
    parser.add_argument("--train-days", type=int, default=oc.get("train_days", 730))
    parser.add_argument("--test-days", type=int, default=oc.get("test_days", 180))
    parser.add_argument("--risk", action="store_true", help="backtest with the Risk Manager")
    args = parser.parse_args()

    grid = (oc.get("grids") or {}).get(args.strategy)
    if not grid:
        parser.error(f"no grid for '{args.strategy}' in config.yaml -> optimizer.grids")
    market = cfg["markets"][args.market]
    symbols = args.symbols or market["symbols"]

    data, settings = {}, {}
    for symbol in symbols:
        try:
            data[symbol] = load_candles(ROOT / cfg["data"]["cache_dir"], source_of(market), symbol, args.timeframe)
        except FileNotFoundError as e:
            print(f"{symbol}: {e}")
            continue
        settings[symbol] = market_settings(cfg, args.market, symbol, data[symbol])
    if not data:
        return

    risk = RiskConfig.from_config(cfg, fee_pct=market["fee_pct"]) if args.risk else None
    ev = Evaluator(data, settings, args.strategy, config_params(cfg, args.strategy),
                   args.objective, oc.get("min_trades", 3), risk)
    longest = max(data.values(), key=len).index
    windows = walk_forward_windows(longest, args.train_days, args.test_days)
    n_combos = len(grid_combinations(grid))
    print(f"{len(windows)} walk-forward windows x {n_combos} settings x {len(data)} symbols ...")

    report = optimize(ev, grid, windows, oc.get("min_efficiency", 0.5))
    print_report(report, args.strategy, args.objective, list(data))

    out = ROOT / "backtest" / "results" / f"optimize_{args.market}_{args.strategy}{'_risk' if args.risk else ''}.json"
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(report, indent=2, default=str))
    print(f"Saved to {out.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
