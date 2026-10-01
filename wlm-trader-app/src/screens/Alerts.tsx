import { useCallback } from "react";
import { BellRing, MessageCircle, Send } from "lucide-react";
import { useApp } from "../App";
import { useAction, useLoad } from "../hooks";
import { Card, Page, Pill } from "../components/ui";
import { SecretFields } from "../components/Secrets";

export default function Alerts() {
  const { api } = useApp();
  const act = useAction();
  const load = useCallback(() => api.settings(), [api]);
  const { data, reload } = useLoad(load);
  if (!data) return <Page title="Alerts"><div className="empty">Loading…</div></Page>;
  const wa = data.secrets.WHATSAPP_PHONE && data.secrets.WHATSAPP_APIKEY;
  const tg = data.secrets.TELEGRAM_BOT_TOKEN && data.secrets.TELEGRAM_CHAT_ID;

  return (
    <Page title="Alerts" sub="Every trade, error and a daily summary, straight to your phone"
      actions={<button className="btn primary" disabled={!wa && !tg} onClick={() => act(() => api.testAlerts(), "Test message sent")}>
        <Send size={17} />Send test message</button>}>
      <div className="grid grid-2">
        <Card title={<span className="row" style={{ gap: 8 }}><MessageCircle size={18} />WhatsApp</span>}
          actions={wa ? <Pill tone="green">on</Pill> : <Pill>off</Pill>}>
          <ol className="steps small" style={{ marginBottom: 14 }}>
            <li>Open <a href="https://www.callmebot.com/blog/free-api-whatsapp-messages/" target="_blank" rel="noreferrer">CallMeBot's WhatsApp page</a> and add the number shown there to your contacts.</li>
            <li>Send it the WhatsApp message: <b>I allow callmebot to send me messages</b></li>
            <li>It replies with an API key. Enter your number and that key below.</li>
          </ol>
          <SecretFields local={data.local} status={data.secrets} onSaved={reload} fields={[
            { key: "WHATSAPP_PHONE", label: "Your WhatsApp number", help: "With country code, e.g. +27821234567" },
            { key: "WHATSAPP_APIKEY", label: "CallMeBot API key", password: true },
          ]} />
        </Card>
        <Card title={<span className="row" style={{ gap: 8 }}><BellRing size={18} />Telegram</span>}
          actions={tg ? <Pill tone="green">on</Pill> : <Pill>off</Pill>}>
          <ol className="steps small" style={{ marginBottom: 14 }}>
            <li>In Telegram, message <b>@BotFather</b>, send <b>/newbot</b> and copy the token.</li>
            <li>Send any message to your new bot, then open <b>api.telegram.org/bot&lt;TOKEN&gt;/getUpdates</b> and copy the number after <b>"chat":{"{"}"id":</b></li>
          </ol>
          <SecretFields local={data.local} status={data.secrets} onSaved={reload} fields={[
            { key: "TELEGRAM_BOT_TOKEN", label: "Bot token", password: true },
            { key: "TELEGRAM_CHAT_ID", label: "Your chat ID" },
          ]} />
          <div className="field-help" style={{ marginTop: 10 }}>Telegram also takes commands: /status /balance /positions /pause /resume /stop.</div>
        </Card>
      </div>
    </Page>
  );
}
