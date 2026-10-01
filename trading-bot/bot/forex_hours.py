"""Forex market hours: when the bot may OPEN new Forex trades.

Forex trades 24 hours a day, 5 days a week: from Sunday 17:00 to Friday 17:00 New York time
(that is 21:00 or 22:00 UTC, depending on US daylight saving - handled automatically here).
No new trades:
  * on the weekend (market closed)
  * in the first hour after the Sunday open (thin market, wide spreads, price gaps)
  * in the last hour before the Friday close (a position would sit through the weekend gap)
  * around news events you list in config.yaml (forex_hours: news_events)
Open positions are always managed (and their stop-losses stay with the broker).
"""
from datetime import datetime, time, timedelta, timezone
from zoneinfo import ZoneInfo

NEW_YORK = ZoneInfo("America/New_York")
OPEN_CLOSE = time(17, 0)            # Sunday open / Friday close, New York time
SUNDAY, FRIDAY, SATURDAY = 6, 4, 5  # datetime.weekday()


def is_open(now: datetime) -> bool:
    ny = now.astimezone(NEW_YORK)
    day, t = ny.weekday(), ny.time()
    if day == SATURDAY:
        return False
    if day == SUNDAY:
        return t >= OPEN_CLOSE
    if day == FRIDAY:
        return t < OPEN_CLOSE
    return True


def _this_week(ny: datetime, weekday: int) -> datetime:
    """17:00 New York time on `weekday` of the current trading week (which starts on Sunday)."""
    days_since_sunday = (ny.weekday() - SUNDAY) % 7
    sunday = (ny - timedelta(days=days_since_sunday)).date()
    day = sunday + timedelta(days=(weekday - SUNDAY) % 7)
    return datetime.combine(day, OPEN_CLOSE, tzinfo=NEW_YORK)


def parse_news(events: list) -> list[tuple[datetime, str]]:
    """'2026-10-02 12:30 US jobs report' (UTC) -> (datetime, 'US jobs report')."""
    parsed = []
    for line in events or []:
        parts = str(line).split(maxsplit=2)
        when = datetime.fromisoformat(f"{parts[0]} {parts[1]}").replace(tzinfo=timezone.utc)
        parsed.append((when, parts[2] if len(parts) > 2 else "news"))
    return parsed


def entry_block_reason(now: datetime, cfg: dict | None = None) -> str:
    """Why new Forex trades are not allowed right now ('' = allowed)."""
    cfg = cfg or {}
    if not is_open(now):
        return "Forex market closed (weekend)"
    ny = now.astimezone(NEW_YORK)
    opened = _this_week(ny, SUNDAY)
    if ny - opened < timedelta(minutes=cfg.get("avoid_after_open_minutes", 60)):
        return "first hour after the Sunday open"
    closes = _this_week(ny, FRIDAY)
    if closes - ny < timedelta(minutes=cfg.get("stop_new_before_close_minutes", 60)):
        return "too close to the Friday close"
    pause = timedelta(minutes=cfg.get("news_pause_minutes", 30))
    for when, name in parse_news(cfg.get("news_events")):
        if abs(now - when) <= pause:
            return f"news pause: {name}"
    return ""


# ---------------------------------------------------------------------------- day-trading mode
def minutes_to_rollover(now: datetime) -> float:
    """Minutes until the next daily rollover (17:00 New York), when swap is charged."""
    ny = now.astimezone(NEW_YORK)
    rollover = datetime.combine(ny.date(), OPEN_CLOSE, tzinfo=NEW_YORK)
    if ny >= rollover:
        rollover += timedelta(days=1)
    return (rollover - ny).total_seconds() / 60


def trading_day(now: datetime) -> str:
    """The Forex trading day (it starts at 17:00 New York), e.g. '2026-10-07'."""
    return (now.astimezone(NEW_YORK) + timedelta(hours=7)).date().isoformat()


def must_be_flat(now: datetime, day_cfg: dict) -> bool:
    """Day mode: close everything shortly before the rollover (no swap, nothing over the weekend)."""
    return minutes_to_rollover(now) <= day_cfg.get("flat_minutes_before_rollover", 60)


def day_entry_block(now: datetime, day_cfg: dict) -> str:
    """Day mode: why a NEW quick trade isn't allowed right now ('' = allowed)."""
    start, end = day_cfg.get("session_start_utc", 7), day_cfg.get("session_end_utc", 20)
    utc = now.astimezone(timezone.utc)
    if utc.weekday() >= 5:
        return "weekend"
    if not start <= utc.hour < end:
        return f"outside the trading session ({start:02d}:00-{end:02d}:00 UTC)"
    if must_be_flat(now, day_cfg):
        return "too close to the daily rollover"
    return ""
