"""WhatsApp alerts through CallMeBot (free, send-only): trades, errors and the daily summary.

Controls (pause, resume, kill switch...) live in the WLM Trader app and Telegram; WhatsApp
only SENDS you messages.

Setup (one time, about 2 minutes):
  1. Open https://www.callmebot.com/blog/free-api-whatsapp-messages/ and add the WhatsApp
     number shown there to your phone's contacts.
  2. Send it this WhatsApp message:  I allow callmebot to send me messages
  3. It replies with your API key. Put it in .env together with your number:
         WHATSAPP_PHONE=+27821234567
         WHATSAPP_APIKEY=123456
Test it:  python -m bot.whatsapp --test
"""
import argparse
import os
import time

import requests

from bot.logger import get_logger

log = get_logger("whatsapp")
URL = "https://api.callmebot.com/whatsapp.php"


class WhatsApp:
    def __init__(self, phone: str, apikey: str, session=None):
        self.phone, self.apikey = phone, apikey
        self.http = session or requests.Session()

    @classmethod
    def from_env(cls):
        phone, key = os.getenv("WHATSAPP_PHONE"), os.getenv("WHATSAPP_APIKEY")
        return cls(phone, key) if phone and key else None

    def send(self, text: str) -> bool:
        """Send a WhatsApp message to yourself. Never raises: a WhatsApp problem must not stop trading."""
        for attempt in range(3):
            try:
                r = self.http.get(URL, params={"phone": self.phone, "text": text[:1500], "apikey": self.apikey},
                                  timeout=20)
                if r.status_code == 200 and "invalid" not in r.text.lower():
                    return True
                log.warning("WhatsApp send refused (HTTP %s), attempt %d/3", r.status_code, attempt + 1)
            except Exception as e:
                log.warning("WhatsApp send failed (%s), attempt %d/3", type(e).__name__, attempt + 1)
            time.sleep(3 * (attempt + 1))
        return False


def main():
    from bot.config import load_config
    parser = argparse.ArgumentParser(description="WhatsApp alerts")
    parser.add_argument("--test", action="store_true", help="send a test message")
    parser.parse_args()
    load_config()
    wa = WhatsApp.from_env()
    if not wa:
        print("Set WHATSAPP_PHONE and WHATSAPP_APIKEY in .env first (see the top of bot/whatsapp.py).")
        return
    print("Sent." if wa.send("✅ WeLoveMining bot: WhatsApp alerts work!") else "Failed - check the number and API key.")


if __name__ == "__main__":
    main()
