"""Tests for LIVE crypto order handling, with a fake exchange (no real orders, no internet)."""
import ccxt
import pytest

from bot.broker import CcxtBroker, OrderRejected
from bot.risk import Decision


class FakeExchange:
    id = "fake"
    precisionMode = ccxt.TICK_SIZE

    def __init__(self, fail_with=None, went_through=True):
        self.fail_with, self.went_through = fail_with, went_through
        self.orders, self.free = [], {"USDT": 1000.0, "BTC": 0.000999}

    def milliseconds(self):
        return 1_000

    def amount_to_precision(self, symbol, amount):
        return f"{amount:.6f}"

    def fetch_balance(self):
        return {"free": dict(self.free), "total": dict(self.free)}

    def create_order(self, symbol, type_, side, amount, price, params):
        assert type_ == "market" and "clientOrderId" in params
        self.orders.append((side, amount))
        if self.fail_with:
            raise self.fail_with
        # Binance style: the buy fee is paid in the coin that was bought
        return {"filled": amount, "average": 50_000.0,
                "fees": [{"cost": amount * 0.001, "currency": "BTC" if side == "buy" else "USDT"}]}

    def fetch_my_trades(self, symbol, since):
        if not self.went_through:
            return []
        return [{"side": "buy", "amount": 0.001, "cost": 50.0, "fee": {"cost": 0.000001, "currency": "BTC"}}]


def broker(ex):
    b = CcxtBroker.__new__(CcxtBroker)          # skip the real exchange connection
    b.ex, b.live, b.quote, b._markets = ex, True, "USDT", None
    return b


def test_buy_keeps_the_amount_really_received_after_the_fee():
    fill = broker(FakeExchange()).buy("BTC/USDT", Decision(True, "ok", amount=0.001), 50_000)
    assert fill.qty == pytest.approx(0.000999)            # 0.1% fee taken in BTC
    assert fill.fee == pytest.approx(0.05)                 # = 0.000001 BTC x 50,000 in USDT


def test_sell_never_asks_for_more_than_is_free():
    ex = FakeExchange()
    broker(ex).sell("BTC/USDT", Decision(True, "ok", amount=0.001), 50_000)
    assert ex.orders == [("sell", pytest.approx(0.000999))]


def test_network_error_checks_the_exchange_instead_of_retrying(monkeypatch):
    import bot.broker as module
    monkeypatch.setattr(module.time, "sleep", lambda s: None)
    ex = FakeExchange(fail_with=ccxt.NetworkError("connection reset"), went_through=True)
    fill = broker(ex).buy("BTC/USDT", Decision(True, "ok", amount=0.001), 50_000)
    assert len(ex.orders) == 1                             # sent once, never twice
    assert fill is not None and fill.qty == pytest.approx(0.000999)

    ex = FakeExchange(fail_with=ccxt.NetworkError("timeout"), went_through=False)
    assert broker(ex).buy("BTC/USDT", Decision(True, "ok", amount=0.001), 50_000) is None
    assert len(ex.orders) == 1


def test_rejected_orders_do_not_crash():
    ex = FakeExchange(fail_with=ccxt.InsufficientFunds("not enough USDT"))
    assert broker(ex).buy("BTC/USDT", Decision(True, "ok", amount=0.001), 50_000) is None


def test_live_orders_need_approval():
    ex = FakeExchange()
    with pytest.raises(OrderRejected):
        broker(ex).buy("BTC/USDT", Decision(False, "halted", amount=0.001), 50_000)
    assert ex.orders == []
