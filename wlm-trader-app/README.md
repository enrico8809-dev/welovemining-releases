# WLM Trader (Windows + Android)

The control app for the WeLoveMining trading bot (`../trading-bot`). One set of screens,
packaged twice:

| | Runs | What it does |
|---|---|---|
| **Windows** (`WLM-Trader-Setup.exe`) | on the PC that trades | starts the bot in the background (tray icon), sets up Python, shows everything, lets you change every setting, enter keys, and pair your phone |
| **Android** (`WLM-Trader.apk`) | your phone | the same screens over Tailscale: dashboard, start/pause/stop, kill switch, settings, backtests, logs |

Both talk to the bot's server (`trading-bot/bot/server.py`), so they always show the same
thing: change a setting on the phone and the PC shows it too.

```
  phone app ──Tailscale (private)──▶ ┐
                                     ├─▶ bot server (127.0.0.1:8765) ─▶ Auto-Trader ─▶ exchange / MT5
  Windows app ──this PC─────────────▶ ┘
```

## Install

Both files are on the [`trader-latest`](../../releases/tag/trader-latest) release (built by GitHub
Actions from `main`; every pull request also builds them as downloadable artifacts).

**Windows**
1. Install **Python 3.11+** from python.org (tick *Add python.exe to PATH*), if you haven't already.
2. Run `WLM-Trader-Setup.exe`. Windows may say "Windows protected your PC": **More info → Run anyway**
   (the installer isn't code-signed).
3. First start: choose **Use my existing bot folder** (the folder with `start_bot.bat`, so your
   paper history and `.env` keys are kept) or **Install a fresh bot**. The app creates the Python
   environment itself the first time (a few minutes).
4. Don't run `start_bot.bat` at the same time: only one copy of the bot may trade.

Closing the window keeps the bot trading (tray icon, bottom-right). **Quit** from the tray icon stops
the bot gracefully. Settings → **Start with Windows** keeps it trading after a restart.

**Android**
1. On the PC: Settings → Phone → **Turn on phone access** (uses Tailscale, like your dashboard).
2. On the phone: install `WLM-Trader.apk` (allow "install unknown apps"), switch **Tailscale** on.
3. Open WLM Trader, type the PC's address (shown on the PC) and press **Pair a phone** on the PC:
   type the 6-digit code. The code works once and expires after 10 minutes.

## Screens

Dashboard (total value, start/pause/stop, kill switch, markets) · **Live** (prices and open
profit/loss every 2 seconds, where each price sits between its stop-loss and entry, the symbols the
bot is watching with the strategy's current signal, and a feed of what the bot is checking and
deciding) · Positions · History (win rate,
P&L, track record) · Trading (markets, strategies, Forex swing/day mode, shorts, pairs, news pauses)
· Risk (every limit, with plain-English help) · Research (backtests, data, coin scanner, regime,
optimizer) · Alerts (WhatsApp, Telegram, test message) · Accounts (exchange and MT5 keys, real-money
switches with a warning) · Logs · Settings (phone pairing, start with Windows, bot folder).

## Safety

- The app can only do what the bot's API allows: settings are checked on the server (e.g. Forex swing
  exposure can't go above 1:1, day mode above 3:1), and anything not on the list is refused.
- **Keys and passwords can only be entered on the PC itself**, never over the network, and are never
  sent back to the app (it only sees "set" / "not set").
- The phone needs both Tailscale (only your devices) and the paired token.
- The kill switch needs a 1.5-second press; switching on real money shows a warning with your
  practice record.

## Develop

```bash
npm install
npm run dev            # screens in the browser (http://localhost:5190), against a running bot server
npm run typecheck && npm test
npm run package        # Windows installer (on Windows)
npm run android:sync   # copy the screens into android/, then build with Android Studio or ./gradlew
```

Run the bot server for development: `cd ../trading-bot && python -m bot.server --no-autostart`
(`--print-token` shows the token to paste into the phone screen's local storage).
