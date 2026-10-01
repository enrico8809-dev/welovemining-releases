import { useCallback, useEffect, useRef, useState } from "react";
import { Activity, ArrowDownRight, ArrowUpRight, Radio } from "lucide-react";
import { useApp } from "../App";
import type { Live as LiveData, LivePosition } from "../api";
import { Banner, Card, Empty, Page, Pill } from "../components/ui";
import { ago, dateTime, MARKET_LABEL, money, pct, price, qty, signed, upDown } from "../format";
import { MARKET_COLOR } from "../theme";

// Real-time view: prices, open profit/loss and the bot's decisions, refreshed every 2 seconds.

const KIND_LABEL: Record<string, string> = { loop: "check", signal: "signal", skip: "skipped", order: "ORDER", stop: "stop", info: "info" };
const KIND_TONE: Record<string, "" | "orange" | "green" | "red" | "amber" | "blue"> = { order: "orange", stop: "blue", skip: "amber", signal: "", loop: "", info: "" };

export default function Live() {
  const { api } = useApp();
  const [data, setData] = useState<LiveData | null>(null);
  const [error, setError] = useState("");
  const [flash, setFlash] = useState<Record<string, "up" | "down">>({});
  const previous = useRef<Record<string, number>>({});

  const load = useCallback(async () => {
    try {
      const next = await api.live();
      // Flash a price green/red for a moment when it changes
      const changes: Record<string, "up" | "down"> = {};
      for (const w of next.watch) {
        const before = previous.current[w.symbol];
        if (w.price !== null && before !== undefined && w.price !== before) changes[w.symbol] = w.price > before ? "up" : "down";
        if (w.price !== null) previous.current[w.symbol] = w.price;
      }
      setFlash(changes);
      setData(next);
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [api]);

  useEffect(() => {
    load();
    const id = setInterval(load, 2000);
    return () => clearInterval(id);
  }, [load]);

  if (!data) return <Page title="Live"><div className="empty">{error || "Connecting…"}</div></Page>;
  const stale = Date.now() - new Date(data.time).getTime() > 15000;

  return (
    <Page title="Live" sub={<span className="row" style={{ gap: 8 }}>
      <span className={`dot ${data.running && !data.paused ? "pulse up" : ""}`}
        style={{ color: data.kill_switch ? "var(--red)" : !data.running ? "var(--mute)" : data.paused ? "var(--amber)" : "var(--green)" }} />
      {data.kill_switch ? "Kill switch on · prices still live" : !data.running ? "Bot stopped · prices still live"
        : data.paused ? "Bot paused (no new trades) · prices every 2 s" : "Bot trading · prices every 2 s"}
      {stale && <Pill tone="amber">stale</Pill>}
    </span>}>
      {error && <Banner tone="error">{error}</Banner>}
      {data.feed_error && <Banner tone="warn">Some prices can't be fetched right now: {data.feed_error}</Banner>}

      <div className="grid grid-3">
        <section className="card hero">
          <span className="label">Total value, live</span>
          <div className="hero-value num" style={{ fontSize: 36 }}>{money(data.total)} <span className="mute" style={{ fontSize: 16 }}>USD</span></div>
          <div className={`num ${upDown(data.open_pnl)}`}>{signed(data.open_pnl)} <span className="mute small">open profit / loss</span></div>
        </section>
        {data.accounts.map((a) => (
          <Card key={a.market}>
            <div className="row between"><span className="label">{MARKET_LABEL[a.market] ?? a.market}</span><span className="mute small">{a.mode}</span></div>
            <div className="market-value num">{money(a.equity)} <span className="mute small">{a.currency}</span></div>
            <div className={`num small ${upDown(a.open_pnl)}`}>{signed(a.open_pnl)} open</div>
          </Card>
        ))}
      </div>

      <Card title="Open positions, live">
        {data.positions.length === 0 ? <Empty>No open trades. Watching the market below.</Empty> : (
          <div className="stack" style={{ gap: 14 }}>
            {data.positions.map((p) => <PositionRow key={`${p.market}-${p.symbol}`} p={p} history={data.history[p.symbol] ?? []} />)}
          </div>
        )}
      </Card>

      <div className="grid grid-2">
        <Card title={<span className="row" style={{ gap: 8 }}><Radio size={18} />Watching</span>}>
          <div className="scroll-x">
            <table className="table">
              <thead><tr><th>Symbol</th><th>Market</th><th className="r">Price</th><th>Strategy says</th></tr></thead>
              <tbody>
                {data.watch.map((w) => (
                  <tr key={`${w.market}-${w.symbol}`}>
                    <td className="sym">{w.symbol}{w.held && <Pill tone="green"> held</Pill>}</td>
                    <td className="mute">{MARKET_LABEL[w.market] ?? w.market}</td>
                    <td className={`r num ${flash[w.symbol] ?? ""}`} style={{ transition: "color 1s" }}>{price(w.price)}</td>
                    <td>{w.signal === "long" ? <span className="up row" style={{ gap: 4 }}><ArrowUpRight size={15} />long</span>
                      : w.signal === "short" ? <span className="down row" style={{ gap: 4 }}><ArrowDownRight size={15} />short</span>
                      : w.signal === "out" ? <span className="mute">stay out</span> : <span className="mute">not checked yet</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="field-help" style={{ marginTop: 8 }}>The strategy decides on closed candles (daily, or hourly in day mode), so "long" can show for a while before a trade happens: the Risk Manager still has to approve it.</div>
        </Card>

        <Card title={<span className="row" style={{ gap: 8 }}><Activity size={18} />What the bot is doing</span>}>
          {data.activity.length === 0 ? <Empty>Nothing yet. Start the bot to see its decisions here.</Empty> : (
            <div className="stack" style={{ gap: 0, maxHeight: 460, overflowY: "auto" }}>
              {data.activity.map((a, i) => (
                <div key={i} className="list-item" style={{ padding: "8px 0", alignItems: "flex-start" }}>
                  <div className="row" style={{ gap: 10, alignItems: "flex-start" }}>
                    <i style={{ width: 8, height: 8, borderRadius: 2, marginTop: 7, background: MARKET_COLOR[a.market] ?? "var(--mute)", flex: "none" }} />
                    <div>
                      <div style={{ fontWeight: a.kind === "order" ? 700 : 500 }}>{a.text}</div>
                      <div className="mute small">{ago(a.time)} · {dateTime(a.time)}</div>
                    </div>
                  </div>
                  <Pill tone={KIND_TONE[a.kind] ?? ""}>{KIND_LABEL[a.kind] ?? a.kind}</Pill>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>
    </Page>
  );
}

function PositionRow({ p, history }: { p: LivePosition; history: [string, number][] }) {
  // Where the price sits between the stop-loss and the best price so far
  const lo = Math.min(p.stop, p.entry_price, p.price ?? p.entry_price, p.highest);
  const hi = Math.max(p.stop, p.entry_price, p.price ?? p.entry_price, p.highest);
  const at = (v: number) => (hi > lo ? ((v - lo) / (hi - lo)) * 100 : 50);
  return (
    <div className="card" style={{ padding: 14, background: "var(--panel2)" }}>
      <div className="row between wrap">
        <div className="row" style={{ gap: 10 }}>
          <span className="sym" style={{ fontSize: 18 }}>{p.symbol}</span>
          <Pill tone={p.side === "short" ? "red" : "green"}>{p.side}</Pill>
          <span className="mute small">{MARKET_LABEL[p.market]} · {qty(p.qty)}{p.market === "forex" ? " lots" : ""}</span>
        </div>
        <div style={{ textAlign: "right" }}>
          <div className={`num ${upDown(p.pnl)}`} style={{ fontSize: 22, fontWeight: 700 }}>{signed(p.pnl)}</div>
          <div className={`num small ${upDown(p.move_pct)}`}>{pct(p.move_pct)}</div>
        </div>
      </div>
      <div className="grid" style={{ gridTemplateColumns: "1fr auto", gap: 14, alignItems: "center", marginTop: 10 }}>
        <div>
          <div className="grid small" style={{ gridTemplateColumns: "1fr 1fr 1fr", gap: 6 }}>
            <div><div className="label">Stop</div><div className="num dim">{price(p.stop)}</div></div>
            <div style={{ textAlign: "center" }}><div className="label">Entry</div><div className="num dim">{price(p.entry_price)}</div></div>
            <div style={{ textAlign: "right" }}><div className="label">Now</div><div className="num">{price(p.price)}</div></div>
          </div>
          <div style={{ position: "relative", height: 8, borderRadius: 4, background: "var(--line)", marginTop: 6 }}>
            <span style={{ position: "absolute", left: `${at(p.stop)}%`, top: -3, width: 3, height: 14, background: "var(--red)", borderRadius: 2 }} />
            <span style={{ position: "absolute", left: `${at(p.entry_price)}%`, top: -3, width: 3, height: 14, background: "var(--mute)", borderRadius: 2 }} />
            {p.price !== null && <span style={{ position: "absolute", left: `calc(${at(p.price)}% - 6px)`, top: -2, width: 12, height: 12, borderRadius: "50%", background: p.pnl !== null && p.pnl >= 0 ? "var(--green)" : "var(--red)", boxShadow: "0 0 0 3px var(--panel2)" }} />}
          </div>
          <div className="mute small" style={{ marginTop: 6 }}>
            {p.to_stop_pct !== null ? <>Price is <b className="num">{Math.abs(p.to_stop_pct).toFixed(2)}%</b> {p.to_stop_pct > 0 ? "above" : "below"} the stop-loss</> : "Waiting for a price…"}
          </div>
        </div>
        <Spark points={history} color={p.pnl !== null && p.pnl >= 0 ? "var(--green)" : "var(--red)"} />
      </div>
    </div>
  );
}

function Spark({ points, color }: { points: [string, number][]; color: string }) {
  if (points.length < 2) return <div style={{ width: 120, height: 40 }} />;
  const v = points.map((p) => p[1]);
  const lo = Math.min(...v), hi = Math.max(...v), span = hi - lo || 1;
  const d = v.map((y, i) => `${i ? "L" : "M"}${(i / (v.length - 1)) * 120},${38 - ((y - lo) / span) * 34 + 2}`).join(" ");
  return <svg width="120" height="40" aria-label="price in this session"><path d={d} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" /></svg>;
}
