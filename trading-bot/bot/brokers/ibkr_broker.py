"""Stocks and ETFs: prices from Yahoo Finance, LIVE orders through Interactive Brokers.

    YahooData      stock prices and daily candles from Yahoo (no orders; used for PAPER)
    IbkrBroker     Interactive Brokers LIVE orders (TWS or IB Gateway must be running)

Use a CASH account at IBKR (no margin). Forex is traded through MetaTrader 5 instead
(bot/brokers/mt5_broker.py).
"""
import pandas as pd

from bot.brokers.base import Fill, SpotBroker, closed_only, require_approval
from bot.logger import get_logger
from bot.rules import MarketRules

log = get_logger("broker")


class YahooData(SpotBroker):
    """Stock prices from Yahoo Finance (daily candles). No orders."""

    def __init__(self, market: str, market_cfg: dict):
        self.market, self.cfg = market, market_cfg
        self.quote = "USD"

    def get_candles(self, symbol, timeframe="1d", limit=400):
        import yfinance as yf
        raw = yf.download(symbol, period="2y", interval=timeframe, auto_adjust=True,
                          progress=False, multi_level_index=False)
        if raw is None or raw.empty:
            raise ValueError(f"No Yahoo data for {symbol}")
        idx = raw.index.tz_localize("UTC") if raw.index.tz is None else raw.index.tz_convert("UTC")
        df = pd.DataFrame({c.lower(): raw[c].to_numpy() for c in ["Open", "High", "Low", "Close", "Volume"]},
                          index=idx).dropna()
        return closed_only(df, timeframe).tail(limit)

    def get_price(self, symbol):
        import yfinance as yf
        return float(yf.Ticker(symbol).fast_info["last_price"])

    def rules(self, symbol):
        return MarketRules(min_cost=self.cfg.get("min_order", 1), amount_step=self.cfg.get("amount_step", 0.0001))


class IbkrBroker(YahooData):
    """Interactive Brokers (TWS or IB Gateway must be running and logged in).
    Prices/candles come from Yahoo; orders and balances from IBKR."""

    def __init__(self, market: str, market_cfg: dict, host="127.0.0.1", port=7497, client_id=17):
        super().__init__(market, market_cfg)
        from ib_async import IB
        self.live = True
        self.ib = IB()
        self.ib.connect(host, port, clientId=client_id, timeout=15)
        log.info("Connected to Interactive Brokers at %s:%s", host, port)

    def get_balance(self):
        for v in self.ib.accountSummary():
            if v.tag == "TotalCashValue" and v.currency == "USD":
                return float(v.value)
        return 0.0

    def get_positions(self):
        return {p.contract.symbol: float(p.position) for p in self.ib.positions()}

    def _order(self, symbol, action, decision):
        require_approval(decision)
        from ib_async import MarketOrder, Stock
        contract = Stock(symbol, "SMART", "USD")
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

    def _buy(self, symbol, decision, price):
        return self._order(symbol, "BUY", decision)

    def _sell(self, symbol, decision, price):
        return self._order(symbol, "SELL", decision)

    def cancel_all(self):
        self.ib.reqGlobalCancel()
        return len(self.ib.openOrders())
