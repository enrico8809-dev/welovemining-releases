# WeLoveMining Trading Bot

Personal trading bot for **crypto, Forex and stocks/ETFs/gold**.

| Market | Live trading on | Backtest data from |
|---|---|---|
| Crypto | Binance (any CCXT exchange works, e.g. Luno, VALR) | the exchange, via CCXT |
| Forex, stocks, ETFs, gold | Interactive Brokers (IBKR), cash account | Yahoo Finance (free) |

**Safety first:** PAPER mode by default. Spot/cash only: no futures, margin, CFDs or leverage.
Forex is traded **1:1** (a position is never bigger than the cash you have). Never withdraws funds.
Give API keys **Read + Spot trading** permission only. Never enable withdrawals.

## Status

| Phase | What | Status |
|---|---|---|
| 1 | Data downloader + backtester | ✅ done |
| 2 | Strategy library (4 strategies) + Forex/stock markets | ✅ done |
| 3 | Market Regime Detector + regime-switching strategy | ✅ done |
| 4–9 | Risk manager, scanner, optimizer, auto-trader, Telegram, dashboard | ⏳ |

## Setup (Windows, one time)

1. Install **Python 3.11+** from python.org (tick *"Add python.exe to PATH"*).
2. Open this `trading-bot` folder and double-click **`setup.bat`**. It creates a private
   Python environment in `.venv`, installs the packages and creates `.env` from `.env.example`.
3. Open `.env` in Notepad and set `EXCHANGE=binance`. API keys are **not needed** for downloading and
   backtesting (candles are public data).

Every time you open a new terminal (Command Prompt) in this folder, first run:

```bat
.venv\Scripts\activate
```

You'll see `(.venv)` at the start of the line. All commands below assume that.

## Download data

```bat
python -m data.downloader                   (all markets)
python -m data.downloader --market crypto   (or: forex, stocks)
```
- **crypto**: 1d + 1h candles since 2021 from your exchange, plus each coin's minimum order size.
- **forex / stocks**: daily candles since 2012 from Yahoo Finance (Forex also 1h, last ~2 years).

Coins, currency pairs and stocks are listed per market in `config.yaml`. Yahoo names:
`EURUSD=X` (Forex), `SPY` (S&P 500 ETF), `GLD` (gold ETF), `AAPL` (Apple).
Later runs only add new candles. Only **closed** candles are saved.

## Backtest

```bat
python -m backtest.run                                         (crypto, sma_cross)
python -m backtest.run --strategy all                          (compare all strategies)
python -m backtest.run --market forex --strategy all
python -m backtest.run --market stocks --symbols SPY GLD --strategy rsi_dip
python -m backtest.run --symbols BTC/USDT --params fast=20 slow=50 stop_loss_pct=10
```
With one strategy you get a full report per symbol (full history + the market's **bear / bull /
sideways** periods). With `--strategy all` you get one comparison table. Saved to `backtest/results/`.

## Strategies (`strategies/`, one file each)

| Name | Idea | Best in | Settings (defaults) |
|---|---|---|---|
| `sma_cross` | In when 10-day average > 40-day average | trends | `fast=10 slow=40` |
| `rsi_dip` | Buy oversold dips (RSI<30) only in an uptrend (above 200-day SMA) | uptrends | `buy_below=30 sell_above=55 trend_period=200 stop_loss_pct=8` |
| `grid` | Buy lower / sell higher in steps inside the recent price range; sell all if it breaks down | sideways | `lookback=30 levels=5 stop_pct=5` |
| `regime` | Picks a strategy per market regime; cash in downtrends (see below) | all | `up=sma_cross sideways=sma_cross` |
| `dca` | Base order + max 3 safety orders on dips, take profit, hard stop | mild dips in uptrends | `step_pct=5 max_safety=3 take_profit_pct=6 stop_loss_pct=15` |

Each strategy uses at most 2 indicators (less overfitting).

## Market Regime Detector (Phase 3)

`bot/regime.py` labels every candle **up**, **down** or **sideways** using 3 measures:
ADX (trend strength), the 100-candle moving average and its slope (direction) and volatility
(panic = far above normal = treated as down). A new label must last 3 candles before it is
accepted, except **down**, which is accepted at once (getting out fast is the safe side).

```bat
python -m bot.regime                           (current regime per coin + history check)
python -m bot.regime --market stocks
python -m backtest.run --strategy regime       (trade with it)
```

The `regime` strategy uses the strategy set in `config.yaml` for each regime and always holds
**cash in a downtrend**. Default: `sma_cross` for both up and sideways (backtests showed `grid`
and cash do worse in sideways markets on daily candles).

What the backtests showed: the regime filter mostly **cuts losses in crashes** (BTC 2022:
-12% instead of -46%) and lowers the worst drop (BTC -35% instead of -54%), but it also misses
part of the rebounds, so over the whole history it is not better than plain `sma_cross` on
every coin. The labels do **not** predict the next 30 days (crypto often bounces after drops).

## Costs used per market (edit in `config.yaml`)

| Market | Fee per side | Minimum fee | Slippage |
|---|---|---|---|
| Crypto (Binance) | 0.1% | – | 0.05% |
| Forex (IBKR) | 0.002% | 2 USD per order | 0.01% |
| Stocks/ETFs (IBKR tiered) | 0.05% | 0.35 USD per order | 0.02% |

Minimum fees matter on small accounts: a 2 USD fee on a 100 USD Forex order is 2%.

### What the backtester guarantees
- **Costs:** fee (with minimum per order) + slippage on every buy and sell; buy-and-hold pays them too.
- **Exchange rules:** amounts are rounded *down* to the exchange's step size; orders below the
  minimum (e.g. 5 USDT) are skipped and counted.
- **No look-ahead:** a decision made when candle *i* closes is filled at candle *i+1*'s open.
  Stop-losses are checked with the candle's low (worst case); a gap below the stop fills at the open.
  `tests/test_lookahead.py` automatically checks every strategy file for future-data leaks.
- **Sharpe/Sortino** are annualised with the real number of candles per year
  (crypto 365 days, stocks ~252, Forex ~260).
- **Report:** total return, CAGR, max drawdown, Sharpe, Sortino, Calmar, win rate, profit factor,
  number of trades, and buy-and-hold comparison.
- **Warning** when a period has fewer than 30 trades (not statistically meaningful).

## Which platform to trade on

- **Crypto: Binance.** Lowest fees (0.1%, less with BNB), the most coins and liquidity, and the
  best-supported API. Alternatives that are FSCA-licensed in South Africa with ZAR deposits:
  **VALR** and **Luno** (both work via CCXT: set `EXCHANGE=valr` or `EXCHANGE=luno`).
- **Forex, stocks, ETFs, gold: Interactive Brokers.** Accepts South African residents, low fees,
  150+ markets, an official API and a free **paper trading** account. Open a **cash** account
  (not margin), so leverage is impossible at the broker too. Connection comes in Phase 7.

## Run the tests

```bat
python -m pytest -q
```

## Folder layout

```
bot/          core: config, logging, exchange connection (retry with backoff)
strategies/   one file per strategy (drop in a new file and it's picked up automatically)
backtest/     engine.py (simulator), metrics.py (numbers), run.py (command line report)
data/         downloader.py (crypto via CCXT), yahoo.py (Forex/stocks); cache in data/cache/
tests/        unit tests
logs/         bot.log, a new file each day, kept 30 days
config.yaml   all settings (no secrets)   .env  your keys (never commit or share)
```
