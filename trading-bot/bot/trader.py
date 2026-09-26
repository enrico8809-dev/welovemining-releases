"""Auto-Trader: the main loop that runs 24/7 on your PC.

Every loop (default every 5 minutes), for each enabled market (crypto / stocks / forex):
  1. Get the coins/stocks to watch (crypto: the Coin Scanner's list, re-scanned daily).
  2. For every open position: check the stop-loss / trailing stop with the live price,
     and sell if the strategy says "out".
  3. For every other symbol: if the strategy (default: regime) says "in" on the last
     CLOSED candle, ask the Risk Manager. Only approved orders are placed.
  4. Update the account value (for the daily loss / drawdown limits) and save everything.

PAPER mode (default, LIVE_TRADING=false in .env): live prices, simulated fills with fees.
LIVE mode (LIVE_TRADING=true): real orders. Crypto via your exchange's API keys;
stocks/Forex via Interactive Brokers (TWS / IB Gateway must be running).

    python -m bot.trader              start the bot (Ctrl+C to stop)
    python -m bot.trader --once       run one loop and exit (good for testing)
    python -m bot.trader --status     show positions, balances and halts
    python -m bot.trader --kill       KILL SWITCH: cancel open orders, block new trades, stop the bot
"""
import argparse
import math
import signal
import time
from datetime import datetime, timezone

from bot.broker import Broker, CcxtBroker, IbkrBroker, PaperBroker, YahooData
from bot.config import load_config, is_live_trading
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
        cash, holdings = self.broker.balances()
        value = cash
        for p in self.store.positions(self.market):
            value += p.qty * prices.get(p.symbol, p.entry_price)
        return value

    def tradeable(self, symbol: str) -> bool:
        """Spot/cash only: with USD cash we can only BUY pairs quoted in USD (EUR/USD yes,
        USD/JPY no - that would mean borrowing yen). Stocks and USDT crypto pairs are fine."""
        if self.market == "forex":
            return symbol.replace("=X", "").endswith("USD")
        return True

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

        # 3) Look for new entries
        if self.store.get(PAUSE_FLAG) or self.store.get(STOP_FLAG):
            return
        held = {p.symbol for p in self.store.positions(self.market)}
        if len(held) >= self.risk.config.max_open_trades:
            return                                # no room for another trade: nothing to check
        for symbol in self.symbols_fn():
            if symbol in held or not self.tradeable(symbol):
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
        candles = self.broker.candles(symbol)
        want_in = False
        if len(candles) >= 50:
            strategy = load_strategy(self.strategy_name, **self.strategy_params)
            want_in = bool(strategy.target_exposure(candles).iloc[-1] > 0)
        self._signals[symbol] = (today, want_in, candles)
        return want_in, candles

    def manage_position(self, pos: Position, prices: dict) -> None:
        price = self.broker.price(pos.symbol)
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
        price = self.broker.price(symbol)
        current_atr = float(atr(candles, self.risk.config.atr_period).iloc[-1])
        if math.isnan(current_atr):
            return
        cash, _ = self.broker.balances()
        decision = self.risk.check_buy(price, current_atr, equity, cash,
                                       open_trades=len(self.store.positions(self.market)),
                                       rules=self.broker.rules(symbol), now=self._now())
        if not decision.approved:
            log.info("[%s] %s: buy not approved (%s)", self.market, symbol, decision.reason)
            return
        fill = self.broker.buy(symbol, decision, price)
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
        fill = self.broker.sell(pos.symbol, decision, price)
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
        cash, holdings = self.broker.balances()
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
def build_traders(cfg: dict, store: StateStore, live: bool, notify=lambda t: None) -> list[MarketTrader]:
    tc = cfg["trader"]
    mode = "live" if live else "paper"
    strategy_params = {}
    if tc["strategy"] == "regime":
        from backtest.run import config_params
        strategy_params = config_params(cfg, "regime")
    traders = []
    for market in tc["markets"]:
        mcfg = cfg["markets"][market]
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
        traders.append(MarketTrader(market, broker, risk, store, tc["strategy"], strategy_params,
                                    symbols_for(market, cfg, data), mode, notify))
    return traders


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


def kill_switch(cfg: dict, store: StateStore) -> None:
    """Cancel all open orders, block new trades on every market and tell a running bot to stop."""
    store.set(STOP_FLAG, True)
    live = is_live_trading()
    for market in cfg["trader"]["markets"]:
        RiskManager(RiskConfig.from_config(cfg), store, market=market).kill()
        if live:
            try:
                broker = CcxtBroker(live=True) if market == "crypto" else IbkrBroker(market, cfg["markets"][market])
                log.warning("[%s] cancelled %d open orders", market, broker.cancel_all())
            except Exception as e:
                log.error("[%s] could not cancel orders: %s", market, e)
    log.warning("KILL SWITCH: all new trades blocked, bot stopping. "
                "To trade again: python -m bot.risk --reset  and  python -m bot.trader --clear-stop")


def print_status(cfg: dict, store: StateStore) -> None:
    print(f"Mode: {'LIVE' if is_live_trading() else 'PAPER'} | stop requested: {bool(store.get(STOP_FLAG))}"
          f" | paused: {bool(store.get(PAUSE_FLAG))}")
    for market in cfg["trader"]["markets"]:
        rm = RiskManager(RiskConfig.from_config(cfg), store, market=market)
        paper = store.get(f"paper:{market}")
        cash = f"{paper['cash']:.2f}" if paper else "(live: see exchange)"
        print(f"\n[{market}] cash {cash} | new buys: {rm.blocked_reason(datetime.now(timezone.utc)) or 'allowed'}")
        for p in store.positions(market):
            print(f"   {p.symbol:<12} qty {p.qty:.8g}  entry {p.entry_price:.8g}  stop {p.stop:.8g}")
    print("\nLast trades:")
    for t in store.trades(10):
        pnl = f" P&L {t['pnl']:+.2f}" if t["pnl"] is not None else ""
        print(f"   {t['time']} {t['market']:<7} {t['side']:<4} {t['symbol']:<12} {t['qty']:.8g} @ {t['price']:.8g}"
              f" ({t['reason']}){pnl}")


def run(cfg: dict, store: StateStore, once: bool = False, notify=lambda t: None) -> None:
    live = is_live_trading()
    tc = cfg["trader"]
    log.info("=== Auto-Trader starting in %s mode | markets: %s | strategy: %s ===",
             "LIVE" if live else "PAPER", ", ".join(tc["markets"]), tc["strategy"])
    if live:
        log.warning("LIVE TRADING: real orders will be placed.")
    traders = build_traders(cfg, store, live, notify)
    for t in traders:
        try:
            t.reconcile()
        except Exception as e:
            log.error("[%s] reconcile failed: %s", t.market, e)

    stop = {"now": False}
    signal.signal(signal.SIGINT, lambda *_: stop.update(now=True))   # Ctrl+C = stop after this loop
    while not stop["now"]:
        if store.get(STOP_FLAG):
            log.warning("Stop requested (kill switch). Exiting.")
            break
        for t in traders:
            try:
                t.step()
            except Exception as e:                       # never crash the whole bot
                log.exception("[%s] loop error: %s", t.market, e)
                notify(f"Error in {t.market}: {e}")
        if once:
            break
        for _ in range(int(tc.get("loop_seconds", 300))):   # sleep in 1 s steps so Ctrl+C/kill work fast
            if stop["now"] or store.get(STOP_FLAG):
                break
            time.sleep(1)
    log.info("Auto-Trader stopped.")


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
