"""Unit tests for the Risk Manager: order sizing, hard limits, halts, pauses and persistence."""
from datetime import datetime, timedelta, timezone

import pytest

from bot.risk import RiskConfig, RiskManager
from bot.rules import MarketRules
from bot.storage import StateStore

NOW = datetime(2026, 1, 10, 12, 0, tzinfo=timezone.utc)
RULES = MarketRules(min_cost=5, amount_step=0.00001)


def manager(**overrides):
    config = dict(max_order_value=1_000_000, fee_pct=0)   # no size caps unless a test sets them
    config.update(overrides)
    rm = RiskManager(RiskConfig(**config))
    rm.update_equity(1000, NOW)
    return rm


def buy(rm, price=100.0, atr=2.0, equity=1000.0, cash=1000.0, open_trades=0, now=NOW, rules=RULES):
    return rm.check_buy(price, atr, equity, cash, open_trades, rules, now)


# ---------------------------------------------------------------- sizing

def test_size_so_a_stop_loss_costs_1_percent():
    # Stop = 2 x ATR(2) = 4 below 100. Losing 1% of 1000 = 10 -> 10 / 4 = 2.5 coins = 250 USDT
    d = buy(manager(max_pct_per_trade=100))
    assert d.approved
    assert d.stop_price == pytest.approx(96)
    assert d.amount == pytest.approx(2.5)
    assert d.amount * (100 - d.stop_price) == pytest.approx(10)


def test_higher_volatility_means_smaller_position():
    calm = buy(manager(max_pct_per_trade=100), atr=1)
    wild = buy(manager(max_pct_per_trade=100), atr=4)
    assert wild.amount == pytest.approx(calm.amount / 4)


def test_stop_is_never_more_than_max_stop_pct_below_entry():
    d = buy(manager(max_pct_per_trade=100, max_stop_pct=15), atr=20)   # 2 x 20 = 40% -> capped at 15%
    assert d.stop_price == pytest.approx(85)


def test_capped_at_max_pct_of_account():
    d = buy(manager(max_pct_per_trade=25))          # wants 250, cap 25% of 1000 = 250
    assert d.amount * 100 <= 250 + 1e-9
    d = buy(manager(max_pct_per_trade=10))
    assert d.amount * 100 == pytest.approx(100)


def test_capped_at_max_order_size_from_env():
    d = buy(manager(max_order_value=20, max_pct_per_trade=100))
    assert d.amount * 100 == pytest.approx(20)


def test_never_spends_more_cash_than_available_including_fee():
    rm = manager(max_pct_per_trade=100, fee_pct=0.1)
    d = buy(rm, cash=50)
    assert d.amount * 100 * 1.001 <= 50 + 1e-9


def test_rejected_below_exchange_minimum():
    d = buy(manager(max_order_value=4))                 # 4 USDT < 5 USDT minimum
    assert not d.approved and "minimum" in d.reason


def test_amount_rounded_down_to_exchange_step():
    rules = MarketRules(min_cost=5, amount_step=0.1)
    d = buy(manager(max_pct_per_trade=100), atr=3, rules=rules)   # 10 / 6 = 1.666.. -> 1.6
    assert d.amount == pytest.approx(1.6)


def test_max_open_trades():
    d = buy(manager(max_open_trades=3), open_trades=3)
    assert not d.approved and "open trades" in d.reason


def test_missing_data_is_rejected():
    assert not buy(manager(), atr=0).approved


# ---------------------------------------------------------------- stops

def test_trailing_stop_only_moves_up():
    rm = manager(trailing_atr_mult=3)
    stop = rm.trailing_stop(current_stop=96, highest_price=110, atr=2)
    assert stop == pytest.approx(104)
    assert rm.trailing_stop(current_stop=stop, highest_price=105, atr=2) == pytest.approx(104)


def test_selling_is_allowed_even_when_halted():
    rm = manager()
    rm.kill()
    assert not buy(rm).approved
    assert rm.check_sell(1.0, 100, RULES).approved


def test_selling_dust_is_rejected():
    assert not manager().check_sell(0.00001, 100, RULES).approved


# ---------------------------------------------------------------- halts

def test_daily_loss_limit_halts_until_next_day():
    rm = manager(daily_loss_limit_pct=3, max_drawdown_pct=50)
    rm.update_equity(969, NOW + timedelta(hours=1))       # -3.1% today
    assert "daily_loss" in rm.blocked_reason(NOW)
    rm.update_equity(969, NOW + timedelta(hours=5))       # still the same day
    assert not buy(rm).approved
    tomorrow = NOW + timedelta(days=1)
    rm.update_equity(969, tomorrow)
    assert rm.blocked_reason(tomorrow) == ""
    assert buy(rm, now=tomorrow).approved


def test_max_drawdown_halts_until_manual_reset():
    rm = manager(daily_loss_limit_pct=50, max_drawdown_pct=20)
    rm.update_equity(1500, NOW)                            # new peak
    rm.update_equity(1190, NOW + timedelta(days=2))        # -20.7% from peak
    later = NOW + timedelta(days=30)
    rm.update_equity(1190, later)
    assert "max_drawdown" in rm.blocked_reason(later)      # a new day does NOT clear it
    rm.reset(equity=1190)
    assert rm.blocked_reason(later) == ""
    assert rm.state.peak_equity == 1190


def test_kill_switch_blocks_new_buys():
    rm = manager()
    rm.kill()
    assert "kill_switch" in buy(rm).reason


# ---------------------------------------------------------------- pauses

def test_cooldown_after_losing_streak():
    rm = manager(losing_streak=3, cooldown_hours=24)
    for i in range(3):
        rm.record_closed_trade(-5, stopped_out=False, now=NOW)
    assert "3 losing trades" in buy(rm).reason
    assert buy(rm, now=NOW + timedelta(hours=25)).approved


def test_a_win_resets_the_losing_streak():
    rm = manager(losing_streak=3)
    rm.record_closed_trade(-5, False, NOW)
    rm.record_closed_trade(-5, False, NOW)
    rm.record_closed_trade(+5, False, NOW)
    rm.record_closed_trade(-5, False, NOW)
    assert buy(rm).approved


def test_pause_after_too_many_stop_losses_in_window():
    rm = manager(max_stops=3, stops_window_hours=24, stops_pause_hours=48, losing_streak=99)
    for h in range(4):                                     # 4 stops within 3 hours
        rm.record_closed_trade(-1, stopped_out=True, now=NOW + timedelta(hours=h))
    t = NOW + timedelta(hours=4)
    assert "stop-losses" in buy(rm, now=t).reason
    assert buy(rm, now=t + timedelta(hours=48)).approved


def test_old_stop_losses_fall_out_of_the_window():
    rm = manager(max_stops=3, stops_window_hours=24, losing_streak=99)
    for d in range(4):                                     # 4 stops, but 1 per day
        rm.record_closed_trade(-1, stopped_out=True, now=NOW + timedelta(days=d))
    assert buy(rm, now=NOW + timedelta(days=4)).approved


# ---------------------------------------------------------------- persistence

def test_state_survives_a_restart(tmp_path):
    db = tmp_path / "state.db"
    rm = RiskManager(RiskConfig(max_drawdown_pct=10, daily_loss_limit_pct=50), StateStore(db))
    rm.update_equity(1000, NOW)
    rm.update_equity(850, NOW + timedelta(days=1))        # -15% -> halted
    rm.store.close()

    restarted = RiskManager(RiskConfig(), StateStore(db))
    assert "max_drawdown" in restarted.blocked_reason(NOW + timedelta(days=2))
    assert restarted.state.peak_equity == 1000


def test_max_order_size_comes_from_env(monkeypatch):
    monkeypatch.setenv("MAX_ORDER_USDT", "20")
    config = RiskConfig.from_config({"risk": {"max_open_trades": 2, "unknown_key": 1}})
    assert config.max_order_value == 20
    assert config.max_open_trades == 2
