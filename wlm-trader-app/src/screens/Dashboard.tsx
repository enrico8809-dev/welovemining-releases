import { AlertTriangle, OctagonX, Pause, Play, Power, RotateCcw } from "lucide-react";
import { useApp, statusOf } from "../App";
import { useAction } from "../hooks";
import { Banner, Card, Empty, HoldButton, ModePill, Page, Pill } from "../components/ui";
import { combineSeries, LineChart, toPoints } from "../components/Chart";
import { ago, dateTime, MARKET_LABEL, money, pct, price, qty, reasonLabel, signed, upDown } from "../format";
import { C, MARKET_COLOR } from "../theme";

export default function Dashboard() {
  const { overview: o, api, go } = useApp();
  const act = useAction();
  if (!o) return null;
  const status = statusOf(o);

  const combined = combineSeries(o.equity, o.combined.markets);
  const first = combined[0]?.[1];
  const change = first ? (100 * (o.combined.equity / first - 1)) : null;
  // Per-market lines indexed to % change since start: one axis for markets of very different size
  const indexed = o.accounts.filter((a) => (o.equity[a.market]?.length ?? 0) > 1).map((a) => {
    const pts = toPoints(o.equity[a.market]);
    const base = pts[0][1];
    return { key: a.market, label: MARKET_LABEL[a.market] ?? a.market, color: MARKET_COLOR[a.market] ?? C.mute,
      points: pts.map(([t, v]) => [t, 100 * (v / base - 1)] as [number, number]) };
  });
  const anyLive = o.accounts.some((a) => a.mode === "live");

  return (
    <Page title="Dashboard" sub={`Updated ${ago(o.time)} · strategy ${o.strategy}`}>
      {o.kill_switch && (
        <Banner tone="error" icon={<OctagonX size={18} />}>
          <b>Kill switch is on.</b> No new trades on any market. Clear it below when you're ready to trade again.
        </Banner>
      )}
      {o.engine.error && <Banner tone="error" icon={<AlertTriangle size={18} />}>{o.engine.error}</Banner>}
      {Object.entries(o.engine.market_errors).map(([m, e]) => (
        <Banner key={m} tone="warn" icon={<AlertTriangle size={18} />}><b>{MARKET_LABEL[m] ?? m}:</b> {e}</Banner>
      ))}
      {anyLive && (
        <Banner tone="error" icon={<AlertTriangle size={18} />}>
          <b>Real money:</b> {o.accounts.filter((a) => a.mode === "live").map((a) => MARKET_LABEL[a.market]).join(", ")} trade with real money.
        </Banner>
      )}

      <div className="grid grid-2">
        <section className="card hero">
          <div className="row between">
            <span className="label">Total account value</span>
            <span className="pill" style={{ color: status.color, borderColor: status.color }}>
              <span className={`dot ${status.pulse ? "pulse" : ""}`} />{status.text}
            </span>
          </div>
          <div className="hero-value num">{money(o.combined.equity)} <span className="mute" style={{ fontSize: 18 }}>USD</span></div>
          <div className={`num ${upDown(change)}`}>{pct(change)} <span className="mute small">since the bot started</span></div>
          <div style={{ marginTop: 10 }}>
            <LineChart area currency="USD" height={150}
              series={[{ key: "total", label: "Total", color: C.orange, points: combined }]} />
          </div>
          {o.combined.excluded.length > 0 && (
            <div className="mute small">Not in the total (other currency): {o.combined.excluded.map((m) => MARKET_LABEL[m]).join(", ")}</div>
          )}
        </section>

        <Card title="Control">
          <div className="stack" style={{ gap: 12 }}>
            <div className="dim small">
              {o.engine.running
                ? <>Running since {dateTime(o.engine.started_at)} · last check {ago(o.engine.last_loop)}</>
                : "The bot is not trading. Press Start to begin."}
            </div>
            <div className="grid" style={{ gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              {o.engine.running ? (
                <button className="btn" disabled={o.engine.stopping} onClick={() => act(() => api.control("stop"))}>
                  <Power size={18} />{o.engine.stopping ? "Stopping…" : "Stop"}</button>
              ) : (
                <button className="btn primary" disabled={o.kill_switch} onClick={() => act(() => api.control("start"))}><Play size={18} />Start</button>
              )}
              {o.paused ? (
                <button className="btn success" onClick={() => act(() => api.control("resume"))}><Play size={18} />Resume</button>
              ) : (
                <button className="btn" disabled={!o.engine.running} onClick={() => act(() => api.control("pause"))}><Pause size={18} />Pause</button>
              )}
            </div>
            <div className="field-help">
              <b>Pause</b> stops new trades; open trades keep their stop-losses. <b>Stop</b> ends the bot; positions stay open.
            </div>
            {o.kill_switch ? (
              <button className="btn" onClick={() => act(() => api.control("clear_kill"))}><RotateCcw size={18} />Clear kill switch</button>
            ) : (
              <HoldButton onConfirm={() => act(() => api.control("kill"))}><OctagonX size={18} />Hold for KILL SWITCH</HoldButton>
            )}
            <div className="field-help">Kill switch: cancels orders, <b>closes all Forex trades</b>, blocks new trades and stops the bot. Crypto and stocks you hold are kept.</div>
          </div>
        </Card>
      </div>

      <div className="grid grid-3">
        {o.accounts.map((a) => (
          <section key={a.market} className="card market-card">
            <div className="row between">
              <div className="row" style={{ gap: 8 }}>
                <i style={{ width: 10, height: 10, borderRadius: 3, background: MARKET_COLOR[a.market] }} />
                <span className="card-title">{MARKET_LABEL[a.market] ?? a.market}</span>
              </div>
              <ModePill mode={a.mode} />
            </div>
            <div className="market-value num" style={{ marginTop: 10 }}>{money(a.equity)} <span className="mute small">{a.currency}</span></div>
            <div className={`num small ${upDown(a.change_pct)}`}>{pct(a.change_pct)}</div>
            <div className="row between small" style={{ marginTop: 10 }}>
              <span className="mute">Cash <span className="num dim">{money(a.cash)}</span></span>
              <span className="mute">{a.positions} open</span>
            </div>
            <div className="small" style={{ marginTop: 6, color: a.blocked ? "var(--amber)" : "var(--green)" }}>
              {a.blocked ? `New trades blocked: ${a.blocked}` : "New trades allowed"}
            </div>
          </section>
        ))}
      </div>

      {indexed.length > 0 && (
        <Card title="Performance by market" actions={<span className="mute small">% change since start</span>}>
          <LineChart series={indexed} percent />
        </Card>
      )}

      <div className="grid grid-2">
        <Card title="Open positions" actions={<button className="btn ghost small" onClick={() => go("positions")}>See all</button>}>
          {o.positions.length === 0 ? <Empty>No open trades right now.</Empty> : o.positions.slice(0, 6).map((p) => (
            <div key={`${p.market}-${p.symbol}`} className="list-item">
              <div>
                <div className="row" style={{ gap: 8 }}><span className="sym">{p.symbol}</span>
                  <Pill tone={p.side === "short" ? "red" : "green"}>{p.side}</Pill></div>
                <div className="mute small">{MARKET_LABEL[p.market]} · {qty(p.qty)} @ <span className="num">{price(p.entry_price)}</span></div>
              </div>
              <div className="mute small" style={{ textAlign: "right" }}>stop<br /><span className="num dim">{price(p.stop)}</span></div>
            </div>
          ))}
        </Card>
        <Card title="Latest trades" actions={<button className="btn ghost small" onClick={() => go("history")}>History</button>}>
          {o.trades.length === 0 ? <Empty>No trades yet.</Empty> : o.trades.slice(0, 6).map((t) => (
            <div key={t.id} className="list-item">
              <div>
                <div className="row" style={{ gap: 8 }}><span className="sym">{t.symbol}</span>
                  <Pill tone={t.side === "buy" ? "green" : "red"}>{t.side}</Pill></div>
                <div className="mute small">{dateTime(t.time)} · {reasonLabel(t.reason)}</div>
              </div>
              <div style={{ textAlign: "right" }}>
                {t.pnl !== null ? <span className={`num ${upDown(t.pnl)}`}>{signed(t.pnl)}</span> : <span className="num dim">{price(t.price)}</span>}
              </div>
            </div>
          ))}
        </Card>
      </div>
    </Page>
  );
}
