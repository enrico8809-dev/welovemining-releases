"""Small SQLite database that lets the bot survive restarts.

Tables
  state      key -> JSON value (Risk Manager state, paper balances, flags)
  positions  open positions the bot manages (entry, stop-loss, highest price...)
  trades     every buy and sell (for Telegram, the dashboard and your records)
  equity     account value over time (for the equity curve)
The file lives at data/bot_state.db (not committed to git).
"""
import json
import sqlite3
from dataclasses import asdict, dataclass
from datetime import datetime, timezone
from pathlib import Path

from bot.config import ROOT

DEFAULT_PATH = ROOT / "data" / "bot_state.db"


@dataclass
class Position:
    market: str              # "crypto", "stocks" or "forex"
    symbol: str
    qty: float
    entry_price: float
    stop: float              # current stop-loss price (moves up with the trailing stop)
    highest: float           # highest price since entry (for the trailing stop)
    opened_at: str
    strategy: str = ""


class StateStore:
    """Use ':memory:' for tests."""

    def __init__(self, path: Path | str = DEFAULT_PATH):
        if str(path) != ":memory:":
            Path(path).parent.mkdir(parents=True, exist_ok=True)
        # check_same_thread=False: the Telegram thread (Phase 8) reads it too
        self.db = sqlite3.connect(str(path), check_same_thread=False)
        self.db.executescript("""
            CREATE TABLE IF NOT EXISTS state (key TEXT PRIMARY KEY, value TEXT NOT NULL);
            CREATE TABLE IF NOT EXISTS positions (
                market TEXT, symbol TEXT, qty REAL, entry_price REAL, stop REAL, highest REAL,
                opened_at TEXT, strategy TEXT, PRIMARY KEY (market, symbol));
            CREATE TABLE IF NOT EXISTS trades (
                id INTEGER PRIMARY KEY AUTOINCREMENT, time TEXT, market TEXT, symbol TEXT,
                side TEXT, qty REAL, price REAL, fee REAL, reason TEXT, pnl REAL, mode TEXT);
            CREATE TABLE IF NOT EXISTS equity (time TEXT, market TEXT, equity REAL);
        """)
        self.db.commit()

    # ---- key/value state
    def get(self, key: str, default=None):
        row = self.db.execute("SELECT value FROM state WHERE key = ?", (key,)).fetchone()
        return json.loads(row[0]) if row else default

    def set(self, key: str, value) -> None:
        self.db.execute("INSERT OR REPLACE INTO state (key, value) VALUES (?, ?)", (key, json.dumps(value)))
        self.db.commit()     # written to disk at once, so a crash loses nothing

    # ---- positions
    def positions(self, market: str | None = None) -> list[Position]:
        sql, args = "SELECT * FROM positions", ()
        if market:
            sql, args = sql + " WHERE market = ?", (market,)
        return [Position(*row) for row in self.db.execute(sql, args).fetchall()]

    def save_position(self, p: Position) -> None:
        self.db.execute("INSERT OR REPLACE INTO positions VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
                        tuple(asdict(p).values()))
        self.db.commit()

    def delete_position(self, market: str, symbol: str) -> None:
        self.db.execute("DELETE FROM positions WHERE market = ? AND symbol = ?", (market, symbol))
        self.db.commit()

    # ---- trades and equity
    def record_trade(self, market, symbol, side, qty, price, fee, reason, pnl=None, mode="paper") -> None:
        self.db.execute(
            "INSERT INTO trades (time, market, symbol, side, qty, price, fee, reason, pnl, mode) "
            "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
            (now_iso(), market, symbol, side, qty, price, fee, reason, pnl, mode))
        self.db.commit()

    def trades(self, limit: int = 50) -> list[dict]:
        cur = self.db.execute("SELECT * FROM trades ORDER BY id DESC LIMIT ?", (limit,))
        cols = [c[0] for c in cur.description]
        return [dict(zip(cols, row)) for row in cur.fetchall()]

    def record_equity(self, market: str, equity: float) -> None:
        self.db.execute("INSERT INTO equity VALUES (?, ?, ?)", (now_iso(), market, equity))
        self.db.commit()

    def equity_history(self, market: str | None = None) -> list[tuple]:
        sql, args = "SELECT time, market, equity FROM equity", ()
        if market:
            sql, args = sql + " WHERE market = ?", (market,)
        return self.db.execute(sql + " ORDER BY time", args).fetchall()

    def close(self) -> None:
        self.db.close()


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")
