"""Telegram control: alerts on your phone and commands to control the bot.

Alerts: every trade, errors, and a daily P&L summary.
Commands (only from YOUR chat, everyone else is ignored):
    /status     mode, halts, pause state, open positions
    /balance    cash and account value per market
    /positions  open positions with entry, stop and current P&L
    /trades     the last 10 trades
    /pause      stop opening new trades (stops keep protecting open positions)
    /resume     allow new trades again
    /stop       KILL SWITCH: cancel open orders, block new trades, stop the bot
    /help       this list

Setup (one time):
  1. In Telegram, talk to @BotFather -> /newbot -> copy the token.
  2. Send any message to your new bot, then open
     https://api.telegram.org/bot<TOKEN>/getUpdates in a browser and copy "chat":{"id": ...}.
  3. Put both in .env:  TELEGRAM_BOT_TOKEN=...   TELEGRAM_CHAT_ID=...
Test it:  python -m bot.telegram --test
"""
import argparse
import os
import threading
import time
from datetime import datetime, timedelta, timezone

import requests

from bot.logger import get_logger

log = get_logger("telegram")
API = "https://api.telegram.org/bot{token}/{method}"


class Telegram:
    def __init__(self, token: str, chat_id: str, session=None):
        self.token, self.chat_id = token, str(chat_id)
        self.http = session or requests.Session()
        self.offset = None
        self._stop = threading.Event()

    @classmethod
    def from_env(cls):
        token, chat = os.getenv("TELEGRAM_BOT_TOKEN"), os.getenv("TELEGRAM_CHAT_ID")
        return cls(token, chat) if token and chat else None

    def _call(self, method: str, http_timeout: float = 15, **params):
        r = self.http.post(API.format(token=self.token, method=method), json=params, timeout=http_timeout)
        r.raise_for_status()
        return r.json().get("result")

    def send(self, text: str) -> bool:
        """Send a message to your chat. Never raises: a Telegram problem must not stop trading."""
        for attempt in range(3):
            try:
                self._call("sendMessage", chat_id=self.chat_id, text=text[:4000])
                return True
            except Exception as e:
                log.warning("Telegram send failed (%s), attempt %d/3", type(e).__name__, attempt + 1)
                time.sleep(2 * (attempt + 1))
        return False

    def poll_once(self, handle) -> None:
        """Fetch new messages (waits up to 25 s) and answer commands from our chat only."""
        params = {"timeout": 25, "allowed_updates": ["message"]}
        if self.offset is not None:
            params["offset"] = self.offset
        # Telegram waits up to params["timeout"] (25 s) for new messages; allow 35 s in total
        for update in self._call("getUpdates", http_timeout=35, **params) or []:
            self.offset = update["update_id"] + 1
            msg = update.get("message") or {}
            chat_id = str((msg.get("chat") or {}).get("id"))
            text = (msg.get("text") or "").strip()
            if chat_id != self.chat_id:
                log.warning("Ignored a Telegram message from an unknown chat (%s)", chat_id)
                continue
            if text.startswith("/"):
                reply = handle(text.split()[0].split("@")[0].lower())
                if reply:
                    self.send(reply)

    def start_polling(self, handle) -> threading.Thread:
        """Answer commands in a background thread while the bot trades."""
        def loop():
            while not self._stop.is_set():
                try:
                    self.poll_once(handle)
                except Exception as e:
                    log.warning("Telegram polling error (%s); retrying in 10 s", type(e).__name__)
                    self._stop.wait(10)
        thread = threading.Thread(target=loop, name="telegram", daemon=True)
        thread.start()
        return thread

    def stop(self):
        self._stop.set()


# ---------------------------------------------------------------------------- commands
class Commands:
    """Turns /commands into answers. `traders` are the running MarketTraders (for live prices)."""

    def __init__(self, cfg: dict, store, traders=()):
        self.cfg, self.store, self.traders = cfg, store, list(traders)

    def handle(self, command: str) -> str:
        from bot.trader import PAUSE_FLAG
        handlers = {
            "/status": self.status, "/balance": self.balance, "/positions": self.positions,
            "/trades": self.trades, "/help": lambda: __doc__.split("Setup")[0].strip(),
            "/start": lambda: __doc__.split("Setup")[0].strip(),
        }
        if command == "/pause":
            self.store.set(PAUSE_FLAG, True)
            return "⏸ Paused: no new trades. Stops still protect open positions. /resume to continue."
        if command == "/resume":
            self.store.set(PAUSE_FLAG, False)
            return "▶️ Resumed: new trades allowed (if the Risk Manager agrees)."
        if command == "/stop":
            from bot.trader import kill_switch
            kill_switch(self.cfg, self.store)
            return ("🛑 KILL SWITCH: open orders cancelled, new trades blocked, bot stopping.\n"
                    "To restart: python -m bot.risk --reset, python -m bot.trader --clear-stop, then start_bot.bat")
        if command in handlers:
            try:
                return handlers[command]()
            except Exception as e:
                log.exception("Telegram command %s failed", command)
                return f"⚠️ {command} failed: {e}"
        return "Unknown command. Send /help"

    def _markets(self):
        return self.cfg["trader"]["markets"]

    def _risk(self, market):
        from bot.risk import RiskConfig, RiskManager
        return RiskManager(RiskConfig.from_config(self.cfg), self.store, market=market)

    def _price(self, market, symbol, fallback):
        for t in self.traders:
            if t.market == market:
                try:
                    return t.broker.price(symbol)
                except Exception:
                    break
        return fallback

    def status(self) -> str:
        from bot.config import is_live_trading
        from bot.trader import PAUSE_FLAG, STOP_FLAG
        lines = [f"🤖 Mode: {'LIVE' if is_live_trading() else 'PAPER'}"
                 f"{' | ⏸ PAUSED' if self.store.get(PAUSE_FLAG) else ''}"
                 f"{' | 🛑 STOPPED' if self.store.get(STOP_FLAG) else ''}"]
        now = datetime.now(timezone.utc)
        for m in self._markets():
            blocked = self._risk(m).blocked_reason(now)
            lines.append(f"• {m}: {len(self.store.positions(m))} positions, new buys "
                         f"{'BLOCKED (' + blocked + ')' if blocked else 'allowed'}")
        return "\n".join(lines)

    def balance(self) -> str:
        lines = ["💰 Balance"]
        for m in self._markets():
            hist = self.store.equity_history(m)
            equity = f"{hist[-1][2]:.2f}" if hist else "n/a"
            paper = self.store.get(f"paper:{m}")
            cash = f"{paper['cash']:.2f}" if paper else "see exchange"
            lines.append(f"• {m}: value {equity} | cash {cash}")
        return "\n".join(lines)

    def positions(self) -> str:
        lines = []
        for m in self._markets():
            for p in self.store.positions(m):
                price = self._price(m, p.symbol, p.entry_price)
                pnl_pct = 100 * (price / p.entry_price - 1)
                lines.append(f"• [{m}] {p.symbol}: {p.qty:.6g} @ {p.entry_price:.6g} → {price:.6g} "
                             f"({pnl_pct:+.1f}%), stop {p.stop:.6g}")
        return "📊 Positions\n" + ("\n".join(lines) if lines else "none")

    def trades(self) -> str:
        rows = self.store.trades(10)
        if not rows:
            return "No trades yet."
        return "🧾 Last trades\n" + "\n".join(
            f"• {t['time'][5:16]} {t['side'].upper()} {t['symbol']} {t['qty']:.6g} @ {t['price']:.6g}"
            + (f" P&L {t['pnl']:+.2f}" if t["pnl"] is not None else "") for t in rows)


def daily_summary(store, markets, day) -> str:
    """P&L summary for one UTC day (a date)."""
    start = datetime.combine(day, datetime.min.time(), tzinfo=timezone.utc)
    end = start + timedelta(days=1)
    lines = [f"📅 Daily summary {day.isoformat()} (UTC)"]
    for m in markets:
        hist = [(datetime.fromisoformat(t), e) for t, _, e in store.equity_history(m)]
        day_hist = [e for t, e in hist if start <= t < end]
        before = [e for t, e in hist if t < start]
        if not day_hist:
            continue
        open_value = before[-1] if before else day_hist[0]
        close_value = day_hist[-1]
        change = close_value - open_value
        pct = 100 * change / open_value if open_value else 0
        lines.append(f"• {m}: {open_value:.2f} → {close_value:.2f} ({change:+.2f}, {pct:+.2f}%)")
    trades = [t for t in store.trades(500) if start <= datetime.fromisoformat(t["time"]) < end]
    realized = sum(t["pnl"] for t in trades if t["pnl"] is not None)
    lines.append(f"Trades today: {len(trades)} | realised P&L {realized:+.2f}")
    return "\n".join(lines)


def main():
    from bot.config import load_config
    from bot.storage import StateStore
    parser = argparse.ArgumentParser(description="Telegram control")
    parser.add_argument("--test", action="store_true", help="send a test message")
    args = parser.parse_args()
    load_config()
    tg = Telegram.from_env()
    if not tg:
        print("Set TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID in .env first (see the top of bot/telegram.py).")
        return
    if args.test:
        ok = tg.send("✅ WeLoveMining bot: Telegram works!")
        print("Sent." if ok else "Failed - check the token and chat id.")
        return
    print("Answering commands (Ctrl+C to stop)...")
    commands = Commands(load_config(), StateStore())
    while True:
        tg.poll_once(commands.handle)


if __name__ == "__main__":
    main()
