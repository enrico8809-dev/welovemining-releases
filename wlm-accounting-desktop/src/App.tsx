import { useEffect, useMemo, useState } from "react";
import {
  BookOpen,
  Boxes,
  Cloud,
  CloudOff,
  FileText,
  FileUp,
  LayoutDashboard,
  RefreshCw,
  Scale,
  Settings as SettingsIcon,
} from "lucide-react";
import { useLedger } from "@engine/LedgerContext";
import { summariseReceivables } from "@engine/invoices";
import Dashboard from "./screens/Dashboard";
import LedgerView from "./screens/LedgerView";
import Documents from "./screens/Documents";
import Stock from "./screens/Stock";
import BankImport from "./screens/BankImport";
import Reconciliation from "./screens/Reconciliation";
import Reports from "./screens/Reports";
import Settings from "./screens/Settings";
import { useToast } from "./components/Toast";

export type View =
  | "dashboard"
  | "ledger"
  | "invoices"
  | "quotes"
  | "stock"
  | "import"
  | "reconcile"
  | "reports"
  | "settings";

const NAV: { group: string; items: { id: View; label: string; icon: React.ReactNode }[] }[] = [
  {
    group: "BOOKS",
    items: [
      { id: "dashboard", label: "Dashboard", icon: <LayoutDashboard size={15} /> },
      { id: "ledger", label: "Ledger", icon: <BookOpen size={15} /> },
      { id: "reports", label: "Reports", icon: <Scale size={15} /> },
    ],
  },
  {
    group: "SELLING",
    items: [
      { id: "invoices", label: "Invoices", icon: <FileText size={15} /> },
      { id: "quotes", label: "Quotes", icon: <FileText size={15} /> },
      { id: "stock", label: "Stock", icon: <Boxes size={15} /> },
    ],
  },
  {
    group: "BANK",
    items: [
      { id: "import", label: "Import statement", icon: <FileUp size={15} /> },
      { id: "reconcile", label: "Reconciliation", icon: <Scale size={15} /> },
    ],
  },
];

export default function App() {
  const { loading, docs, txns, cloud, syncing, syncNow } = useLedger();
  const toast = useToast();
  const [view, setView] = useState<View>("dashboard");
  const [version, setVersion] = useState("");

  useEffect(() => {
    window.wlm.appVersion().then(setVersion);
  }, []);

  // Alt+1..9 walks the sidebar, the way a till or a ledger program would.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!e.altKey || e.ctrlKey || e.shiftKey) return;
      const all = [...NAV.flatMap((g) => g.items.map((i) => i.id)), "settings" as View];
      const index = Number(e.key) - 1;
      if (Number.isInteger(index) && all[index]) {
        e.preventDefault();
        setView(all[index]);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const counts = useMemo(() => {
    const receivables = summariseReceivables(docs);
    return {
      ledger: txns.length,
      invoices: docs.filter((d) => d.kind === "invoice").length,
      quotes: docs.filter((d) => d.kind === "quote").length,
      outstanding: receivables.outstanding,
    };
  }, [docs, txns]);

  if (loading) return <div className="boot">Opening the books…</div>;

  const sync = async () => {
    const outcome = await syncNow();
    toast.show(
      outcome.ok
        ? `Synced — ${outcome.pushed} sent, ${outcome.pulled} received`
        : outcome.error ?? "Sync failed",
      outcome.ok ? "info" : "error"
    );
  };

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">WLM</div>
          <div>
            <div className="brand-name">
              <span className="accent">WLM</span> ACCOUNTING
            </div>
            <div className="brand-sub">WeLoveMining Pty Ltd</div>
          </div>
        </div>

        <nav className="nav">
          {NAV.map((group) => (
            <div key={group.group}>
              <div className="nav-group">{group.group}</div>
              {group.items.map((item) => (
                <button
                  key={item.id}
                  className={`nav-item ${view === item.id ? "active" : ""}`}
                  onClick={() => setView(item.id)}
                >
                  {item.icon}
                  <span>{item.label}</span>
                  {item.id === "ledger" && <span className="count">{counts.ledger}</span>}
                  {item.id === "invoices" && <span className="count">{counts.invoices}</span>}
                  {item.id === "quotes" && <span className="count">{counts.quotes}</span>}
                </button>
              ))}
            </div>
          ))}

          <div className="nav-group">SETUP</div>
          <button
            className={`nav-item ${view === "settings" ? "active" : ""}`}
            onClick={() => setView("settings")}
          >
            <SettingsIcon size={15} />
            <span>Settings</span>
          </button>
        </nav>

        <div className="sidebar-foot">
          <button
            className="nav-item"
            onClick={sync}
            disabled={!cloud || syncing}
            title={cloud ? `Signed in as ${cloud.user.email}` : "Not connected to a server"}
          >
            {cloud ? <Cloud size={15} /> : <CloudOff size={15} />}
            <span>{syncing ? "Syncing…" : cloud ? "Sync now" : "Local only"}</span>
            {syncing && <RefreshCw size={13} className="count" />}
          </button>
          <div style={{ paddingTop: 8 }}>Version {version || "—"}</div>
        </div>
      </aside>

      <main className="main">
        {view === "dashboard" && <Dashboard onNavigate={setView} />}
        {view === "ledger" && <LedgerView />}
        {view === "invoices" && <Documents kind="invoice" />}
        {view === "quotes" && <Documents kind="quote" />}
        {view === "stock" && <Stock />}
        {view === "import" && <BankImport />}
        {view === "reconcile" && <Reconciliation />}
        {view === "reports" && <Reports />}
        {view === "settings" && <Settings />}
      </main>
    </div>
  );
}
