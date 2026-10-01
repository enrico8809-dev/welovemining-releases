"""The bot's activity feed: what it is checking and deciding, in plain words, for the app's
Live screen. Kept in the database (last 300 entries) so it survives restarts.

    kinds:  loop    "Checked prices: 3 positions, 20 symbols"
            signal  "BTC/USDT: strategy wants IN"
            skip    "ETH/USDT: buy not approved (max open trades (3) reached)"
            order   "BUY BTC/USDT 0.00023 @ 84195"
            stop    "BTC/USDT: trailing stop moved to 79243"
            info    anything else worth seeing (halts, market closed, ...)
"""
import threading

from bot.storage import now_iso

KEY = "activity"
MAX_ENTRIES = 300
_lock = threading.Lock()


def record(store, market: str, kind: str, text: str, symbol: str = "") -> None:
    if store is None:
        return
    with _lock:
        items = store.get(KEY) or []
        items.append({"time": now_iso(), "market": market, "kind": kind, "symbol": symbol, "text": text})
        store.set(KEY, items[-MAX_ENTRIES:])


def recent(store, limit: int = 60) -> list[dict]:
    items = store.get(KEY) or []
    return list(reversed(items[-limit:]))
