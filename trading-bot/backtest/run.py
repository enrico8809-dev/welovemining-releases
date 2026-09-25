"""Run a backtest from the command line and print a report.

Examples (run from the trading-bot folder):
    python -m backtest.run                                    (crypto, sma_cross)
    python -m backtest.run --strategy all                     (compare every strategy)
    python -m backtest.run --market forex --strategy rsi_dip
    python -m backtest.run --market stocks --symbols SPY GLD --strategy all
    python -m backtest.run --symbols BTC/USDT --strategy sma_cross --params fast=20 slow=50

Reports the full history plus each bull / bear / sideways period of the market (config.yaml).
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


def market_settings(cfg: dict, market_name: str, symbol: str, candles: pd.DataFrame):
    """Costs and exchange rules for one symbol, from the market's section in config.yaml."""
    market = cfg["markets"][market_name]
    cache_dir = ROOT / cfg["data"]["cache_dir"]
    source_id = source_of(market)
    rules = load_market_rules(cache_dir, source_id, symbol, market["min_order"], market["amount_step"])

    # Money is counted in the pair's quote currency. For Forex pairs like USDZAR=X that is ZAR,
    # so scale the capital, minimum order and minimum fee (all set in USD) by the USD price.
    scale = 1.0
    if market_name == "forex" and symbol.upper().startswith("USD"):
        scale = float(candles["close"].iloc[0])
        rules.min_cost *= scale
    return BacktestSettings(
        initial_capital=cfg["backtest"]["initial_capital"] * scale,
        fee_pct=market["fee_pct"],
        min_fee=market.get("min_fee", 0) * scale,
        slippage_pct=market["slippage_pct"],
        rules=rules,
    )


def source_of(market: dict) -> str:
    """Folder name in data/cache: the crypto exchange id, or 'yahoo'."""
    if market["source"] == "ccxt":
        return (os.getenv("EXCHANGE") or "binance").lower()
    return market["source"]


def backtest_symbol(cfg: dict, market_name: str, symbol: str, timeframe: str,
                    strategy_name: str, params: dict, show: bool = True) -> dict:
    """Backtest one symbol over the full history and each of the market's periods.
    Returns {period name: summary}."""
    market = cfg["markets"][market_name]
    min_trades = cfg["backtest"]["min_trades_warning"]
    candles = load_candles(ROOT / cfg["data"]["cache_dir"], source_of(market), symbol, timeframe)
    settings = market_settings(cfg, market_name, symbol, candles)

    periods = {"full": (None, None)}
    periods.update({name: (p["start"], p["end"]) for name, p in market.get("periods", {}).items()})
    params = {**config_params(cfg, strategy_name), **params}   # command-line settings win

    columns, warnings = {}, []
    for name, (start, end) in periods.items():
        try:
            strategy = load_strategy(strategy_name, **params)
            result = run_backtest(candles, strategy, settings, start, end)
        except ValueError as e:
            warnings.append(f"[{name}] skipped: {e}")
            continue
        s = summarize(result, min_trades)
        s["from"], s["to"] = result.equity.index[0], result.equity.index[-1]
        columns[name] = s
        warnings += [f"[{name}] {w}" for w in s["warnings"]]

    if show:
        table = pd.DataFrame({col: {label: fmt(s[key], f) for key, label, f in ROWS}
                              for col, s in columns.items()})
        print(f"\n=== {symbol} {timeframe} | {load_strategy(strategy_name, **params)} | "
              f"fee {settings.fee_pct}% (min {settings.min_fee:g}) + slippage {settings.slippage_pct}% per side ===")
        print(table.to_string())
        for w in warnings:
            print(f"  WARNING {w}")
    return columns


def config_params(cfg: dict, strategy_name: str) -> dict:
    """Default settings for a strategy from config.yaml (only the regime strategy has them)."""
    if strategy_name != "regime":
        return {}
    regime = dict(cfg.get("regime", {}))
    routes = regime.pop("routes", {})
    return {**regime, **routes}


def summary_row(columns: dict) -> dict:
    """One line per backtest for the comparison table."""
    full = columns.get("full", {})
    row = {
        "Return %": fmt(full.get("total_return_pct"), "{:.0f}"),
        "B&H %": fmt(full.get("bh_total_return_pct"), "{:.0f}"),
        "Sharpe": fmt(full.get("sharpe"), "{:.2f}"),
        "B&H Sharpe": fmt(full.get("bh_sharpe"), "{:.2f}"),
        "MaxDD %": fmt(full.get("max_drawdown_pct"), "{:.0f}"),
        "Trades": fmt(full.get("trades"), "{:d}"),
    }
    for name, s in columns.items():
        if name != "full":
            row[f"{name} %"] = fmt(s["total_return_pct"], "{:.0f}")
            row[f"{name} B&H %"] = fmt(s["bh_total_return_pct"], "{:.0f}")
    return row


def main():
    cfg = load_config()
    parser = argparse.ArgumentParser(description="Backtest a strategy")
    parser.add_argument("--market", default="crypto", choices=list(cfg["markets"]))
    parser.add_argument("--symbols", nargs="+", help="default: all symbols of the market")
    parser.add_argument("--timeframe", default="1d")
    parser.add_argument("--strategy", default="sma_cross", choices=[*available_strategies(), "all"])
    parser.add_argument("--params", nargs="*", help="strategy settings, e.g. fast=10 slow=40")
    args = parser.parse_args()
    params = parse_params(args.params)
    if args.strategy == "all" and params:
        parser.error("--params only works with a single --strategy")

    symbols = args.symbols or cfg["markets"][args.market]["symbols"]
    strategies = available_strategies() if args.strategy == "all" else [args.strategy]
    show_details = len(strategies) == 1

    out_dir = ROOT / "backtest" / "results"
    out_dir.mkdir(parents=True, exist_ok=True)
    rows = {}
    for symbol in symbols:
        for name in strategies:
            try:
                columns = backtest_symbol(cfg, args.market, symbol, args.timeframe, name, params, show_details)
            except (FileNotFoundError, ValueError) as e:
                print(f"\n{symbol}: {e}")
                continue
            rows[(symbol, name)] = summary_row(columns)

    if rows:
        summary = pd.DataFrame(rows).T
        summary.index.names = ["symbol", "strategy"]
        print(f"\n=== Summary: {args.market} {args.timeframe} (full history, fees included) ===")
        print(summary.to_string())
        out = out_dir / f"{args.market}_{args.timeframe}_{args.strategy}.csv"
        summary.to_csv(out)
        print(f"\nSaved to {out.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
