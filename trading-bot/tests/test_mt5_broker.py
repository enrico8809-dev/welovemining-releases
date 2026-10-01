"""MetaTrader 5 broker: demo safety, stop-loss with every order, magic-number filtering."""
from types import SimpleNamespace as NS

import pytest

from bot.brokers.base import OrderRejected
from bot.brokers.mt5_broker import Mt5Broker
from bot.risk import Decision
from tests.fake_mt5 import FakeMT5


def broker(mt5=None, **kw):
    return Mt5Broker(mt5_module=mt5 or FakeMT5(), **kw)


def long_decision(lots=0.1, stop=1.09):
    return Decision(True, "ok", amount=lots, stop_price=stop, side="buy")


def test_demo_account_is_fine_by_default():
    b = broker()
    assert b.is_demo and b.mode == "demo" and not b.live and b.quote == "USD"


def test_real_account_refused_unless_forex_live_trading():
    with pytest.raises(PermissionError, match="REAL account"):
        broker(FakeMT5(trade_mode=FakeMT5.ACCOUNT_TRADE_MODE_REAL))
    b = broker(FakeMT5(trade_mode=FakeMT5.ACCOUNT_TRADE_MODE_REAL), live_allowed=True)
    assert b.live and b.mode == "live"


def test_login_comes_from_env(monkeypatch):
    monkeypatch.setenv("MT5_LOGIN", "123456")
    monkeypatch.setenv("MT5_PASSWORD", "secret-pass")
    monkeypatch.setenv("MT5_SERVER", "Broker-Demo")
    mt5 = FakeMT5()
    broker(mt5)
    assert mt5.init_kwargs["login"] == 123456 and mt5.init_kwargs["server"] == "Broker-Demo"


def test_order_carries_the_stop_loss_to_the_broker():
    mt5 = FakeMT5()
    fill = broker(mt5).place_order("EURUSD", "buy", long_decision(), 1.1001)
    req = mt5.requests[-1]
    assert req["sl"] == 1.09 and req["price"] == 1.10010          # bought at the ASK
    assert req["magic"] == 880088 and req["volume"] == 0.1
    assert fill.qty == 0.1 and fill.fee == pytest.approx(0.35)    # commission reported as a cost


def test_no_stop_no_trade():
    with pytest.raises(OrderRejected, match="stop-loss"):
        broker().place_order("EURUSD", "buy", Decision(True, "ok", amount=0.1, side="buy"), 1.1)


def test_stop_on_the_wrong_side_is_refused():
    with pytest.raises(OrderRejected, match="wrong side"):
        broker().place_order("EURUSD", "buy", long_decision(stop=1.2), 1.1)
    with pytest.raises(OrderRejected, match="wrong side"):
        broker().place_order("EURUSD", "sell", Decision(True, "ok", amount=0.1, stop_price=1.0, side="sell"), 1.1)


def test_unapproved_or_mismatched_orders_are_refused():
    with pytest.raises(OrderRejected):
        broker().place_order("EURUSD", "buy", Decision(False, "halted"), 1.1)
    with pytest.raises(OrderRejected, match="does not match"):
        broker().place_order("EURUSD", "sell", long_decision(), 1.1)


def test_short_position_shows_as_negative_lots():
    mt5 = FakeMT5()
    b = broker(mt5)
    b.place_order("EURUSD", "sell", Decision(True, "ok", amount=0.2, stop_price=1.11, side="sell"), 1.1)
    assert mt5.requests[-1]["price"] == 1.10000                   # sold at the BID
    assert b.get_positions() == {"EURUSD": -0.2}


def test_manual_trades_are_ignored():
    mt5 = FakeMT5()
    mt5.positions.append(NS(ticket=1, symbol="USDJPY", magic=0, type=0, volume=1.0, price_open=150,
                            sl=0, tp=0, comment="manual", profit=0.0))
    b = broker(mt5)
    b.place_order("EURUSD", "buy", long_decision(), 1.1)
    assert b.get_positions() == {"EURUSD": 0.1}
    assert b.close_all() == 1
    assert len(mt5.positions) == 1 and mt5.positions[0].comment == "manual"


def test_close_reports_net_pnl_from_the_deals():
    mt5 = FakeMT5()
    b = broker(mt5)
    b.place_order("EURUSD", "buy", long_decision(), 1.1)
    mt5.ticks["EURUSD"] = (1.10500, 1.10510)
    fill = b.close_position("EURUSD", Decision(True, "ok", amount=0.1), 1.105)
    # (1.105 - 1.1001) x 0.1 lot x 100,000 = 49.0, swap -1, commission 2 x -0.35
    assert fill.pnl == pytest.approx(49.0 - 1.0 - 0.7)
    assert b.get_positions() == {}


def test_lost_reply_is_checked_not_resent():
    mt5 = FakeMT5()
    mt5.lose_next_reply = True
    fill = broker(mt5).place_order("EURUSD", "buy", long_decision(), 1.1)
    assert fill is not None and fill.qty == 0.1
    assert len([r for r in mt5.requests if r["action"] == mt5.TRADE_ACTION_DEAL]) == 1


def test_broker_rejection_returns_none():
    mt5 = FakeMT5()
    mt5.reject_next = True
    assert broker(mt5).place_order("EURUSD", "buy", long_decision(), 1.1) is None


def test_trailing_stop_is_moved_at_the_broker():
    mt5 = FakeMT5()
    b = broker(mt5)
    b.place_order("EURUSD", "buy", long_decision(), 1.1)
    assert b.modify_stop("EURUSD", 1.095)
    assert mt5.positions[0].sl == 1.095


def test_stop_hit_at_the_broker_is_found_in_the_history():
    mt5 = FakeMT5()
    b = broker(mt5)
    b.place_order("EURUSD", "buy", long_decision(stop=1.095), 1.1)
    ticket = b.position_ticket("EURUSD")
    mt5.hit_stop("EURUSD")
    result = b.position_result(ticket)
    assert result.reason == "stop_loss" and result.price == 1.095 and result.pnl < 0


def test_candles_skip_the_forming_candle_and_keep_the_spread():
    c = broker().get_candles("EURUSD", "1d", 100)
    assert len(c) == 100 and "spread" in c.columns and c.index.tz is not None


def test_conversion_to_account_currency():
    b = broker()
    assert b.to_account("EURUSD", 1.1) == 1.0
    assert b.to_account("USDJPY", 150.0) == pytest.approx(1 / 150)
