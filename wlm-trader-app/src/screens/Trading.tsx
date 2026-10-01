import { useSettings } from "../hooks";
import { Banner, Card, Field, Page, RangeField, Segmented, Toggle } from "../components/ui";
import { SaveBar, SymbolEditor } from "../components/SaveBar";
import { MARKET_LABEL } from "../format";

// Plain-English descriptions so you know what each strategy does before picking it
export const STRATEGY_INFO: Record<string, string> = {
  regime: "Recommended. Reads the market first: follows uptrends, stays out (or goes short on Forex) in downtrends.",
  sma_cross: "Trend following: in while the short-term average is above the long-term average.",
  rsi_dip: "Buys short dips in an uptrend; on Forex also sells short spikes in a downtrend.",
  breakout: "Trades the break out of the recent range (high or low of the last 20 candles).",
  grid: "Buys lower and sells higher in steps inside a sideways range.",
  dca: "Buys more on dips (max 3 extra buys), then takes profit. Long only.",
};

export default function Trading() {
  const s = useSettings();
  if (!s.data) return <Page title="Trading"><div className="empty">{s.error || "Loading settings…"}</div></Page>;
  const strategies = s.data.options.strategies;
  const markets = s.value<string[]>("trader.markets") ?? [];
  const forexMode = s.value<string>("markets.forex.mode") ?? "swing";
  const toggleMarket = (m: string, on: boolean) =>
    s.set("trader.markets", on ? [...markets, m].filter((x, i, a) => a.indexOf(x) === i) : markets.filter((x) => x !== m));

  const strategySelect = (key: string, allowed = strategies) => (
    <Field label="Strategy" help={STRATEGY_INFO[s.value<string>(key)]}>
      <select className="select" value={s.value<string>(key) ?? ""} onChange={(e) => s.set(key, e.target.value)}>
        {allowed.map((name) => <option key={name} value={name}>{name}</option>)}
      </select>
    </Field>
  );

  return (
    <Page title="Trading" sub="What the bot trades and how">
      <Card title="Markets">
        <div className="stack">
          {["crypto", "stocks", "forex"].map((m) => (
            <div key={m} className="list-item">
              <div>
                <div className="sym">{MARKET_LABEL[m]}</div>
                <div className="mute small">{{
                  crypto: "Coins on your exchange (Binance). Spot only: no leverage, no shorting.",
                  stocks: "US stocks and ETFs (Interactive Brokers). Cash account only.",
                  forex: "Currency pairs and gold through MetaTrader 5. Long and short.",
                }[m]}</div>
              </div>
              <Toggle label={`Trade ${m}`} on={markets.includes(m)} onChange={(on) => toggleMarket(m, on)} />
            </div>
          ))}
        </div>
      </Card>

      <div className="grid grid-2">
        <Card title="Crypto and stocks">
          <div className="stack" style={{ gap: 14 }}>
            {strategySelect("trader.strategy")}
            <Field label="Stocks to trade">
              <SymbolEditor value={s.value<string[]>("markets.stocks.symbols") ?? []}
                onChange={(v) => s.set("markets.stocks.symbols", v)} placeholder="Add a stock, e.g. AAPL, then Enter" />
            </Field>
            <div className="field-help">Crypto coins are picked automatically every day by the Coin Scanner (the 20 most-traded USDT pairs).</div>
            <RangeField label="Check prices every" unit=" s" min={60} max={900} step={30}
              value={s.value<number>("trader.loop_seconds") ?? 300} onChange={(v) => s.set("trader.loop_seconds", v)}
              help="How often the bot checks prices and stop-losses for crypto and stocks." />
          </div>
        </Card>

        <Card title="Forex style">
          <div className="stack" style={{ gap: 14 }}>
            <Segmented value={forexMode} onChange={(v) => s.set("markets.forex.mode", v)}
              options={[{ value: "swing", label: "Swing (days)" }, { value: "day", label: "Day trading" }]} />
            <div className="field-help">
              {forexMode === "day"
                ? "Quick trades on hourly candles during the London and New York sessions. Everything is closed before 17:00 New York, so nothing is held overnight. Up to 3× your balance in total; each trade still risks about 1%."
                : "Daily candles: trades last days or weeks. Total exposure is never more than your balance (1:1)."}
            </div>
            <div className="list-item">
              <div>
                <div className="sym" style={{ fontSize: 15 }}>Allow short trades</div>
                <div className="mute small">Profit when a price falls. Backtests: long-only did slightly better.</div>
              </div>
              <Toggle label="Allow short trades" on={s.value<boolean>("markets.forex.allow_short") ?? true}
                onChange={(v) => s.set("markets.forex.allow_short", v)} />
            </div>
            {forexMode === "day" ? (
              <>
                {strategySelect("forex_day.strategy", strategies.filter((n) => n !== "grid" && n !== "dca"))}
                <Field label="Candle size">
                  <Segmented value={s.value<string>("forex_day.timeframe") ?? "1h"} onChange={(v) => s.set("forex_day.timeframe", v)}
                    options={[{ value: "5m", label: "5 min" }, { value: "15m", label: "15 min" }, { value: "30m", label: "30 min" }, { value: "1h", label: "1 hour" }]} />
                </Field>
                <RangeField label="Max new trades per day" min={1} max={20} step={1}
                  value={s.value<number>("forex_day.max_trades_per_day") ?? 6} onChange={(v) => s.set("forex_day.max_trades_per_day", v)} />
                <div className="grid" style={{ gridTemplateColumns: "1fr 1fr" }}>
                  <RangeField label="Session start (UTC)" unit=":00" min={0} max={23} step={1}
                    value={s.value<number>("forex_day.session_start_utc") ?? 7} onChange={(v) => s.set("forex_day.session_start_utc", v)} />
                  <RangeField label="Session end (UTC)" unit=":00" min={1} max={24} step={1}
                    value={s.value<number>("forex_day.session_end_utc") ?? 20} onChange={(v) => s.set("forex_day.session_end_utc", v)} />
                </div>
                <RangeField label="Max exposure (day trading)" unit="×" min={0.5} max={3} step={0.5}
                  value={s.value<number>("forex_day.max_leverage") ?? 3} onChange={(v) => s.set("forex_day.max_leverage", v)}
                  help="All day trades together are never worth more than this many times your balance." />
              </>
            ) : strategySelect("markets.forex.strategy")}
          </div>
        </Card>
      </div>

      <Card title="Forex pairs">
        <div className="stack" style={{ gap: 14 }}>
          <SymbolEditor value={s.value<string[]>("markets.forex.symbols") ?? []}
            onChange={(v) => s.set("markets.forex.symbols", v)} placeholder="Add a pair as your broker names it, e.g. EURJPY" />
          <Field label="Pause around news (UTC)" help={'One per line, e.g. "2026-10-02 12:30 US jobs report". No new Forex trades this many minutes before and after.'}>
            <textarea className="input num" rows={3} value={(s.value<string[]>("forex_hours.news_events") ?? []).join("\n")}
              onChange={(e) => s.set("forex_hours.news_events", e.target.value.split("\n").map((l) => l.trim()).filter(Boolean))} />
          </Field>
          <RangeField label="News pause" unit=" min" min={0} max={120} step={5}
            value={s.value<number>("forex_hours.news_pause_minutes") ?? 30} onChange={(v) => s.set("forex_hours.news_pause_minutes", v)} />
        </div>
      </Card>

      <Banner tone="info">Backtests show what <b>would</b> have happened, not what will. Try changes on paper/demo first (Research tab).</Banner>
      <SaveBar dirty={s.dirty} saving={s.saving} onSave={s.save} onDiscard={s.discard} />
    </Page>
  );
}
