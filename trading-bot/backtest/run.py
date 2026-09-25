"""Run a backtest from the command line and print a report.

Examples (run from the trading-bot folder):
    python -m backtest.run
    python -m backtest.run --symbols BTC/USDT ETH/USDT --strategy sma_cross --params fast=10 slow=40
    python -m backtest.run --timeframe 1h --params fast=240 slow=960

Reports the full history plus each bull / bear / sideways period from config.yaml.
"""
import argparse
import math
import os

import pandas as pd

from backtest.engine import BacktestSettings, load_market_rules, run_backtest
from backtest.metrics import summarize
from bot.config import ROOT, load_config
from data.downloader import load_candles
from strategies import available_strategies, load_strategy

# (key, label, number format) for the report table
ROWS = [
    ("from", "From", "{:%Y-%m-%d}"),
    ("to", "To", "{:%Y-%m-%d}"),
    ("total_return_pct", "Total return %", "{:.1f}"),
    ("bh_total_return_pct", "Buy & hold return %", "{:.1f}"),
    ("vs_bh_pct", "Strategy - B&H %", "{:+.1f}"),
    ("cagr_pct", "CAGR %", "{:.1f}"),
    ("max_drawdown_pct", "Max drawdown %", "{:.1f}"),
    ("bh_max_drawdown_pct", "B&H max drawdown %", "{:.1f}"),
    ("sharpe", "Sharpe", "{:.2f}"),
    ("bh_sharpe", "B&H Sharpe", "{:.2f}"),
    ("sortino", "Sortino", "{:.2f}"),
    ("calmar", "Calmar", "{:.2f}"),
    ("trades", "Trades", "{:d}"),
    ("win_rate_pct", "Win rate %", "{:.1f}"),
    ("profit_factor", "Profit factor", "{:.2f}"),
    ("avg_trade_pct", "Avg trade %", "{:.2f}"),
    ("skipped_orders", "Skipped (below min)", "{:d}"),
]


def parse_params(pairs: list[str]) -> dict:
    """['fast=10', 'slow=40'] -> {'fast': 10, 'slow': 40}"""
    params = {}
    for pair in pairs or []:
        key, value = pair.split("=", 1)
        try:
            params[key] = int(value)
        except ValueError:
            params[key] = float(value) if value.replace(".", "", 1).isdigit() else value
    return params


def fmt(value, pattern: str) -> str:
    if value is None or (isinstance(value, float) and math.isnan(value)):
        return "n/a"
    return pattern.format(value)


def backtest_symbol(cfg: dict, exchange_id: str, symbol: str, timeframe: str,
                    strategy_name: str, params: dict) -> pd.DataFrame:
    """Backtest one symbol over the full history and each configured period."""
    bt = cfg["backtest"]
    cache_dir = ROOT / cfg["data"]["cache_dir"]
    candles = load_candles(cache_dir, exchange_id, symbol, timeframe)
    rules = load_market_rules(cache_dir, exchange_id, symbol,
                              bt["default_min_order_usdt"], bt["default_amount_step"])
    settings = BacktestSettings(initial_capital=bt["initial_capital"], fee_pct=bt["fee_pct"],
                                slippage_pct=bt["slippage_pct"], rules=rules)

    periods = {"full": (None, None)}
    periods.update({name: (p["start"], p["end"]) for name, p in bt.get("periods", {}).items()})

    columns, warnings = {}, []
    for name, (start, end) in periods.items():
        try:
            strategy = load_strategy(strategy_name, **params)
            result = run_backtest(candles, strategy, settings, start, end)
        except ValueError as e:
            warnings.append(f"[{name}] skipped: {e}")
            continue
        s = summarize(result, bt["min_trades_warning"])
        s["from"], s["to"] = result.equity.index[0], result.equity.index[-1]
        columns[name] = s
        warnings += [f"[{name}] {w}" for w in s["warnings"]]

    table = pd.DataFrame({col: {label: fmt(s[key], f) for key, label, f in ROWS}
                          for col, s in columns.items()})
    print(f"\n=== {symbol} {timeframe} | {load_strategy(strategy_name, **params)} | "
          f"fee {bt['fee_pct']}% + slippage {bt['slippage_pct']}% per side ===")
    print(table.to_string())
    for w in warnings:
        print(f"  WARNING {w}")
    return table


def main():
    cfg = load_config()
    parser = argparse.ArgumentParser(description="Backtest a strategy")
    parser.add_argument("--exchange", default=os.getenv("EXCHANGE") or "binance")
    parser.add_argument("--symbols", nargs="+", default=["BTC/USDT"])
    parser.add_argument("--timeframe", default="1d")
    parser.add_argument("--strategy", default="sma_cross", choices=available_strategies())
    parser.add_argument("--params", nargs="*", help="strategy settings, e.g. fast=10 slow=40")
    args = parser.parse_args()
    params = parse_params(args.params)

    out_dir = ROOT / "backtest" / "results"
    out_dir.mkdir(parents=True, exist_ok=True)
    for symbol in args.symbols:
        try:
            table = backtest_symbol(cfg, args.exchange.lower(), symbol, args.timeframe, args.strategy, params)
        except FileNotFoundError as e:
            print(f"\n{symbol}: {e}")
            continue
        out = out_dir / f"{args.strategy}_{symbol.replace('/', '-')}_{args.timeframe}.csv"
        table.to_csv(out)
        print(f"  Saved report to {out.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
