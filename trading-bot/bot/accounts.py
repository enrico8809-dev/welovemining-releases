"""Balances per market and combined, the same everywhere (Telegram, dashboard, app).

Each trader saves a snapshot every loop under `account:<market>`:
    {"equity": ..., "cash": ..., "currency": "USDT"/"USD", "mode": "paper"/"live"/"demo"}
The combined total adds up the markets counted in US dollars (USDT is treated as 1 USD).
"""
from datetime import datetime, timezone

USD_LIKE = {"USD", "USDT", "USDC"}


def account_rows(cfg: dict, store) -> list[dict]:
    from bot.risk import RiskConfig, RiskManager
    now = datetime.now(timezone.utc)
    rows = []
    for market in cfg["trader"]["markets"]:
        acct = store.get(f"account:{market}") or {}
        history = store.equity_history(market)
        first = history[0][2] if history else None
        equity = acct.get("equity", history[-1][2] if history else None)
        paper = store.get(f"paper:{market}") or {}
        rows.append({
            "market": market,
            "equity": equity,
            "cash": acct.get("cash", paper.get("cash")),
            "currency": acct.get("currency", "USDT" if market == "crypto" else "USD"),
            "mode": acct.get("mode", "paper"),
            "change_pct": round(100 * (equity / first - 1), 2) if first and equity else None,
            "positions": len(store.positions(market)),
            "blocked": RiskManager(RiskConfig.from_config(cfg, market=market), store, market=market).blocked_reason(now),
        })
    return rows


def combined(rows: list[dict]) -> dict:
    """Total of the USD-counted markets; others are listed separately."""
    usd = [r for r in rows if r["equity"] is not None and r["currency"] in USD_LIKE]
    return {
        "equity": round(sum(r["equity"] for r in usd), 2),
        "currency": "USD",
        "markets": [r["market"] for r in usd],
        "excluded": [r["market"] for r in rows if r not in usd],
    }
