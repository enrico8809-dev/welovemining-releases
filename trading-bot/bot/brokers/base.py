"""The interface every broker implements, so the trader works the same on every market.

    get_candles(symbol)              closed candles only (the forming one is dropped)
    get_price(symbol)                latest price
    get_balance()                    free cash, in the account currency (USDT / USD / ...)
    get_positions()                  {symbol: quantity}; negative = short (Forex only)
    place_order(symbol, side, decision, price)    open/increase a position
    close_position(symbol, decision, price)       close (part of) a position
    rules(symbol)                    exchange minimums and precision

Safety
  * place_order / close_position refuse anything that was not approved by the Risk Manager
    (a Decision with approved=True). There is no other way to send an order.
  * No withdrawals anywhere in the brokers.
"""
from dataclasses import dataclass

import pandas as pd

from bot.risk import Decision
from bot.rules import MarketRules


@dataclass
class Fill:
    qty: float
    price: float
    fee: float                  # in the account currency
    pnl: float | None = None    # realised P&L when the broker reports it (MT5), else computed by the trader
    reason: str = ""            # MT5: "stop_loss" when the broker's stop closed the position


class OrderRejected(Exception):
    pass


def require_approval(decision: Decision) -> None:
    if not isinstance(decision, Decision) or not decision.approved:
        raise OrderRejected("order not approved by the Risk Manager")


def closed_only(df: pd.DataFrame, timeframe: str) -> pd.DataFrame:
    """Drop the candle that is still open (its close time is in the future)."""
    step = pd.Timedelta(timeframe.replace("d", "D"))
    now = pd.Timestamp.now(tz="UTC")
    return df[df.index + step <= now]


class Broker:
    market = ""
    quote = "USDT"
    live = False

    def get_candles(self, symbol: str, timeframe: str = "1d", limit: int = 400) -> pd.DataFrame: ...
    def get_price(self, symbol: str) -> float: ...
    def get_balance(self) -> float: ...
    def get_positions(self) -> dict: ...
    def place_order(self, symbol: str, side: str, decision: Decision, price: float) -> Fill | None: ...
    def close_position(self, symbol: str, decision: Decision, price: float) -> Fill | None: ...
    def rules(self, symbol: str) -> MarketRules: ...

    def get_equity(self) -> float | None:
        """Account value as the broker reports it, or None to let the trader add it up."""
        return None

    def cancel_all(self) -> int:
        return 0


class SpotBroker(Broker):
    """Spot/cash markets (crypto, stocks): you can only buy what you pay for, and sell what you hold."""

    def place_order(self, symbol, side, decision, price):
        if side != "buy":
            raise OrderRejected("spot only: opening a short position is not allowed")
        return self._buy(symbol, decision, price)

    def close_position(self, symbol, decision, price):
        return self._sell(symbol, decision, price)

    def _buy(self, symbol, decision, price): ...
    def _sell(self, symbol, decision, price): ...
