"""Brokers: where prices come from and where orders go.

    CcxtBroker     crypto exchange via CCXT (Binance, Luno, VALR...): prices + LIVE orders
    YahooData      stock/Forex prices from Yahoo Finance (no orders)
    IbkrBroker     Interactive Brokers LIVE orders (stocks, ETFs, Forex); prices from Yahoo
    PaperBroker    PAPER trading: live prices from any of the above, simulated fills with
                   fees and slippage, balances kept in the SQLite database

Safety
  * Orders only go through `buy()` / `sell()`, and they refuse anything that was not
    approved by the Risk Manager (a Decision with approved=True). There is no other way.
  * Market orders on SPOT only. No withdrawals, no margin, no futures anywhere in this file.
  * A network error after sending an order is never "retried blindly" (that could buy twice):
    we first check with the exchange whether the order went through.
"""
import time
import uuid
from dataclasses import dataclass

import ccxt
import pandas as pd

from bot.exchange import create_exchange, with_retry
from bot.logger import get_logger
from bot.risk import Decision
from bot.rules import MarketRules

log = get_logger("broker")


@dataclass
class Fill:
    qty: float
    price: float
    fee: float          # in the quote currency (USDT / USD)


class OrderRejected(Exception):
    pass


def require_approval(decision: Decision) -> None:
    if not isinstance(decision, Decision) or not decision.approved:
        raise OrderRejected("order not approved by the Risk Manager")


def closed_only(df: pd.DataFrame, timeframe: str) -> pd.DataFrame:
    """Drop the candle that is still open (its close time is in the future)."""
    step = pd.Timedelta(timeframe.replace("d", "D"))
    now = pd.Timestamp.now(tz="UTC")
    return df[df.index + step <= now]


class Broker:
    market = ""
    quote = "USDT"
    live = False

    def candles(self, symbol: str, timeframe: str = "1d", limit: int = 400) -> pd.DataFrame: ...
    def price(self, symbol: str) -> float: ...
    def rules(self, symbol: str) -> MarketRules: ...
    def balances(self) -> tuple[float, dict]: ...          # (cash in quote currency, {symbol: qty})
    def buy(self, symbol: str, decision: Decision, price: float) -> Fill | None: ...
    def sell(self, symbol: str, decision: Decision, price: float) -> Fill | None: ...
    def cancel_all(self) -> int:
        return 0


# --------------------------------------------------------------------------- crypto
class CcxtBroker(Broker):
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

    def candles(self, symbol, timeframe="1d", limit=400):
        rows = with_retry(self.ex.fetch_ohlcv, symbol, timeframe, limit=limit)
        df = pd.DataFrame(rows, columns=["timestamp", "open", "high", "low", "close", "volume"])
        df.index = pd.to_datetime(df["timestamp"], unit="ms", utc=True)
        return closed_only(df[["open", "high", "low", "close", "volume"]].astype(float), timeframe)

    def price(self, symbol):
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

    def balances(self):
        bal = with_retry(self.ex.fetch_balance)
        cash = float((bal.get("free") or {}).get(self.quote) or 0)
        holdings = {f"{coin}/{self.quote}": float(qty) for coin, qty in (bal.get("total") or {}).items()
                    if coin != self.quote and qty}
        return cash, holdings

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

    def buy(self, symbol, decision, price):
        return self._order(symbol, "buy", decision, price)

    def sell(self, symbol, decision, price):
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


# --------------------------------------------------------------------------- stocks / forex
class YahooData(Broker):
    """Stock and Forex prices from Yahoo Finance (daily candles). No orders."""

    def __init__(self, market: str, market_cfg: dict):
        self.market, self.cfg = market, market_cfg
        self.quote = "USD"

    def candles(self, symbol, timeframe="1d", limit=400):
        import yfinance as yf
        raw = yf.download(symbol, period="2y", interval=timeframe, auto_adjust=True,
                          progress=False, multi_level_index=False)
        if raw is None or raw.empty:
            raise ValueError(f"No Yahoo data for {symbol}")
        idx = raw.index.tz_localize("UTC") if raw.index.tz is None else raw.index.tz_convert("UTC")
        df = pd.DataFrame({c.lower(): raw[c].to_numpy() for c in ["Open", "High", "Low", "Close", "Volume"]},
                          index=idx).dropna()
        return closed_only(df, timeframe).tail(limit)

    def price(self, symbol):
        import yfinance as yf
        return float(yf.Ticker(symbol).fast_info["last_price"])

    def rules(self, symbol):
        return MarketRules(min_cost=self.cfg.get("min_order", 1), amount_step=self.cfg.get("amount_step", 0.0001))


def ibkr_contract(symbol: str, market: str):
    """'EURUSD=X' -> Forex('EURUSD'), 'SPY' -> Stock('SPY', 'SMART', 'USD')."""
    from ib_async import Forex, Stock
    if market == "forex":
        return Forex(symbol.replace("=X", ""))
    return Stock(symbol, "SMART", "USD")


class IbkrBroker(YahooData):
    """Interactive Brokers (TWS or IB Gateway must be running and logged in).
    Use a CASH account (no margin). Prices/candles come from Yahoo; orders and balances from IBKR."""

    def __init__(self, market: str, market_cfg: dict, host="127.0.0.1", port=7497, client_id=17):
        super().__init__(market, market_cfg)
        from ib_async import IB
        self.live = True
        self.ib = IB()
        self.ib.connect(host, port, clientId=client_id, timeout=15)
        log.info("Connected to Interactive Brokers at %s:%s", host, port)

    def balances(self):
        cash = 0.0
        for v in self.ib.accountSummary():
            if v.tag == "TotalCashValue" and v.currency == "USD":
                cash = float(v.value)
        holdings = {}
        if self.market == "forex":
            for v in self.ib.accountValues():
                if v.tag == "CashBalance" and v.currency not in ("USD", "BASE"):
                    holdings[f"{v.currency}USD=X"] = float(v.value)
        else:
            for p in self.ib.positions():
                holdings[p.contract.symbol] = float(p.position)
        return cash, holdings

    def _order(self, symbol, action, decision):
        require_approval(decision)
        from ib_async import MarketOrder
        contract = ibkr_contract(symbol, self.market)
        self.ib.qualifyContracts(contract)
        trade = self.ib.placeOrder(contract, MarketOrder(action, decision.amount))
        for _ in range(60):                         # wait up to ~60 s for the fill
            self.ib.sleep(1)
            if trade.isDone():
                break
        if trade.orderStatus.status != "Filled":
            log.error("%s %s not filled: %s", action, symbol, trade.orderStatus.status)
            return None
        fee = sum(f.commissionReport.commission or 0 for f in trade.fills)
        return Fill(float(trade.orderStatus.filled), float(trade.orderStatus.avgFillPrice), float(fee))

    def buy(self, symbol, decision, price):
        return self._order(symbol, "BUY", decision)

    def sell(self, symbol, decision, price):
        return self._order(symbol, "SELL", decision)

    def cancel_all(self):
        self.ib.reqGlobalCancel()
        return len(self.ib.openOrders())


# --------------------------------------------------------------------------- paper
class PaperBroker(Broker):
    """Simulated trading with live prices. Fees and slippage are charged like the backtester."""

    def __init__(self, data: Broker, store, start_cash: float, fee_pct: float,
                 slippage_pct: float, min_fee: float = 0.0):
        self.data, self.store = data, store
        self.market, self.quote = data.market, data.quote
        self.fee_pct, self.slip, self.min_fee = fee_pct / 100, slippage_pct / 100, min_fee
        self.key = f"paper:{self.market}"
        if self.store.get(self.key) is None:
            self.store.set(self.key, {"cash": start_cash, "holdings": {}})

    def candles(self, symbol, timeframe="1d", limit=400):
        return self.data.candles(symbol, timeframe, limit)

    def price(self, symbol):
        return self.data.price(symbol)

    def rules(self, symbol):
        return self.data.rules(symbol)

    def balances(self):
        s = self.store.get(self.key)
        return s["cash"], dict(s["holdings"])

    def _fee(self, value):
        return max(value * self.fee_pct, self.min_fee)

    def buy(self, symbol, decision, price):
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

    def sell(self, symbol, decision, price):
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
