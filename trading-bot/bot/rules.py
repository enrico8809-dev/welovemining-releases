"""Exchange rules for one trading pair: minimum order and amount precision.
Used by the backtester and the Risk Manager, so both follow the same rules as the exchange."""
import math
from dataclasses import dataclass


@dataclass
class MarketRules:
    """Exchange limits for one trading pair."""
    min_cost: float = 5.0          # minimum order value in USDT
    min_amount: float = 0.0        # minimum coin amount
    amount_step: float = 0.00001   # coin amount must be a multiple of this

    def round_amount(self, amount: float) -> float:
        """Round DOWN to the allowed step (rounding up could spend money we don't have)."""
        if not self.amount_step:
            return amount
        steps = math.floor(amount / self.amount_step + 1e-9)
        return round(steps * self.amount_step, 12)

    def is_valid(self, amount: float, price: float) -> bool:
        return amount > 0 and amount >= self.min_amount and amount * price >= self.min_cost


@dataclass
class LotRules:
    """Forex / gold symbol rules from MetaTrader 5. Sizes are in LOTS:
    EURUSD 1 lot = 100,000 EUR, XAUUSD 1 lot = 100 ounces (contract_size)."""
    symbol: str
    contract_size: float = 100_000
    volume_min: float = 0.01          # smallest position (0.01 lot = "micro lot")
    volume_step: float = 0.01
    volume_max: float = 100.0
    point: float = 0.00001            # smallest price change
    digits: int = 5                   # price decimals
    stops_level: int = 0              # broker's minimum stop distance from the price, in points
    base_currency: str = ""           # EUR in EURUSD
    profit_currency: str = ""         # USD in EURUSD: P&L is first counted in this currency
    swap_long: float = 0.0            # overnight cost/credit per lot per night, in points
    swap_short: float = 0.0
    swap_triple_day: int = 3          # weekday that charges 3 nights (MT5: 0=Sunday ... 3=Wednesday)

    @classmethod
    def default_for(cls, symbol: str) -> "LotRules":
        """Typical broker settings, used when no MT5 symbol info has been downloaded."""
        base, profit = symbol[:3], symbol[3:6]
        if base in ("XAU", "XAG"):              # metals: 100 oz (gold) / 5000 oz (silver) per lot
            return cls(symbol, contract_size=100 if base == "XAU" else 5000, point=0.01, digits=2,
                       base_currency=base, profit_currency=profit)
        if profit == "JPY":
            return cls(symbol, point=0.001, digits=3, base_currency=base, profit_currency=profit)
        return cls(symbol, base_currency=base, profit_currency=profit)

    def round_lots(self, lots: float) -> float:
        """Round DOWN to the lot step (rounding up would risk more than allowed)."""
        lots = min(lots, self.volume_max)
        steps = math.floor(lots / self.volume_step + 1e-9)
        return round(steps * self.volume_step, 8)

    def round_price(self, price: float) -> float:
        return round(price, self.digits)

    def to_account(self, price: float, account_currency: str) -> float | None:
        """How many account-currency units 1 unit of the profit currency is worth, using this
        symbol's own price. USD account: EURUSD -> 1, USDJPY -> 1/price. Crosses (EURGBP) -> None."""
        if self.profit_currency == account_currency:
            return 1.0
        if self.base_currency == account_currency and price > 0:
            return 1.0 / price
        return None
