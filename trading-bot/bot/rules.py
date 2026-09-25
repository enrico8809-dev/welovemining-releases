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
