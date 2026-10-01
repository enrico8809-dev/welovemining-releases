"""Forex sizing (lots, 1:1 exposure cap, stop rules), market hours and short signals."""
from datetime import datetime, timezone

import numpy as np
import pandas as pd
import pytest

from bot.forex_hours import entry_block_reason, is_open
from bot.risk import RiskConfig, RiskManager
from bot.rules import LotRules
from strategies import load_strategy, supports_short
from tests.conftest import make_candles

NOW = datetime(2026, 10, 7, 12, 0, tzinfo=timezone.utc)      # a Wednesday


def fx_manager(**overrides):
    return RiskManager(RiskConfig(**{"max_lots": 10, **overrides}))


def entry(rm, side="buy", price=1.1, atr=0.005, equity=10_000, exposure=0.0, trades=0,
          rules=None, to_account=1.0, spread=0.0):
    return rm.check_forex_entry(side, price, atr, equity, exposure, trades,
                                rules or LotRules.default_for("EURUSD"), to_account, NOW, spread)


def test_risk_based_size_is_capped_at_one_to_one():
    # 1% of 10,000 = 100 risk; stop 2 x 0.005 = 0.01 -> 100 / (0.01 x 100,000) = 0.1 lot
    # but 0.1 lot of EURUSD = 11,000 USD > 10,000 account -> capped to 0.09 lot (1:1)
    d = entry(fx_manager())
    assert d.approved and d.amount == pytest.approx(0.09) and d.side == "buy"
    assert d.stop_price == pytest.approx(1.09)
    assert d.amount * 100_000 * 1.1 <= 10_000                    # never more exposure than the account


def test_risk_sizing_when_the_cap_is_not_binding():
    d = entry(fx_manager(), atr=0.01)                              # stop 0.02 -> 0.05 lot = 5,500 exposure
    assert d.approved and d.amount == pytest.approx(0.05)


def test_short_stop_goes_above_the_price():
    d = entry(fx_manager(), side="sell")
    assert d.approved and d.side == "sell" and d.stop_price == pytest.approx(1.11)


def test_exposure_cap_counts_open_positions():
    assert not entry(fx_manager(), exposure=10_000).approved
    d = entry(fx_manager(), exposure=8_000)                        # 2,000 room -> 0.01 lot (1,100)
    assert d.approved and d.amount == pytest.approx(0.01)


def test_too_small_account_is_rejected_not_rounded_up():
    d = entry(fx_manager(), equity=500)                            # 0.01 lot = 1,100 > 500 at 1:1
    assert not d.approved and "too small" in d.reason


def test_usdjpy_is_converted_to_the_account_currency():
    rules = LotRules.default_for("USDJPY")
    d = entry(fx_manager(), price=150.0, atr=1.0, rules=rules, to_account=1 / 150)
    # risk: 2 yen x 100,000 / 150 = 1,333 USD per lot -> 0.075; cap: 1 lot = 100,000 USD -> 0.1
    assert d.approved and d.amount == pytest.approx(0.07)


def test_stop_respects_the_broker_stop_level_and_spread():
    rules = LotRules.default_for("EURUSD")
    rules.stops_level = 3000                                       # 0.03 minimum distance
    d = entry(fx_manager(), rules=rules, spread=0.0002)
    assert d.stop_price <= 1.1 - 0.0302


def test_forex_entry_obeys_halts_and_max_trades():
    rm = fx_manager(max_open_trades=2)
    assert "max open trades" in entry(rm, trades=2).reason
    rm.kill()
    assert not entry(rm).approved
    assert not entry(fx_manager(), to_account=None).approved


def test_short_trailing_stop_only_moves_down():
    rm = RiskManager(RiskConfig(trailing_atr_mult=3))
    assert rm.trailing_stop(1.12, 1.10, 0.002, side="sell") == pytest.approx(1.106)
    assert rm.trailing_stop(1.106, 1.105, 0.002, side="sell") == pytest.approx(1.106)


def test_lot_rounding_is_down():
    assert LotRules.default_for("EURUSD").round_lots(0.0199) == 0.01
    gold = LotRules.default_for("XAUUSD")
    assert gold.contract_size == 100 and gold.digits == 2


def test_forex_risk_section_overrides(monkeypatch):
    monkeypatch.setenv("MAX_ORDER_USDT", "20")
    cfg = {"risk": {"max_open_trades": 3}, "forex_risk": {"max_open_trades": 2, "max_leverage": 1}}
    assert RiskConfig.from_config(cfg, market="forex").max_open_trades == 2
    assert RiskConfig.from_config(cfg).max_order_value == 20


# ---------------------------------------------------------------- market hours
@pytest.mark.parametrize("when, open_", [
    ("2026-10-10 12:00", False),        # Saturday
    ("2026-10-11 20:30", False),        # Sunday 16:30 New York (summer time = UTC-4)
    ("2026-10-11 21:30", True),         # Sunday 17:30 New York
    ("2026-10-09 20:30", True),         # Friday 16:30 New York
    ("2026-10-09 21:30", False),        # Friday 17:30 New York
    ("2026-12-11 21:30", True),         # Friday 16:30 New York in winter (UTC-5)
])
def test_market_open(when, open_):
    assert is_open(datetime.fromisoformat(when).replace(tzinfo=timezone.utc)) is open_


def test_no_entries_after_open_before_close_or_around_news():
    t = lambda s: datetime.fromisoformat(s).replace(tzinfo=timezone.utc)
    assert "Sunday open" in entry_block_reason(t("2026-10-11 21:30"))
    assert entry_block_reason(t("2026-10-11 22:30")) == ""
    assert "Friday close" in entry_block_reason(t("2026-10-09 20:30"))
    cfg = {"news_events": ["2026-10-07 12:30 US inflation"], "news_pause_minutes": 30}
    assert "US inflation" in entry_block_reason(NOW, cfg)
    assert entry_block_reason(t("2026-10-07 13:30"), cfg) == ""


# ---------------------------------------------------------------- short signals
def downtrend():
    return make_candles(np.linspace(1.3, 1.0, 300))


def test_sma_cross_goes_short_only_when_allowed():
    c = downtrend()
    assert load_strategy("sma_cross").target_exposure(c).min() == 0
    assert load_strategy("sma_cross", allow_short=True).target_exposure(c).iloc[-1] == -1


def test_regime_shorts_only_in_a_downtrend():
    c = downtrend()
    long_only = load_strategy("regime").target_exposure(c)
    both = load_strategy("regime", allow_short=True).target_exposure(c)
    assert long_only.min() >= 0 and both.iloc[-1] == -1


def test_rsi_dip_mirror_short():
    # A long downtrend with a sharp 5-day rally (RSI overbought) while still below the 200-day SMA
    closes = np.concatenate([np.linspace(1.4, 1.0, 300), 1.0 + 0.008 * np.arange(1, 6), np.full(20, 1.04)])
    exposure = load_strategy("rsi_dip", rsi_period=5, allow_short=True).target_exposure(make_candles(closes))
    assert exposure.min() == -1 and exposure.max() <= 0


def test_which_strategies_can_short():
    assert supports_short("sma_cross") and supports_short("regime") and supports_short("rsi_dip")
    assert not supports_short("grid") and not supports_short("dca")


def test_crypto_backtest_still_never_shorts():
    from backtest.engine import BacktestSettings, run_backtest
    s = load_strategy("sma_cross", allow_short=True)
    result = run_backtest(downtrend(), s, BacktestSettings())
    assert all(o["side"] in ("buy", "sell") for o in result.orders)
    assert result.equity.min() > 0 and pd.Series(result.equity).iloc[-1] <= 1000
