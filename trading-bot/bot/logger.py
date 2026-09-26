"""Logging to the console and to logs/bot.log, with a new file every day."""
import logging
from logging.handlers import TimedRotatingFileHandler
from pathlib import Path

from bot.config import ROOT

_configured = False


def get_logger(name: str = "bot", log_dir: str = "logs", level: str = "INFO",
               keep_days: int = 30) -> logging.Logger:
    """Return a logger. The first call sets up the console + daily rotating file."""
    global _configured
    if not _configured:
        folder = ROOT / log_dir
        folder.mkdir(parents=True, exist_ok=True)
        fmt = logging.Formatter("%(asctime)s %(levelname)-7s %(name)s: %(message)s")

        # Rotates at midnight; old files are named bot.log.2026-09-25 and deleted after keep_days
        file_handler = TimedRotatingFileHandler(
            Path(folder) / "bot.log", when="midnight", backupCount=keep_days, encoding="utf-8")
        file_handler.setFormatter(fmt)
        console = logging.StreamHandler()
        console.setFormatter(fmt)

        root = logging.getLogger()
        root.setLevel(level)
        root.addHandler(file_handler)
        root.addHandler(console)
        _configured = True
    return logging.getLogger(name)
