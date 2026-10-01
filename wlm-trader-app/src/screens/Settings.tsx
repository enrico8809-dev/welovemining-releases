import { useCallback, useEffect, useState } from "react";
import { FolderOpen, LogOut, RefreshCw, Smartphone } from "lucide-react";
import { useApp } from "../App";
import { useLoad } from "../hooks";
import { desktop } from "../desktop";
import { Banner, Card, Page, Pill, Toggle, useToast } from "../components/ui";

export default function Settings() {
  const { api, overview, disconnect } = useApp();
  return (
    <Page title="Settings" sub={`WLM Trader ${overview?.version ?? ""}`}>
      {desktop ? <PhonePairing /> : (
        <Card title="Connection">
          <div className="stack">
            <div className="dim">Connected to <b className="num">{api.conn.url}</b></div>
            <div><button className="btn" onClick={disconnect}><LogOut size={17} />Disconnect this phone</button></div>
          </div>
        </Card>
      )}
      {desktop && <DesktopSettings />}
      <Card title="About">
        <div className="stack small dim">
          <div>WLM Trader controls your WeLoveMining trading bot. The bot runs on your PC; this app is the remote control.</div>
          <div><b>No bot can promise profit.</b> Backtests show what would have happened, not what will. Practise on paper/demo
            first, start small, and never trade money you can't afford to lose.</div>
          <div>© 2026 WeLoveMining (Pty) Ltd · <a href="https://welovemining.co.za" target="_blank" rel="noreferrer">welovemining.co.za</a></div>
        </div>
      </Card>
    </Page>
  );
}

function PhonePairing() {
  const { api } = useApp();
  const toast = useToast();
  const loadTs = useCallback(() => desktop!.tailscale(), []);
  const { data: ts, setData: setTs } = useLoad(loadTs);
  const [code, setCode] = useState<{ code: string; until: number } | null>(null);
  const [now, setNow] = useState(Date.now());
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!code) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [code]);

  const enable = async () => {
    setBusy(true);
    try {
      setTs(await desktop!.enablePhoneAccess());
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e), "error");
    } finally {
      setBusy(false);
    }
  };
  const makeCode = async () => {
    try {
      const r = await api.pairStart();
      setCode({ code: r.code, until: Date.now() + r.expires_in * 1000 });
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e), "error");
    }
  };
  const left = code ? Math.max(0, Math.round((code.until - now) / 1000)) : 0;
  const host = ts?.url?.replace(/^https:\/\//, "").replace(/\/$/, "");

  return (
    <Card title={<span className="row" style={{ gap: 8 }}><Smartphone size={18} />Phone</span>}
      actions={ts?.serving ? <Pill tone="green">phone access on</Pill> : <Pill>phone access off</Pill>}>
      <div className="stack" style={{ gap: 14 }}>
        {!ts ? <div className="mute">Checking Tailscale…</div> : !ts.installed ? (
          <Banner tone="warn">
            Install <a href="https://tailscale.com/download" target="_blank" rel="noreferrer">Tailscale</a> on this PC and on your phone,
            and log in with the same account on both. It's a free private network: only your own devices can reach the bot.
          </Banner>
        ) : !ts.serving ? (
          <>
            <div className="dim">Let your phone reach the bot through Tailscale (private: only your own devices).</div>
            <div><button className="btn primary" disabled={busy} onClick={enable}>{busy ? "Turning on…" : "Turn on phone access"}</button></div>
            <div className="field-help">The first time, Tailscale may open a page asking you to allow this. Click Enable there, then press the button again.</div>
          </>
        ) : (
          <>
            <ol className="steps">
              <li>Install <b>WLM Trader</b> on your phone and switch <b>Tailscale</b> on.</li>
              <li>Open WLM Trader on the phone and enter the address <b className="num">{host}</b></li>
              <li>Press <b>Pair a phone</b> below and type the code on the phone.</li>
            </ol>
            {code && left > 0 ? (
              <div className="stack">
                <div className="code-box">{code.code}</div>
                <div className="mute small" style={{ textAlign: "center" }}>Valid for {Math.floor(left / 60)}:{String(left % 60).padStart(2, "0")} · works once</div>
              </div>
            ) : <div><button className="btn primary" onClick={makeCode}>Pair a phone</button></div>}
          </>
        )}
      </div>
    </Card>
  );
}

function DesktopSettings() {
  const toast = useToast();
  const loadAuto = useCallback(() => desktop!.getAutoStart(), []);
  const { data: auto, setData: setAuto } = useLoad(loadAuto);
  const loadState = useCallback(() => desktop!.botState(), []);
  const { data: state } = useLoad(loadState);

  return (
    <Card title="This PC">
      <div className="stack">
        <div className="list-item">
          <div>
            <div className="sym" style={{ fontSize: 15 }}>Start with Windows</div>
            <div className="mute small">The bot keeps trading after a restart (e.g. Windows updates). Closing the window keeps it running in the tray.</div>
          </div>
          <Toggle label="Start with Windows" on={!!auto} onChange={async (v) => { await desktop!.setAutoStart(v); setAuto(v); toast(v ? "Starts with Windows" : "Won't start with Windows", "success"); }} />
        </div>
        <div className="list-item">
          <div>
            <div className="sym" style={{ fontSize: 15 }}>Bot folder</div>
            <div className="mute small num">{state?.folder || "–"}</div>
          </div>
          <div className="row">
            <button className="btn small" onClick={() => desktop!.openBotFolder()}><FolderOpen size={16} />Open</button>
            <button className="btn small" onClick={() => desktop!.chooseFolder()}>Change</button>
          </div>
        </div>
        <div className="list-item">
          <div>
            <div className="sym" style={{ fontSize: 15 }}>Restart the bot program</div>
            <div className="mute small">Needed after entering new keys or passwords.</div>
          </div>
          <button className="btn small" onClick={() => desktop!.restartBot()}><RefreshCw size={16} />Restart</button>
        </div>
        <div className="field-help">Don't run start_bot.bat at the same time as this app: only one copy may trade (the app tells you if one is already running).</div>
      </div>
    </Card>
  );
}
