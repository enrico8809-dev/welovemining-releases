"""Local web dashboard: equity curve, open positions, trade history, performance per strategy.

    python -m bot.dashboard            then open http://localhost:8050 in your browser
    (or double-click dashboard.bat)

It only READS the bot's database (it can't place orders) and only listens on your own PC
(127.0.0.1), so nobody else on the network can open it. It refreshes every 30 seconds.
"""
import argparse
import json
from collections import defaultdict
from datetime import datetime, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

from bot.config import is_live_trading, load_config
from bot.logger import get_logger
from bot.risk import RiskConfig, RiskManager
from bot.storage import StateStore

log = get_logger("dashboard")


def summary(cfg: dict, store: StateStore) -> dict:
    """Everything the page shows, as one JSON-friendly dict."""
    from bot.trader import PAUSE_FLAG, STOP_FLAG
    markets = cfg["trader"]["markets"]
    now = datetime.now(timezone.utc)

    equity = defaultdict(list)
    for time, market, value in store.equity_history():
        equity[market].append([time, round(value, 2)])

    market_rows = []
    for m in markets:
        paper = store.get(f"paper:{m}")
        hist = equity.get(m, [])
        first, last = (hist[0][1], hist[-1][1]) if hist else (None, None)
        market_rows.append({
            "market": m,
            "equity": last,
            "change_pct": round(100 * (last / first - 1), 2) if first else None,
            "cash": round(paper["cash"], 2) if paper else None,
            "blocked": RiskManager(RiskConfig.from_config(cfg), store, market=m).blocked_reason(now),
            "positions": len(store.positions(m)),
        })

    trades = store.trades(200)
    perf = defaultdict(lambda: {"trades": 0, "wins": 0, "pnl": 0.0})
    for t in trades:
        if t["pnl"] is None:
            continue
        key = f"{t['market']} · {t['reason']}"          # e.g. "crypto · stop_loss"
        perf[key]["trades"] += 1
        perf[key]["wins"] += t["pnl"] > 0
        perf[key]["pnl"] += t["pnl"]
    by_symbol = defaultdict(float)
    for t in trades:
        if t["pnl"] is not None:
            by_symbol[t["symbol"]] += t["pnl"]

    return {
        "mode": "LIVE" if is_live_trading() else "PAPER",
        "paused": bool(store.get(PAUSE_FLAG)),
        "stopped": bool(store.get(STOP_FLAG)),
        "strategy": cfg["trader"]["strategy"],
        "updated": now.isoformat(timespec="seconds"),
        "markets": market_rows,
        "equity": equity,
        "positions": [p.__dict__ for p in store.positions()],
        "trades": trades[:50],
        "performance": [{"name": k, **v, "pnl": round(v["pnl"], 2),
                         "win_rate": round(100 * v["wins"] / v["trades"], 1)} for k, v in perf.items()],
        "by_symbol": sorted(([s, round(v, 2)] for s, v in by_symbol.items()), key=lambda x: x[1], reverse=True),
    }


PAGE = """<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>WLM Trading Bot</title>
<style>
:root{--bg:#f6f7f9;--card:#fff;--text:#1d2330;--muted:#6b7280;--line:#e5e7eb;--up:#0f9d58;--down:#d93025;--accent:#2563eb}
@media (prefers-color-scheme:dark){:root{--bg:#0f1115;--card:#181b22;--text:#e8eaf0;--muted:#9aa1ad;--line:#2a2f3a;--up:#34c77b;--down:#ff6b5e;--accent:#6ea0ff}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--text);font:14px/1.45 system-ui,-apple-system,Segoe UI,sans-serif}
header{padding:16px 20px;display:flex;flex-wrap:wrap;gap:10px;align-items:center;border-bottom:1px solid var(--line)}
h1{font-size:18px;margin:0 12px 0 0}.pill{padding:3px 10px;border-radius:99px;font-size:12px;font-weight:600;border:1px solid var(--line)}
.live{background:var(--down);color:#fff;border:0}.paper{background:var(--accent);color:#fff;border:0}.warn{color:var(--down);border-color:var(--down)}
main{padding:16px;display:grid;grid-template-columns:minmax(0,1fr);gap:16px;max-width:1200px;margin:auto}
.cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(220px,100%),1fr));gap:12px}
.card{background:var(--card);border:1px solid var(--line);border-radius:10px;padding:14px;min-width:0}
.cards>div{min-width:0}
.card h2{font-size:13px;font-weight:600;color:var(--muted);margin:0 0 8px;text-transform:uppercase;letter-spacing:.04em}
.big{font-size:24px;font-weight:700}.up{color:var(--up)}.down{color:var(--down)}.muted{color:var(--muted)}
table{width:100%;border-collapse:collapse;font-size:13px}th,td{text-align:left;padding:6px 8px;border-bottom:1px solid var(--line);white-space:nowrap}
th{color:var(--muted);font-weight:600}td.num,th.num{text-align:right;font-variant-numeric:tabular-nums}
.scroll{overflow-x:auto}svg{width:100%;height:180px;display:block}
</style></head><body>
<header><h1>WeLoveMining Trading Bot</h1><span id="mode" class="pill"></span><span id="flags"></span>
<span class="muted" id="updated" style="margin-left:auto"></span></header>
<main>
<section class="cards" id="markets"></section>
<section class="card"><h2>Account value</h2><div id="charts" class="cards"></div></section>
<section class="card"><h2>Open positions</h2><div class="scroll"><table id="positions"></table></div></section>
<section class="cards">
 <div class="card"><h2>Performance (closed trades)</h2><div class="scroll"><table id="perf"></table></div></div>
 <div class="card"><h2>P&amp;L per symbol</h2><div class="scroll"><table id="symbols"></table></div></div>
</section>
<section class="card"><h2>Trade history</h2><div class="scroll"><table id="trades"></table></div></section>
</main>
<script>
const f=(v,d=2)=>v==null?'–':Number(v).toLocaleString(undefined,{maximumFractionDigits:d,minimumFractionDigits:d});
const cls=v=>v==null?'':(v>=0?'up':'down');
const esc=s=>String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
function table(el,head,rows){document.getElementById(el).innerHTML=rows.length?
 '<tr>'+head.map(h=>`<th class="${h[1]||''}">${h[0]}</th>`).join('')+'</tr>'+rows.join(''):'<tr><td class="muted">none yet</td></tr>'}
function chart(points){ if(points.length<2) return '<p class="muted">collecting data…</p>';
 const v=points.map(p=>p[1]),min=Math.min(...v),max=Math.max(...v),span=(max-min)||1,W=600,H=160;
 const xy=v.map((y,i)=>[i*W/(v.length-1),H-8-(y-min)/span*(H-16)]);
 const color=v[v.length-1]>=v[0]?'var(--up)':'var(--down)';
 return `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none"><polyline fill="none" stroke="${color}" stroke-width="2"
  vector-effect="non-scaling-stroke" points="${xy.map(p=>p.join(',')).join(' ')}"/></svg>
  <div class="muted">${f(min)} – ${f(max)} · ${esc(points[0][0].slice(0,10))} → ${esc(points[points.length-1][0].slice(0,10))}</div>`}
async function load(){
 const d=await (await fetch('/api/summary')).json();
 const mode=document.getElementById('mode');mode.textContent=d.mode+' · '+d.strategy;mode.className='pill '+d.mode.toLowerCase();
 document.getElementById('flags').innerHTML=(d.paused?'<span class="pill warn">PAUSED</span> ':'')+(d.stopped?'<span class="pill warn">STOPPED (kill switch)</span>':'');
 document.getElementById('updated').textContent='updated '+d.updated.replace('T',' ').slice(0,16)+' UTC';
 document.getElementById('markets').innerHTML=d.markets.map(m=>`<div class="card"><h2>${esc(m.market)}</h2>
  <div class="big">${f(m.equity)}</div><div class="${cls(m.change_pct)}">${m.change_pct==null?'':(m.change_pct>=0?'+':'')+f(m.change_pct)+'% since start'}</div>
  <div class="muted">cash ${f(m.cash)} · ${m.positions} open</div>
  <div class="${m.blocked?'down':'up'}">${m.blocked?'new buys blocked: '+esc(m.blocked):'new buys allowed'}</div></div>`).join('');
 document.getElementById('charts').innerHTML=d.markets.map(m=>`<div><b>${esc(m.market)}</b>${chart(d.equity[m.market]||[])}</div>`).join('');
 table('positions',[['Market'],['Symbol'],['Qty','num'],['Entry','num'],['Stop','num'],['Highest','num'],['Opened']],
  d.positions.map(p=>`<tr><td>${esc(p.market)}</td><td>${esc(p.symbol)}</td><td class="num">${f(p.qty,6)}</td><td class="num">${f(p.entry_price,4)}</td>
  <td class="num">${f(p.stop,4)}</td><td class="num">${f(p.highest,4)}</td><td>${esc(p.opened_at.replace("T"," ").slice(0,16))}</td></tr>`));
 table('perf',[['Market · exit reason'],['Trades','num'],['Win rate','num'],['P&L','num']],
  d.performance.map(p=>`<tr><td>${esc(p.name)}</td><td class="num">${p.trades}</td><td class="num">${f(p.win_rate,1)}%</td><td class="num ${cls(p.pnl)}">${f(p.pnl)}</td></tr>`));
 table('symbols',[['Symbol'],['P&L','num']],d.by_symbol.map(s=>`<tr><td>${esc(s[0])}</td><td class="num ${cls(s[1])}">${f(s[1])}</td></tr>`));
 table('trades',[['Time (UTC)'],['Market'],['Side'],['Symbol'],['Qty','num'],['Price','num'],['Fee','num'],['Reason'],['P&L','num'],['Mode']],
  d.trades.map(t=>`<tr><td>${esc(t.time.replace('T',' ').slice(0,16))}</td><td>${esc(t.market)}</td><td>${esc(t.side)}</td><td>${esc(t.symbol)}</td>
  <td class="num">${f(t.qty,6)}</td><td class="num">${f(t.price,4)}</td><td class="num">${f(t.fee,4)}</td><td>${esc(t.reason)}</td>
  <td class="num ${cls(t.pnl)}">${t.pnl==null?'':f(t.pnl)}</td><td>${esc(t.mode)}</td></tr>`));
}
load();setInterval(load,30000);
</script></body></html>"""


def make_handler(cfg: dict, store: StateStore):
    class Handler(BaseHTTPRequestHandler):
        def do_GET(self):
            if self.path in ("/", "/index.html"):
                body, kind = PAGE.encode(), "text/html; charset=utf-8"
            elif self.path == "/api/summary":
                body, kind = json.dumps(summary(cfg, store)).encode(), "application/json"
            else:
                self.send_error(404)
                return
            self.send_response(200)
            self.send_header("Content-Type", kind)
            self.send_header("Cache-Control", "no-store")
            self.end_headers()
            self.wfile.write(body)

        def log_message(self, *args):       # keep the console quiet
            pass
    return Handler


def serve(cfg: dict, store: StateStore, port: int = 8050) -> ThreadingHTTPServer:
    return ThreadingHTTPServer(("127.0.0.1", port), make_handler(cfg, store))   # this PC only


def main():
    parser = argparse.ArgumentParser(description="Local dashboard")
    parser.add_argument("--port", type=int, default=8050)
    args = parser.parse_args()
    server = serve(load_config(), StateStore(), args.port)
    print(f"Dashboard running: open http://localhost:{args.port} in your browser (Ctrl+C to stop)")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()
