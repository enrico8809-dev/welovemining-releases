import { RotateCcw } from "lucide-react";
import { useApp } from "../App";
import { useAction, useSettings } from "../hooks";
import { Card, Field, Page, RangeField } from "../components/ui";
import { SaveBar } from "../components/SaveBar";
import { money } from "../format";

export default function Risk() {
  const { overview, api } = useApp();
  const act = useAction();
  const s = useSettings();
  if (!s.data) return <Page title="Risk"><div className="empty">{s.error || "Loading settings…"}</div></Page>;
  const total = overview?.combined.equity ?? 0;
  const riskPct = s.value<number>("risk.risk_per_trade_pct") ?? 1;
  const num = (key: string, fallback: number) => s.value<number>(key) ?? fallback;

  return (
    <Page title="Risk" sub="The safety limits. Every order passes through these first; nothing can bypass them."
      actions={<button className="btn" onClick={() => act(() => api.control("reset_risk"))}><RotateCcw size={17} />Reset halts</button>}>
      <div className="grid grid-2">
        <Card title="Every trade">
          <div className="stack" style={{ gap: 18 }}>
            <RangeField label="Risk per trade" unit="%" min={0.1} max={5} step={0.1} value={riskPct}
              onChange={(v) => s.set("risk.risk_per_trade_pct", v)}
              help={<>If a trade hits its stop-loss you lose about this much of the account (≈ <b className="num">{money(total * riskPct / 100)}</b> USD now). 1% is the classic safe choice.</>} />
            <RangeField label="Stop-loss distance" unit="× ATR" min={0.5} max={6} step={0.5} value={num("risk.stop_atr_mult", 2)}
              onChange={(v) => s.set("risk.stop_atr_mult", v)}
              help="How far below the price the stop-loss goes, in typical daily moves (ATR). Wider = fewer stop-outs but smaller positions." />
            <RangeField label="Trailing stop" unit="× ATR" min={1} max={10} step={0.5} value={num("risk.trailing_atr_mult", 5)}
              onChange={(v) => s.set("risk.trailing_atr_mult", v)}
              help="The stop follows the best price this far behind, to lock in profit. Backtests: 5 worked better than 3." />
            <Field label="Max order size (crypto and stocks)" help="Hard cap per order in USD, whatever the sizing says.">
              <input className="input num" type="number" min={1} step={1} value={s.envValue<number>("MAX_ORDER_USDT") ?? 20}
                onChange={(e) => s.setEnv("MAX_ORDER_USDT", Number(e.target.value))} />
            </Field>
          </div>
        </Card>

        <Card title="Account protection">
          <div className="stack" style={{ gap: 18 }}>
            <RangeField label="Max open trades (per market)" min={1} max={10} step={1} value={num("risk.max_open_trades", 3)}
              onChange={(v) => s.set("risk.max_open_trades", v)} />
            <RangeField label="Max per trade" unit="%" min={5} max={100} step={5} value={num("risk.max_pct_per_trade", 25)}
              onChange={(v) => s.set("risk.max_pct_per_trade", v)} help="Never more than this share of the account in one crypto/stock position." />
            <RangeField label="Daily loss limit" unit="%" min={0.5} max={10} step={0.5} value={num("risk.daily_loss_limit_pct", 3)}
              onChange={(v) => s.set("risk.daily_loss_limit_pct", v)} help="Down this much today: no new trades until tomorrow (UTC)." />
            <RangeField label="Max drawdown" unit="%" min={5} max={50} step={1} value={num("risk.max_drawdown_pct", 20)}
              onChange={(v) => s.set("risk.max_drawdown_pct", v)} help="Down this much from the best point: trading stops until you press Reset halts." />
          </div>
        </Card>

        <Card title="Forex">
          <div className="stack" style={{ gap: 18 }}>
            <RangeField label="Max exposure (swing)" unit="×" min={0.1} max={1} step={0.1} value={num("forex_risk.max_leverage", 1)}
              onChange={(v) => s.set("forex_risk.max_leverage", v)}
              help="All swing positions together are never worth more than your balance (1× = no leverage)." />
            <RangeField label="Risk per Forex trade" unit="%" min={0.1} max={3} step={0.1} value={num("forex_risk.risk_per_trade_pct", 1)}
              onChange={(v) => s.set("forex_risk.risk_per_trade_pct", v)} />
            <RangeField label="Max open Forex trades" min={1} max={10} step={1} value={num("forex_risk.max_open_trades", 3)}
              onChange={(v) => s.set("forex_risk.max_open_trades", v)} />
            <RangeField label="Max size per order" unit=" lots" min={0.01} max={5} step={0.01} value={num("forex_risk.max_lots", 1)}
              onChange={(v) => s.set("forex_risk.max_lots", v)} help="1 lot of EURUSD = 100,000 euros." />
          </div>
        </Card>
      </div>
      <SaveBar dirty={s.dirty} saving={s.saving} onSave={s.save} onDiscard={s.discard} />
    </Page>
  );
}
