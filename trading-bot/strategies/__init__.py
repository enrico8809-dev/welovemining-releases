"""Strategy plug-ins. Each strategy lives in its own file in this folder.

load_strategy("sma_cross", fast=10, slow=40) imports strategies/sma_cross.py
and creates the Strategy class found inside it. To add a strategy, just add a file.
"""
import importlib
import inspect
import pkgutil
from pathlib import Path

from strategies.base import Strategy


def available_strategies() -> list[str]:
    folder = Path(__file__).parent
    return sorted(m.name for m in pkgutil.iter_modules([str(folder)]) if m.name not in ("base", "indicators"))


def load_strategy(name: str, **params) -> Strategy:
    if name not in available_strategies():
        raise ValueError(f"Unknown strategy '{name}'. Available: {', '.join(available_strategies())}")
    module = importlib.import_module(f"strategies.{name}")
    for _, cls in inspect.getmembers(module, inspect.isclass):
        if issubclass(cls, Strategy) and cls is not Strategy and cls.__module__ == module.__name__:
            return cls(**params)
    raise ValueError(f"No Strategy class found in strategies/{name}.py")
