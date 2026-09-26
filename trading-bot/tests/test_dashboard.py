"""Tests for the local dashboard (reads the database, serves one page + JSON)."""
import json
import threading
import urllib.request

from bot.dashboard import serve, summary
from bot.storage import Position, StateStore

CFG = {"trader": {"markets": ["crypto"], "strategy": "regime"}, "markets": {"crypto": {"fee_pct": 0.1}}, "risk": {}}


def filled_store():
    store = StateStore(":memory:")
    store.set("paper:crypto", {"cash": 800.0, "holdings": {"BTC/USDT": 0.004}})
    store.save_position(Position("crypto", "BTC/USDT", 0.004, 50000, 46000, 51000, "2026-09-26T10:00:00+00:00", "regime"))
    store.record_equity("crypto", 1000.0)
    store.record_equity("crypto", 1012.5)
    store.record_trade("crypto", "ETH/USDT", "buy", 0.1, 2500, 0.25, "signal", None, "paper")
    store.record_trade("crypto", "ETH/USDT", "sell", 0.1, 2600, 0.26, "signal", 9.49, "paper")
    store.record_trade("crypto", "SOL/USDT", "sell", 1, 90, 0.09, "stop_loss", -5.0, "paper")
    return store


def test_summary_contents():
    s = summary(CFG, filled_store())
    assert s["markets"][0]["equity"] == 1012.5 and s["markets"][0]["change_pct"] == 1.25
    assert s["markets"][0]["cash"] == 800.0 and s["markets"][0]["positions"] == 1
    assert s["positions"][0]["symbol"] == "BTC/USDT"
    perf = {p["name"]: p for p in s["performance"]}
    assert perf["crypto · signal"]["win_rate"] == 100.0
    assert perf["crypto · stop_loss"]["pnl"] == -5.0
    assert s["by_symbol"][0] == ["ETH/USDT", 9.49]


def test_server_serves_page_and_json_on_localhost_only():
    server = serve(CFG, filled_store(), port=0)            # port 0 = any free port
    host, port = server.server_address
    assert host == "127.0.0.1"
    threading.Thread(target=server.serve_forever, daemon=True).start()
    try:
        page = urllib.request.urlopen(f"http://127.0.0.1:{port}/").read().decode()
        assert "WeLoveMining Trading Bot" in page
        data = json.loads(urllib.request.urlopen(f"http://127.0.0.1:{port}/api/summary").read())
        assert data["mode"] in ("PAPER", "LIVE") and len(data["trades"]) == 3
    finally:
        server.shutdown()
