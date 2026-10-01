import { useCallback, useState } from "react";
import { useApp } from "../App";
import { useLoad } from "../hooks";
import { Banner, Card, Empty, ModePill, Page, Pill, Segmented } from "../components/ui";
import { dateTime, MARKET_LABEL, money, price, qty, reasonLabel, signed, upDown } from "../format";

export default function History() {
  const { api } = useApp();
  const [market, setMarket] = useState("all");
  const load = useCallback(() => api.trades(market === "all" ? undefined : market, 400), [api, market]);
  const { data, error } = useLoad(load, 15000);
  const trades = data?.trades ?? [];
  const closed = trades.filter((t) => t.pnl !== null);
  const wins = closed.filter((t) => (t.pnl ?? 0) > 0).length;
  const total = closed.reduce((s, t) => s + (t.pnl ?? 0), 0);

  return (
    <Page title="History" sub="Every buy and sell the bot made"
      actions={<Segmented value={market} onChange={setMarket}
        options={[{ value: "all", label: "All" }, { value: "crypto", label: "Crypto" }, { value: "stocks", label: "Stocks" }, { value: "forex", label: "Forex" }]} />}>
      {error && <Banner tone="error">{error}</Banner>}

      <div className="grid grid-3">
        <Card><div className="label">Closed trades</div><div className="market-value num">{closed.length}</div></Card>
        <Card><div className="label">Win rate</div><div className="market-value num">{closed.length ? `${Math.round(100 * wins / closed.length)}%` : "–"}</div>
          <div className="mute small">{wins} won · {closed.length - wins} lost</div></Card>
        <Card><div className="label">Realised profit / loss</div>
          <div className={`market-value num ${upDown(total)}`}>{signed(total)}</div></Card>
      </div>

      {data?.record && Object.keys(data.record).length > 0 && (
        <Card title="Track record per market">
          <div className="scroll-x">
            <table className="table">
              <thead><tr><th>Market</th><th className="r">Days running</th><th className="r">Trades</th><th className="r">Closed</th><th className="r">Win rate</th><th className="r">P&amp;L</th></tr></thead>
              <tbody>
                {Object.entries(data.record).map(([m, r]) => (
                  <tr key={m}>
                    <td className="sym">{MARKET_LABEL[m] ?? m}</td>
                    <td className="r num">{r.days}</td>
                    <td className="r num">{r.trades}</td>
                    <td className="r num">{r.closed}</td>
                    <td className="r num">{r.closed ? `${Math.round(100 * r.wins / r.closed)}%` : "–"}</td>
                    <td className={`r num ${upDown(r.pnl)}`}>{signed(r.pnl)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      <Card title="Trades">
        {trades.length === 0 ? <Empty>No trades yet.</Empty> : (
          <div className="scroll-x">
            <table className="table">
              <thead>
                <tr><th>Time</th><th>Market</th><th>Symbol</th><th>Side</th><th className="r">Size</th><th className="r">Price</th>
                  <th className="r">Fee</th><th>Why</th><th className="r">P&amp;L</th><th>Mode</th></tr>
              </thead>
              <tbody>
                {trades.map((t) => (
                  <tr key={t.id}>
                    <td className="mute">{dateTime(t.time)}</td>
                    <td>{MARKET_LABEL[t.market] ?? t.market}</td>
                    <td className="sym">{t.symbol}</td>
                    <td><Pill tone={t.side === "buy" ? "green" : "red"}>{t.side}</Pill></td>
                    <td className="r num">{qty(t.qty)}</td>
                    <td className="r num">{price(t.price)}</td>
                    <td className="r num mute">{money(t.fee, 4)}</td>
                    <td className="dim">{reasonLabel(t.reason)}</td>
                    <td className={`r num ${upDown(t.pnl)}`}>{t.pnl === null ? "" : signed(t.pnl)}</td>
                    <td><ModePill mode={t.mode} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </Page>
  );
}
