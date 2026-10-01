"""Brokers: where prices come from and where orders go. All share the interface in base.py.

    ccxt_broker.CcxtBroker    crypto exchange via CCXT (Binance, Luno, VALR...)
    ibkr_broker.YahooData     stock prices from Yahoo Finance (no orders)
    ibkr_broker.IbkrBroker    stocks/ETFs: LIVE orders through Interactive Brokers
    mt5_broker.Mt5Broker      Forex and gold through MetaTrader 5 (demo by default)
    paper.PaperBroker         PAPER trading for crypto and stocks: simulated fills
"""
from bot.brokers.base import Broker, Fill, OrderRejected, require_approval  # noqa: F401
