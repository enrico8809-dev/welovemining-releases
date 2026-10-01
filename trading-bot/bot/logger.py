"""Logging to the console and to logs/bot.log, with a new file every day.
Secrets from .env (keys, passwords, tokens) are blanked out of every log line."""
import logging
import os
from logging.handlers import TimedRotatingFileHandler
from pathlib import Path

from bot.config import ROOT

_configured = False
SECRET_ENV = ("API_KEY", "API_SECRET", "MT5_LOGIN", "MT5_PASSWORD", "TELEGRAM_BOT_TOKEN",
              "WHATSAPP_APIKEY", "APP_TOKEN")


class RedactSecrets(logging.Filter):
    """Replace any secret value from .env with *** before a line is written."""

    def filter(self, record: logging.LogRecord) -> bool:
        secrets = [v for v in (os.getenv(name) for name in SECRET_ENV) if v and len(v) >= 4]
        if secrets:
            message = record.getMessage()
            for value in secrets:
                message = message.replace(value, "***")
            record.msg, record.args = message, None
        return True


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
        for handler in (file_handler, console):
            handler.addFilter(RedactSecrets())

        root = logging.getLogger()
        root.setLevel(level)
        root.addHandler(file_handler)
        root.addHandler(console)
        _configured = True
    return logging.getLogger(name)
