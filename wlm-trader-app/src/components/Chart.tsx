import { PointerEvent, useEffect, useMemo, useRef, useState } from "react";
import { dateTime, money } from "../format";

// Line chart for account value over time, built in plain SVG (no chart library).
// Thin 2px lines, recessive grid, one shared y-axis, crosshair + tooltip on hover/touch,
// legend + end labels when there's more than one series (identity is never colour alone).

export interface Series {
  key: string;
  label: string;
  color: string;
  points: [number, number][]; // [time ms, value]
}

const PAD = { top: 12, right: 58, bottom: 12, left: 4 };

export function LineChart({ series, height = 220, area = false, currency = "", percent = false }: {
  series: Series[]; height?: number; area?: boolean; currency?: string; percent?: boolean;
}) {
  const svg = useRef<SVGSVGElement>(null);
  const [hover, setHover] = useState<number | null>(null);    // time ms under the pointer
  const [W, setW] = useState(720);                             // drawn at the real width: text never stretches
  const H = height;
  useEffect(() => {
    const el = svg.current?.parentElement;
    if (!el) return;
    const ro = new ResizeObserver(() => setW(Math.max(200, el.clientWidth)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const fmt = (v: number) => (percent ? `${v >= 0 ? "+" : ""}${v.toFixed(Math.abs(v) < 10 ? 1 : 0)}%` : compact(v));

  const visible = series.filter((s) => s.points.length > 1);
  const scales = useMemo(() => {
    const all = visible.flatMap((s) => s.points);
    if (!all.length) return null;
    const t0 = Math.min(...all.map((p) => p[0]));
    const t1 = Math.max(...all.map((p) => p[0]));
    let lo = Math.min(...all.map((p) => p[1]));
    let hi = Math.max(...all.map((p) => p[1]));
    const padding = (hi - lo) * 0.12 || Math.abs(hi) * 0.01 || 1;
    lo -= padding;
    hi += padding;
    const x = (t: number) => PAD.left + ((t - t0) / (t1 - t0 || 1)) * (W - PAD.left - PAD.right);
    const y = (v: number) => PAD.top + (1 - (v - lo) / (hi - lo)) * (H - PAD.top - PAD.bottom);
    return { t0, t1, lo, hi, x, y };
  }, [visible, W, H]);

  if (!scales) return <div className="empty" style={{ height }}>The chart fills in as the bot runs.</div>;
  const { x, y, lo, hi, t0, t1 } = scales;
  const ticks = [lo + (hi - lo) * 0.25, lo + (hi - lo) * 0.5, lo + (hi - lo) * 0.75];

  const onMove = (e: PointerEvent<SVGSVGElement>) => {
    const rect = svg.current!.getBoundingClientRect();
    const px = ((e.clientX - rect.left) / rect.width) * W;
    const ratio = Math.max(0, Math.min(1, (px - PAD.left) / (W - PAD.left - PAD.right)));
    setHover(t0 + ratio * (t1 - t0));
  };
  const nearest = (s: Series, t: number) =>
    s.points.reduce((best, p) => (Math.abs(p[0] - t) < Math.abs(best[0] - t) ? p : best), s.points[0]);

  return (
    <div style={{ position: "relative" }}>
      <svg ref={svg} viewBox={`0 0 ${W} ${H}`} className="chart" style={{ height }}
        onPointerMove={onMove} onPointerDown={onMove} onPointerLeave={() => setHover(null)} role="img"
        aria-label={`Account value: ${visible.map((s) => `${s.label} ${money(s.points[s.points.length - 1][1])}`).join(", ")}`}>
        <defs>
          {visible.map((s) => (
            <linearGradient key={s.key} id={`fill-${s.key}`} x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor={s.color} stopOpacity="0.22" />
              <stop offset="100%" stopColor={s.color} stopOpacity="0" />
            </linearGradient>
          ))}
        </defs>
        {ticks.map((v) => (
          <g key={v}>
            <line x1={PAD.left} x2={W - PAD.right} y1={y(v)} y2={y(v)} stroke="var(--line)" strokeWidth="1" vectorEffect="non-scaling-stroke" />
            <text x={W - PAD.right + 6} y={y(v) + 4} fill="var(--mute)" fontSize="11" fontFamily="var(--font-num)">{fmt(v)}</text>
          </g>
        ))}
        {visible.map((s) => {
          const d = s.points.map((p, i) => `${i ? "L" : "M"}${x(p[0]).toFixed(1)},${y(p[1]).toFixed(1)}`).join(" ");
          const last = s.points[s.points.length - 1];
          return (
            <g key={s.key}>
              {area && <path d={`${d} L${x(last[0])},${H - PAD.bottom} L${x(s.points[0][0])},${H - PAD.bottom} Z`} fill={`url(#fill-${s.key})`} />}
              <path d={d} fill="none" stroke={s.color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
            </g>
          );
        })}
        {hover !== null && (
          <line x1={x(hover)} x2={x(hover)} y1={PAD.top} y2={H - PAD.bottom} stroke="var(--line-strong)" strokeWidth="1" vectorEffect="non-scaling-stroke" />
        )}
      </svg>
      {hover !== null && (
        <div className="card" style={{ position: "absolute", top: 4, left: `${Math.min(70, (x(hover) / W) * 100)}%`, padding: "8px 10px", pointerEvents: "none", fontSize: 13, boxShadow: "0 8px 22px rgba(0,0,0,.5)" }}>
          <div className="mute small">{dateTime(new Date(hover).toISOString())}</div>
          {visible.map((s) => (
            <div key={s.key} className="row" style={{ gap: 8 }}>
              <i style={{ width: 10, height: 3, background: s.color, borderRadius: 2 }} />
              <span>{s.label}</span>
              <span className="num" style={{ marginLeft: "auto" }}>{percent ? fmt(nearest(s, hover)[1]) : `${money(nearest(s, hover)[1])} ${currency}`}</span>
            </div>
          ))}
        </div>
      )}
      {visible.length > 1 && (
        <div className="legend" style={{ marginTop: 8 }}>
          {visible.map((s) => (
            <span key={s.key}><i style={{ background: s.color }} />{s.label} <b className="num">{percent ? fmt(s.points[s.points.length - 1][1]) : money(s.points[s.points.length - 1][1], 0)}</b></span>
          ))}
        </div>
      )}
    </div>
  );
}

function compact(v: number): string {
  const a = Math.abs(v);
  if (a >= 1e6) return `${(v / 1e6).toFixed(2)}M`;
  if (a >= 1e4) return `${(v / 1e3).toFixed(1)}k`;
  return v.toFixed(a >= 100 ? 0 : 2);
}

/** Combined USD curve: at every moment, the sum of each USD market's latest known value. */
export function combineSeries(equity: Record<string, [string, number][]>, markets: string[]): [number, number][] {
  const events = markets.flatMap((m) => (equity[m] ?? []).map(([t, v]) => ({ m, t: Date.parse(t), v })));
  events.sort((a, b) => a.t - b.t);
  const latest: Record<string, number> = {};
  const out: [number, number][] = [];
  for (const e of events) {
    latest[e.m] = e.v;
    if (Object.keys(latest).length === markets.filter((m) => equity[m]?.length).length) {
      out.push([e.t, Object.values(latest).reduce((a, b) => a + b, 0)]);
    }
  }
  return out;
}

export function toPoints(points: [string, number][] | undefined): [number, number][] {
  return (points ?? []).map(([t, v]) => [Date.parse(t), v]);
}
