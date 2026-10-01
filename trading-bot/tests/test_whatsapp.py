"""WhatsApp alerts: sends to CallMeBot, never raises, every alert reaches every channel."""
from bot.whatsapp import WhatsApp


class FakeHttp:
    def __init__(self, status=200, text="Message queued", fail=False):
        self.status, self.text, self.fail, self.calls = status, text, fail, []

    def get(self, url, params, timeout):
        self.calls.append(params)
        if self.fail:
            raise ConnectionError("offline")
        return type("R", (), {"status_code": self.status, "text": self.text})()


def test_sends_message(monkeypatch):
    http = FakeHttp()
    assert WhatsApp("+27820000000", "123456", http).send("BUY BTC")
    assert http.calls[0] == {"phone": "+27820000000", "text": "BUY BTC", "apikey": "123456"}


def test_never_raises(monkeypatch):
    monkeypatch.setattr("bot.whatsapp.time.sleep", lambda s: None)
    assert WhatsApp("+27", "1", FakeHttp(fail=True)).send("x") is False
    assert WhatsApp("+27", "1", FakeHttp(text="APIKey is invalid")).send("x") is False


def test_from_env(monkeypatch):
    monkeypatch.delenv("WHATSAPP_PHONE", raising=False)
    assert WhatsApp.from_env() is None
    monkeypatch.setenv("WHATSAPP_PHONE", "+27")
    monkeypatch.setenv("WHATSAPP_APIKEY", "99")
    assert WhatsApp.from_env().apikey == "99"


def test_secrets_never_reach_the_log(monkeypatch, caplog):
    import logging
    from bot.logger import RedactSecrets
    monkeypatch.setenv("WHATSAPP_APIKEY", "SUPERSECRET")
    record = logging.LogRecord("x", logging.INFO, "", 0, "url apikey=%s", ("SUPERSECRET",), None)
    RedactSecrets().filter(record)
    assert "SUPERSECRET" not in record.getMessage() and "***" in record.getMessage()
