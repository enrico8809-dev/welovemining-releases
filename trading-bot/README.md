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
| 4 | Risk Manager (sizing, stops, hard limits, halts) | ✅ done |
| 5 | Coin Scanner (liquid USDT pairs) | ✅ done |
| 6 | Walk-forward Optimizer | ✅ done |
| 7 | Auto-Trader (crypto via CCXT, stocks/Forex via Interactive Brokers) | ✅ done |
| 8–9 | Telegram, dashboard | ⏳ |

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

## Risk Manager (Phase 4)

`bot/risk.py`: **every order must be approved here first.** Settings are in the `risk:` section
of `config.yaml`; the max order size comes from `MAX_ORDER_USDT` in `.env`.

| Rule | Default |
|---|---|
| Position size from volatility (ATR): a stop-loss costs ~1% of the account | `risk_per_trade_pct: 1` |
| Stop-loss on every position: entry - 2 x ATR, never more than 15% below | `stop_atr_mult: 2`, `max_stop_pct: 15` |
| Trailing stop: highest price since entry - 5 x ATR, only moves up | `trailing_atr_mult: 5` |
| Max order size / open trades / % of account per trade | `MAX_ORDER_USDT` / 3 / 25% |
| Never spend more than the cash you have (spot only, no leverage) | always |
| Daily loss limit: no new trades until tomorrow (UTC) | 3% |
| Max drawdown from peak: no new trades until **you** reset it | 20% |
| Cooldown after a losing streak | 3 losses -> 24 h |
| Pause after too many stop-losses | >3 in 24 h -> 48 h |
| Kill switch: blocks new trades until reset | Telegram `/stop` in Phase 8 |

Selling to close a position is always allowed. The state (halts, pauses, peak) is saved in
`data/bot_state.db` (SQLite), so restarting the bot does **not** clear a halt.

```bat
python -m bot.risk                       (show limits and current state)
python -m bot.risk --reset --equity 1000 (clear halts; the drawdown peak restarts at 1000)
python -m backtest.run --risk            (backtest with the Risk Manager)
python -m backtest.run --market stocks --risk
```

Backtest results with `--risk` (sma_cross, 2021–2026): much smaller positions (~15% of the
account), so much lower returns, but the worst drop fell from -54% to **-7%** on BTC and the
Sharpe ratio rose from 0.62 to **0.81** (buy & hold: 0.61). A 3 x ATR trailing stop closed
28 of 29 trades too early, so the default is 5 x ATR.

## Coin Scanner (Phase 5)

`bot/scanner.py` checks **every** USDT spot pair on the exchange with one request and keeps the
tradeable ones (settings in the `scanner:` section of `config.yaml`):

1. Removes stablecoins (USDC, FDUSD...), fiat (EUR, TRY...) and leveraged tokens (BTCUP, ETH3L...).
2. Keeps pairs with at least **10 million USDT** traded in 24 h and a bid/ask spread of at most **0.1%**.
3. Ranks them by volume and keeps the **top 20**. The list is saved to `data/scanner_latest.json`
   for the auto-trader (Phase 7).

```bat
python -m bot.scanner                                   (show and save the list)
python -m bot.scanner --download                        (also download their daily candles)
python -m backtest.run --scanned --strategy regime --risk   (backtest all scanned coins)
```

Careful with backtests of scanned coins: today's top coins are the ones that **survived and grew**,
so their past looks better than a random coin's would have (survivorship bias).

## Optimizer (Phase 6)

`backtest/optimize.py` tunes a strategy with **walk-forward testing** (settings in the
`optimizer:` section of `config.yaml`):

1. Try every setting in a small grid on **2 years** of history ("train").
2. Test the best one on the **next 6 months**, which it has never seen ("test").
3. Slide forward 6 months and repeat until today. Only the test results count.
4. The score is **risk-adjusted** (Sharpe or Calmar), averaged over all symbols.

The tuned settings are **rejected** (keep the defaults) if on unseen data they:
score 0 or less, keep less than 50% of their training score, lose in more than half of the
windows, or do no better than the default settings.

```bat
python -m backtest.optimize --strategy sma_cross
python -m backtest.optimize --strategy regime --risk
python -m backtest.optimize --market stocks --strategy sma_cross --objective calmar
```

Results so far (crypto, 7 windows, 2023–2026): **every strategy was rejected**. Tuning did not
beat the default settings on unseen data, e.g. `sma_cross` tuned 0.37 vs defaults 0.54 Sharpe.
That means the defaults are not curve-fitted, and chasing "better" settings would only have
fitted the past.

## Auto-Trader (Phase 7)

`bot/trader.py` runs 24/7. Every 5 minutes, for each market in `config.yaml` → `trader.markets`:

1. **Watch list**: crypto = the Coin Scanner's top 20 (re-scanned daily); stocks/Forex = your list.
2. **Open positions**: check the stop-loss / trailing stop with the live price; sell if the
   strategy says "out".
3. **New trades**: if the strategy (default `regime`) says "in" on the last **closed** daily
   candle, the **Risk Manager** sizes and approves the order. Nothing else can place orders.
4. Update the account value (daily loss / drawdown limits) and save everything to SQLite.

| Market | PAPER mode (default) | LIVE mode (`LIVE_TRADING=true`) |
|---|---|---|
| Crypto | live Binance prices, simulated fills | real spot orders via your API keys |
| Stocks, ETFs, gold | live Yahoo prices, simulated fills | real orders via Interactive Brokers |
| Forex | same (only XXX/USD pairs: with USD cash you can't buy USD/JPY without borrowing) | Interactive Brokers, 1:1 |

On start-up the bot **reconciles** its saved positions with the exchange (e.g. after a crash or
if you sold something by hand). Paper balances start at 1000 per market (`trader.paper_capital`).

**Double-click to use it on Windows:**

| File | What it does |
|---|---|
| `start_bot.bat` | starts the bot (restarts it after a crash; stops for good after the kill switch) |
| `status_bot.bat` | positions, cash, halts and last trades |
| `kill_bot.bat` | **KILL SWITCH**: cancels open orders, blocks new trades, stops the bot |

Or in the terminal: `python -m bot.trader` (`--once`, `--status`, `--kill`, `--clear-stop`).
After the kill switch: `python -m bot.risk --reset` and `python -m bot.trader --clear-stop`.

### Going live (only when you're happy with weeks of paper results)
1. **Crypto:** create a Binance API key with **Read + Spot trading only** (never withdrawals;
   restrict it to your home IP). Put it in `.env` as `API_KEY` / `API_SECRET`.
2. **Stocks/Forex:** install TWS or IB Gateway, log in (try the **paper** account first: port
   7497), enable the API (Settings → API → "Enable ActiveX and Socket Clients").
3. Keep `MAX_ORDER_USDT` small at first, then set `LIVE_TRADING=true` in `.env`.

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
bot/          core: config, logging, exchange, regime, risk, scanner, broker, trader, storage (SQLite)
strategies/   one file per strategy (drop in a new file and it's picked up automatically)
backtest/     engine.py (simulator), metrics.py (numbers), run.py (command line report)
data/         downloader.py (crypto via CCXT), yahoo.py (Forex/stocks); cache in data/cache/
tests/        unit tests
logs/         bot.log, a new file each day, kept 30 days
config.yaml   all settings (no secrets)   .env  your keys (never commit or share)
```
