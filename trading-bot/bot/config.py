"""Loads settings from config.yaml and secrets from .env.

Settings changed in the WLM Trader app are saved to data/app_settings.json and applied on
top of config.yaml (so config.yaml and its comments are never rewritten).
"""
import json
import os
from pathlib import Path

import yaml
from dotenv import load_dotenv

# Folder that contains config.yaml, .env and all the code folders
ROOT = Path(__file__).resolve().parent.parent


APP_SETTINGS = ROOT / "data" / "app_settings.json"


def load_config(path: Path | str | None = None, overrides: bool = True) -> dict:
    """Read config.yaml into a dict, plus the app's saved changes. Also loads .env."""
    load_dotenv(ROOT / ".env")
    path = Path(path) if path else ROOT / "config.yaml"
    with open(path, "r", encoding="utf-8") as f:
        cfg = yaml.safe_load(f)
    if overrides and path == ROOT / "config.yaml":
        cfg = deep_merge(cfg, load_overrides())
    return cfg


def load_overrides() -> dict:
    try:
        return json.loads(APP_SETTINGS.read_text(encoding="utf-8"))
    except (FileNotFoundError, json.JSONDecodeError):
        return {}


def save_overrides(values: dict) -> None:
    APP_SETTINGS.parent.mkdir(parents=True, exist_ok=True)
    APP_SETTINGS.write_text(json.dumps(values, indent=2), encoding="utf-8")


def deep_merge(base: dict, extra: dict) -> dict:
    """Copy of `base` with `extra` merged in (nested dicts merged, everything else replaced)."""
    out = dict(base)
    for key, value in extra.items():
        out[key] = deep_merge(out[key], value) if isinstance(value, dict) and isinstance(out.get(key), dict) else value
    return out


def update_env(values: dict[str, str]) -> None:
    """Set keys in .env (keeping every other line) and in this process's environment."""
    path = ROOT / ".env"
    lines = path.read_text(encoding="utf-8").splitlines() if path.exists() else []
    remaining = dict(values)
    for i, line in enumerate(lines):
        key = line.split("=", 1)[0].strip()
        if not line.lstrip().startswith("#") and key in remaining:
            lines[i] = f"{key}={remaining.pop(key)}"
    lines += [f"{k}={v}" for k, v in remaining.items()]
    path.write_text("\n".join(lines) + "\n", encoding="utf-8")
    for k, v in values.items():
        os.environ[k] = str(v)


def env_bool(name: str, default: bool = False) -> bool:
    """Read a true/false value from .env. Anything other than 'true'/'1'/'yes' is False."""
    value = os.getenv(name)
    if value is None:
        return default
    return value.strip().lower() in ("true", "1", "yes")


def is_live_trading() -> bool:
    """PAPER mode is the default. Live only when LIVE_TRADING=true in .env."""
    load_dotenv(ROOT / ".env")
    return env_bool("LIVE_TRADING", default=False)


def is_forex_live() -> bool:
    """Forex uses an MT5 DEMO account by default. A REAL account only when FOREX_LIVE_TRADING=true."""
    load_dotenv(ROOT / ".env")
    return env_bool("FOREX_LIVE_TRADING", default=False)
