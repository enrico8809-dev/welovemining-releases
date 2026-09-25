"""Loads settings from config.yaml and secrets from .env."""
import os
from pathlib import Path

import yaml
from dotenv import load_dotenv

# Folder that contains config.yaml, .env and all the code folders
ROOT = Path(__file__).resolve().parent.parent


def load_config(path: Path | str | None = None) -> dict:
    """Read config.yaml into a dict. Also loads .env into environment variables."""
    load_dotenv(ROOT / ".env")
    path = Path(path) if path else ROOT / "config.yaml"
    with open(path, "r", encoding="utf-8") as f:
        return yaml.safe_load(f)


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
