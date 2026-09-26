"""Risk Manager: every order must be approved here first. There is no way around it.

What it does
  * Position size from volatility (ATR): if the stop-loss is hit, you lose about
    `risk_per_trade_pct` of your money, never more than the hard caps allow.
  * Stop-loss on every position (entry - stop_atr_mult x ATR, at most max_stop_pct below)
    and a trailing stop that follows the highest price up (never down).
  * Hard limits: max order size (MAX_ORDER_USDT in .env), max open trades, max % of the
    account per trade, never more than the cash you have (spot only, no leverage).
  * Daily loss limit: no new trades for the rest of the day (UTC).
  * Max total drawdown: no new trades until you reset it yourself
    (python -m bot.risk --reset). Restarting the bot does NOT clear it.
  * Cooldown after a losing streak, and a pause after too many stop-losses in a short time.
  * Kill switch: blocks all new trades until reset.

Selling to CLOSE a position is always allowed (it reduces risk); only new buys are blocked.
The Risk Manager's state is saved in SQLite, so it survives restarts.

Check its state:  python -m bot.risk          Reset halts:  python -m bot.risk --reset
"""
import argparse
import os
from dataclasses import asdict, dataclass, field
from datetime import datetime, timedelta, timezone

from bot.logger import get_logger
from bot.rules import MarketRules

log = get_logger("risk")


@dataclass
class RiskConfig:
    max_order_value: float = 20.0      # hard cap per order (MAX_ORDER_USDT in .env)
    max_open_trades: int = 3
    max_pct_per_trade: float = 25.0    # max % of the account in one position
    risk_per_trade_pct: float = 1.0    # % of the account lost if the stop-loss is hit
    atr_period: int = 14               # candles used to measure volatility (ATR)
    stop_atr_mult: float = 2.0         # stop-loss distance = 2 x ATR ...
    max_stop_pct: float = 15.0         # ... but never more than 15% below the entry
    trailing_atr_mult: float = 5.0     # trailing stop: 5 x ATR below the highest price since entry
    daily_loss_limit_pct: float = 3.0
    max_drawdown_pct: float = 20.0
    losing_streak: int = 3             # this many losing trades in a row ...
    cooldown_hours: float = 24.0       # ... = no new trades for this long
    max_stops: int = 3                 # more than this many stop-losses ...
    stops_window_hours: float = 24.0   # ... within this window ...
    stops_pause_hours: float = 48.0    # ... = pause for this long
    fee_pct: float = 0.1               # used to leave room for the fee when spending cash

    @classmethod
    def from_config(cls, cfg: dict, fee_pct: float = 0.1) -> "RiskConfig":
        """Build from the `risk:` section of config.yaml plus MAX_ORDER_USDT from .env."""
        values = {k: v for k, v in (cfg.get("risk") or {}).items() if k in cls.__dataclass_fields__}
        max_order = os.getenv("MAX_ORDER_USDT")
        if max_order:
            values["max_order_value"] = float(max_order)
        return cls(fee_pct=fee_pct, **values)


@dataclass
class Decision:
    """The Risk Manager's answer. Only orders with approved=True may be sent."""
    approved: bool
    reason: str
    amount: float = 0.0          # coins to buy/sell (already rounded to the exchange step)
    stop_price: float = 0.0      # initial stop-loss for a new position


@dataclass
class RiskState:
    """Everything the Risk Manager remembers (saved to SQLite)."""
    halted: str = ""                 # "", "kill_switch", "daily_loss", "max_drawdown"
    peak_equity: float = 0.0
    day: str = ""                    # current UTC day, e.g. "2026-09-25"
    day_start_equity: float = 0.0
    losses_in_a_row: int = 0
    paused_until: str = ""           # ISO time; no new trades before this
    pause_reason: str = ""
    stop_times: list = field(default_factory=list)   # ISO times of recent stop-losses


def _iso(t: datetime) -> str:
    return t.astimezone(timezone.utc).isoformat()


def _parse(s: str) -> datetime:
    return datetime.fromisoformat(s)


class RiskManager:
    STATE_KEY = "risk_state"

    def __init__(self, config: RiskConfig, store=None, quiet: bool = False, market: str = ""):
        self.config = config
        self.store = store
        self.quiet = quiet            # True in backtests: don't log every halt/pause
        # Each market (crypto / stocks / forex) is a separate account with its own limits
        self.key = f"{self.STATE_KEY}:{market}" if market else self.STATE_KEY
        saved = store.get(self.key) if store else None
        self.state = RiskState(**saved) if saved else RiskState()

    # ----------------------------------------------------------------- state
    def _save(self) -> None:
        if self.store:
            self.store.set(self.key, asdict(self.state))

    def update_equity(self, equity: float, now: datetime) -> None:
        """Call regularly (every loop / candle) with the account value (cash + positions)."""
        s, c = self.state, self.config
        today = now.astimezone(timezone.utc).date().isoformat()
        if s.day != today:                        # a new day: new daily loss budget
            s.day, s.day_start_equity = today, equity
            if s.halted == "daily_loss":
                if not self.quiet:
                    log.info("New day: daily loss halt lifted")
                s.halted = ""
        s.peak_equity = max(s.peak_equity, equity)

        if not s.halted:
            if equity <= s.day_start_equity * (1 - c.daily_loss_limit_pct / 100):
                self._halt("daily_loss", f"daily loss limit {c.daily_loss_limit_pct}% hit "
                                         f"({s.day_start_equity:.2f} -> {equity:.2f})")
            elif equity <= s.peak_equity * (1 - c.max_drawdown_pct / 100):
                self._halt("max_drawdown", f"max drawdown {c.max_drawdown_pct}% hit "
                                           f"(peak {s.peak_equity:.2f} -> {equity:.2f})")
        self._save()

    def _halt(self, reason: str, message: str) -> None:
        self.state.halted = reason
        if not self.quiet:
            log.warning("TRADING HALTED: %s", message)

    def kill(self) -> None:
        """Kill switch: block all new trades until reset (open orders are cancelled by the trader)."""
        self._halt("kill_switch", "kill switch activated")
        self._save()

    def reset(self, equity: float | None = None) -> None:
        """Manual reset after a max-drawdown halt or kill switch. The peak restarts at today's equity."""
        s = self.state
        log.warning("Risk halts reset by user (was: %s)", s.halted or "not halted")
        s.halted, s.paused_until, s.pause_reason = "", "", ""
        s.losses_in_a_row, s.stop_times = 0, []
        if equity is not None:
            s.peak_equity, s.day_start_equity = equity, equity
        self._save()

    def record_closed_trade(self, pnl: float, stopped_out: bool, now: datetime) -> None:
        """Call after every closed position, to track losing streaks and stop-loss clusters."""
        s, c = self.state, self.config
        s.losses_in_a_row = s.losses_in_a_row + 1 if pnl < 0 else 0
        if s.losses_in_a_row >= c.losing_streak:
            self._pause(now, c.cooldown_hours, f"{s.losses_in_a_row} losing trades in a row")
            s.losses_in_a_row = 0

        if stopped_out:
            window_start = now - timedelta(hours=c.stops_window_hours)
            s.stop_times = [t for t in s.stop_times if _parse(t) > window_start] + [_iso(now)]
            if len(s.stop_times) > c.max_stops:
                self._pause(now, c.stops_pause_hours,
                            f"{len(s.stop_times)} stop-losses within {c.stops_window_hours:g}h")
                s.stop_times = []
        self._save()

    def _pause(self, now: datetime, hours: float, reason: str) -> None:
        until = now + timedelta(hours=hours)
        if not self.state.paused_until or _parse(self.state.paused_until) < until:
            self.state.paused_until, self.state.pause_reason = _iso(until), reason
        if not self.quiet:
            log.warning("New trades paused until %s: %s", _iso(until), reason)

    def blocked_reason(self, now: datetime) -> str:
        """Why new buys are blocked right now ('' = not blocked)."""
        s = self.state
        if s.halted:
            return f"halted: {s.halted}"
        if s.paused_until and now < _parse(s.paused_until):
            return f"paused until {s.paused_until}: {s.pause_reason}"
        return ""

    # ----------------------------------------------------------------- orders
    def stop_distance(self, price: float, atr: float) -> float:
        """How far below the entry the stop-loss goes: stop_atr_mult x ATR, capped at max_stop_pct."""
        return min(self.config.stop_atr_mult * atr, price * self.config.max_stop_pct / 100)

    def check_buy(self, price: float, atr: float, equity: float, cash: float,
                  open_trades: int, rules: MarketRules, now: datetime,
                  max_order_value: float | None = None) -> Decision:
        """Approve (and size) a new buy, or reject it with a reason."""
        c = self.config
        blocked = self.blocked_reason(now)
        if blocked:
            return Decision(False, blocked)
        if open_trades >= c.max_open_trades:
            return Decision(False, f"max open trades ({c.max_open_trades}) reached")
        if not (price > 0 and atr > 0 and equity > 0):
            return Decision(False, "missing price/ATR/equity data")

        distance = self.stop_distance(price, atr)
        # Volatility sizing: lose risk_per_trade_pct of equity if the stop is hit
        value = equity * c.risk_per_trade_pct / 100 / distance * price
        caps = {
            "max % per trade": equity * c.max_pct_per_trade / 100,
            "max order size": c.max_order_value if max_order_value is None else max_order_value,
            "available cash": cash / (1 + c.fee_pct / 100),     # spot only: never borrow
        }
        for name, cap in caps.items():
            if value > cap:
                value = cap
        amount = rules.round_amount(value / price)
        if not rules.is_valid(amount, price):
            return Decision(False, f"order {amount * price:.2f} is below the exchange minimum "
                                   f"({rules.min_cost:g}) or amount precision")
        return Decision(True, "approved", amount=amount, stop_price=price - distance)

    def check_sell(self, amount: float, price: float, rules: MarketRules) -> Decision:
        """Selling to close is always allowed, but it must still meet the exchange rules."""
        amount = rules.round_amount(amount)
        if not rules.is_valid(amount, price):
            return Decision(False, "amount below the exchange minimum (dust)")
        return Decision(True, "approved", amount=amount)

    def trailing_stop(self, current_stop: float, highest_price: float, atr: float) -> float:
        """New stop = highest price since entry - trailing_atr_mult x ATR. It only ever moves UP."""
        return max(current_stop, highest_price - self.config.trailing_atr_mult * atr)


def main():
    from bot.config import load_config
    from bot.storage import StateStore

    parser = argparse.ArgumentParser(description="Show or reset the Risk Manager state")
    parser.add_argument("--reset", action="store_true", help="clear halts, pauses and the drawdown peak")
    parser.add_argument("--equity", type=float, help="with --reset: your current account value")
    parser.add_argument("--market", default="all", help="crypto, stocks, forex or all")
    args = parser.parse_args()

    cfg = load_config()
    store = StateStore()
    markets = list(cfg["markets"]) if args.market == "all" else [args.market]
    for market in markets:
        rm = RiskManager(RiskConfig.from_config(cfg, cfg["markets"][market]["fee_pct"]), store, market=market)
        if args.reset:
            rm.reset(args.equity)
            print(f"[{market}] Risk Manager reset.")
        print(f"\n[{market}] state:", asdict(rm.state))
        print(f"[{market}] new buys:", rm.blocked_reason(datetime.now(timezone.utc)) or "allowed")
    print("\nLimits:", asdict(RiskConfig.from_config(cfg)))


if __name__ == "__main__":
    main()
