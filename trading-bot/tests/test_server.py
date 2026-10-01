"""App server: token auth, overview, safe settings, keys only from the PC, controls, jobs."""
import json
import threading
import time
import urllib.request
from urllib.error import HTTPError

import pytest

import bot.config as config
import bot.server as server
from bot.storage import Position, StateStore
from bot.trader import PAUSE_FLAG, STOP_FLAG

TOKEN = "test-token-123456"


@pytest.fixture
def api(tmp_path, monkeypatch):
    monkeypatch.setattr(config, "APP_SETTINGS", tmp_path / "app_settings.json")
    env_file = tmp_path / ".env"
    env_file.write_text("LIVE_TRADING=false\nAPI_KEY=\n")
    real_root = config.ROOT

    def fake_update_env(values):          # write to a temp .env, never the real one
        lines = env_file.read_text().splitlines()
        keys = {l.split("=", 1)[0] for l in lines}
        lines = [f"{l.split('=', 1)[0]}={values[l.split('=', 1)[0]]}" if l.split("=", 1)[0] in values else l
                 for l in lines] + [f"{k}={v}" for k, v in values.items() if k not in keys]
        env_file.write_text("\n".join(lines))
        import os
        os.environ.update({k: str(v) for k, v in values.items()})
    monkeypatch.setattr(server, "update_env", fake_update_env)
    monkeypatch.setenv("LIVE_TRADING", "false")
    store = StateStore(":memory:")
    engine = server.Engine(store)
    httpd = server.serve(store, engine, port=0, token=TOKEN)
    threading.Thread(target=httpd.serve_forever, daemon=True).start()
    base = f"http://127.0.0.1:{httpd.server_address[1]}"

    def call(method, path, body=None, token=TOKEN, headers=None):
        req = urllib.request.Request(base + path, method=method,
                                     data=json.dumps(body).encode() if body is not None else None,
                                     headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json",
                                              **(headers or {})})
        try:
            with urllib.request.urlopen(req, timeout=10) as r:
                return r.status, json.loads(r.read())
        except HTTPError as e:
            return e.code, json.loads(e.read())
    yield call, store, engine, env_file
    engine.stop()
    httpd.shutdown()
    assert config.ROOT == real_root


def test_health_is_open_everything_else_needs_the_token(api):
    call, *_ = api
    assert call("GET", "/api/health", token="")[0] == 200
    assert call("GET", "/api/overview", token="wrong")[0] == 401


def test_overview_has_accounts_positions_and_engine(api):
    call, store, *_ = api
    store.save_position(Position("forex", "EURUSD", -0.05, 1.1, 1.12, 1.09, "t"))
    store.set("account:forex", {"equity": 10_000, "cash": 10_000, "currency": "USD", "mode": "demo"})
    code, data = call("GET", "/api/overview")
    assert code == 200 and data["engine"]["running"] is False
    assert data["positions"][0]["side"] == "short"
    assert any(a["market"] == "forex" and a["mode"] == "demo" for a in data["accounts"])
    assert data["combined"]["currency"] == "USD"


def test_settings_are_validated_and_saved(api):
    call, *_ = api
    code, data = call("PUT", "/api/settings", {"values": {"risk.max_open_trades": 4}})
    assert code == 200 and data["changed"] == ["risk.max_open_trades"]
    assert call("GET", "/api/settings")[1]["values"]["risk.max_open_trades"] == 4
    assert call("PUT", "/api/settings", {"values": {"forex_risk.max_leverage": 5}})[0] == 400   # 1:1 rule
    assert call("PUT", "/api/settings", {"values": {"risk.max_drawdown_pct": 99}})[0] == 400
    assert call("PUT", "/api/settings", {"values": {"ibkr.host": "evil"}})[0] == 400              # not editable


def test_live_switch_goes_to_env(api):
    call, _, _, env_file = api
    assert call("PUT", "/api/settings", {"env": {"LIVE_TRADING": True}})[0] == 200
    assert "LIVE_TRADING=true" in env_file.read_text()
    assert call("PUT", "/api/settings", {"env": {"LIVE_TRADING": "yes"}})[0] == 400


def test_keys_only_from_this_pc_and_never_sent_back(api):
    call, _, _, env_file = api
    code, _ = call("PUT", "/api/secrets", {"API_KEY": "abc123"}, headers={"X-Forwarded-For": "100.64.0.2"})
    assert code == 403 and "abc123" not in env_file.read_text()
    assert call("PUT", "/api/secrets", {"API_KEY": "abc123", "NOT_A_KEY": "x"})[0] == 200
    assert "API_KEY=abc123" in env_file.read_text() and "NOT_A_KEY" not in env_file.read_text()
    settings = call("GET", "/api/settings")[1]
    assert settings["secrets"]["API_KEY"] is True and "abc123" not in json.dumps(settings)


def test_pause_resume_and_kill_switch(api, monkeypatch):
    call, store, *_ = api
    call("POST", "/api/control", {"action": "pause"})
    assert store.get(PAUSE_FLAG) is True
    call("POST", "/api/control", {"action": "resume"})
    assert store.get(PAUSE_FLAG) is False
    import bot.trader as trader
    monkeypatch.setattr(trader, "connect_mt5", lambda cfg, live_allowed: (_ for _ in ()).throw(ConnectionError("no mt5")))
    assert call("POST", "/api/control", {"action": "kill"})[0] == 200
    assert store.get(STOP_FLAG) is True
    assert "kill switch" in call("POST", "/api/control", {"action": "start"})[1]["message"]
    call("POST", "/api/control", {"action": "clear_kill"})
    assert store.get(STOP_FLAG) is False
    assert call("POST", "/api/control", {"action": "format_c"})[0] == 400


def test_engine_start_stop(api, monkeypatch):
    call, store, engine, _ = api
    import bot.trader as trader

    def fake_run(cfg, store, stop_event=None, status=None, **kw):
        while not stop_event.is_set():
            status["last_loop"] = "now"
            time.sleep(0.05)
    monkeypatch.setattr(trader, "run", fake_run)
    assert call("POST", "/api/control", {"action": "start"})[1]["message"] == "started"
    time.sleep(0.2)
    assert call("GET", "/api/overview")[1]["engine"]["running"] is True
    assert call("POST", "/api/control", {"action": "stop"})[1]["message"] == "stopped"


def test_job_commands_are_whitelisted():
    cfg = {"markets": {"crypto": {}, "forex": {}}}
    cmd = server.job_command("backtest", {"market": "forex", "strategy": "regime", "risk": True}, cfg)
    assert cmd[1:] == ["-m", "backtest.run", "--market", "forex", "--strategy", "regime", "--risk"]
    for bad in ({"market": "moon"}, {"strategy": "rm -rf"}, {"symbols": ["A;B"]}, {"timeframe": "1y"}):
        with pytest.raises(ValueError):
            server.job_command("backtest", bad, cfg)
    with pytest.raises(ValueError):
        server.job_command("shell", {}, cfg)
