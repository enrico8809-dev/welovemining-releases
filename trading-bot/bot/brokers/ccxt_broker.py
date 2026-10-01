"""Crypto exchange via CCXT (Binance, Luno, VALR...): public prices + LIVE spot orders.

* Market orders on SPOT only. No withdrawals, no margin, no futures.
* A network error after sending an order is never "retried blindly" (that could buy twice):
  we first check with the exchange whether the order went through.
"""
import time
import uuid

import ccxt
import pandas as pd

from bot.brokers.base import Fill, OrderRejected, SpotBroker, closed_only, require_approval
from bot.exchange import create_exchange, with_retry
from bot.logger import get_logger
from bot.risk import Decision
from bot.rules import MarketRules

log = get_logger("broker")


class CcxtBroker(SpotBroker):
    """Crypto exchange. Prices are public; orders need API keys (spot trading permission only)."""
    market = "crypto"

    def __init__(self, exchange_name: str | None = None, live: bool = False, quote: str = "USDT"):
        self.ex = create_exchange(exchange_name, with_keys=live)
        self.live, self.quote = live, quote
        self._markets = None

    def markets(self) -> dict:
        if self._markets is None:
            self._markets = with_retry(self.ex.load_markets)
        return self._markets

    def get_candles(self, symbol, timeframe="1d", limit=400):
        rows = with_retry(self.ex.fetch_ohlcv, symbol, timeframe, limit=limit)
        df = pd.DataFrame(rows, columns=["timestamp", "open", "high", "low", "close", "volume"])
        df.index = pd.to_datetime(df["timestamp"], unit="ms", utc=True)
        return closed_only(df[["open", "high", "low", "close", "volume"]].astype(float), timeframe)

    def get_price(self, symbol):
        return float(with_retry(self.ex.fetch_ticker, symbol)["last"])

    def rules(self, symbol):
        m = self.markets()[symbol]
        step = (m.get("precision") or {}).get("amount")
        if step is not None and self.ex.precisionMode == ccxt.DECIMAL_PLACES:
            step = 10 ** -int(step)
        limits = m.get("limits") or {}
        return MarketRules(min_cost=(limits.get("cost") or {}).get("min") or 5.0,
                           min_amount=(limits.get("amount") or {}).get("min") or 0.0,
                           amount_step=step or 0.00001)

    def get_balance(self):
        bal = with_retry(self.ex.fetch_balance)
        return float((bal.get("free") or {}).get(self.quote) or 0)

    def get_positions(self):
        bal = with_retry(self.ex.fetch_balance)
        return {f"{coin}/{self.quote}": float(qty) for coin, qty in (bal.get("total") or {}).items()
                if coin != self.quote and qty}

    def _order(self, symbol, side, decision, price):
        require_approval(decision)
        if not self.live:
            raise OrderRejected("CcxtBroker is in paper mode: use PaperBroker")
        amount = float(self.ex.amount_to_precision(symbol, decision.amount))
        client_id = f"wlm{uuid.uuid4().hex[:20]}"
        started = self.ex.milliseconds()
        try:
            # clientOrderId (CCXT's standard name) lets us recognise our own order later
            order = self.ex.create_order(symbol, "market", side, amount, None, {"clientOrderId": client_id})
        except (ccxt.NetworkError, ccxt.RequestTimeout) as e:
            # Did it go through anyway? Check our recent trades before doing anything else.
            log.error("%s %s: network error while ordering (%s). Checking with the exchange...", side, symbol, e)
            time.sleep(3)
            return self._find_fill(symbol, side, started)
        except ccxt.InsufficientFunds as e:
            log.error("%s %s rejected: insufficient funds (%s)", side, symbol, e)
            return None
        except ccxt.InvalidOrder as e:
            log.error("%s %s rejected by the exchange: %s", side, symbol, e)
            return None
        filled = float(order.get("filled") or amount)
        avg = float(order.get("average") or order.get("price") or price)
        return self._net_fill(symbol, side, filled, avg, order.get("fees") or [order.get("fee") or {}])

    def _net_fill(self, symbol, side, filled, avg, fees) -> Fill:
        """Binance takes the buy fee IN THE COIN you bought (unless you pay fees in BNB):
        buy 0.001 BTC -> you hold 0.000999. Keep the amount we REALLY hold, and the fee in USDT."""
        base = symbol.split("/")[0]
        qty, fee_quote = filled, 0.0
        for f in fees:
            cost = float(f.get("cost") or 0)
            if f.get("currency") == base:
                if side == "buy":
                    qty -= cost
                fee_quote += cost * avg
            elif f.get("currency") == self.quote:
                fee_quote += cost
            elif cost:                                  # e.g. paid in BNB: approximate at 0.075%
                fee_quote += filled * avg * 0.00075
        return Fill(qty, avg, fee_quote)

    def _find_fill(self, symbol, side, since_ms):
        try:
            trades = with_retry(self.ex.fetch_my_trades, symbol, since_ms)
        except Exception as e:
            log.error("Could not check trades for %s: %s. Reconcile will fix it on restart.", symbol, e)
            return None
        mine = [t for t in trades if t.get("side") == side]
        if not mine:
            log.warning("%s %s did NOT go through", side, symbol)
            return None
        qty = sum(t["amount"] for t in mine)
        avg = sum(t["cost"] for t in mine) / qty
        log.warning("%s %s DID go through: %.8f @ %.8f", side, symbol, qty, avg)
        return self._net_fill(symbol, side, qty, avg, [t.get("fee") or {} for t in mine])

    def _buy(self, symbol, decision, price):
        return self._order(symbol, "buy", decision, price)

    def _sell(self, symbol, decision, price):
        # Never try to sell more than we really have (fees, dust, a manual sale...)
        require_approval(decision)
        free = float((with_retry(self.ex.fetch_balance).get("free") or {}).get(symbol.split("/")[0]) or 0)
        if free < decision.amount:
            log.warning("%s: selling %.8f instead of %.8f (that's what is free)", symbol, free, decision.amount)
            decision = Decision(True, decision.reason, amount=free)
        return self._order(symbol, "sell", decision, price)

    def cancel_all(self):
        if not self.live:
            return 0
        count = 0
        for order in with_retry(self.ex.fetch_open_orders):
            try:
                self.ex.cancel_order(order["id"], order["symbol"])
                count += 1
            except Exception as e:
                log.error("Could not cancel order %s: %s", order.get("id"), e)
        return count
