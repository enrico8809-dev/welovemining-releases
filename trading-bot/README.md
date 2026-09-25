# WeLoveMining Trading Bot

Personal crypto **spot** trading bot (CCXT: Binance first, works with any CCXT exchange such as Luno).

**Safety first:** PAPER mode by default, spot only (no futures/margin/leverage), never withdraws funds.
Give your API key **Read + Spot trading** permission only. Never enable withdrawals.

## Status

| Phase | What | Status |
|---|---|---|
| 1 | Data downloader + backtester | ✅ done |
| 2 | Strategy library | ⏳ (SMA crossover already included, used to test the backtester) |
| 3–9 | Regime detector, risk manager, scanner, optimizer, auto-trader, Telegram, dashboard | ⏳ |

## Setup (Windows, one time)

1. Install **Python 3.11+** from python.org (tick *"Add python.exe to PATH"*).
2. Open this `trading-bot` folder and double-click **`setup.bat`**. It creates a private
   Python environment in `.venv`, installs the packages and creates `.env` from `.env.example`.
3. Open `.env` in Notepad and set `EXCHANGE=binance`. API keys are **not needed** for Phase 1
   (candles are public data).

Every time you open a new terminal (Command Prompt) in this folder, first run:

```bat
.venv\Scripts\activate
```

You'll see `(.venv)` at the start of the line. All commands below assume that.

## Phase 1: download data and backtest

```bat
python -m data.downloader
```
Downloads 1d and 1h candles since 2021-01-01 for the coins in `config.yaml` into `data/cache/`,
plus each coin's exchange minimums (`markets.json`). First run takes a few minutes; later runs only
fetch new candles. Only **closed** candles are saved.

```bat
python -m backtest.run
python -m backtest.run --symbols BTC/USDT ETH/USDT SOL/USDT
python -m backtest.run --params fast=20 slow=50 stop_loss_pct=10
python -m backtest.run --timeframe 1h --params fast=240 slow=960
```
Prints a report for the full history and for the **bear / bull / sideways** periods set in
`config.yaml`, and saves it to `backtest/results/`.

### What the backtester guarantees
- **Costs:** 0.1% fee + 0.05% slippage on every buy and sell (set in `config.yaml`), buy-and-hold pays them too.
- **Exchange rules:** amounts are rounded *down* to the exchange's step size; orders below the
  minimum (e.g. 5 USDT) are skipped and counted.
- **No look-ahead:** a decision made when candle *i* closes is filled at candle *i+1*'s open.
  Stop-losses are checked with the candle's low (worst case); a gap below the stop fills at the open.
  `tests/test_lookahead.py` automatically checks every strategy file for future-data leaks.
- **Report:** total return, CAGR, max drawdown, Sharpe, Sortino, Calmar, win rate, profit factor,
  number of trades, and buy-and-hold comparison.
- **Warning** when a period has fewer than 30 trades (not statistically meaningful).

## Run the tests

```bat
python -m pytest -q
```

## Folder layout

```
bot/          core: config, logging, exchange connection (retry with backoff)
strategies/   one file per strategy (drop in a new file and it's picked up automatically)
backtest/     engine.py (simulator), metrics.py (numbers), run.py (command line report)
data/         downloader.py; candles cached in data/cache/ (not committed)
tests/        unit tests
logs/         bot.log, a new file each day, kept 30 days
config.yaml   all settings (no secrets)   .env  your keys (never commit or share)
```
