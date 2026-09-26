"""Tests for the Auto-Trader and the brokers, with a fake market (no internet)."""
import numpy as np
import pandas as pd
import pytest

from bot.broker import Broker, OrderRejected, PaperBroker
from bot.risk import Decision, RiskConfig, RiskManager
from bot.rules import MarketRules
from bot.storage import Position, StateStore
from bot.trader import MarketTrader, STOP_FLAG, PAUSE_FLAG
from strategies.base import Strategy
from tests.conftest import make_candles


class FakeData(Broker):
    """A market where the test decides the price and the candles."""
    market = "crypto"
    quote = "USDT"

    def __init__(self):
        self.prices = {"AAA/USDT": 100.0, "BBB/USDT": 50.0}
        closes = list(np.linspace(80, 100, 120))
        self.candle_data = make_candles(closes, start="2026-01-01", spread=0.02)

    def candles(self, symbol, timeframe="1d", limit=400):
        return self.candle_data

    def price(self, symbol):
        return self.prices[symbol]

    def rules(self, symbol):
        return MarketRules(min_cost=5, amount_step=0.0001)


class Always(Strategy):
    """Test strategy: in or out, as the test says."""
    name = "always"
    wanted = 1.0

    def target_exposure(self, candles):
        return pd.Series(Always.wanted, index=candles.index)


@pytest.fixture
def setup(monkeypatch):
    import bot.trader as trader_module
    monkeypatch.setattr(trader_module, "load_strategy", lambda name, **p: Always())
    Always.wanted = 1.0
    store = StateStore(":memory:")
    data = FakeData()
    broker = PaperBroker(data, store, start_cash=1000, fee_pct=0.1, slippage_pct=0.0)
    risk = RiskManager(RiskConfig(max_order_value=1e9, max_pct_per_trade=25), store, market="crypto")
    messages = []
    trader = MarketTrader("crypto", broker, risk, store, "always", {}, lambda: ["AAA/USDT"],
                          "paper", notify=messages.append)
    return trader, store, data, broker, messages


def test_buys_when_strategy_says_in_and_risk_approves(setup):
    trader, store, data, broker, messages = setup
    trader.step()
    positions = store.positions("crypto")
    assert len(positions) == 1 and positions[0].symbol == "AAA/USDT"
    cash, holdings = broker.balances()
    assert holdings["AAA/USDT"] == positions[0].qty
    assert cash < 1000 and cash > 700                  # max 25% of the account in one trade
    assert positions[0].stop < 100                     # stop-loss set below the entry
    assert store.trades()[0]["side"] == "buy"
    assert messages and messages[0].startswith("BUY AAA/USDT")


def test_does_not_buy_twice(setup):
    trader, store, *_ = setup
    trader.step()
    trader.step()
    assert len([t for t in store.trades() if t["side"] == "buy"]) == 1


def test_sells_on_stop_loss_and_waits_for_a_fresh_signal(setup):
    trader, store, data, broker, messages = setup
    trader.step()
    stop = store.positions("crypto")[0].stop
    data.prices["AAA/USDT"] = stop * 0.99              # price falls through the stop
    trader.step()
    assert store.positions("crypto") == []
    sell = store.trades()[0]
    assert sell["side"] == "sell" and sell["reason"] == "stop_loss" and sell["pnl"] < 0
    data.prices["AAA/USDT"] = 100.0                    # signal still "in": must NOT re-buy yet
    trader.step()
    assert store.positions("crypto") == []


def test_sells_when_strategy_says_out(setup):
    trader, store, *_ = setup
    trader.step()
    Always.wanted = 0.0
    trader._signals.clear()                           # (a new day: fresh signal)
    trader.step()
    assert store.positions("crypto") == []
    assert store.trades()[0]["reason"] == "signal"


def test_trailing_stop_moves_up_with_the_price(setup):
    trader, store, data, *_ = setup
    trader.step()
    first_stop = store.positions("crypto")[0].stop
    data.prices["AAA/USDT"] = 150.0
    trader.step()
    assert store.positions("crypto")[0].stop > first_stop
    data.prices["AAA/USDT"] = 140.0                    # price dips: stop must not move down
    before = store.positions("crypto")[0].stop
    trader.step()
    assert store.positions("crypto")[0].stop == before


def test_no_new_buys_when_halted_but_stops_still_work(setup):
    trader, store, data, *_ = setup
    trader.step()
    trader.risk.kill()
    store.set("wait_reset:crypto:BBB/USDT", False)
    trader.symbols_fn = lambda: ["AAA/USDT", "BBB/USDT"]
    trader.step()
    assert [p.symbol for p in store.positions("crypto")] == ["AAA/USDT"]    # BBB not bought
    data.prices["AAA/USDT"] = 1.0                      # crash: the stop still sells
    trader.step()
    assert store.positions("crypto") == []


def test_pause_and_stop_flags_block_new_buys(setup):
    trader, store, *_ = setup
    store.set(PAUSE_FLAG, True)
    trader.step()
    assert store.positions("crypto") == []
    store.set(PAUSE_FLAG, False)
    store.set(STOP_FLAG, True)
    trader.step()
    assert store.positions("crypto") == []


def test_orders_without_risk_approval_are_refused(setup):
    _, _, _, broker, _ = setup
    with pytest.raises(OrderRejected):
        broker.buy("AAA/USDT", Decision(False, "nope", amount=1), 100)
    with pytest.raises(OrderRejected):
        broker.buy("AAA/USDT", "buy 1 please", 100)


def test_paper_fills_pay_fees_and_slippage():
    store = StateStore(":memory:")
    broker = PaperBroker(FakeData(), store, start_cash=1000, fee_pct=0.1, slippage_pct=0.1)
    fill = broker.buy("AAA/USDT", Decision(True, "ok", amount=1), 100)
    assert fill.price == pytest.approx(100.1) and fill.fee == pytest.approx(0.1001)
    assert broker.balances()[0] == pytest.approx(1000 - 100.1 - 0.1001)


def test_reconcile_fixes_positions_after_a_restart(setup):
    trader, store, data, broker, _ = setup
    store.save_position(Position("crypto", "GONE/USDT", 1, 10, 9, 10, "t"))       # sold outside the bot
    store.save_position(Position("crypto", "AAA/USDT", 2, 100, 90, 100, "t"))
    s = store.get("paper:crypto")
    s["holdings"] = {"AAA/USDT": 1.5}                                             # less than recorded
    store.set("paper:crypto", s)
    trader.reconcile()
    positions = {p.symbol: p for p in store.positions("crypto")}
    assert "GONE/USDT" not in positions
    assert positions["AAA/USDT"].qty == 1.5


def test_forex_only_buys_pairs_quoted_in_usd(setup):
    trader, *_ = setup
    trader.market = "forex"
    assert trader.tradeable("EURUSD=X")
    assert not trader.tradeable("USDJPY=X")            # would need yen we don't have (no borrowing)
    assert not trader.tradeable("USDZAR=X")


def test_positions_survive_a_restart(tmp_path):
    db = tmp_path / "bot.db"
    store = StateStore(db)
    store.save_position(Position("crypto", "AAA/USDT", 1.5, 100, 90, 110, "t", "regime"))
    store.close()
    again = StateStore(db)
    assert again.positions("crypto")[0].highest == 110


def test_ibkr_contracts():
    pytest.importorskip("ib_async")
    from bot.broker import ibkr_contract
    fx = ibkr_contract("EURUSD=X", "forex")
    assert (fx.symbol, fx.currency, fx.secType) == ("EUR", "USD", "CASH")
    stock = ibkr_contract("SPY", "stocks")
    assert (stock.symbol, stock.exchange, stock.currency) == ("SPY", "SMART", "USD")
