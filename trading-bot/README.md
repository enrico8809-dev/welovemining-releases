# WeLoveMining Trading Bot

Personal trading bot for **crypto, Forex and stocks/ETFs/gold**.

| Market | Live trading on | Backtest data from |
|---|---|---|
| Crypto | Binance (any CCXT exchange works, e.g. Luno, VALR) | the exchange, via CCXT |
| Stocks, ETFs | Interactive Brokers (IBKR), cash account | Yahoo Finance (free) |
| Forex, gold | MetaTrader 5 (any MT5 broker), **demo account** by default | MT5 history (Yahoo as fallback) |

**Safety first:** PAPER mode by default (Forex: an MT5 **demo** account). Crypto and stocks are
spot/cash only: no futures, margin or leverage. Forex may go long or short, but total exposure is
capped at **1:1** (open positions are never worth more than your account) and every Forex order
carries its stop-loss to the broker. Never withdraws funds. Give API keys **Read + Spot trading**
permission only. Never enable withdrawals.

> **No bot can promise profit.** Backtests show what *would* have happened, not what will. The
> safety limits keep losses small; they can't make a strategy win. Paper/demo trade for weeks first.

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
| 8 | Telegram alerts and commands | ✅ done |
| 9 | Local web dashboard | ✅ done |
| + | Forex via MetaTrader 5 (long + short, lots, broker stops), WhatsApp alerts | ✅ done |
| + | Forex day-trading mode; WLM Trader app for Windows + Android | ✅ done |

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
- **stocks**: daily candles since 2012 from Yahoo Finance.
- **forex**: your MT5 broker's history (Windows, MT5 running); otherwise Yahoo Finance as a fallback.

Coins, currency pairs and stocks are listed per market in `config.yaml`. Forex uses MT5 names
(`EURUSD`, `XAUUSD` for gold); stocks use Yahoo names: `SPY` (S&P 500 ETF), `GLD` (gold ETF), `AAPL`.
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
| `breakout` | Buy a break above the 20-candle high, exit below the 10-candle low (Forex: also short) | trends | `entry=20 exit=10` |
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
| Forex, gold | MT5 **demo** account (real broker, play money) | MT5 real account, only with `FOREX_LIVE_TRADING=true` |

On start-up the bot **reconciles** its saved positions with the exchange (e.g. after a crash or
if you sold something by hand). Paper balances start at 1000 per market (`trader.paper_capital`).

**Double-click to use it on Windows:**

| File | What it does |
|---|---|
| `start_bot.bat` | starts the bot (restarts it after a crash; stops for good after the kill switch) |
| `status_bot.bat` | positions, cash, halts and last trades |
| `kill_bot.bat` | **KILL SWITCH**: cancels open orders, closes Forex positions, blocks new trades, stops the bot |

Or in the terminal: `python -m bot.trader` (`--once`, `--status`, `--kill`, `--clear-stop`).
After the kill switch: `python -m bot.risk --reset` and `python -m bot.trader --clear-stop`.

### Going live (only when you're happy with weeks of paper results)
1. **Crypto:** create a Binance API key with **Read + Spot trading only** (never withdrawals;
   restrict it to your home IP). Put it in `.env` as `API_KEY` / `API_SECRET`.
2. **Stocks:** install TWS or IB Gateway, log in (try the **paper** account first: port
   7497), enable the API (Settings → API → "Enable ActiveX and Socket Clients").
3. Keep `MAX_ORDER_USDT` small at first, then set `LIVE_TRADING=true` in `.env`.
4. **Forex:** see below; it has its own switch (`FOREX_LIVE_TRADING`).

## Forex via MetaTrader 5

`bot/forex_trader.py` trades EURUSD, GBPUSD, USDJPY, AUDUSD, USDCHF, USDCAD, USDZAR and gold
(XAUUSD) through the MetaTrader 5 terminal on your PC (`bot/brokers/mt5_broker.py`).

**Setup (one time)**
1. Open a **demo** account with an MT5 broker and install its MetaTrader 5 terminal. In South
   Africa pick a broker regulated by the **FSCA** (check it on the FSCA website before depositing).
2. In MT5: log in, then **Tools → Options → Expert Advisors → tick "Allow algorithmic trading"**,
   and press the **Algo Trading** button in the toolbar so it's green.
3. In `.env`: `MT5_LOGIN`, `MT5_PASSWORD`, `MT5_SERVER` (shown in MT5 under File → Login). Leave
   `FOREX_LIVE_TRADING=false`. Run `setup.bat` again to install the `MetaTrader5` package.
4. Download your broker's history and symbol specs: `python -m data.forex_data`.
5. Start the bot as usual. If MT5 isn't running, Forex is skipped and the other markets carry on.

**How it trades**
- **Long and short.** The `regime` strategy buys in an uptrend and goes **short only in a
  downtrend** (it profits when the price falls).
- **Size in lots** from the stop distance: if the stop is hit you lose about 1% of the account.
- **1:1 cap:** all open Forex positions together are never worth more than your account
  (`forex_risk: max_leverage: 1`). Your broker's 1:500 leverage is never used.
  At 1:1 the smallest EURUSD position (0.01 lot) needs about **1,200 USD** in the account.
- **Stop-loss at the broker** with every order: it works even if your PC is off.
  The trailing stop is moved at the broker too.
- **Market hours:** no new trades on weekends, in the first hour after the Sunday open, the last
  hour before the Friday close, or around news you list in `forex_hours: news_events`.
- Only touches its own trades (magic number `880088`); your manual MT5 trades are left alone.
- **Safety:** on a **real** MT5 account the bot refuses to trade unless `FOREX_LIVE_TRADING=true`.

**Backtest:** `python -m backtest.run --market forex --strategy regime` (spread, commission and
overnight swap included; reported separately from crypto). Add `--params allow_short=false` to
compare with long-only.

Backtest 2012-2026 on daily candles (Yahoo prices with *estimated* spreads/swaps, 10,000 USD, 1:1):

| | EURUSD | GBPUSD | USDJPY | AUDUSD | USDCHF | USDCAD | USDZAR | Gold |
|---|---|---|---|---|---|---|---|---|
| long + short | -4% | +13% | +23% | -13% | -21% | +5% | -20% | +2% |
| long only | -12% | -5% | +41% | -12% | +2% | +26% | -23% | 0% |
| buy & hold | -12% | -15% | +51% | -31% | -12% | +28% | +51% | +167% |

At 1:1 these strategies earn very little on Forex over 14 years, and shorting helped on some pairs
and hurt on others. Re-run with your broker's real data (`python -m data.forex_data`) before
judging, and demo trade first.

### Day-trading mode (quick trades)

Set `markets.forex.mode: day` (or switch it in the app). The bot then:
- trades **hourly candles** (`forex_day: timeframe`, also 15m/5m with MT5 data) during the London +
  New York session (07:00-20:00 UTC), checking every minute;
- makes at most `max_trades_per_day` (6) new trades per day;
- **closes everything an hour before the 17:00 New York rollover**: no overnight swap, nothing over
  the weekend;
- still risks ~1% per trade at a broker stop-loss, with total exposure up to **3:1** (tight stops
  need bigger positions; swing mode stays 1:1).

Backtest: `python -m backtest.run --market forex --timeframe 1h --strategy sma_cross`.
Two years of hourly data (Yahoo, estimated spreads), average over the 8 symbols:
`sma_cross` +3%, `rsi_dip` 0%, `regime` 0%, `breakout` -3%; ~1 trade per day per symbol, and
AUDUSD, USDCAD and USDZAR hit the 20% drawdown halt with most strategies. **No quick-trade strategy
has shown a reliable edge yet** - most day traders lose money to spreads. Demo trade it first.

## WhatsApp alerts

Every trade, error and the daily summary can also go to your **WhatsApp** (free, via CallMeBot;
send-only, controls are in Telegram / the app). Setup: see the top of `bot/whatsapp.py`
(about 2 minutes), then put `WHATSAPP_PHONE` and `WHATSAPP_APIKEY` in `.env` and test with
`python -m bot.whatsapp --test`.

## Telegram (Phase 8)

The bot sends you **every trade, errors and a daily P&L summary**, and obeys these commands
(only from **your** chat ID, messages from anyone else are ignored):

| Command | What it does |
|---|---|
| `/status` | mode, pause/stop state, halts, number of positions |
| `/balance` | account value per market (crypto, stocks, Forex) and combined |
| `/positions` | open positions with current P&L and stop |
| `/trades` | last 10 trades |
| `/pause` / `/resume` | stop / allow new trades (stops keep protecting open positions) |
| `/stop` | **KILL SWITCH** (cancel open orders, close Forex positions, block new trades, stop the bot) |

Setup (one time):
1. In Telegram, open **@BotFather** → `/newbot` → copy the **token**.
2. Send any message to your new bot, then open
   `https://api.telegram.org/bot<TOKEN>/getUpdates` in your browser and copy the number after
   `"chat":{"id":`.
3. In `.env`: `TELEGRAM_BOT_TOKEN=...` and `TELEGRAM_CHAT_ID=...`
4. Test: `python -m bot.telegram --test`. Then start the bot as usual; Telegram runs inside it.

## WLM Trader app (Windows + Android)

The easiest way to run and control the bot: **`wlm-trader-app/`** (see its README). The Windows
app starts the bot for you, and every setting, key, backtest and control (start, pause, stop, kill
switch) is in the app; the Android app shows the same screens on your phone through Tailscale.

Its **Live** screen shows real-time prices, open profit/loss and the bot's activity feed
(`bot/activity.py`: every check, signal, skipped trade, order and stop move, in plain words).

Behind it is `bot/server.py` (`python -m bot.server`): a JSON API on `127.0.0.1:8765` protected by
`APP_TOKEN` in `.env` (created automatically). Settings changed in the app are saved to
`data/app_settings.json` (on top of `config.yaml`). Keys and passwords can only be changed from the
PC itself. Only one copy of the bot may trade at a time (app or `start_bot.bat`).

## Dashboard (Phase 9)

Double-click **`dashboard.bat`** (or run `python -m bot.dashboard`) and it opens
**http://localhost:8050** with: account value per market, the equity curve, open positions with
their stops, performance per exit reason, P&L per symbol and the full trade history.
It refreshes every 30 seconds, works on a phone-sized window, only **reads** the database (it
cannot trade) and only listens on your own PC.

## Costs used per market (edit in `config.yaml`)

| Market | Fee per side | Minimum fee | Slippage |
|---|---|---|---|
| Crypto (Binance) | 0.1% | – | 0.05% |
| Forex (MT5) | spread (from MT5 history) + commission per lot + overnight swap | – | – |
| Stocks/ETFs (IBKR tiered) | 0.05% | 0.35 USD per order | 0.02% |

Minimum fees matter on small accounts: a 0.35 USD fee on a 10 USD stock order is 3.5%.

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
- **Stocks, ETFs: Interactive Brokers.** Accepts South African residents, low fees, an official
  API and a free **paper trading** account. Open a **cash** account (not margin).
- **Forex, gold: any MetaTrader 5 broker** (FSCA-regulated if you're in South Africa). Start with a
  **demo** account; the bot caps exposure at 1:1 whatever leverage the broker offers.

## Run the tests

```bat
python -m pytest -q
```

## Folder layout

```
bot/          core: config, logging, exchange, regime, risk, scanner, trader, forex_trader, storage (SQLite)
bot/brokers/  one interface, many brokers: ccxt (crypto), ibkr (stocks), mt5 (Forex), paper
strategies/   one file per strategy (drop in a new file and it's picked up automatically)
backtest/     engine.py (spot simulator), forex_engine.py (Forex), metrics.py, run.py (report)
data/         downloader.py (crypto via CCXT), yahoo.py (stocks), forex_data.py (MT5); cache in data/cache/
tests/        unit tests
logs/         bot.log, a new file each day, kept 30 days
config.yaml   all settings (no secrets)   .env  your keys (never commit or share)
```
