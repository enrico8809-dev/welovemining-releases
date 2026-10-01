import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useState } from "react";
import {
  Activity, Bell, Bot, BriefcaseBusiness, FlaskConical, History, KeyRound, LayoutDashboard, Radio,
  Menu, ScrollText, Settings as SettingsIcon, ShieldCheck, SlidersHorizontal, X,
} from "lucide-react";
import { Api, ApiError, Connection, Overview, pair, savedConnection, saveConnection } from "./api";
import { BotState, desktop } from "./desktop";
import { Banner } from "./components/ui";
import Dashboard from "./screens/Dashboard";
import Live from "./screens/Live";
import Positions from "./screens/Positions";
import HistoryScreen from "./screens/History";
import Trading from "./screens/Trading";
import Risk from "./screens/Risk";
import Research from "./screens/Research";
import Alerts from "./screens/Alerts";
import Accounts from "./screens/Accounts";
import Logs from "./screens/Logs";
import SettingsScreen from "./screens/Settings";

// ---------------------------------------------------------------- shared state for every screen
interface AppState {
  api: Api;
  overview: Overview | null;
  error: string;
  refresh: () => Promise<void>;
  disconnect: () => void;
  go: (screen: ScreenId) => void;
}
const AppContext = createContext<AppState | null>(null);
export const useApp = () => useContext(AppContext)!;

type ScreenId = "dashboard" | "live" | "positions" | "history" | "trading" | "risk" | "research" | "alerts" | "accounts" | "logs" | "settings";

const SCREENS: { id: ScreenId; label: string; icon: ReactNode; render: () => ReactNode }[] = [
  { id: "dashboard", label: "Dashboard", icon: <LayoutDashboard size={19} />, render: () => <Dashboard /> },
  { id: "live", label: "Live", icon: <Radio size={19} />, render: () => <Live /> },
  { id: "positions", label: "Positions", icon: <BriefcaseBusiness size={19} />, render: () => <Positions /> },
  { id: "history", label: "History", icon: <History size={19} />, render: () => <HistoryScreen /> },
  { id: "trading", label: "Trading", icon: <SlidersHorizontal size={19} />, render: () => <Trading /> },
  { id: "risk", label: "Risk", icon: <ShieldCheck size={19} />, render: () => <Risk /> },
  { id: "research", label: "Research", icon: <FlaskConical size={19} />, render: () => <Research /> },
  { id: "alerts", label: "Alerts", icon: <Bell size={19} />, render: () => <Alerts /> },
  { id: "accounts", label: "Accounts", icon: <KeyRound size={19} />, render: () => <Accounts /> },
  { id: "logs", label: "Logs", icon: <ScrollText size={19} />, render: () => <Logs /> },
  { id: "settings", label: "Settings", icon: <SettingsIcon size={19} />, render: () => <SettingsScreen /> },
];
const PHONE_TABS: ScreenId[] = ["dashboard", "live", "positions", "trading"];

// ---------------------------------------------------------------- root
export default function App() {
  const [conn, setConn] = useState<Connection | null>(desktop ? null : savedConnection());

  if (desktop && !conn) return <DesktopBoot onReady={setConn} />;
  if (!conn) return <ConnectPhone onConnected={(c) => { saveConnection(c); setConn(c); }} />;
  return <Connected conn={conn} onDisconnect={() => { saveConnection(null); setConn(null); }} />;
}

function Connected({ conn, onDisconnect }: { conn: Connection; onDisconnect: () => void }) {
  const api = useMemo(() => new Api(conn), [conn]);
  const [overview, setOverview] = useState<Overview | null>(null);
  const [error, setError] = useState("");
  const [screen, setScreen] = useState<ScreenId>("dashboard");
  const [moreOpen, setMoreOpen] = useState(false);

  const refresh = useCallback(async () => {
    try {
      setOverview(await api.overview());
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      if (e instanceof ApiError && e.status === 401 && !desktop) onDisconnect();
    }
  }, [api, onDisconnect]);

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, 5000);              // live view: every 5 seconds
    return () => clearInterval(id);
  }, [refresh]);

  const go = (id: ScreenId) => { setScreen(id); setMoreOpen(false); document.querySelector(".main")?.scrollTo(0, 0); };
  const current = SCREENS.find((s) => s.id === screen)!;
  const state = overview ? statusOf(overview) : null;

  return (
    <AppContext.Provider value={{ api, overview, error, refresh, disconnect: onDisconnect, go }}>
      <div className="shell">
        <aside className="sidebar">
          <Brand />
          {SCREENS.map((s) => (
            <button key={s.id} className={`nav-item ${s.id === screen ? "active" : ""}`} onClick={() => go(s.id)}>
              {s.icon}{s.label}
            </button>
          ))}
          <div className="nav-spacer" />
          {state && (
            <div className="sidebar-status">
              <div className="label">Bot</div>
              <div className="row" style={{ color: state.color, fontWeight: 700, marginTop: 4 }}>
                <span className={`dot ${state.pulse ? "pulse" : ""}`} />{state.text}
              </div>
            </div>
          )}
        </aside>

        <header className="topbar">
          <Brand compact />
          {state && <span className="pill" style={{ color: state.color, borderColor: state.color }}><span className={`dot ${state.pulse ? "pulse" : ""}`} />{state.text}</span>}
        </header>

        <main className="main">
          {error && !overview && (
            <div className="page"><Banner tone="error" icon={<Activity size={18} />}>{error}</Banner></div>
          )}
          {overview ? current.render() : !error && <div className="page"><div className="empty">Connecting to your bot…</div></div>}
        </main>

        <nav className="tabbar">
          {PHONE_TABS.map((id) => {
            const s = SCREENS.find((x) => x.id === id)!;
            return (
              <button key={id} className={`tab ${screen === id ? "active" : ""}`} onClick={() => go(id)}>
                {s.icon}<span>{s.label}</span>
              </button>
            );
          })}
          <button className={`tab ${!PHONE_TABS.includes(screen) ? "active" : ""}`} onClick={() => setMoreOpen(true)}>
            <Menu size={19} /><span>More</span>
          </button>
        </nav>

        {moreOpen && (
          <div className="backdrop" style={{ alignItems: "end" }} onClick={() => setMoreOpen(false)}>
            <div className="modal" onClick={(e) => e.stopPropagation()} style={{ paddingBottom: "calc(22px + var(--safe-bottom))" }}>
              <div className="row between" style={{ marginBottom: 8 }}>
                <h2>More</h2>
                <button className="btn ghost small" onClick={() => setMoreOpen(false)} aria-label="Close"><X size={18} /></button>
              </div>
              <div className="grid" style={{ gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                {SCREENS.filter((s) => !PHONE_TABS.includes(s.id)).map((s) => (
                  <button key={s.id} className={`nav-item ${s.id === screen ? "active" : ""}`} onClick={() => go(s.id)}>
                    {s.icon}{s.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </AppContext.Provider>
  );
}

export function statusOf(o: Overview): { text: string; color: string; pulse: boolean } {
  if (o.kill_switch) return { text: "Kill switch on", color: "var(--red)", pulse: false };
  if (!o.engine.running) return { text: "Stopped", color: "var(--mute)", pulse: false };
  if (o.engine.stopping) return { text: "Stopping…", color: "var(--amber)", pulse: false };
  if (o.paused) return { text: "Paused", color: "var(--amber)", pulse: false };
  return { text: "Trading", color: "var(--green)", pulse: true };
}

export function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <div className="brand" style={compact ? { padding: 0 } : undefined}>
      <img className="brand-mark" src="./emblem.png" alt="WeLoveMining" />
      <div>
        <div className="brand-name">WLM TRADER</div>
        {!compact && <div className="brand-sub">WELOVEMINING</div>}
      </div>
    </div>
  );
}

/** The WeLoveMining emblem with the app name, for the welcome and connect screens
 *  (the logo's own wordmark is dark, so it's set in the app's light text here). */
export function Logo() {
  return (
    <div style={{ display: "grid", justifyItems: "center", gap: 6, padding: "6px 0 2px" }}>
      <img src="./emblem.png" alt="WeLoveMining" style={{ width: "min(200px, 55%)", filter: "drop-shadow(0 8px 24px rgba(247,147,26,.35))" }} />
      <div className="brand-name" style={{ fontSize: 24 }}>WLM TRADER</div>
      <div className="brand-sub">WELOVEMINING</div>
    </div>
  );
}

// ---------------------------------------------------------------- phone: connect with a pairing code
function ConnectPhone({ onConnected }: { onConnected: (c: Connection) => void }) {
  const [url, setUrl] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const submit = async () => {
    setBusy(true);
    setError("");
    try {
      onConnected(await pair(url, code));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="center-screen">
      <div className="card connect-card stack" style={{ gap: 16 }}>
        <Logo />
        <div>
          <h1 className="page-title" style={{ fontSize: 24 }}>Connect to your bot</h1>
          <div className="page-sub">Your bot runs on your PC. This phone controls it through Tailscale.</div>
        </div>
        <ol className="steps small">
          <li>On the PC, open <b>WLM Trader → Settings → Phone</b> and press <b>Pair a phone</b>.</li>
          <li>Make sure the <b>Tailscale</b> app is on, on this phone.</li>
          <li>Type the address and the 6-digit code shown on the PC.</li>
        </ol>
        <label className="field">
          <span className="label">PC address</span>
          <input className="input" placeholder="my-pc.tail1234.ts.net" value={url} autoCapitalize="none" autoCorrect="off"
            onChange={(e) => setUrl(e.target.value)} />
        </label>
        <label className="field">
          <span className="label">Pairing code</span>
          <input className="input num" inputMode="numeric" maxLength={6} placeholder="123456" value={code}
            style={{ fontSize: 24, letterSpacing: 8, textAlign: "center" }} onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} />
        </label>
        {error && <Banner tone="error">{error}</Banner>}
        <button className="btn primary block" disabled={busy || !url || code.length !== 6} onClick={submit}>
          {busy ? "Connecting…" : "Connect"}
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- Windows: wait for the bot to be ready
function DesktopBoot({ onReady }: { onReady: (c: Connection) => void }) {
  const [state, setState] = useState<BotState | null>(null);

  useEffect(() => {
    let alive = true;
    const check = async () => {
      const s = await desktop!.botState();
      if (!alive) return;
      setState(s);
      if (s.phase === "running") {
        const c = await desktop!.connection();
        if (c && alive) onReady(c);
      }
    };
    check();
    const off = desktop!.onBotState(() => check());
    const id = setInterval(check, 1500);
    return () => { alive = false; off(); clearInterval(id); };
  }, [onReady]);

  return (
    <div className="center-screen">
      <div className="card connect-card stack" style={{ gap: 16, width: "min(560px, 100%)" }}>
        <Logo />
        {!state || state.phase === "starting" || state.phase === "preparing" ? (
          <>
            <h1 className="page-title" style={{ fontSize: 24 }}>{state?.phase === "preparing" ? "Setting up the bot…" : "Starting the bot…"}</h1>
            <div className="page-sub">{state?.message || "One moment."}</div>
            {state?.log.length ? <pre className="console" style={{ maxHeight: 220 }}>{state.log.slice(-14).join("\n")}</pre> : null}
          </>
        ) : state.phase === "needs-folder" ? (
          <>
            <h1 className="page-title" style={{ fontSize: 24 }}>Welcome to WLM Trader</h1>
            <div className="page-sub">Where is your trading bot? If you already use it (start_bot.bat), choose that folder so your history and keys are kept.</div>
            <button className="btn primary block" onClick={() => desktop!.chooseFolder()}><Bot size={18} />Use my existing bot folder</button>
            <button className="btn block" onClick={() => desktop!.useBundledBot()}>Install a fresh bot</button>
            <div className="field-help">A fresh bot starts in PAPER mode with play money. Python 3.11+ must be installed (python.org).</div>
          </>
        ) : (
          <>
            <h1 className="page-title" style={{ fontSize: 24 }}>{state.phase === "error" ? "The bot couldn't start" : "The bot is stopped"}</h1>
            {state.message && <Banner tone="error">{state.message}</Banner>}
            {state.log.length ? <pre className="console" style={{ maxHeight: 240 }}>{state.log.slice(-18).join("\n")}</pre> : null}
            <div className="row wrap">
              <button className="btn primary" onClick={() => desktop!.restartBot()}>Try again</button>
              <button className="btn" onClick={() => desktop!.chooseFolder()}>Choose another folder</button>
              <button className="btn ghost" onClick={() => desktop!.openBotFolder()}>Open bot folder</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
