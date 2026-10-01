"""Forex auto-trader (MetaTrader 5): long AND short, sized in lots, stop-loss held by the broker.

Every loop:
  1. Positions the broker closed on its stop-loss are booked (P&L from MT5's deal history).
  2. Open positions: move the trailing stop AT THE BROKER, close when the signal changes.
  3. Account value -> daily loss / drawdown limits (same Risk Manager as crypto).
  4. New entries only while the market is open (bot/forex_hours.py) and the Risk Manager agrees:
     size from the stop distance, total exposure capped at 1:1, stop-loss sent with the order.
"""
import math
from datetime import datetime, timedelta, timezone

from bot.forex_hours import entry_block_reason
from bot.logger import get_logger
from bot.risk import RiskManager
from bot.storage import Position, StateStore, now_iso
from strategies import load_strategy
from strategies.indicators import atr

log = get_logger("forex")
STALE_TICK = timedelta(minutes=10)      # no tick for this long = that symbol isn't trading now


class ForexTrader:
    market = "forex"

    def __init__(self, broker, risk: RiskManager, store: StateStore, strategy_name: str,
                 strategy_params: dict, symbols: list[str], hours_cfg: dict | None = None,
                 notify=lambda text: None):
        self.broker, self.risk, self.store = broker, risk, store
        self.strategy_name, self.strategy_params = strategy_name, strategy_params
        self.symbols, self.hours_cfg, self.notify = symbols, hours_cfg or {}, notify
        self.mode = broker.mode                 # "demo" or "live"
        self._signals = {}                      # symbol -> (hour, direction, candles)
        self._last_block = ""

    def _now(self) -> datetime:
        return datetime.now(timezone.utc)

    # ------------------------------------------------------------------ signals
    def signal(self, symbol: str):
        """(direction, candles): +1 long, -1 short, 0 flat, from the last CLOSED daily candle.
        Re-checked once an hour (the daily candle closes at 17:00 New York time)."""
        hour = self._now().replace(minute=0, second=0, microsecond=0)
        cached = self._signals.get(symbol)
        if cached and cached[0] == hour:
            return cached[1], cached[2]
        candles = self.broker.get_candles(symbol)
        direction = 0
        if len(candles) >= 50:
            value = load_strategy(self.strategy_name, **self.strategy_params).target_exposure(candles).iloc[-1]
            direction = 1 if value > 0 else -1 if value < 0 else 0
        self._signals[symbol] = (hour, direction, candles)
        return direction, candles

    def _atr(self, candles) -> float:
        value = float(atr(candles, self.risk.config.atr_period).iloc[-1]) if len(candles) else 0.0
        return 0.0 if math.isnan(value) else value

    def exposure(self) -> float:
        """Value of all open Forex positions, in the account currency (for the 1:1 cap)."""
        total = 0.0
        for p in self.store.positions(self.market):
            price = self.broker.get_price(p.symbol)
            rules = self.broker.lot_rules(p.symbol)
            total += abs(p.qty) * rules.contract_size * price * (self.broker.to_account(p.symbol, price) or 0)
        return total

    # ------------------------------------------------------------------ one loop
    def step(self) -> None:
        held = self.broker.get_positions()
        for pos in self.store.positions(self.market):
            try:
                if pos.symbol not in held:
                    self.closed_by_broker(pos)
                else:
                    self.manage_position(pos)
            except Exception as e:
                log.exception("[forex] error managing %s: %s", pos.symbol, e)

        equity = self.broker.get_equity()
        now = self._now()
        self.risk.update_equity(equity, now)
        self.store.record_equity(self.market, equity)
        self.snapshot(equity)

        from bot.trader import PAUSE_FLAG, STOP_FLAG
        if self.store.get(PAUSE_FLAG) or self.store.get(STOP_FLAG):
            return
        block = entry_block_reason(now, self.hours_cfg)
        if block:
            if block != self._last_block:
                log.info("[forex] no new trades: %s", block)
            self._last_block = block
            return
        self._last_block = ""
        open_count = len(self.store.positions(self.market))
        if open_count >= self.risk.config.max_open_trades:
            return
        exposure = self.exposure()
        for symbol in self.symbols:
            if any(p.symbol == symbol for p in self.store.positions(self.market)):
                continue
            try:
                if self.maybe_enter(symbol, equity, exposure):
                    exposure = self.exposure()
            except Exception as e:
                log.exception("[forex] error checking %s: %s", symbol, e)

    def snapshot(self, equity: float) -> None:
        """What the app, Telegram and the dashboard show for this account."""
        self.store.set(f"account:{self.market}", {
            "equity": round(equity, 2), "cash": round(self.broker.get_balance(), 2),
            "currency": self.broker.quote, "mode": self.mode, "updated": now_iso()})

    # ------------------------------------------------------------------ positions
    def manage_position(self, pos: Position) -> None:
        side = "buy" if pos.qty > 0 else "sell"
        want, candles = self.signal(pos.symbol)
        bid, ask, _ = self.broker.quote_tick(pos.symbol)
        price = bid if side == "buy" else ask            # the price we'd close at
        pos.highest = max(pos.highest, price) if side == "buy" else min(pos.highest, price)  # best price so far
        current_atr = self._atr(candles)
        if current_atr > 0:
            rules = self.broker.lot_rules(pos.symbol)
            new_stop = rules.round_price(self.risk.trailing_stop(pos.stop, pos.highest, current_atr, side))
            if new_stop != pos.stop and self.broker.modify_stop(pos.symbol, new_stop):
                log.info("[forex] %s trailing stop %s -> %s", pos.symbol, pos.stop, new_stop)
                pos.stop = new_stop
        self.store.save_position(pos)
        if want != (1 if side == "buy" else -1):
            self.exit(pos, "signal")

    def maybe_enter(self, symbol: str, equity: float, exposure: float) -> bool:
        want, candles = self.signal(symbol)
        wait_key = f"wait_reset:forex:{symbol}"
        if want == 0 or want != self.store.get(wait_key, 0):
            self.store.set(wait_key, 0)          # the signal changed since the last stop-loss
        if want == 0 or self.store.get(wait_key) == want:
            return False
        bid, ask, tick_time = self.broker.quote_tick(symbol)
        if self._now() - tick_time > STALE_TICK:
            return False                         # this symbol isn't trading right now (e.g. gold's daily break)
        side = "buy" if want > 0 else "sell"
        entry = ask if side == "buy" else bid
        rules = self.broker.lot_rules(symbol)
        decision = self.risk.check_forex_entry(
            side, entry, self._atr(candles), equity, exposure, len(self.store.positions(self.market)),
            rules, self.broker.to_account(symbol, entry), self._now(), spread=ask - bid)
        if not decision.approved:
            log.info("[forex] %s %s not approved (%s)", side, symbol, decision.reason)
            return False
        fill = self.broker.place_order(symbol, side, decision, entry)
        if not fill:
            return False
        qty = fill.qty if side == "buy" else -fill.qty
        self.store.save_position(Position(self.market, symbol, qty, fill.price, decision.stop_price,
                                          fill.price, now_iso(), self.strategy_name))
        self.store.set(f"mt5_ticket:{symbol}", self.broker.position_ticket(symbol))
        self.store.record_trade(self.market, symbol, side, fill.qty, fill.price, fill.fee, "signal", None, self.mode)
        msg = (f"{'BUY' if side == 'buy' else 'SELL (short)'} {symbol} [forex, {self.mode}]: {fill.qty:g} lots @ "
               f"{fill.price:.6g}, stop {decision.stop_price:.6g}")
        log.info(msg)
        self.notify(msg)
        return True

    def exit(self, pos: Position, reason: str) -> None:
        decision = self.risk.check_forex_close(pos.qty, self.broker.lot_rules(pos.symbol))
        if not decision.approved:
            log.warning("[forex] cannot close %s (%s)", pos.symbol, decision.reason)
            return
        fill = self.broker.close_position(pos.symbol, decision, pos.entry_price)
        if fill:
            self._book_close(pos, fill, reason)

    def closed_by_broker(self, pos: Position) -> None:
        """The broker's stop-loss (or you, manually) closed it: book the result from MT5's history."""
        ticket = self.store.get(f"mt5_ticket:{pos.symbol}")
        fill = self.broker.position_result(ticket) if ticket else None
        if fill is None:
            log.warning("[forex] %s is no longer open and has no closing deal; removing it", pos.symbol)
            self.store.delete_position(self.market, pos.symbol)
            return
        self._book_close(pos, fill, fill.reason or "closed")
        if fill.reason == "stop_loss":
            self.store.set(f"wait_reset:forex:{pos.symbol}", 1 if pos.qty > 0 else -1)

    def _book_close(self, pos: Position, fill, reason: str) -> None:
        pnl = fill.pnl if fill.pnl is not None else 0.0
        close_side = "sell" if pos.qty > 0 else "buy"
        self.store.delete_position(self.market, pos.symbol)
        self.store.set(f"mt5_ticket:{pos.symbol}", None)
        self.store.record_trade(self.market, pos.symbol, close_side, fill.qty, fill.price, fill.fee,
                                reason, pnl, self.mode)
        self.risk.record_closed_trade(pnl, stopped_out=(reason == "stop_loss"), now=self._now())
        msg = (f"CLOSE {pos.symbol} [forex, {self.mode}] ({reason}): {fill.qty:g} lots @ {fill.price:.6g}, "
               f"P&L {pnl:+.2f} {self.broker.quote}")
        log.info(msg)
        self.notify(msg)

    # ------------------------------------------------------------------ startup / kill switch
    def reconcile(self) -> None:
        """After a restart: book positions closed while the bot was off, adopt bot positions
        the database doesn't know (they keep their broker stop-loss)."""
        held = self.broker.get_positions()
        for pos in self.store.positions(self.market):
            if pos.symbol not in held:
                self.closed_by_broker(pos)
        known = {p.symbol for p in self.store.positions(self.market)}
        for symbol in held:
            if symbol not in known:
                info = self.broker.position_info(symbol)
                self.store.save_position(Position(self.market, symbol, held[symbol], info.price_open,
                                                  info.sl, info.price_open, now_iso(), self.strategy_name))
                self.store.set(f"mt5_ticket:{symbol}", info.ticket)
                log.warning("[forex] reconcile: adopted %s (%g lots, stop %s)", symbol, held[symbol], info.sl)
        equity = self.broker.get_equity()
        self.snapshot(equity)
        log.info("[forex] reconcile done (%s): equity %.2f %s, %d positions", self.mode, equity,
                 self.broker.quote, len(self.store.positions(self.market)))

    def on_kill(self) -> None:
        """Kill switch: close every bot position and cancel pending orders."""
        closed, cancelled = self.broker.close_all(), self.broker.cancel_all()
        for pos in self.store.positions(self.market):
            self.closed_by_broker(pos)
        log.warning("[forex] kill switch: closed %d positions, cancelled %d orders", closed, cancelled)
