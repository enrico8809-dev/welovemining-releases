"""Run a backtest from the command line and print a report.

Examples (run from the trading-bot folder):
    python -m backtest.run                                    (crypto, sma_cross)
    python -m backtest.run --strategy all                     (compare every strategy)
    python -m backtest.run --market forex --strategy regime   (Forex: long + short, lots, spread, swap)
    python -m backtest.run --market stocks --symbols SPY GLD --strategy all
    python -m backtest.run --symbols BTC/USDT --strategy sma_cross --params fast=20 slow=50

Reports the full history plus each bull / bear / sideways period of the market (config.yaml).
Forex always runs with the Risk Manager (it sizes the lots) and is reported separately.
"""
import argparse
import math
import os

import pandas as pd

from backtest.engine import BacktestSettings, load_market_rules, run_backtest
from backtest.forex_engine import ForexSettings, run_forex_backtest
from backtest.metrics import summarize
from backtest.risk_engine import run_backtest_with_risk
from bot.risk import RiskConfig
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
        if value.lower() in ("true", "false"):
            params[key] = value.lower() == "true"
            continue
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
    return BacktestSettings(
        initial_capital=cfg["backtest"]["initial_capital"],
        fee_pct=market["fee_pct"],
        min_fee=market.get("min_fee", 0),
        slippage_pct=market["slippage_pct"],
        rules=rules,
    )


def load_market_candles(cfg: dict, market_name: str, symbol: str, timeframe: str) -> pd.DataFrame:
    """Cached candles for any market (Forex: MT5 history, else the Yahoo fallback)."""
    cache_dir = ROOT / cfg["data"]["cache_dir"]
    market = cfg["markets"][market_name]
    if market["source"] == "mt5":
        from data.forex_data import load_forex_candles
        return load_forex_candles(cache_dir, symbol, timeframe, market)[0]
    return load_candles(cache_dir, source_of(market), symbol, timeframe)


def source_of(market: dict) -> str:
    """Folder name in data/cache: the crypto exchange id, or 'yahoo'."""
    if market["source"] == "ccxt":
        return (os.getenv("EXCHANGE") or "binance").lower()
    return market["source"]


def backtest_symbol(cfg: dict, market_name: str, symbol: str, timeframe: str,
                    strategy_name: str, params: dict, show: bool = True, use_risk: bool = False) -> dict:
    """Backtest one symbol over the full history and each of the market's periods.
    Returns {period name: summary}."""
    market = cfg["markets"][market_name]
    min_trades = cfg["backtest"]["min_trades_warning"]
    if market["source"] == "mt5":
        return backtest_forex_symbol(cfg, symbol, timeframe, strategy_name, params, show)
    candles = load_candles(ROOT / cfg["data"]["cache_dir"], source_of(market), symbol, timeframe)
    settings = market_settings(cfg, market_name, symbol, candles)

    periods = {"full": (None, None)}
    periods.update({name: (p["start"], p["end"]) for name, p in market.get("periods", {}).items()})
    params = {**config_params(cfg, strategy_name), **params}   # command-line settings win

    columns, warnings = {}, []
    for name, (start, end) in periods.items():
        try:
            strategy = load_strategy(strategy_name, **params)
            if use_risk:
                risk_config = RiskConfig.from_config(cfg, fee_pct=settings.fee_pct)
                result = run_backtest_with_risk(candles, strategy, settings, risk_config, start, end)
            else:
                result = run_backtest(candles, strategy, settings, start, end)
        except ValueError as e:
            warnings.append(f"[{name}] skipped: {e}")
            continue
        s = summarize(result, min_trades)
        s["from"], s["to"] = result.equity.index[0], result.equity.index[-1]
        columns[name] = s
        warnings += [f"[{name}] {w}" for w in s["warnings"]]
        if name == "full":
            warnings += [f"[risk] {n}" for n in result.notes]

    if show:
        table = pd.DataFrame({col: {label: fmt(s[key], f) for key, label, f in ROWS}
                              for col, s in columns.items()})
        print(f"\n=== {symbol} {timeframe} | {load_strategy(strategy_name, **params)}"
              f"{' + RISK MANAGER' if use_risk else ''} | "
              f"fee {settings.fee_pct}% (min {settings.min_fee:g}) + slippage {settings.slippage_pct}% per side ===")
        print(table.to_string())
        for w in warnings:
            print(f"  WARNING {w}")
    return columns


def backtest_forex_symbol(cfg: dict, symbol: str, timeframe: str, strategy_name: str, params: dict,
                          show: bool = True) -> dict:
    """Forex: long + short, lots sized by the Risk Manager, spread/commission/swap included."""
    from data.forex_data import load_forex_candles, load_lot_rules
    from strategies import supports_short
    market = cfg["markets"]["forex"]
    cache_dir = ROOT / cfg["data"]["cache_dir"]
    candles, data_source = load_forex_candles(cache_dir, symbol, timeframe, market)
    lot_rules, spec_source = load_lot_rules(cache_dir, symbol, market)
    settings = ForexSettings(initial_capital=cfg["backtest"].get("forex_capital", 10_000),
                             account_currency=market.get("account_currency", "USD"),
                             commission_per_lot=market.get("commission_per_lot", 0))
    risk_config = RiskConfig.from_config(cfg, market="forex")
    params = {**config_params(cfg, strategy_name), **params}
    if supports_short(strategy_name):
        params.setdefault("allow_short", True)

    periods = {"full": (None, None)}
    periods.update({name: (p["start"], p["end"]) for name, p in market.get("periods", {}).items()})
    columns, warnings = {}, []
    for name, (start, end) in periods.items():
        try:
            result = run_forex_backtest(candles, load_strategy(strategy_name, **params), lot_rules,
                                        settings, risk_config, start, end)
        except ValueError as e:
            warnings.append(f"[{name}] skipped: {e}")
            continue
        s = summarize(result, cfg["backtest"]["min_trades_warning"])
        s["from"], s["to"] = result.equity.index[0], result.equity.index[-1]
        s["shorts"] = sum(1 for o in result.orders if o["reason"] == "signal" and o["side"] == "sell")
        columns[name] = s
        warnings += [f"[{name}] {w}" for w in s["warnings"]]
        if name == "full":
            warnings += [f"[risk] {n}" for n in result.notes]
    if show:
        rows = ROWS[:-1] + [("shorts", "Short entries", "{:d}"), ("skipped_orders", "Skipped (too small)", "{:d}")]
        table = pd.DataFrame({col: {label: fmt(s.get(key), f) for key, label, f in rows}
                              for col, s in columns.items()})
        print(f"\n=== FOREX {symbol} {timeframe} | {load_strategy(strategy_name, **params)} + RISK MANAGER | "
              f"data: {data_source}, specs: {spec_source} | max {risk_config.max_leverage:g}:1, "
              f"commission {settings.commission_per_lot:g}/lot, swap {lot_rules.swap_long:g}/{lot_rules.swap_short:g} pts ===")
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
    parser.add_argument("--scanned", action="store_true",
                        help="crypto: use the coins from the last Coin Scanner run (python -m bot.scanner)")
    parser.add_argument("--timeframe", default="1d")
    parser.add_argument("--strategy", default="sma_cross", choices=[*available_strategies(), "all"])
    parser.add_argument("--params", nargs="*", help="strategy settings, e.g. fast=10 slow=40")
    parser.add_argument("--risk", action="store_true",
                        help="size trades and add stops with the Risk Manager (config.yaml 'risk:')")
    args = parser.parse_args()
    params = parse_params(args.params)
    if args.strategy == "all" and params:
        parser.error("--params only works with a single --strategy")

    symbols = args.symbols or cfg["markets"][args.market]["symbols"]
    if args.scanned:
        from bot.scanner import load_saved
        symbols = load_saved()
        if not symbols:
            parser.error("no scan found: run  python -m bot.scanner --download  first")
    strategies = available_strategies() if args.strategy == "all" else [args.strategy]
    show_details = len(strategies) == 1

    out_dir = ROOT / "backtest" / "results"
    out_dir.mkdir(parents=True, exist_ok=True)
    rows = {}
    for symbol in symbols:
        for name in strategies:
            try:
                columns = backtest_symbol(cfg, args.market, symbol, args.timeframe, name, params,
                                          show_details, use_risk=args.risk)
            except (FileNotFoundError, ValueError) as e:
                print(f"\n{symbol}: {e}")
                continue
            rows[(symbol, name)] = summary_row(columns)

    if rows:
        summary = pd.DataFrame(rows).T.fillna("n/a")   # n/a = coin did not exist in that period
        summary.index.names = ["symbol", "strategy"]
        risk_text = " with Risk Manager" if args.risk else ""
        print(f"\n=== Summary: {args.market} {args.timeframe}{risk_text} (full history, fees included) ===")
        print(summary.to_string())
        out = out_dir / f"{args.market}_{args.timeframe}_{args.strategy}{'_risk' if args.risk else ''}.csv"
        summary.to_csv(out)
        print(f"\nSaved to {out.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
