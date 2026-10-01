import { useCallback, useEffect, useState } from "react";
import { FlaskConical, Play } from "lucide-react";
import { useApp } from "../App";
import { useLoad } from "../hooks";
import type { Job } from "../api";
import { Banner, Card, Empty, Field, Page, Pill, Segmented, Toggle, useToast } from "../components/ui";
import { SymbolEditor } from "../components/SaveBar";
import { STRATEGY_INFO } from "./Trading";
import { ago, MARKET_LABEL } from "../format";

type Kind = "backtest" | "download" | "forex_data" | "scan" | "regime" | "optimize";

const KINDS: { value: Kind; label: string; help: string }[] = [
  { value: "backtest", label: "Backtest", help: "Replay a strategy on past prices, with fees and spreads, and compare with simply holding." },
  { value: "download", label: "Download data", help: "Fetch price history for backtests (only new candles after the first time)." },
  { value: "forex_data", label: "MT5 history", help: "Your Forex broker's own history, spreads and swaps (MetaTrader 5 must be running)." },
  { value: "scan", label: "Coin scanner", help: "Find the most-traded crypto pairs with tight spreads right now." },
  { value: "regime", label: "Market regime", help: "Is each market trending up, sideways or down - and what followed in the past?" },
  { value: "optimize", label: "Optimizer", help: "Walk-forward tuning: tries settings on 2 years, tests on the next 6 months it never saw." },
];

export default function Research() {
  const { api } = useApp();
  const toast = useToast();
  const [kind, setKind] = useState<Kind>("backtest");
  const [market, setMarket] = useState("forex");
  const [strategy, setStrategy] = useState("regime");
  const [timeframe, setTimeframe] = useState("1d");
  const [symbols, setSymbols] = useState<string[]>([]);
  const [risk, setRisk] = useState(true);
  const [current, setCurrent] = useState<Job | null>(null);
  const loadSettings = useCallback(() => api.settings(), [api]);
  const { data: settings } = useLoad(loadSettings);
  const loadJobs = useCallback(() => api.jobs(), [api]);
  const { data: jobs, reload: reloadJobs } = useLoad(loadJobs);

  // Follow the running job's output
  useEffect(() => {
    if (!current || current.status !== "running") return;
    const id = setInterval(async () => {
      const job = await api.job(current.id);
      setCurrent(job);
      if (job.status !== "running") reloadJobs();
    }, 1500);
    return () => clearInterval(id);
  }, [api, current, reloadJobs]);

  const run = async () => {
    const args: Record<string, unknown> = {};
    if (kind !== "scan" && kind !== "forex_data") args.market = market;
    if (kind === "backtest" || kind === "optimize") args.strategy = strategy;
    if ((kind === "backtest" || kind === "download") && timeframe) args.timeframe = timeframe;
    if (kind === "backtest" && symbols.length) args.symbols = symbols;
    if ((kind === "backtest" || kind === "optimize") && risk) args.risk = true;
    if (kind === "scan") args.download = true;
    try {
      setCurrent(await api.startJob(kind, args));
      reloadJobs();
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e), "error");
    }
  };

  const open = async (id: string) => setCurrent(await api.job(id));
  const info = KINDS.find((k) => k.value === kind)!;
  const strategies = settings?.options.strategies ?? [];

  return (
    <Page title="Research" sub="Test ideas on history before risking anything">
      <Card title={<span className="row" style={{ gap: 8 }}><FlaskConical size={18} />New run</span>}>
        <div className="stack" style={{ gap: 14 }}>
          <div className="row wrap" style={{ gap: 6 }}>
            {KINDS.map((k) => (
              <button key={k.value} className={`btn small ${k.value === kind ? "primary" : ""}`} onClick={() => setKind(k.value)}>{k.label}</button>
            ))}
          </div>
          <div className="field-help">{info.help}</div>
          <div className="grid grid-3">
            {kind !== "scan" && kind !== "forex_data" && (
              <Field label="Market">
                <Segmented value={market} onChange={setMarket}
                  options={(kind === "optimize" ? ["crypto", "stocks"] : ["crypto", "stocks", "forex"]).map((m) => ({ value: m, label: MARKET_LABEL[m] }))} />
              </Field>
            )}
            {(kind === "backtest" || kind === "optimize") && (
              <Field label="Strategy" help={STRATEGY_INFO[strategy]}>
                <select className="select" value={strategy} onChange={(e) => setStrategy(e.target.value)}>
                  {[...strategies, ...(kind === "backtest" ? ["all"] : [])].map((n) => <option key={n} value={n}>{n === "all" ? "all (compare)" : n}</option>)}
                </select>
              </Field>
            )}
            {(kind === "backtest" || kind === "download") && (
              <Field label="Candles" help={timeframe === "1h" && market === "forex" ? "Hourly Forex = day-trading mode." : undefined}>
                <Segmented value={timeframe} onChange={setTimeframe} options={[{ value: "1d", label: "Daily" }, { value: "1h", label: "Hourly" }]} />
              </Field>
            )}
          </div>
          {kind === "backtest" && (
            <>
              <Field label="Symbols (empty = all of the market's)">
                <SymbolEditor value={symbols} onChange={setSymbols} placeholder="e.g. EURUSD or BTC/USDT, then Enter" />
              </Field>
              {market !== "forex" && (
                <div className="row"><Toggle label="Use Risk Manager" on={risk} onChange={setRisk} />
                  <span className="dim">With the Risk Manager (position sizing and stops, like live)</span></div>
              )}
            </>
          )}
          <div><button className="btn primary" disabled={current?.status === "running"} onClick={run}><Play size={17} />Run</button></div>
        </div>
      </Card>

      {current && (
        <Card title={<span className="row" style={{ gap: 8 }}>{KINDS.find((k) => k.value === current.kind)?.label}
          <JobPill job={current} /></span>}>
          {current.table && <ResultTable table={current.table} />}
          <pre className="console" style={{ marginTop: current.table ? 14 : 0 }}>{current.output || "Starting…"}</pre>
        </Card>
      )}

      <Card title="Earlier runs">
        {!jobs?.jobs.length ? <Empty>No runs yet in this session.</Empty> : jobs.jobs.map((j) => (
          <div key={j.id} className="list-item">
            <div>
              <div className="sym" style={{ fontSize: 15 }}>{KINDS.find((k) => k.value === j.kind)?.label}
                <span className="mute small"> {Object.entries(j.args).map(([k, v]) => `${k}=${Array.isArray(v) ? v.join(",") : v}`).join(" ")}</span></div>
              <div className="mute small">{ago(j.started)}</div>
            </div>
            <div className="row"><JobPill job={j} /><button className="btn small" onClick={() => open(j.id)}>Open</button></div>
          </div>
        ))}
      </Card>
      <Banner tone="info">A good backtest is not a promise. Results with fewer than 30 trades are mostly luck.</Banner>
    </Page>
  );
}

function JobPill({ job }: { job: Job }) {
  return job.status === "running" ? <Pill tone="amber">running</Pill> : job.status === "done" ? <Pill tone="green">done</Pill> : <Pill tone="red">failed</Pill>;
}

function ResultTable({ table }: { table: { columns: string[]; rows: string[][] } }) {
  return (
    <div className="scroll-x">
      <table className="table">
        <thead><tr>{table.columns.map((c, i) => <th key={i} className={i > 1 ? "r" : ""}>{c}</th>)}</tr></thead>
        <tbody>
          {table.rows.map((row, r) => (
            <tr key={r}>{row.map((cell, i) => {
              const n = Number(cell);
              const tone = i > 1 && /%/.test(table.columns[i]) && !Number.isNaN(n) ? (n > 0 ? "up" : n < 0 ? "down" : "") : "";
              return <td key={i} className={`${i > 1 ? "r num" : i === 0 ? "sym" : ""} ${tone}`}>{cell}</td>;
            })}</tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
