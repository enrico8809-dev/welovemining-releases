"""WLM Trader server: the bot's control center for the Windows and Android apps.

    python -m bot.server            (the Windows app starts this for you)

* Runs the Auto-Trader in the background; the app can start, stop, pause and kill it.
* A small JSON API on http://127.0.0.1:8765, protected by a secret token (APP_TOKEN in .env,
  created automatically). It only listens on this PC; your phone reaches it through
  Tailscale (run once:  tailscale serve --bg 8765).
* Keys and passwords can only be changed from THIS PC (never over the network), and are
  never sent back to the app - it only sees whether each one is set.
"""
import argparse
import json
import re
import secrets
import subprocess
import sys
import threading
import time
import uuid
from datetime import datetime, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

from bot.config import ROOT, env_bool, load_config, load_overrides, save_overrides, update_env
from bot.logger import get_logger
from bot.storage import StateStore, now_iso

log = get_logger("server")
VERSION = "1.0.0"
DEFAULT_PORT = 8765
SECRET_KEYS = ("API_KEY", "API_SECRET", "MT5_LOGIN", "MT5_PASSWORD", "MT5_SERVER", "MT5_PATH",
               "TELEGRAM_BOT_TOKEN", "TELEGRAM_CHAT_ID", "WHATSAPP_PHONE", "WHATSAPP_APIKEY")
EXCHANGES = ("binance", "valr", "luno", "kraken", "bybit", "okx", "kucoin")


# ---------------------------------------------------------------------------- engine
class Engine:
    """Runs the Auto-Trader loop in a background thread."""

    def __init__(self, store: StateStore):
        self.store = store
        self.thread: threading.Thread | None = None
        self.stop_event = threading.Event()
        self.status: dict = {}
        self.started_at = ""

    @property
    def running(self) -> bool:
        return bool(self.thread and self.thread.is_alive())

    def start(self) -> str:
        if self.running:
            return "already running"
        from bot.trader import STOP_FLAG, run
        if self.store.get(STOP_FLAG):
            return "the kill switch was used: clear it first"
        self.stop_event = threading.Event()
        self.status = {}
        self.started_at = now_iso()

        def target():
            try:
                run(load_config(), self.store, stop_event=self.stop_event, status=self.status)
            except Exception as e:
                log.exception("Auto-Trader crashed: %s", e)
                self.status["error"] = str(e)
        self.thread = threading.Thread(target=target, name="auto-trader", daemon=True)
        self.thread.start()
        return "started"

    def stop(self, wait: float = 3) -> str:
        """Ask the loop to stop. It finishes the symbol it's checking first, so this can take
        a moment; the app shows 'Stopping...' meanwhile."""
        if not self.running:
            return "not running"
        self.stop_event.set()
        self.thread.join(wait)
        return "stopped" if not self.running else "stopping: finishing the current check"

    def restart(self) -> str:
        if self.running:
            self.stop(wait=120)
            return self.start()
        return "not running"

    def info(self) -> dict:
        errors = {k.split(":", 1)[1]: v for k, v in self.status.items() if k.startswith("error:")}
        return {"running": self.running, "stopping": self.running and self.stop_event.is_set(),
                "started_at": self.started_at if self.running else "",
                "last_loop": self.status.get("last_loop", ""), "error": self.status.get("error", ""),
                "market_errors": errors}


# ---------------------------------------------------------------------------- settings
def _num(lo, hi, cast=float):
    def check(v):
        v = cast(v)
        if not lo <= v <= hi:
            raise ValueError(f"must be between {lo} and {hi}")
        return v
    return check


def _symbols(v):
    if not isinstance(v, list) or not v or not all(isinstance(s, str) and re.fullmatch(r"[A-Za-z0-9/=.^_-]{1,20}", s)
                                                   for s in v):
        raise ValueError("must be a list of symbols")
    return v


def _markets(v):
    if not isinstance(v, list) or not set(v) <= {"crypto", "stocks", "forex"}:
        raise ValueError("markets: crypto, stocks, forex")
    return v


def _strategy(v):
    from strategies import available_strategies
    if v not in available_strategies():
        raise ValueError(f"unknown strategy {v}")
    return v


def _news(v):
    from bot.forex_hours import parse_news
    parse_news(v)                      # raises if a line isn't "YYYY-MM-DD HH:MM name"
    return v


def _bool(v):
    if not isinstance(v, bool):
        raise ValueError("must be true or false")
    return v


# Every setting the app may change, with its check. Anything else is refused.
EDITABLE = {
    "trader.markets": _markets,
    "trader.strategy": _strategy,
    "trader.loop_seconds": _num(30, 3600, int),
    "risk.max_open_trades": _num(1, 10, int),
    "risk.risk_per_trade_pct": _num(0.1, 5),
    "risk.max_pct_per_trade": _num(1, 100),
    "risk.daily_loss_limit_pct": _num(0.5, 20),
    "risk.max_drawdown_pct": _num(2, 50),
    "risk.stop_atr_mult": _num(0.5, 10),
    "risk.trailing_atr_mult": _num(1, 20),
    "forex_risk.max_leverage": _num(0.1, 1),          # never more than 1:1 (your rule)
    "forex_risk.max_lots": _num(0.01, 5),
    "forex_risk.max_open_trades": _num(1, 10, int),
    "forex_risk.risk_per_trade_pct": _num(0.1, 3),
    "markets.forex.symbols": _symbols,
    "markets.forex.strategy": _strategy,
    "markets.forex.allow_short": _bool,
    "markets.forex.mode": lambda v: v if v in ("swing", "day") else (_ for _ in ()).throw(ValueError("swing or day")),
    "forex_day.strategy": _strategy,
    "forex_day.timeframe": lambda v: v if v in ("5m", "15m", "30m", "1h") else (_ for _ in ()).throw(
        ValueError("5m, 15m, 30m or 1h")),
    "forex_day.max_leverage": _num(0.1, 3),          # day mode: up to 3:1 (your choice)
    "forex_day.max_trades_per_day": _num(1, 50, int),
    "forex_day.risk_per_trade_pct": _num(0.1, 3),
    "forex_day.session_start_utc": _num(0, 23, int),
    "forex_day.session_end_utc": _num(1, 24, int),
    "markets.stocks.symbols": _symbols,
    "markets.crypto.symbols": _symbols,
    "forex_hours.news_events": _news,
    "forex_hours.news_pause_minutes": _num(0, 240, int),
    "scanner.min_volume_usdt": _num(0, 1e11),
    "scanner.top_n": _num(1, 100, int),
}
ENV_EDITABLE = {
    "LIVE_TRADING": _bool,
    "FOREX_LIVE_TRADING": _bool,
    "MAX_ORDER_USDT": _num(1, 1_000_000),
    "EXCHANGE": lambda v: v if v in EXCHANGES else (_ for _ in ()).throw(ValueError(f"exchange: {EXCHANGES}")),
}


def get_path(cfg: dict, path: str):
    for part in path.split("."):
        cfg = (cfg or {}).get(part)
    return cfg


def set_path(cfg: dict, path: str, value) -> None:
    *parents, last = path.split(".")
    for part in parents:
        cfg = cfg.setdefault(part, {})
    cfg[last] = value


def settings_view(cfg: dict) -> dict:
    import os
    from strategies import available_strategies
    return {
        "values": {path: get_path(cfg, path) for path in EDITABLE},
        "env": {"LIVE_TRADING": env_bool("LIVE_TRADING"), "FOREX_LIVE_TRADING": env_bool("FOREX_LIVE_TRADING"),
                "MAX_ORDER_USDT": float(os.getenv("MAX_ORDER_USDT") or 20),
                "EXCHANGE": (os.getenv("EXCHANGE") or "binance").lower()},
        "secrets": {k: bool(os.getenv(k)) for k in SECRET_KEYS},
        "options": {"strategies": available_strategies(), "markets": ["crypto", "stocks", "forex"],
                    "exchanges": list(EXCHANGES)},
    }


def apply_settings(body: dict) -> list[str]:
    """Validate and save. Returns the list of changed keys (raises ValueError on a bad value)."""
    values, env = body.get("values") or {}, body.get("env") or {}
    unknown = [k for k in values if k not in EDITABLE] + [k for k in env if k not in ENV_EDITABLE]
    if unknown:
        raise ValueError(f"not editable: {', '.join(unknown)}")
    checked = {}
    for k, v in values.items():
        try:
            checked[k] = EDITABLE[k](v)
        except (ValueError, TypeError) as e:
            raise ValueError(f"{k}: {e}") from e
    env_checked = {}
    for k, v in env.items():
        try:
            v = ENV_EDITABLE[k](v)
        except (ValueError, TypeError) as e:
            raise ValueError(f"{k}: {e}") from e
        env_checked[k] = ("true" if v else "false") if isinstance(v, bool) else str(v)
    overrides = load_overrides()
    for k, v in checked.items():
        set_path(overrides, k, v)
    if checked:
        save_overrides(overrides)
    if env_checked:
        update_env(env_checked)
    for k in env_checked:
        log.warning("Setting %s changed from the app", k)
    return list(checked) + list(env_checked)


# ---------------------------------------------------------------------------- jobs
JOB_KINDS = {
    "backtest": "backtest.run",
    "download": "data.downloader",
    "scan": "bot.scanner",
    "regime": "bot.regime",
    "optimize": "backtest.optimize",
    "forex_data": "data.forex_data",
}


def job_command(kind: str, args: dict, cfg: dict) -> list[str]:
    """Build a safe command line for a research job (only known options, checked values)."""
    from strategies import available_strategies
    if kind not in JOB_KINDS:
        raise ValueError(f"unknown job {kind}")
    cmd = [sys.executable, "-m", JOB_KINDS[kind]]
    market = args.get("market")
    if market is not None:
        if market not in cfg["markets"]:
            raise ValueError("unknown market")
        if kind != "scan" and kind != "forex_data":
            cmd += ["--market", market]
    strategy = args.get("strategy")
    if strategy is not None:
        if strategy not in [*available_strategies(), "all"] or kind not in ("backtest", "optimize"):
            raise ValueError("bad strategy")
        cmd += ["--strategy", strategy]
    if args.get("symbols"):
        cmd += ["--symbols", *_symbols(args["symbols"])]
    if args.get("timeframe"):
        if args["timeframe"] not in ("15m", "1h", "4h", "1d"):
            raise ValueError("bad timeframe")
        cmd += ["--timeframe" if kind != "download" else "--timeframes", args["timeframe"]]
    if args.get("risk") and kind in ("backtest", "optimize"):
        cmd.append("--risk")
    if kind == "scan":
        cmd.append("--download") if args.get("download") else None
    return cmd


def backtest_table(args: dict) -> dict | None:
    """The summary CSV that backtest.run saved, as {columns, rows} for the app."""
    import csv
    market = args.get("market", "crypto")
    name = f"{market}_{args.get('timeframe') or '1d'}_{args.get('strategy') or 'sma_cross'}" \
           f"{'_risk' if args.get('risk') else ''}.csv"
    path = ROOT / "backtest" / "results" / name
    if not path.exists():
        return None
    with open(path, newline="", encoding="utf-8") as f:
        rows = list(csv.reader(f))
    return {"columns": rows[0], "rows": rows[1:]} if rows else None


class Jobs:
    """Research tasks (backtests, downloads, scans) run one at a time as separate processes."""

    def __init__(self):
        self.jobs: dict[str, dict] = {}
        self.lock = threading.Lock()

    def start(self, kind: str, args: dict, cfg: dict) -> dict:
        cmd = job_command(kind, args, cfg)
        with self.lock:
            if any(j["status"] == "running" for j in self.jobs.values()):
                raise ValueError("another job is still running")
            job = {"id": uuid.uuid4().hex[:10], "kind": kind, "args": args, "status": "running",
                   "started": now_iso(), "output": ""}
            self.jobs[job["id"]] = job

        def target():
            try:
                proc = subprocess.Popen(cmd, cwd=ROOT, stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
                                        text=True, encoding="utf-8", errors="replace")
                for line in proc.stdout:
                    if len(job["output"]) < 300_000:
                        job["output"] += line
                job["status"] = "done" if proc.wait() == 0 else "failed"
                if kind == "backtest" and job["status"] == "done":
                    job["table"] = backtest_table(args)
            except Exception as e:
                job["output"] += f"\n{e}"
                job["status"] = "failed"
            job["finished"] = now_iso()
        threading.Thread(target=target, daemon=True).start()
        return job

    def list(self) -> list[dict]:
        return [{k: v for k, v in j.items() if k != "output"} for j in
                sorted(self.jobs.values(), key=lambda j: j["started"], reverse=True)]


# ---------------------------------------------------------------------------- read models
def track_record(store: StateStore) -> dict:
    """Paper/demo history per market, for the 'before you go live' screen."""
    out = {}
    for time_, market, _ in store.equity_history():
        out.setdefault(market, {"since": time_, "trades": 0, "closed": 0, "pnl": 0.0, "wins": 0})
    for t in store.trades(100_000):
        r = out.setdefault(t["market"], {"since": t["time"], "trades": 0, "closed": 0, "pnl": 0.0, "wins": 0})
        r["trades"] += 1
        if t["pnl"] is not None:
            r["closed"] += 1
            r["pnl"] = round(r["pnl"] + t["pnl"], 2)
            r["wins"] += t["pnl"] > 0
    now = datetime.now(timezone.utc)
    for r in out.values():
        r["days"] = (now - datetime.fromisoformat(r["since"])).days
    return out


def equity_series(store: StateStore, max_points: int = 300) -> dict:
    series = {}
    for time_, market, value in store.equity_history():
        series.setdefault(market, []).append([time_, round(value, 2)])
    for market, points in series.items():
        if len(points) > max_points:                       # keep the curve light for the phone
            step = len(points) / max_points
            series[market] = [points[int(i * step)] for i in range(max_points)] + [points[-1]]
    return series


def overview(cfg: dict, store: StateStore, engine: Engine) -> dict:
    import os
    from bot.accounts import account_rows, combined
    from bot.config import is_forex_live, is_live_trading
    from bot.trader import PAUSE_FLAG, STOP_FLAG
    rows = account_rows(cfg, store)
    return {
        "version": VERSION,
        "time": now_iso(),
        "engine": engine.info(),
        "paused": bool(store.get(PAUSE_FLAG)),
        "kill_switch": bool(store.get(STOP_FLAG)),
        "live": {"crypto_stocks": is_live_trading(), "forex": is_forex_live()},
        "accounts": rows,
        "combined": combined(rows),
        "positions": [{**p.__dict__, "side": "short" if p.qty < 0 else "long"} for p in store.positions()],
        "trades": store.trades(50),
        "equity": equity_series(store),
        "alerts": {"telegram": bool(os.getenv("TELEGRAM_BOT_TOKEN")), "whatsapp": bool(os.getenv("WHATSAPP_APIKEY"))},
        "strategy": cfg["trader"]["strategy"],
        "markets": cfg["trader"]["markets"],
    }


def tail_log(lines: int = 300) -> list[str]:
    path = ROOT / "logs" / "bot.log"
    if not path.exists():
        return []
    with open(path, "rb") as f:
        f.seek(0, 2)
        size = f.tell()
        f.seek(max(0, size - 400_000))
        text = f.read().decode("utf-8", errors="replace")
    return text.splitlines()[-lines:]


# ---------------------------------------------------------------------------- control
def control(action: str, cfg: dict, store: StateStore, engine: Engine) -> str:
    from bot.risk import RiskConfig, RiskManager
    from bot.trader import PAUSE_FLAG, STOP_FLAG, kill_switch
    if action == "start":
        return engine.start()
    if action == "stop":
        return engine.stop()
    if action == "pause":
        store.set(PAUSE_FLAG, True)
        return "paused: no new trades, stops still protect open positions"
    if action == "resume":
        store.set(PAUSE_FLAG, False)
        return "resumed"
    if action == "kill":
        # A running engine closes its own Forex positions; otherwise do it from here
        running = engine.running
        kill_switch(cfg, store, close_now=not running)
        if running:                                # the loop closes its Forex positions, then stops
            return "kill switch: new trades blocked; the bot is closing Forex positions and stopping"
        return "kill switch: orders cancelled, Forex positions closed, new trades blocked"
    if action == "clear_kill":
        store.set(STOP_FLAG, False)
        for market in cfg["trader"]["markets"]:
            RiskManager(RiskConfig.from_config(cfg, market=market), store, market=market).reset()
        return "kill switch cleared and risk halts reset: you can start the bot again"
    if action == "reset_risk":
        for market in cfg["trader"]["markets"]:
            RiskManager(RiskConfig.from_config(cfg, market=market), store, market=market).reset()
        return "risk halts reset"
    raise ValueError(f"unknown action {action}")


# ---------------------------------------------------------------------------- HTTP
def ensure_token() -> str:
    import os
    load_config()
    token = os.getenv("APP_TOKEN")
    if not token:
        token = secrets.token_urlsafe(24)
        update_env({"APP_TOKEN": token})
        log.info("Created a new app token (APP_TOKEN in .env)")
    return token


class Pairing:
    """Phone pairing: the PC shows a 6-digit code (valid 10 minutes, 5 tries); the phone trades
    it for the app token once. Typing a short code beats copying a long secret onto a phone."""

    def __init__(self, token: str):
        self.token, self.code, self.expires, self.attempts = token, "", 0.0, 0
        self.lock = threading.Lock()

    def start(self) -> dict:
        with self.lock:
            self.code = f"{secrets.randbelow(1_000_000):06d}"
            self.expires, self.attempts = time.time() + 600, 0
            return {"code": self.code, "expires_in": 600}

    def redeem(self, code: str) -> str | None:
        with self.lock:
            if not self.code or time.time() > self.expires:
                return None
            if secrets.compare_digest(str(code).strip(), self.code):
                self.code = ""                              # single use
                return self.token
            self.attempts += 1
            if self.attempts >= 5:
                self.code = ""                              # too many wrong tries: start again on the PC
            return None


def make_handler(store: StateStore, engine: Engine, jobs: Jobs, token: str):
    pairing = Pairing(token)

    class Handler(BaseHTTPRequestHandler):
        server_version = "WLMTrader"

        def log_message(self, *args):
            pass

        def _send(self, code: int, payload) -> None:
            body = json.dumps(payload, default=str).encode()
            try:
                self.send_response(code)
                self.send_header("Content-Type", "application/json")
                self.send_header("Cache-Control", "no-store")
                self._cors()
                self.end_headers()
                self.wfile.write(body)
            except (BrokenPipeError, ConnectionResetError):
                pass                                  # the app went away mid-answer: nothing to do

        def _cors(self):
            # Auth is a header token (never a cookie), so allowing any origin is safe
            self.send_header("Access-Control-Allow-Origin", "*")
            self.send_header("Access-Control-Allow-Headers", "Authorization, Content-Type")
            self.send_header("Access-Control-Allow-Methods", "GET, POST, PUT, OPTIONS")

        def _authorized(self) -> bool:
            given = self.headers.get("Authorization", "").removeprefix("Bearer ").strip()
            return secrets.compare_digest(given.encode(), token.encode())

        def _local(self) -> bool:
            """A request from this PC itself (not forwarded by Tailscale or anything else)."""
            forwarded = any(h.lower().startswith(("x-forwarded", "tailscale-")) for h in self.headers.keys())
            return self.client_address[0] in ("127.0.0.1", "::1") and not forwarded

        def _body(self) -> dict:
            length = int(self.headers.get("Content-Length") or 0)
            if length > 100_000:
                raise ValueError("request too large")
            return json.loads(self.rfile.read(length) or b"{}")

        def do_OPTIONS(self):
            self.send_response(204)
            self._cors()
            self.end_headers()

        def _route(self, method: str):
            path = self.path.split("?", 1)[0].rstrip("/")
            query = dict(p.split("=", 1) for p in self.path.split("?", 1)[1].split("&") if "=" in p) \
                if "?" in self.path else {}
            if path == "/api/health":
                return self._send(200, {"ok": True, "app": "wlm-trader", "version": VERSION})
            if method == "POST" and path == "/api/pair":
                time.sleep(0.5)                       # slow down guessing
                try:
                    found = pairing.redeem(self._body().get("code", ""))
                except (ValueError, json.JSONDecodeError):
                    found = None
                if not found:
                    return self._send(403, {"error": "wrong or expired code: make a new one on the PC"})
                log.warning("A new device was paired with the app")
                return self._send(200, {"token": found})
            if not self._authorized():
                time.sleep(0.5)                       # slow down token guessing
                return self._send(401, {"error": "wrong or missing token"})
            cfg = load_config()
            try:
                if method == "GET" and path == "/api/overview":
                    return self._send(200, overview(cfg, store, engine))
                if method == "GET" and path == "/api/trades":
                    limit = min(int(query.get("limit", 200)), 2000)
                    market = query.get("market")
                    trades = [t for t in store.trades(limit * 3 if market else limit)
                              if not market or t["market"] == market][:limit]
                    return self._send(200, {"trades": trades, "record": track_record(store)})
                if method == "GET" and path == "/api/logs":
                    return self._send(200, {"lines": tail_log(min(int(query.get("lines", 300)), 2000))})
                if method == "POST" and path == "/api/control":
                    action = self._body().get("action", "")
                    return self._send(200, {"ok": True, "message": control(action, cfg, store, engine)})
                if method == "POST" and path == "/api/pair/start":
                    if not self._local():
                        return self._send(403, {"error": "pairing codes are made on the PC itself"})
                    return self._send(200, pairing.start())
                if method == "GET" and path == "/api/settings":
                    return self._send(200, {**settings_view(cfg), "local": self._local()})
                if method == "PUT" and path == "/api/settings":
                    changed = apply_settings(self._body())
                    restarted = engine.restart() if changed and engine.running else ""
                    return self._send(200, {"ok": True, "changed": changed, "restarted": bool(restarted)})
                if method == "PUT" and path == "/api/secrets":
                    if not self._local():
                        return self._send(403, {"error": "keys and passwords can only be changed on the PC itself"})
                    body = {k: str(v).strip() for k, v in self._body().items() if k in SECRET_KEYS}
                    if body:
                        update_env(body)
                        log.warning("Keys changed from the app: %s", ", ".join(body))
                    return self._send(200, {"ok": True, "changed": list(body)})
                if method == "POST" and path == "/api/notify/test":
                    from bot.trader import make_notify
                    notify, tg, wa = make_notify()
                    notify("✅ WLM Trader: alerts work!")
                    return self._send(200, {"ok": True, "telegram": bool(tg), "whatsapp": bool(wa)})
                if method == "GET" and path == "/api/jobs":
                    return self._send(200, {"jobs": jobs.list()})
                if method == "POST" and path == "/api/jobs":
                    body = self._body()
                    job = jobs.start(body.get("kind", ""), body.get("args") or {}, cfg)
                    return self._send(200, job)
                if method == "GET" and path.startswith("/api/jobs/"):
                    job = jobs.jobs.get(path.rsplit("/", 1)[1])
                    return self._send(200, job) if job else self._send(404, {"error": "no such job"})
                return self._send(404, {"error": "not found"})
            except (ValueError, KeyError, json.JSONDecodeError) as e:
                return self._send(400, {"error": str(e)})
            except Exception as e:
                log.exception("API error on %s: %s", path, e)
                return self._send(500, {"error": str(e)})

        def do_GET(self):
            self._route("GET")

        def do_POST(self):
            self._route("POST")

        def do_PUT(self):
            self._route("PUT")
    return Handler


def serve(store: StateStore, engine: Engine, port: int = DEFAULT_PORT, token: str | None = None) -> ThreadingHTTPServer:
    token = token or ensure_token()
    return ThreadingHTTPServer(("127.0.0.1", port), make_handler(store, engine, Jobs(), token))


def main():
    parser = argparse.ArgumentParser(description="WLM Trader server (used by the Windows and Android apps)")
    parser.add_argument("--port", type=int, default=DEFAULT_PORT)
    parser.add_argument("--no-autostart", action="store_true", help="don't start trading automatically")
    parser.add_argument("--print-token", action="store_true", help="show the app token and exit")
    args = parser.parse_args()
    token = ensure_token()
    if args.print_token:
        print(token)
        return
    store = StateStore()
    engine = Engine(store)
    server = serve(store, engine, args.port, token)
    print(f"WLM Trader server on http://127.0.0.1:{args.port}  (phone: tailscale serve --bg {args.port})", flush=True)
    if not args.no_autostart:
        print(f"Auto-Trader: {engine.start()}", flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        engine.stop()


if __name__ == "__main__":
    main()
