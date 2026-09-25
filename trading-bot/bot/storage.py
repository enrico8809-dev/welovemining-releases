"""Small SQLite database that lets the bot survive restarts.

Phase 4 stores the Risk Manager's state (halts, pauses, peak equity...).
Later phases add tables for trades and positions.
The file lives at data/bot_state.db (not committed to git).
"""
import json
import sqlite3
from pathlib import Path

from bot.config import ROOT

DEFAULT_PATH = ROOT / "data" / "bot_state.db"


class StateStore:
    """A key -> JSON value store in SQLite. Use ':memory:' for tests."""

    def __init__(self, path: Path | str = DEFAULT_PATH):
        if str(path) != ":memory:":
            Path(path).parent.mkdir(parents=True, exist_ok=True)
        self.db = sqlite3.connect(str(path))
        self.db.execute("CREATE TABLE IF NOT EXISTS state (key TEXT PRIMARY KEY, value TEXT NOT NULL)")
        self.db.commit()

    def get(self, key: str, default=None):
        row = self.db.execute("SELECT value FROM state WHERE key = ?", (key,)).fetchone()
        return json.loads(row[0]) if row else default

    def set(self, key: str, value) -> None:
        self.db.execute("INSERT OR REPLACE INTO state (key, value) VALUES (?, ?)",
                        (key, json.dumps(value)))
        self.db.commit()     # written to disk at once, so a crash loses nothing

    def close(self) -> None:
        self.db.close()
