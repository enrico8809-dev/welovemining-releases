// Talks to the bot's server (trading-bot/bot/server.py).
// Windows app: the server runs on this PC (http://127.0.0.1:8765); the token comes from the
// desktop bridge. Phone: the server is reached over Tailscale (https://<pc>.ts.net) with a
// token obtained once through a 6-digit pairing code.

export interface Connection {
  url: string;
  token: string;
}

export interface Account {
  market: string;
  equity: number | null;
  cash: number | null;
  currency: string;
  mode: "paper" | "live" | "demo";
  change_pct: number | null;
  positions: number;
  blocked: string;
}

export interface Position {
  market: string;
  symbol: string;
  qty: number;
  entry_price: number;
  stop: number;
  highest: number;
  opened_at: string;
  strategy: string;
  side: "long" | "short";
}

export interface Trade {
  id: number;
  time: string;
  market: string;
  symbol: string;
  side: "buy" | "sell";
  qty: number;
  price: number;
  fee: number;
  reason: string;
  pnl: number | null;
  mode: string;
}

export interface Overview {
  version: string;
  time: string;
  engine: { running: boolean; stopping: boolean; started_at: string; last_loop: string; error: string; market_errors: Record<string, string> };
  paused: boolean;
  kill_switch: boolean;
  live: { crypto_stocks: boolean; forex: boolean };
  accounts: Account[];
  combined: { equity: number; currency: string; markets: string[]; excluded: string[] };
  positions: Position[];
  trades: Trade[];
  equity: Record<string, [string, number][]>;
  alerts: { telegram: boolean; whatsapp: boolean };
  strategy: string;
  markets: string[];
}

export interface TrackRecord {
  since: string;
  days: number;
  trades: number;
  closed: number;
  pnl: number;
  wins: number;
}

export type SettingValue = string | number | boolean | string[] | null;

export interface Settings {
  values: Record<string, SettingValue>;
  env: { LIVE_TRADING: boolean; FOREX_LIVE_TRADING: boolean; MAX_ORDER_USDT: number; EXCHANGE: string };
  secrets: Record<string, boolean>;
  options: { strategies: string[]; markets: string[]; exchanges: string[] };
  local: boolean;
}

export interface Job {
  id: string;
  kind: string;
  args: Record<string, unknown>;
  status: "running" | "done" | "failed";
  started: string;
  finished?: string;
  output?: string;
  table?: { columns: string[]; rows: string[][] } | null;   // backtest summary
}

export interface LivePosition extends Position {
  price: number | null;
  pnl: number | null;          // open profit/loss in the account currency
  move_pct: number | null;     // price move since entry, in the trade's direction
  to_stop_pct: number | null;  // distance to the stop-loss (positive = safe side)
  quote_time: string | null;
}

export interface Live {
  time: string;
  running: boolean;
  paused: boolean;
  kill_switch: boolean;
  feed_error: string;
  accounts: { market: string; equity: number | null; cash: number | null; currency: string; mode: string; open_pnl: number }[];
  total: number;
  open_pnl: number;
  positions: LivePosition[];
  watch: { market: string; symbol: string; price: number | null; time: string | null; signal: "long" | "short" | "out" | null; held: boolean }[];
  history: Record<string, [string, number][]>;
  activity: { time: string; market: string; kind: string; symbol: string; text: string }[];
}

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export function normalizeUrl(input: string): string {
  let url = input.trim().replace(/\/+$/, "");
  if (!/^https?:\/\//i.test(url)) url = `https://${url}`;
  return url;
}

async function request<T>(url: string, method: string, path: string, token?: string, body?: unknown): Promise<T> {
  let response: Response;
  try {
    response = await fetch(url + path, {
      method,
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError(0, "Can't reach the bot. Is the PC on, and Tailscale connected on this phone?");
  }
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new ApiError(response.status, (data as { error?: string }).error ?? `HTTP ${response.status}`);
  return data as T;
}

/** Trade a 6-digit pairing code (shown in the Windows app) for this device's token. */
export async function pair(url: string, code: string): Promise<Connection> {
  const base = normalizeUrl(url);
  await request(base, "GET", "/api/health");
  const { token } = await request<{ token: string }>(base, "POST", "/api/pair", undefined, { code });
  return { url: base, token };
}

export class Api {
  constructor(public conn: Connection) {}

  private req<T>(method: string, path: string, body?: unknown): Promise<T> {
    return request<T>(this.conn.url, method, path, this.conn.token, body);
  }

  overview = () => this.req<Overview>("GET", "/api/overview");
  live = () => this.req<Live>("GET", "/api/live");
  trades = (market?: string, limit = 300) =>
    this.req<{ trades: Trade[]; record: Record<string, TrackRecord> }>(
      "GET", `/api/trades?limit=${limit}${market ? `&market=${market}` : ""}`);
  logs = (lines = 400) => this.req<{ lines: string[] }>("GET", `/api/logs?lines=${lines}`);
  control = (action: string) => this.req<{ ok: boolean; message: string }>("POST", "/api/control", { action });
  settings = () => this.req<Settings>("GET", "/api/settings");
  saveSettings = (values: Record<string, SettingValue>, env: Record<string, SettingValue> = {}) =>
    this.req<{ ok: boolean; changed: string[]; restarted: boolean }>("PUT", "/api/settings", { values, env });
  saveSecrets = (secrets: Record<string, string>) =>
    this.req<{ ok: boolean; changed: string[] }>("PUT", "/api/secrets", secrets);
  testAlerts = () => this.req<{ ok: boolean; telegram: boolean; whatsapp: boolean }>("POST", "/api/notify/test");
  jobs = () => this.req<{ jobs: Job[] }>("GET", "/api/jobs");
  startJob = (kind: string, args: Record<string, unknown>) => this.req<Job>("POST", "/api/jobs", { kind, args });
  job = (id: string) => this.req<Job>("GET", `/api/jobs/${id}`);
  pairStart = () => this.req<{ code: string; expires_in: number }>("POST", "/api/pair/start");
}

// ---------------------------------------------------------------- phone connection storage
const KEY = "wlm-trader.connection";

export function savedConnection(): Connection | null {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as Connection) : null;
  } catch {
    return null;
  }
}

export function saveConnection(conn: Connection | null): void {
  try {
    if (conn) localStorage.setItem(KEY, JSON.stringify(conn));
    else localStorage.removeItem(KEY);
  } catch {
    /* storage unavailable: the user just pairs again next time */
  }
}
