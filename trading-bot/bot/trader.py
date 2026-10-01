"""Auto-Trader: the main loop that runs 24/7 on your PC.

Every loop (default every 5 minutes), for each enabled market (crypto / stocks):
  1. Get the coins/stocks to watch (crypto: the Coin Scanner's list, re-scanned daily).
  2. For every open position: check the stop-loss / trailing stop with the live price,
     and sell if the strategy says "out".
  3. For every other symbol: if the strategy (default: regime) says "in" on the last
     CLOSED candle, ask the Risk Manager. Only approved orders are placed.
  4. Update the account value (for the daily loss / drawdown limits) and save everything.

PAPER mode (default, LIVE_TRADING=false in .env): live prices, simulated fills with fees.
LIVE mode (LIVE_TRADING=true): real orders. Crypto via your exchange's API keys;
stocks via Interactive Brokers (TWS / IB Gateway must be running).
Forex runs through MetaTrader 5 (bot/forex_trader.py): a DEMO account unless
FOREX_LIVE_TRADING=true, long and short, every order with its stop-loss at the broker.

    python -m bot.trader              start the bot (Ctrl+C to stop)
    python -m bot.trader --once       run one loop and exit (good for testing)
    python -m bot.trader --status     show positions, balances and halts
    python -m bot.trader --kill       KILL SWITCH: cancel orders, close Forex positions, block new trades, stop
"""
import argparse
import math
import signal
import socket
import threading
import time
from datetime import datetime, timezone

from bot.brokers.base import Broker
from bot.brokers.ccxt_broker import CcxtBroker
from bot.brokers.ibkr_broker import IbkrBroker, YahooData
from bot.brokers.paper import PaperBroker
from bot.config import is_forex_live, is_live_trading, load_config
from bot.logger import get_logger
from bot.risk import RiskConfig, RiskManager
from bot.storage import Position, StateStore, now_iso
from strategies import load_strategy
from strategies.indicators import atr

log = get_logger("trader")
STOP_FLAG = "stop_requested"
PAUSE_FLAG = "paused"


class MarketTrader:
    """Trades one market (one account) through one broker."""

    def __init__(self, market: str, broker: Broker, risk: RiskManager, store: StateStore,
                 strategy_name: str, strategy_params: dict, symbols_fn, mode: str,
                 notify=lambda text: None):
        self.market, self.broker, self.risk, self.store = market, broker, risk, store
        self.strategy_name, self.strategy_params = strategy_name, strategy_params
        self.symbols_fn = symbols_fn       # returns the symbols to watch right now
        self.mode = mode                   # "paper" or "live"
        self.notify = notify               # Telegram alerts (Phase 8); no-op by default
        self._signals = {}                 # symbol -> (UTC day, wants in?, candles)

    # ------------------------------------------------------------------ helpers
    def _now(self) -> datetime:
        return datetime.now(timezone.utc)

    def equity(self, prices: dict) -> float:
        value = self.broker.get_balance()
        for p in self.store.positions(self.market):
            value += p.qty * prices.get(p.symbol, p.entry_price)
        return value

    def snapshot(self, equity: float) -> None:
        """What the app, Telegram and the dashboard show for this account."""
        self.store.set(f"account:{self.market}", {
            "equity": round(equity, 2), "cash": round(self.broker.get_balance(), 2),
            "currency": self.broker.quote, "mode": self.mode, "updated": now_iso()})

    def on_kill(self) -> None:
        """Kill switch: cancel open orders. Spot holdings are kept (no leverage, no forced sale)."""
        if self.broker.live:
            log.warning("[%s] cancelled %d open orders", self.market, self.broker.cancel_all())

    # ------------------------------------------------------------------ one loop
    def step(self) -> None:
        prices = {}
        # 1) Manage open positions first (selling is always allowed, even when halted)
        for pos in self.store.positions(self.market):
            try:
                self.manage_position(pos, prices)
            except Exception as e:
                log.exception("[%s] error managing %s: %s", self.market, pos.symbol, e)

        # 2) Update equity -> daily loss / drawdown limits
        eq = self.equity(prices)
        self.risk.update_equity(eq, self._now())
        self.store.record_equity(self.market, eq)
        self.snapshot(eq)

        # 3) Look for new entries
        if self.store.get(PAUSE_FLAG) or self.store.get(STOP_FLAG):
            return
        held = {p.symbol for p in self.store.positions(self.market)}
        if len(held) >= self.risk.config.max_open_trades:
            return                                # no room for another trade: nothing to check
        for symbol in self.symbols_fn():
            if len(self.store.positions(self.market)) >= self.risk.config.max_open_trades:
                break                             # full: no need to check the rest
            if symbol in held:
                continue
            try:
                self.maybe_enter(symbol, eq)
            except Exception as e:
                log.exception("[%s] error checking %s: %s", self.market, symbol, e)

    def signal(self, symbol: str):
        """(wants to be in?, candles) based on the last CLOSED daily candle only.
        Daily candles change once a day, so we fetch them once per UTC day per symbol."""
        today = self._now().date()
        cached = self._signals.get(symbol)
        if cached and cached[0] == today:
            return cached[1], cached[2]
        candles = self.broker.get_candles(symbol)
        want_in = False
        if len(candles) >= 50:
            strategy = load_strategy(self.strategy_name, **self.strategy_params)
            want_in = bool(strategy.target_exposure(candles).iloc[-1] > 0)
        self._signals[symbol] = (today, want_in, candles)
        return want_in, candles

    def manage_position(self, pos: Position, prices: dict) -> None:
        price = self.broker.get_price(pos.symbol)
        prices[pos.symbol] = price
        want_in, candles = self.signal(pos.symbol)
        current_atr = float(atr(candles, self.risk.config.atr_period).iloc[-1]) if len(candles) else 0

        # Trailing stop: follows the highest price up, never down
        if price > pos.highest:
            pos.highest = price
        if current_atr > 0:
            pos.stop = self.risk.trailing_stop(pos.stop, pos.highest, current_atr)
        self.store.save_position(pos)

        if price <= pos.stop:
            self.exit(pos, price, "stop_loss")
            self.store.set(f"wait_reset:{self.market}:{pos.symbol}", True)
        elif not want_in:
            self.exit(pos, price, "signal")

    def maybe_enter(self, symbol: str, equity: float) -> None:
        want_in, candles = self.signal(symbol)
        wait_key = f"wait_reset:{self.market}:{symbol}"
        if not want_in:
            self.store.set(wait_key, False)      # strategy went flat: re-entry allowed again
            return
        if self.store.get(wait_key):             # stopped out: wait for a fresh signal
            return
        price = self.broker.get_price(symbol)
        current_atr = float(atr(candles, self.risk.config.atr_period).iloc[-1])
        if math.isnan(current_atr):
            return
        cash = self.broker.get_balance()
        decision = self.risk.check_buy(price, current_atr, equity, cash,
                                       open_trades=len(self.store.positions(self.market)),
                                       rules=self.broker.rules(symbol), now=self._now())
        if not decision.approved:
            log.info("[%s] %s: buy not approved (%s)", self.market, symbol, decision.reason)
            return
        fill = self.broker.place_order(symbol, "buy", decision, price)
        if not fill:
            return
        # Keep the stop the same distance below the real fill price
        stop = fill.price - (price - decision.stop_price)
        self.store.save_position(Position(self.market, symbol, fill.qty, fill.price, stop,
                                          fill.price, now_iso(), self.strategy_name))
        self.store.record_trade(self.market, symbol, "buy", fill.qty, fill.price, fill.fee,
                                "signal", None, self.mode)
        msg = (f"BUY {symbol} [{self.market}, {self.mode}]: {fill.qty:.8g} @ {fill.price:.8g} "
               f"(value {fill.qty * fill.price:.2f} {self.broker.quote}, stop {stop:.8g})")
        log.info(msg)
        self.notify(msg)

    def exit(self, pos: Position, price: float, reason: str) -> None:
        decision = self.risk.check_sell(pos.qty, price, self.broker.rules(pos.symbol))
        if not decision.approved:
            log.warning("[%s] %s: cannot sell (%s); forgetting the dust", self.market, pos.symbol, decision.reason)
            self.store.delete_position(self.market, pos.symbol)
            return
        fill = self.broker.close_position(pos.symbol, decision, price)
        if not fill:
            return
        pnl = fill.qty * (fill.price - pos.entry_price) - fill.fee
        self.store.delete_position(self.market, pos.symbol)
        self.store.record_trade(self.market, pos.symbol, "sell", fill.qty, fill.price, fill.fee,
                                reason, pnl, self.mode)
        self.risk.record_closed_trade(pnl, stopped_out=(reason == "stop_loss"), now=self._now())
        msg = (f"SELL {pos.symbol} [{self.market}, {self.mode}] ({reason}): {fill.qty:.8g} @ "
               f"{fill.price:.8g}, P&L {pnl:+.2f} {self.broker.quote}")
        log.info(msg)
        self.notify(msg)

    # ------------------------------------------------------------------ startup
    def reconcile(self) -> None:
        """Compare what we THINK we hold with what the broker SAYS we hold (after a crash/restart)."""
        cash, holdings = self.broker.get_balance(), self.broker.get_positions()
        for pos in self.store.positions(self.market):
            actual = holdings.get(pos.symbol, 0.0)
            if actual <= 0:
                log.warning("[%s] reconcile: %s no longer held (sold outside the bot?) - removing",
                            self.market, pos.symbol)
                self.store.delete_position(self.market, pos.symbol)
            elif actual < pos.qty * 0.99:
                log.warning("[%s] reconcile: %s qty %.8g -> %.8g (exchange has less)",
                            self.market, pos.symbol, pos.qty, actual)
                pos.qty = actual
                self.store.save_position(pos)
        mine = {p.symbol for p in self.store.positions(self.market)}
        for symbol, qty in holdings.items():
            if symbol not in mine and qty > 0:
                log.info("[%s] reconcile: you also hold %s (%.8g) - not managed by the bot", self.market, symbol, qty)
        log.info("[%s] reconcile done: cash %.2f %s, %d positions", self.market, cash, self.broker.quote, len(mine))


# ---------------------------------------------------------------------------- setup
def build_traders(cfg: dict, store: StateStore, live: bool, notify=lambda t: None) -> list:
    tc = cfg["trader"]
    mode = "live" if live else "paper"
    traders = []
    for market in tc["markets"]:
        mcfg = cfg["markets"][market]
        if market == "forex":
            forex = build_forex_trader(cfg, store, notify)
            if forex:
                traders.append(forex)
            continue
        if market == "crypto":
            data = CcxtBroker(live=live)
            if tc.get("public_url"):
                data.ex.urls["api"]["public"] = tc["public_url"]
        elif live:
            ib = cfg.get("ibkr", {})
            data = IbkrBroker(market, mcfg, ib.get("host", "127.0.0.1"), ib.get("port", 7497),
                              ib.get("client_id", 17) + len(traders))
        else:
            data = YahooData(market, mcfg)
        data.market = market
        broker = data if live else PaperBroker(
            data, store, tc.get("paper_capital", {}).get(market, 1000),
            mcfg["fee_pct"], mcfg["slippage_pct"], mcfg.get("min_fee", 0))
        risk = RiskManager(RiskConfig.from_config(cfg, mcfg["fee_pct"]), store, market=market)
        traders.append(MarketTrader(market, broker, risk, store, tc["strategy"], strategy_params(cfg, tc["strategy"]),
                                    symbols_for(market, cfg, data), mode, notify))
    return traders


def strategy_params(cfg: dict, name: str, allow_short: bool = False) -> dict:
    from backtest.run import config_params
    from strategies import supports_short
    params = config_params(cfg, name)
    if allow_short and supports_short(name):
        params["allow_short"] = True
    return params


def connect_mt5(cfg: dict, live_allowed: bool):
    from bot.brokers.mt5_broker import Mt5Broker
    m = cfg.get("mt5", {})
    return Mt5Broker(live_allowed=live_allowed, magic=m.get("magic", 880088),
                     suffix=m.get("symbol_suffix", ""), deviation=m.get("deviation_points", 20))


def build_forex_trader(cfg: dict, store: StateStore, notify=lambda t: None):
    """Forex through MetaTrader 5. If MT5 isn't available the other markets keep running."""
    from bot.forex_trader import ForexTrader
    mcfg = cfg["markets"]["forex"]
    try:
        broker = connect_mt5(cfg, live_allowed=is_forex_live())
    except Exception as e:
        log.error("[forex] MetaTrader 5 not available, Forex is skipped: %s", e)
        notify(f"⚠️ Forex skipped: {e}")
        return None
    name = mcfg.get("strategy", cfg["trader"]["strategy"])
    risk = RiskManager(RiskConfig.from_config(cfg, market="forex"), store, market="forex")
    return ForexTrader(broker, risk, store, name, strategy_params(cfg, name, mcfg.get("allow_short", True)),
                       mcfg["symbols"], cfg.get("forex_hours", {}), notify)


def symbols_for(market: str, cfg: dict, data: Broker):
    """Crypto: Coin Scanner results (re-scanned once a day). Others: the list in config.yaml."""
    if market != "crypto":
        return lambda: cfg["markets"][market]["symbols"]
    cache = {"day": None, "symbols": []}

    def get():
        today = datetime.now(timezone.utc).date()
        if cache["day"] != today:
            from bot.scanner import save, scan
            sc = cfg.get("scanner", {})
            try:
                results, _ = scan(data.ex, sc.get("min_volume_usdt", 1e7), sc.get("max_spread_pct", 0.1),
                                  sc.get("top_n", 20))
                cache["symbols"] = [r.symbol for r in results]
                save(results, data.ex.id)
                cache["day"] = today
                log.info("[crypto] scanner: watching %d coins", len(cache["symbols"]))
            except Exception as e:
                log.error("[crypto] scanner failed (%s); using config symbols", e)
                cache["symbols"] = cache["symbols"] or cfg["markets"]["crypto"]["symbols"]
        return cache["symbols"]
    return get


def kill_switch(cfg: dict, store: StateStore, close_now: bool = True) -> None:
    """Block new trades on every market and tell a running bot to stop. A running bot then
    cancels its orders and closes its Forex positions itself. close_now=True (the --kill command
    and kill_bot.bat) also does that right away from here, in case the bot isn't running."""
    store.set(STOP_FLAG, True)
    for market in cfg["trader"]["markets"]:
        RiskManager(RiskConfig.from_config(cfg, market=market), store, market=market).kill()
    if close_now:
        live = is_live_trading()
        for market in cfg["trader"]["markets"]:
            try:
                if market == "forex":
                    from bot.forex_trader import ForexTrader
                    broker = connect_mt5(cfg, live_allowed=True)     # closing is always allowed
                    ForexTrader(broker, RiskManager(RiskConfig.from_config(cfg, market="forex"), store,
                                                    market="forex"), store, "", {}, []).on_kill()
                elif live:
                    broker = CcxtBroker(live=True) if market == "crypto" else IbkrBroker(market, cfg["markets"][market])
                    log.warning("[%s] cancelled %d open orders", market, broker.cancel_all())
            except Exception as e:
                log.error("[%s] kill switch could not reach the broker: %s", market, e)
    log.warning("KILL SWITCH: all new trades blocked, bot stopping. "
                "To trade again: python -m bot.risk --reset  and  python -m bot.trader --clear-stop")


def print_status(cfg: dict, store: StateStore) -> None:
    print(f"Crypto/stocks: {'LIVE' if is_live_trading() else 'PAPER'} | Forex: "
          f"{'LIVE allowed' if is_forex_live() else 'DEMO only'} | stop requested: {bool(store.get(STOP_FLAG))}"
          f" | paused: {bool(store.get(PAUSE_FLAG))}")
    for market in cfg["trader"]["markets"]:
        rm = RiskManager(RiskConfig.from_config(cfg, market=market), store, market=market)
        acct = store.get(f"account:{market}") or {}
        value = f"value {acct['equity']:.2f} {acct['currency']} ({acct['mode']})" if acct else "no data yet"
        print(f"\n[{market}] {value} | new trades: {rm.blocked_reason(datetime.now(timezone.utc)) or 'allowed'}")
        for p in store.positions(market):
            side = "SHORT " if p.qty < 0 else ""
            print(f"   {side}{p.symbol:<12} qty {abs(p.qty):.8g}  entry {p.entry_price:.8g}  stop {p.stop:.8g}")
    print("\nLast trades:")
    for t in store.trades(10):
        pnl = f" P&L {t['pnl']:+.2f}" if t["pnl"] is not None else ""
        print(f"   {t['time']} {t['market']:<7} {t['side']:<4} {t['symbol']:<12} {t['qty']:.8g} @ {t['price']:.8g}"
              f" ({t['reason']}){pnl}")


TRADING_LOCK_PORT = 8799    # only one copy of the bot may trade at a time (start_bot.bat OR the app)


def acquire_trading_lock():
    """A local port works as a lock on every OS and is released automatically if the bot dies."""
    lock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    try:
        lock.bind(("127.0.0.1", TRADING_LOCK_PORT))
    except OSError:
        lock.close()
        return None
    return lock


def make_notify():
    """Alerts go to every channel you set up (Telegram and/or WhatsApp)."""
    from bot.telegram import Telegram
    from bot.whatsapp import WhatsApp
    tg, wa = Telegram.from_env(), WhatsApp.from_env()
    channels = [c.send for c in (tg, wa) if c]

    def notify(text):
        for send in channels:
            send(text)
    return notify, tg, wa


def run(cfg: dict, store: StateStore, once: bool = False, notify=None,
        stop_event: threading.Event | None = None, status: dict | None = None) -> None:
    """The main loop. stop_event: set it to stop after the current loop (the app's Stop button).
    status: a dict the app reads (last loop time, open errors)."""
    from bot.telegram import Commands, daily_summary
    lock = acquire_trading_lock()
    if lock is None:
        log.error("Another copy of the bot is already trading (start_bot.bat or the WLM Trader app). "
                  "Close it first.")
        if status is not None:
            status["error"] = "another copy of the bot is already trading"
        return
    stop_event = stop_event or threading.Event()
    status = status if status is not None else {}
    live = is_live_trading()
    tc = cfg["trader"]
    tg = wa = None
    if notify is None:
        notify, tg, wa = make_notify()
    mode = "LIVE" if live else "PAPER"
    log.info("=== Auto-Trader starting | crypto/stocks: %s | markets: %s | strategy: %s | Telegram: %s | "
             "WhatsApp: %s ===", mode, ", ".join(tc["markets"]), tc["strategy"], "on" if tg else "off",
             "on" if wa else "off")
    if live:
        log.warning("LIVE TRADING: real orders will be placed.")
    try:
        traders = build_traders(cfg, store, live, notify)
        if tg and not once:
            tg.start_polling(Commands(cfg, store, traders).handle)
        if not once:
            notify(f"🤖 Bot started ({mode}): {', '.join(t.market for t in traders)}.")
        for t in traders:
            try:
                t.reconcile()
            except Exception as e:
                log.error("[%s] reconcile failed: %s", t.market, e)

        if threading.current_thread() is threading.main_thread():
            signal.signal(signal.SIGINT, lambda *_: stop_event.set())   # Ctrl+C = stop after this loop
        while not stop_event.is_set():
            if store.get(STOP_FLAG):
                log.warning("Stop requested (kill switch). Closing Forex positions and exiting.")
                for t in traders:
                    try:
                        t.on_kill()
                    except Exception as e:
                        log.error("[%s] kill switch failed: %s", t.market, e)
                break
            for t in traders:
                try:
                    t.step()
                    status.pop(f"error:{t.market}", None)
                except Exception as e:                       # never crash the whole bot
                    log.exception("[%s] loop error: %s", t.market, e)
                    status[f"error:{t.market}"] = str(e)
                    notify(f"⚠️ Error in {t.market}: {e}")
            status["last_loop"] = now_iso()
            # Once a day (first loop after midnight UTC): send yesterday's P&L summary
            today = datetime.now(timezone.utc).date()
            last = store.get("last_summary_day")
            if last != today.isoformat():
                if last:
                    from datetime import date
                    notify(daily_summary(store, tc["markets"], date.fromisoformat(last)))
                store.set("last_summary_day", today.isoformat())
            if once:
                break
            # sleep in 1 s steps so Stop / Ctrl+C / the kill switch work fast
            for _ in range(int(tc.get("loop_seconds", 300))):
                if stop_event.is_set() or store.get(STOP_FLAG):
                    break
                time.sleep(1)
    finally:
        lock.close()
        log.info("Auto-Trader stopped.")
        if not once:
            notify("🛑 Bot stopped.")
        if tg:
            tg.stop()


def main():
    cfg = load_config()
    parser = argparse.ArgumentParser(description="WeLoveMining Auto-Trader")
    parser.add_argument("--once", action="store_true", help="run one loop and exit")
    parser.add_argument("--status", action="store_true", help="show positions, balances and halts")
    parser.add_argument("--kill", action="store_true", help="KILL SWITCH")
    parser.add_argument("--clear-stop", action="store_true", help="allow the bot to start again after --kill")
    args = parser.parse_args()
    store = StateStore()
    if args.kill:
        kill_switch(cfg, store)
    elif args.status:
        print_status(cfg, store)
    elif args.clear_stop:
        store.set(STOP_FLAG, False)
        print("Stop flag cleared. Also run  python -m bot.risk --reset  if the kill switch was used.")
    else:
        if store.get(STOP_FLAG):
            print("The kill switch was used. Run  python -m bot.trader --clear-stop  first.")
            return
        run(cfg, store, once=args.once)


if __name__ == "__main__":
    main()
