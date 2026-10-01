"""Forex and gold through MetaTrader 5 (official `MetaTrader5` Python package, Windows only).

Needs: the MT5 terminal installed on this PC and logged in to your broker, with
"Algo Trading" switched on. Login, password and server go in .env (MT5_LOGIN, MT5_PASSWORD,
MT5_SERVER); they are never written to the logs.

Safety
  * DEMO by default: on a REAL account the broker refuses to start unless
    FOREX_LIVE_TRADING=true is set in .env.
  * Every order carries its stop-loss TO THE BROKER (`sl` in the order). No stop = no order.
  * Only positions with the bot's magic number are touched; your manual trades are left alone.
  * A failed order is never re-sent blindly: we first look for the position it may have opened.
"""
import os
import time
import uuid
from datetime import datetime, timedelta, timezone

import pandas as pd

from bot.brokers.base import Broker, Fill, OrderRejected, require_approval
from bot.logger import get_logger
from bot.rules import LotRules

log = get_logger("mt5")

TIMEFRAMES = {"5m": "TIMEFRAME_M5", "15m": "TIMEFRAME_M15", "30m": "TIMEFRAME_M30",
              "1h": "TIMEFRAME_H1", "4h": "TIMEFRAME_H4", "1d": "TIMEFRAME_D1"}
OK_CODES = (10008, 10009, 10010)       # TRADE_RETCODE_PLACED, _DONE, _DONE_PARTIAL
DEAL_REASON_SL = 4                     # the deal was the broker's stop-loss


def load_mt5():
    try:
        import MetaTrader5 as mt5
    except ImportError as e:
        raise ImportError("MetaTrader5 package not installed (Windows only): run setup.bat again") from e
    return mt5


class Mt5Broker(Broker):
    market = "forex"

    def __init__(self, live_allowed: bool = False, magic: int = 880088, suffix: str = "",
                 deviation: int = 20, mt5_module=None):
        self.mt5 = mt5_module or load_mt5()
        self.magic, self.suffix, self.deviation = magic, suffix, deviation
        self._connect()
        info = self.mt5.account_info()
        if info is None:
            raise ConnectionError(f"MT5: no account info ({self.mt5.last_error()})")
        self.quote = info.currency
        self.is_demo = info.trade_mode == self.mt5.ACCOUNT_TRADE_MODE_DEMO
        if not self.is_demo and not live_allowed:
            self.mt5.shutdown()
            raise PermissionError("MT5 is logged in to a REAL account but FOREX_LIVE_TRADING is not true. "
                                  "Log in to a DEMO account, or set FOREX_LIVE_TRADING=true when you're ready.")
        self.live = not self.is_demo
        self.mode = "live" if self.live else "demo"
        log.info("MT5 connected: %s account on %s, currency %s, broker leverage 1:%s (the bot caps its own)",
                 self.mode.upper(), info.server, info.currency, info.leverage)

    # ------------------------------------------------------------------ connection
    def _connect(self) -> None:
        login, password = os.getenv("MT5_LOGIN"), os.getenv("MT5_PASSWORD")
        kwargs = {"timeout": 60_000}
        if os.getenv("MT5_PATH"):
            kwargs["path"] = os.getenv("MT5_PATH")
        if login and password:
            kwargs.update(login=int(login), password=password, server=os.getenv("MT5_SERVER", ""))
        for wait in (0, 2, 4, 8, 16):
            time.sleep(wait)
            if self.mt5.initialize(**kwargs):
                return
            log.warning("MT5 connect failed (%s); retrying", self.mt5.last_error())
        raise ConnectionError("MT5: could not connect. Is the terminal installed, running and logged in?")

    def _read(self, fn, *args, **kwargs):
        """Call a READ function; on a dropped connection reconnect once and try again."""
        result = fn(*args, **kwargs)
        if result is None:
            log.warning("MT5 %s returned nothing (%s); reconnecting", fn.__name__, self.mt5.last_error())
            self._connect()
            result = fn(*args, **kwargs)
        return result

    def _sym(self, symbol: str) -> str:
        """Bot symbol -> broker symbol (some brokers add a suffix, e.g. EURUSD.m)."""
        name = symbol + self.suffix
        self.mt5.symbol_select(name, True)
        return name

    # ------------------------------------------------------------------ market data
    def get_candles(self, symbol, timeframe="1d", limit=400):
        tf = getattr(self.mt5, TIMEFRAMES[timeframe])
        # start_pos=1 skips the candle that is still forming: closed candles only
        rates = self._read(self.mt5.copy_rates_from_pos, self._sym(symbol), tf, 1, limit)
        return rates_to_frame(rates)

    def quote_tick(self, symbol):
        """(bid, ask, time of the last tick in UTC)."""
        tick = self._read(self.mt5.symbol_info_tick, self._sym(symbol))
        return float(tick.bid), float(tick.ask), datetime.fromtimestamp(tick.time, timezone.utc)

    def get_price(self, symbol):
        return self.quote_tick(symbol)[0]

    def lot_rules(self, symbol) -> LotRules:
        return lot_rules_from_info(symbol, self._read(self.mt5.symbol_info, self._sym(symbol)))

    def rules(self, symbol):
        return self.lot_rules(symbol)

    def to_account(self, symbol: str, price: float) -> float | None:
        """Account-currency value of 1 unit of the symbol's profit currency."""
        rules = self.lot_rules(symbol)
        direct = rules.to_account(price, self.quote)
        if direct is not None:
            return direct
        ccy = rules.profit_currency                     # a cross, e.g. EURGBP -> GBP
        for pair, invert in ((ccy + self.quote, False), (self.quote + ccy, True)):
            info = self.mt5.symbol_info(pair + self.suffix)
            if info is not None:
                bid = self.quote_tick(pair)[0]
                return 1 / bid if invert else bid
        return None

    # ------------------------------------------------------------------ account
    def get_balance(self):
        return float(self._read(self.mt5.account_info).balance)

    def get_equity(self):
        return float(self._read(self.mt5.account_info).equity)

    def _my_positions(self, symbol: str | None = None) -> list:
        found = self.mt5.positions_get(symbol=self._sym(symbol)) if symbol else self.mt5.positions_get()
        return [p for p in (found or ()) if p.magic == self.magic]

    def get_positions(self):
        """{symbol: lots}, negative = short. Only the bot's own positions."""
        out = {}
        for p in self._my_positions():
            sign = 1 if p.type == self.mt5.POSITION_TYPE_BUY else -1
            symbol = p.symbol[: len(p.symbol) - len(self.suffix)] if self.suffix else p.symbol
            out[symbol] = out.get(symbol, 0.0) + sign * p.volume
        return out

    # ------------------------------------------------------------------ orders
    def _filling(self, symbol: str) -> int:
        mode = self.mt5.symbol_info(self._sym(symbol)).filling_mode
        if mode & 1:
            return self.mt5.ORDER_FILLING_FOK
        if mode & 2:
            return self.mt5.ORDER_FILLING_IOC
        return self.mt5.ORDER_FILLING_RETURN

    def place_order(self, symbol, side, decision, price):
        """Open a position WITH its stop-loss at the broker."""
        require_approval(decision)
        if side != decision.side:
            raise OrderRejected(f"side {side} does not match the approved side {decision.side}")
        if not decision.stop_price or decision.stop_price <= 0:
            raise OrderRejected("no stop-loss: every Forex order must carry one")
        bid, ask, _ = self.quote_tick(symbol)
        entry = ask if side == "buy" else bid
        if (side == "buy" and decision.stop_price >= bid) or (side == "sell" and decision.stop_price <= ask):
            raise OrderRejected(f"stop {decision.stop_price} is on the wrong side of the price")
        tag = f"wlm-{uuid.uuid4().hex[:10]}"
        request = {
            "action": self.mt5.TRADE_ACTION_DEAL, "symbol": self._sym(symbol), "volume": float(decision.amount),
            "type": self.mt5.ORDER_TYPE_BUY if side == "buy" else self.mt5.ORDER_TYPE_SELL,
            "price": entry, "sl": float(decision.stop_price), "deviation": self.deviation,
            "magic": self.magic, "comment": tag, "type_time": self.mt5.ORDER_TIME_GTC,
            "type_filling": self._filling(symbol),
        }
        result = self.mt5.order_send(request)
        if result is None:
            # The terminal lost the request. Did the position open anyway? Look before anything else.
            log.error("%s %s: no answer from MT5 (%s). Checking positions...", side, symbol, self.mt5.last_error())
            time.sleep(3)
            for p in self._my_positions(symbol):
                if p.comment == tag:
                    log.warning("%s %s DID go through: %.2f lots @ %s", side, symbol, p.volume, p.price_open)
                    return Fill(p.volume, p.price_open, 0.0)
            log.warning("%s %s did NOT go through", side, symbol)
            return None
        if result.retcode not in OK_CODES:
            log.error("%s %s rejected by the broker: %s (%s)", side, symbol, result.comment, result.retcode)
            return None
        return Fill(float(result.volume), float(result.price), self._deal_costs(result.deal))

    def _deal_costs(self, deal_ticket) -> float:
        deals = self.mt5.history_deals_get(ticket=deal_ticket) or ()
        return -sum(d.commission + getattr(d, "fee", 0.0) for d in deals)

    def close_position(self, symbol, decision, price):
        """Close the bot's position on this symbol (market order in the opposite direction)."""
        require_approval(decision)
        positions = self._my_positions(symbol)
        if not positions:
            return None
        p = positions[0]
        is_buy = p.type == self.mt5.POSITION_TYPE_BUY
        bid, ask, _ = self.quote_tick(symbol)
        request = {
            "action": self.mt5.TRADE_ACTION_DEAL, "symbol": p.symbol, "position": p.ticket,
            "volume": float(min(decision.amount, p.volume)),
            "type": self.mt5.ORDER_TYPE_SELL if is_buy else self.mt5.ORDER_TYPE_BUY,
            "price": bid if is_buy else ask, "deviation": self.deviation, "magic": self.magic,
            "comment": "wlm-close", "type_time": self.mt5.ORDER_TIME_GTC, "type_filling": self._filling(symbol),
        }
        result = self.mt5.order_send(request)
        if result is None or result.retcode not in OK_CODES:
            log.error("Close %s failed: %s", symbol, result.comment if result else self.mt5.last_error())
            return None
        return self.position_result(p.ticket) or Fill(float(result.volume), float(result.price), 0.0)

    def position_result(self, position_ticket: int) -> Fill | None:
        """Net result of a closed position from the deal history: exit price, costs and P&L
        (profit + swap + commission, in the account currency). reason 'stop_loss' if the broker's SL hit."""
        deals = self.mt5.history_deals_get(position=position_ticket) or ()
        exits = [d for d in deals if d.entry == self.mt5.DEAL_ENTRY_OUT]
        if not exits:
            return None
        costs = -sum(d.commission + getattr(d, "fee", 0.0) for d in deals)
        pnl = sum(d.profit + d.swap + d.commission + getattr(d, "fee", 0.0) for d in deals)
        reason = "stop_loss" if exits[-1].reason == DEAL_REASON_SL else "closed"
        return Fill(sum(d.volume for d in exits), exits[-1].price, costs, pnl, reason)

    def position_ticket(self, symbol: str) -> int | None:
        positions = self._my_positions(symbol)
        return positions[0].ticket if positions else None

    def position_info(self, symbol: str):
        """The bot's open MT5 position on this symbol (ticket, price_open, sl, volume...) or None."""
        positions = self._my_positions(symbol)
        return positions[0] if positions else None

    def modify_stop(self, symbol: str, stop: float) -> bool:
        """Move the stop-loss at the broker (trailing stop)."""
        positions = self._my_positions(symbol)
        if not positions:
            return False
        p = positions[0]
        result = self.mt5.order_send({"action": self.mt5.TRADE_ACTION_SLTP, "symbol": p.symbol,
                                      "position": p.ticket, "sl": float(stop), "tp": p.tp, "magic": self.magic})
        if result is None or result.retcode not in OK_CODES:
            log.warning("Could not move the stop on %s: %s", symbol, result.comment if result else "no answer")
            return False
        return True

    def cancel_all(self):
        """Cancel the bot's pending orders (it normally has none: it uses market orders)."""
        count = 0
        for order in self.mt5.orders_get() or ():
            if order.magic == self.magic:
                result = self.mt5.order_send({"action": self.mt5.TRADE_ACTION_REMOVE, "order": order.ticket})
                count += bool(result and result.retcode in OK_CODES)
        return count

    def close_all(self) -> int:
        """Kill switch: close every position the bot opened."""
        from bot.risk import Decision
        closed = 0
        for symbol, lots in self.get_positions().items():
            if self.close_position(symbol, Decision(True, "kill switch", amount=abs(lots)), 0):
                closed += 1
        return closed

    def history_rates(self, symbol: str, timeframe: str, start: datetime, end: datetime | None = None):
        """Candles between two dates (for the backtester's cache)."""
        tf = getattr(self.mt5, TIMEFRAMES[timeframe])
        end = end or datetime.now(timezone.utc) - timedelta(days=1)
        return rates_to_frame(self._read(self.mt5.copy_rates_range, self._sym(symbol), tf, start, end))


def rates_to_frame(rates) -> pd.DataFrame:
    """MT5 rates (time, open, high, low, close, tick_volume, spread, real_volume) -> candles.
    Prices are BID prices; `spread` is in points. Times are the broker's server time."""
    df = pd.DataFrame(rates)
    if df.empty:
        return pd.DataFrame(columns=["open", "high", "low", "close", "volume", "spread"])
    df.index = pd.to_datetime(df["time"], unit="s", utc=True)
    df = df.rename(columns={"tick_volume": "volume"})
    return df[["open", "high", "low", "close", "volume", "spread"]].astype(float)


def lot_rules_from_info(symbol: str, info) -> LotRules:
    return LotRules(
        symbol=symbol, contract_size=info.trade_contract_size, volume_min=info.volume_min,
        volume_step=info.volume_step, volume_max=info.volume_max, point=info.point, digits=info.digits,
        stops_level=info.trade_stops_level, base_currency=info.currency_base,
        profit_currency=info.currency_profit, swap_long=info.swap_long, swap_short=info.swap_short,
        swap_triple_day=info.swap_rollover3days)
