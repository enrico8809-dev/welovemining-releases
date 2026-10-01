"""A tiny stand-in for the MetaTrader5 package (the real one only runs on Windows).
It keeps positions and deals in memory and behaves like the terminal for the calls we use."""
import time
from types import SimpleNamespace as NS

import numpy as np


class FakeMT5:
    ACCOUNT_TRADE_MODE_DEMO, ACCOUNT_TRADE_MODE_REAL = 0, 2
    TIMEFRAME_H1, TIMEFRAME_H4, TIMEFRAME_D1 = 16385, 16388, 16408
    POSITION_TYPE_BUY, POSITION_TYPE_SELL = 0, 1
    ORDER_TYPE_BUY, ORDER_TYPE_SELL = 0, 1
    TRADE_ACTION_DEAL, TRADE_ACTION_SLTP, TRADE_ACTION_REMOVE = 1, 6, 8
    ORDER_FILLING_FOK, ORDER_FILLING_IOC, ORDER_FILLING_RETURN = 0, 1, 2
    ORDER_TIME_GTC = 0
    DEAL_ENTRY_IN, DEAL_ENTRY_OUT = 0, 1

    def __init__(self, trade_mode=0, currency="USD", balance=10_000.0):
        self.trade_mode, self.currency, self.balance = trade_mode, currency, balance
        self.connected = False
        self.init_kwargs = None
        self.positions, self.deals, self.orders, self.requests = [], [], [], []
        self.ticks = {"EURUSD": (1.10000, 1.10010), "USDJPY": (150.000, 150.010), "XAUUSD": (2400.00, 2400.30)}
        self.lose_next_reply = False     # simulate the terminal dropping an order_send reply
        self.reject_next = False
        self.commission_per_lot = -3.5
        self._ticket = 1000

    # ---- connection / account
    def initialize(self, **kwargs):
        self.init_kwargs, self.connected = kwargs, True
        return True

    def shutdown(self):
        self.connected = False

    def last_error(self):
        return (1, "fake")

    def account_info(self):
        floating = sum(p.profit for p in self.positions)
        return NS(trade_mode=self.trade_mode, currency=self.currency, balance=self.balance,
                  equity=self.balance + floating, server="FakeBroker-Demo", leverage=500)

    # ---- symbols / prices
    def symbol_select(self, name, enable):
        return name in self.ticks

    def symbol_info(self, name):
        if name not in self.ticks:
            return None
        jpy, gold = name.endswith("JPY"), name.startswith("XAU")
        return NS(trade_contract_size=100 if gold else 100_000, volume_min=0.01, volume_step=0.01,
                  volume_max=50.0, point=0.01 if gold else 0.001 if jpy else 0.00001,
                  digits=2 if gold else 3 if jpy else 5, trade_stops_level=10,
                  currency_base=name[:3], currency_profit=name[3:6], swap_long=-7.0, swap_short=2.0,
                  swap_rollover3days=3, filling_mode=2)

    def symbol_info_tick(self, name):
        bid, ask = self.ticks[name]
        return NS(bid=bid, ask=ask, time=int(time.time()))

    def copy_rates_from_pos(self, name, tf, start, count):
        n = 300
        t0 = int(time.time()) - (n + start) * 86400
        closes = 1.10 + 0.0005 * np.arange(n)
        dtype = [("time", "i8"), ("open", "f8"), ("high", "f8"), ("low", "f8"), ("close", "f8"),
                 ("tick_volume", "i8"), ("spread", "i4"), ("real_volume", "i8")]
        rows = [(t0 + i * 86400, c - 0.0005, c + 0.002, c - 0.002, c, 100, 12, 0) for i, c in enumerate(closes)]
        return np.array(rows[-count:], dtype=dtype)

    copy_rates_range = None

    # ---- trading
    def positions_get(self, symbol=None):
        return tuple(p for p in self.positions if symbol is None or p.symbol == symbol)

    def orders_get(self):
        return tuple(self.orders)

    def history_deals_get(self, ticket=None, position=None):
        return tuple(d for d in self.deals if (ticket and d.ticket == ticket) or (position and d.position_id == position))

    def _next(self):
        self._ticket += 1
        return self._ticket

    def order_send(self, request):
        self.requests.append(dict(request))
        if self.reject_next:
            self.reject_next = False
            return NS(retcode=10016, comment="Invalid stops", volume=0, price=0, deal=0)
        if request["action"] == self.TRADE_ACTION_SLTP:
            for p in self.positions:
                if p.ticket == request["position"]:
                    p.sl = request["sl"]
            return NS(retcode=10009, comment="done", volume=0, price=0, deal=0)
        if request["action"] == self.TRADE_ACTION_REMOVE:
            self.orders = [o for o in self.orders if o.ticket != request["order"]]
            return NS(retcode=10009, comment="done", volume=0, price=0, deal=0)
        deal = self._next()
        if "position" in request:                         # closing
            p = next(p for p in self.positions if p.ticket == request["position"])
            self.positions.remove(p)
            sign = 1 if p.type == self.POSITION_TYPE_BUY else -1
            profit = sign * (request["price"] - p.price_open) * request["volume"] * 100_000
            self.deals.append(NS(ticket=deal, position_id=p.ticket, entry=self.DEAL_ENTRY_OUT, volume=request["volume"],
                                 price=request["price"], profit=profit, swap=-1.0,
                                 commission=self.commission_per_lot * request["volume"], fee=0.0, reason=0))
            self.balance += profit - 1.0 + self.commission_per_lot * request["volume"]
        else:                                             # opening
            ticket = self._next()
            self.positions.append(NS(ticket=ticket, symbol=request["symbol"], magic=request["magic"],
                                     type=request["type"], volume=request["volume"], price_open=request["price"],
                                     sl=request["sl"], tp=0.0, comment=request["comment"], profit=0.0))
            self.deals.append(NS(ticket=deal, position_id=ticket, entry=self.DEAL_ENTRY_IN, volume=request["volume"],
                                 price=request["price"], profit=0.0, swap=0.0,
                                 commission=self.commission_per_lot * request["volume"], fee=0.0, reason=0))
        if self.lose_next_reply:
            self.lose_next_reply = False
            return None
        return NS(retcode=10009, comment="done", volume=request["volume"], price=request["price"], deal=deal)

    # ---- test helpers
    def hit_stop(self, symbol):
        """The broker's stop-loss closes the position while the bot isn't looking."""
        p = next(p for p in self.positions if p.symbol == symbol)
        self.positions.remove(p)
        sign = 1 if p.type == self.POSITION_TYPE_BUY else -1
        profit = sign * (p.sl - p.price_open) * p.volume * 100_000
        self.deals.append(NS(ticket=self._next(), position_id=p.ticket, entry=self.DEAL_ENTRY_OUT, volume=p.volume,
                             price=p.sl, profit=profit, swap=0.0, commission=self.commission_per_lot * p.volume,
                             fee=0.0, reason=4))
        self.balance += profit
