"""Exchange connection (any CCXT exchange) plus a retry helper for network errors.

SPOT ONLY: the exchange is always created with defaultType='spot'.
This module never withdraws funds and never needs withdrawal permissions.
"""
import os
import time

import ccxt

from bot.logger import get_logger

log = get_logger("exchange")


def create_exchange(name: str | None = None, with_keys: bool = False) -> ccxt.Exchange:
    """Create a CCXT exchange object, e.g. 'binance' or 'luno'.

    with_keys=False is enough for public data (candles, prices, markets).
    """
    name = (name or os.getenv("EXCHANGE") or "binance").lower()
    if not hasattr(ccxt, name):
        raise ValueError(f"Unknown exchange '{name}'. See ccxt.exchanges for valid names.")

    settings = {
        "enableRateLimit": True,               # CCXT waits between calls to respect rate limits
        "options": {"defaultType": "spot"},    # spot market only - never futures/margin
    }
    if with_keys:
        settings["apiKey"] = os.getenv("API_KEY", "")
        settings["secret"] = os.getenv("API_SECRET", "")
    return getattr(ccxt, name)(settings)


def with_retry(func, *args, retries: int = 5, base_delay: float = 2.0, **kwargs):
    """Call func(*args, **kwargs). On network/rate-limit errors wait and try again.

    Waits 2s, 4s, 8s, 16s... (exponential backoff). Other errors are raised at once,
    because retrying e.g. 'invalid symbol' will never help.
    """
    for attempt in range(1, retries + 1):
        try:
            return func(*args, **kwargs)
        except (ccxt.NetworkError, ccxt.RateLimitExceeded) as e:
            if attempt == retries:
                raise
            delay = base_delay * 2 ** (attempt - 1)
            log.warning("%s failed (%s). Retry %d/%d in %.0fs",
                        getattr(func, "__name__", "call"), type(e).__name__, attempt, retries - 1, delay)
            time.sleep(delay)
