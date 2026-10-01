"""Forex auto-trader with a fake MetaTrader 5: entries with broker stops, shorts, trailing,
stop-loss closed by the broker, 1:1 cap, market hours, kill switch, reconcile."""
from datetime import datetime, timezone

import pandas as pd
import pytest

from bot.brokers.mt5_broker import Mt5Broker
from bot.forex_trader import ForexTrader
from bot.risk import RiskConfig, RiskManager
from bot.storage import StateStore
from bot.trader import PAUSE_FLAG, STOP_FLAG
from strategies.base import Strategy
from tests.fake_mt5 import FakeMT5

WEDNESDAY = datetime(2026, 10, 7, 12, 0, tzinfo=timezone.utc)


class Signal(Strategy):
    name = "signal"
    value = 1.0

    def target_exposure(self, candles):
        return pd.Series(Signal.value, index=candles.index)


@pytest.fixture
def fx(monkeypatch):
    import bot.forex_trader as module
    monkeypatch.setattr(module, "load_strategy", lambda name, **p: Signal())
    Signal.value = 1.0
    mt5 = FakeMT5()
    store = StateStore(":memory:")
    broker = Mt5Broker(mt5_module=mt5)
    risk = RiskManager(RiskConfig(max_lots=10, max_open_trades=3), store, market="forex")
    messages = []
    trader = ForexTrader(broker, risk, store, "signal", {}, ["EURUSD"], {}, messages.append)
    monkeypatch.setattr(trader, "_now", lambda: WEDNESDAY)
    monkeypatch.setattr(module, "entry_block_reason", lambda now, cfg: "")
    mt5_time = lambda name: type("T", (), {"bid": mt5.ticks[name][0], "ask": mt5.ticks[name][1],
                                           "time": int(WEDNESDAY.timestamp())})()
    monkeypatch.setattr(mt5, "symbol_info_tick", mt5_time)
    return trader, store, mt5, messages


def test_long_entry_carries_its_stop_to_the_broker(fx):
    trader, store, mt5, messages = fx
    trader.step()
    pos = store.positions("forex")[0]
    assert pos.qty > 0 and mt5.positions[0].sl == pos.stop < pos.entry_price
    assert store.get("account:forex")["mode"] == "demo"
    assert messages[0].startswith("BUY EURUSD [forex, demo]")


def test_short_entry_is_negative_with_the_stop_above(fx):
    trader, store, mt5, messages = fx
    Signal.value = -1.0
    trader.step()
    pos = store.positions("forex")[0]
    assert pos.qty < 0 and pos.stop > pos.entry_price
    assert mt5.positions[0].type == FakeMT5.POSITION_TYPE_SELL
    assert "SELL (short)" in messages[0]


def test_exposure_stays_within_the_account(fx):
    trader, store, mt5, _ = fx
    trader.step()
    lots = store.positions("forex")[0].qty
    assert lots * 100_000 * 1.1001 <= 10_000


def test_signal_flip_closes_with_broker_pnl(fx):
    trader, store, mt5, messages = fx
    trader.step()
    Signal.value = 0.0
    trader._signals.clear()
    mt5.ticks["EURUSD"] = (1.10500, 1.10510)
    trader.step()
    assert not store.positions("forex") and not mt5.positions
    close = store.trades(1)[0]
    assert close["reason"] == "signal" and close["pnl"] > 0
    assert messages[-1].startswith("CLOSE EURUSD")


def test_broker_stop_loss_is_booked_and_waits_for_a_fresh_signal(fx):
    trader, store, mt5, _ = fx
    trader.step()
    mt5.hit_stop("EURUSD")
    trader.step()
    assert store.trades(1)[0]["reason"] == "stop_loss" and store.trades(1)[0]["pnl"] < 0
    assert not mt5.positions                                  # no instant re-entry on the same signal
    Signal.value = -1.0
    trader._signals.clear()
    trader.step()                                             # a different signal may trade again
    assert mt5.positions and mt5.positions[0].type == FakeMT5.POSITION_TYPE_SELL


def test_trailing_stop_moves_at_the_broker(fx):
    trader, store, mt5, _ = fx
    trader.step()
    before = mt5.positions[0].sl
    mt5.ticks["EURUSD"] = (1.20000, 1.20010)
    trader.step()
    assert mt5.positions[0].sl > before and store.positions("forex")[0].stop == mt5.positions[0].sl


def test_no_entries_when_paused_stopped_or_market_closed(fx, monkeypatch):
    trader, store, mt5, _ = fx
    store.set(PAUSE_FLAG, True)
    trader.step()
    store.set(PAUSE_FLAG, False)
    store.set(STOP_FLAG, True)
    trader.step()
    store.set(STOP_FLAG, False)
    import bot.forex_trader as module
    monkeypatch.setattr(module, "entry_block_reason", lambda now, cfg: "Forex market closed (weekend)")
    trader.step()
    assert not mt5.positions


def test_kill_switch_closes_everything(fx):
    trader, store, mt5, _ = fx
    trader.step()
    trader.on_kill()
    assert not mt5.positions and not store.positions("forex")
    assert store.trades(1)[0]["side"] == "sell"


def test_reconcile_books_closed_and_adopts_unknown(fx):
    trader, store, mt5, _ = fx
    trader.step()
    mt5.hit_stop("EURUSD")                                    # closed while the bot was off
    from types import SimpleNamespace as NS
    mt5.positions.append(NS(ticket=77, symbol="USDJPY", magic=880088, type=1, volume=0.05, price_open=150.0,
                            sl=152.0, tp=0.0, comment="wlm-x", profit=0.0))
    trader.reconcile()
    assert store.trades(1)[0]["reason"] == "stop_loss"
    adopted = store.positions("forex")[0]
    assert adopted.symbol == "USDJPY" and adopted.qty == -0.05 and adopted.stop == 152.0


def test_day_mode_closes_everything_before_the_rollover(fx, monkeypatch):
    trader, store, mt5, messages = fx
    trader.day_cfg = {"session_start_utc": 0, "session_end_utc": 24, "flat_minutes_before_rollover": 60,
                      "max_trades_per_day": 1}
    import bot.forex_trader as module
    monkeypatch.setattr(module, "day_entry_block", lambda now, cfg: "")
    trader.step()
    assert mt5.positions and trader.trades_today() == 1
    monkeypatch.setattr(module, "must_be_flat", lambda now, cfg: True)
    trader.step()
    assert not mt5.positions and store.trades(1)[0]["reason"] == "end_of_day"
    monkeypatch.setattr(module, "must_be_flat", lambda now, cfg: False)
    trader.step()                                          # max 1 trade today: no new entry
    assert not mt5.positions
