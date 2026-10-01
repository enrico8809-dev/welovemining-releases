import { ShieldCheck } from "lucide-react";
import { useApp } from "../App";
import { Card, Empty, Page, Pill } from "../components/ui";
import { ago, MARKET_LABEL, price, qty } from "../format";
import { MARKET_COLOR } from "../theme";

export default function Positions() {
  const { overview: o } = useApp();
  if (!o) return null;
  const markets = o.markets.filter((m) => o.positions.some((p) => p.market === m));

  return (
    <Page title="Positions" sub={`${o.positions.length} open trade${o.positions.length === 1 ? "" : "s"} · every one has a stop-loss`}>
      {o.positions.length === 0 && <Card><Empty>No open trades. The bot opens one when a strategy signal and the Risk Manager agree.</Empty></Card>}
      {markets.map((m) => (
        <Card key={m} title={<span className="row" style={{ gap: 8 }}><i style={{ width: 10, height: 10, borderRadius: 3, background: MARKET_COLOR[m] }} />{MARKET_LABEL[m] ?? m}</span>}>
          <div className="scroll-x">
            <table className="table">
              <thead>
                <tr>
                  <th>Symbol</th><th>Side</th><th className="r">Size</th><th className="r">Entry</th>
                  <th className="r">Stop-loss</th><th className="r">Risk to stop</th><th>Opened</th>
                </tr>
              </thead>
              <tbody>
                {o.positions.filter((p) => p.market === m).map((p) => {
                  const distance = Math.abs(p.entry_price - p.stop) / p.entry_price * 100;
                  const locked = p.side === "long" ? p.stop >= p.entry_price : p.stop <= p.entry_price;
                  return (
                    <tr key={p.symbol}>
                      <td className="sym">{p.symbol}</td>
                      <td><Pill tone={p.side === "short" ? "red" : "green"}>{p.side}</Pill></td>
                      <td className="r num">{qty(p.qty)}{m === "forex" ? " lots" : ""}</td>
                      <td className="r num">{price(p.entry_price)}</td>
                      <td className="r num">{price(p.stop)}</td>
                      <td className="r">
                        {locked
                          ? <span className="up row" style={{ justifyContent: "flex-end", gap: 4 }}><ShieldCheck size={15} />profit locked</span>
                          : <span className="num dim">{distance.toFixed(2)}%</span>}
                      </td>
                      <td className="mute">{ago(p.opened_at)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      ))}
      <div className="field-help">
        The stop-loss follows the price as it moves in your favour (trailing stop) and never moves back.
        Forex stops sit at your broker, so they work even when the PC is off.
      </div>
    </Page>
  );
}
