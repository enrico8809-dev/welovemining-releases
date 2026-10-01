"""PAPER trading: live prices from a real broker, simulated fills with fees and slippage.
Balances are kept in the SQLite database, so they survive restarts."""
from bot.brokers.base import Broker, Fill, SpotBroker, require_approval
from bot.logger import get_logger

log = get_logger("broker")


class PaperBroker(SpotBroker):
    """Simulated spot trading with live prices. Fees and slippage are charged like the backtester."""

    def __init__(self, data: Broker, store, start_cash: float, fee_pct: float,
                 slippage_pct: float, min_fee: float = 0.0):
        self.data, self.store = data, store
        self.market, self.quote = data.market, data.quote
        self.fee_pct, self.slip, self.min_fee = fee_pct / 100, slippage_pct / 100, min_fee
        self.key = f"paper:{self.market}"
        if self.store.get(self.key) is None:
            self.store.set(self.key, {"cash": start_cash, "holdings": {}})

    def get_candles(self, symbol, timeframe="1d", limit=400):
        return self.data.get_candles(symbol, timeframe, limit)

    def get_price(self, symbol):
        return self.data.get_price(symbol)

    def rules(self, symbol):
        return self.data.rules(symbol)

    def get_balance(self):
        return self.store.get(self.key)["cash"]

    def get_positions(self):
        return dict(self.store.get(self.key)["holdings"])

    def _fee(self, value):
        return max(value * self.fee_pct, self.min_fee)

    def _buy(self, symbol, decision, price):
        require_approval(decision)
        fill_price = price * (1 + self.slip)
        s = self.store.get(self.key)
        cost = decision.amount * fill_price
        fee = self._fee(cost)
        if cost + fee > s["cash"] + 1e-9:
            log.error("[paper] not enough cash to buy %s", symbol)
            return None
        s["cash"] -= cost + fee
        s["holdings"][symbol] = s["holdings"].get(symbol, 0) + decision.amount
        self.store.set(self.key, s)
        return Fill(decision.amount, fill_price, fee)

    def _sell(self, symbol, decision, price):
        require_approval(decision)
        fill_price = price * (1 - self.slip)
        s = self.store.get(self.key)
        qty = min(decision.amount, s["holdings"].get(symbol, 0))
        if qty <= 0:
            return None
        value = qty * fill_price
        fee = self._fee(value)
        s["cash"] += value - fee
        left = s["holdings"].get(symbol, 0) - qty
        if left > 1e-12:
            s["holdings"][symbol] = left
        else:
            s["holdings"].pop(symbol, None)
        self.store.set(self.key, s)
        return Fill(qty, fill_price, fee)
