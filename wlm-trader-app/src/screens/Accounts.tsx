import { useCallback, useState } from "react";
import { AlertTriangle, Bitcoin, CandlestickChart } from "lucide-react";
import { useApp } from "../App";
import { useLoad, useSettings } from "../hooks";
import { Banner, Card, Field, Modal, Page, Pill, Toggle } from "../components/ui";
import { SecretFields } from "../components/Secrets";
import { SaveBar } from "../components/SaveBar";
import { MARKET_LABEL, signed, upDown } from "../format";

type LiveKey = "LIVE_TRADING" | "FOREX_LIVE_TRADING";

export default function Accounts() {
  const { api } = useApp();
  const s = useSettings();
  const loadRecord = useCallback(() => api.trades(undefined, 1), [api]);
  const { data: history } = useLoad(loadRecord);
  const [confirm, setConfirm] = useState<LiveKey | null>(null);
  if (!s.data) return <Page title="Accounts"><div className="empty">{s.error || "Loading…"}</div></Page>;
  const { secrets, local } = s.data;

  const flip = (key: LiveKey, on: boolean) => (on ? setConfirm(key) : s.setEnv(key, false));
  const markets = confirm === "FOREX_LIVE_TRADING" ? ["forex"] : ["crypto", "stocks"];

  return (
    <Page title="Accounts" sub="Where the bot trades, and whether it uses real money">
      <Card title="Real money">
        <div className="stack">
          <div className="list-item">
            <div>
              <div className="sym">Crypto and stocks</div>
              <div className="mute small">Off = PAPER trading: real prices, pretend money.</div>
            </div>
            <div className="row">{s.envValue<boolean>("LIVE_TRADING") ? <Pill tone="red">Live money</Pill> : <Pill tone="orange">Paper</Pill>}
              <Toggle label="Live crypto and stocks" on={!!s.envValue<boolean>("LIVE_TRADING")} onChange={(v) => flip("LIVE_TRADING", v)} /></div>
          </div>
          <div className="list-item">
            <div>
              <div className="sym">Forex (MetaTrader 5)</div>
              <div className="mute small">Off = the bot refuses to trade unless MT5 is logged in to a DEMO account.</div>
            </div>
            <div className="row">{s.envValue<boolean>("FOREX_LIVE_TRADING") ? <Pill tone="red">Live allowed</Pill> : <Pill tone="blue">Demo only</Pill>}
              <Toggle label="Live Forex" on={!!s.envValue<boolean>("FOREX_LIVE_TRADING")} onChange={(v) => flip("FOREX_LIVE_TRADING", v)} /></div>
          </div>
        </div>
      </Card>

      <div className="grid grid-2">
        <Card title={<span className="row" style={{ gap: 8 }}><Bitcoin size={18} />Crypto exchange</span>}>
          <div className="stack" style={{ gap: 14 }}>
            <Field label="Exchange">
              <select className="select" value={s.envValue<string>("EXCHANGE")} onChange={(e) => s.setEnv("EXCHANGE", e.target.value)}>
                {s.data.options.exchanges.map((x) => <option key={x} value={x}>{x}</option>)}
              </select>
            </Field>
            <Banner tone="warn" icon={<AlertTriangle size={18} />}>
              Create the API key with <b>Reading</b> and <b>Spot trading</b> only. <b>Never</b> enable withdrawals,
              and restrict it to your home IP address.
            </Banner>
            <SecretFields local={local} status={secrets} onSaved={() => undefined} fields={[
              { key: "API_KEY", label: "API key" },
              { key: "API_SECRET", label: "API secret", password: true },
            ]} />
            <div className="field-help">Not needed for paper trading.</div>
          </div>
        </Card>

        <Card title={<span className="row" style={{ gap: 8 }}><CandlestickChart size={18} />MetaTrader 5 (Forex)</span>}>
          <div className="stack" style={{ gap: 14 }}>
            <ol className="steps small">
              <li>Install your broker's <b>MetaTrader 5</b> on this PC and log in (start with a <b>demo</b> account).</li>
              <li>In MT5: Tools → Options → Expert Advisors → tick <b>Allow algorithmic trading</b>, and turn the <b>Algo Trading</b> button green.</li>
              <li>Enter the same login below (File → Login in MT5 shows the server name).</li>
            </ol>
            <SecretFields local={local} status={secrets} onSaved={() => undefined} fields={[
              { key: "MT5_LOGIN", label: "Login (account number)" },
              { key: "MT5_PASSWORD", label: "Password", password: true },
              { key: "MT5_SERVER", label: "Server", help: "e.g. YourBroker-Demo" },
              { key: "MT5_PATH", label: "Terminal path (optional)", help: "Only if you have more than one MT5 installed." },
            ]} />
          </div>
        </Card>
      </div>

      <Modal open={confirm !== null} onClose={() => setConfirm(null)}>
        <h2 className="row" style={{ gap: 8, color: "var(--red)" }}><AlertTriangle size={22} />Trade with real money?</h2>
        <div className="stack" style={{ gap: 12 }}>
          <div className="dim">Read this first. Nobody can promise this bot will make money.</div>
          <ul className="steps small">
            <li>Real orders will be placed with your {confirm === "FOREX_LIVE_TRADING" ? "MT5 broker account" : "exchange and broker accounts"}.</li>
            <li>You <b>can lose money</b>. Backtests showed small gains at best, and losing streaks.</li>
            <li>Start with a <b>small amount</b> you can afford to lose. Keep the risk at 1% per trade.</li>
            {confirm === "LIVE_TRADING" && <li>Crypto and stock stop-losses only work while this PC and the bot are running.</li>}
            {confirm === "FOREX_LIVE_TRADING" && <li>Forex stop-losses sit at the broker, but a price gap (weekend, big news) can jump past them.</li>}
          </ul>
          <div className="card" style={{ padding: 12, background: "var(--panel2)" }}>
            <div className="label" style={{ marginBottom: 6 }}>Your practice record</div>
            {markets.map((m) => {
              const r = history?.record?.[m];
              return (
                <div key={m} className="row between small">
                  <span>{MARKET_LABEL[m]}</span>
                  {r ? <span className="num">{r.days} days · {r.closed} closed trades · <span className={upDown(r.pnl)}>{signed(r.pnl)}</span></span>
                    : <span className="mute">no practice trades yet</span>}
                </div>
              );
            })}
          </div>
          <div className="row" style={{ justifyContent: "flex-end" }}>
            <button className="btn" onClick={() => setConfirm(null)}>Keep practising</button>
            <button className="btn danger" onClick={() => { s.setEnv(confirm!, true); setConfirm(null); }}>I understand, switch on</button>
          </div>
          <div className="field-help">It takes effect when you press Save.</div>
        </div>
      </Modal>
      <SaveBar dirty={s.dirty} saving={s.saving} onSave={s.save} onDiscard={s.discard} />
    </Page>
  );
}
