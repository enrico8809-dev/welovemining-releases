"""Tests for Telegram control (fake Telegram server, no internet)."""
from datetime import date

import pytest

from bot.storage import Position, StateStore
from bot.telegram import Commands, Telegram, daily_summary
from bot.trader import PAUSE_FLAG, STOP_FLAG

CFG = {
    "trader": {"markets": ["crypto"]},
    "markets": {"crypto": {"fee_pct": 0.1}},
    "risk": {},
}


class FakeResponse:
    def __init__(self, result):
        self.result = result

    def raise_for_status(self):
        pass

    def json(self):
        return {"ok": True, "result": self.result}


class FakeTelegramServer:
    """Records what the bot sends; serves pre-set incoming messages."""

    def __init__(self, incoming=()):
        self.incoming = list(incoming)
        self.sent = []

    def post(self, url, json, timeout):
        if url.endswith("/sendMessage"):
            self.sent.append((json["chat_id"], json["text"]))
            return FakeResponse(True)
        if url.endswith("/getUpdates"):
            updates, self.incoming = self.incoming, []
            return FakeResponse(updates)
        raise AssertionError(url)


def message(update_id, chat_id, text):
    return {"update_id": update_id, "message": {"chat": {"id": chat_id}, "text": text}}


def test_only_answers_my_chat():
    server = FakeTelegramServer([message(1, 999, "/stop"), message(2, 123, "/help")])
    tg = Telegram("token", "123", session=server)
    handled = []
    tg.poll_once(lambda cmd: handled.append(cmd) or "ok")
    assert handled == ["/help"]                       # the stranger's /stop was ignored
    assert server.sent == [("123", "ok")]
    assert tg.offset == 3                             # both messages are marked as read


def test_send_never_raises():
    class Broken:
        def post(self, *a, **k):
            raise ConnectionError("no internet")
    tg = Telegram("t", "1", session=Broken())
    import bot.telegram as module
    module.time.sleep = lambda s: None               # don't wait in tests
    assert tg.send("hello") is False


@pytest.fixture
def commands(monkeypatch):
    import bot.trader as trader
    monkeypatch.setattr(trader, "is_live_trading", lambda: False)
    store = StateStore(":memory:")
    return Commands(CFG, store), store


def test_pause_and_resume(commands):
    cmd, store = commands
    assert "Paused" in cmd.handle("/pause")
    assert store.get(PAUSE_FLAG) is True
    assert "Resumed" in cmd.handle("/resume")
    assert store.get(PAUSE_FLAG) is False


def test_stop_is_the_kill_switch(commands):
    cmd, store = commands
    reply = cmd.handle("/stop")
    assert "KILL SWITCH" in reply
    assert store.get(STOP_FLAG) is True
    assert "kill_switch" in cmd.handle("/status")


def test_positions_and_balance(commands):
    cmd, store = commands
    store.save_position(Position("crypto", "BTC/USDT", 0.01, 50000, 45000, 52000, "t"))
    store.set("paper:crypto", {"cash": 500.0, "holdings": {"BTC/USDT": 0.01}})
    store.record_equity("crypto", 1000.0)
    assert "BTC/USDT" in cmd.handle("/positions")
    assert "value 1000.00" in cmd.handle("/balance") and "cash 500.00" in cmd.handle("/balance")
    assert cmd.handle("/nonsense").startswith("Unknown")


def test_daily_summary():
    store = StateStore(":memory:")
    store.db.executemany("INSERT INTO equity VALUES (?, ?, ?)", [
        ("2026-09-24T23:55:00+00:00", "crypto", 1000.0),
        ("2026-09-25T12:00:00+00:00", "crypto", 1010.0),
        ("2026-09-25T23:55:00+00:00", "crypto", 1020.0),
    ])
    store.db.execute("INSERT INTO trades (time, market, symbol, side, qty, price, fee, reason, pnl, mode) "
                     "VALUES ('2026-09-25T10:00:00+00:00','crypto','BTC/USDT','sell',1,1,0,'signal',15.5,'paper')")
    text = daily_summary(store, ["crypto"], date(2026, 9, 25))
    assert "1000.00 → 1020.00 (+20.00, +2.00%)" in text
    assert "Trades today: 1 | realised P&L +15.50" in text
