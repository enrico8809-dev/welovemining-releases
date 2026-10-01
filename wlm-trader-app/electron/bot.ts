import { ChildProcess, spawn } from "node:child_process";
import { promises as fs, existsSync } from "node:fs";
import path from "node:path";
import { EventEmitter } from "node:events";

// Runs the Python trading bot (trading-bot/bot/server.py) for the Windows app:
// finds/creates its Python environment, starts the server, restarts it after a crash,
// and stops it gracefully (never in the middle of an order) when the app quits.

export const PORT = 8765;
export const URL = `http://127.0.0.1:${PORT}`;

export type Phase = "needs-folder" | "preparing" | "starting" | "running" | "stopped" | "error";

export interface BotState {
  phase: Phase;
  folder: string;
  message: string;
  log: string[];
}

const isWindows = process.platform === "win32";

export class BotManager extends EventEmitter {
  state: BotState = { phase: "needs-folder", folder: "", message: "", log: [] };
  private child: ChildProcess | null = null;
  private quitting = false;
  private crashes = 0;

  constructor(folder: string) {
    super();
    this.state.folder = folder;
  }

  private set(update: Partial<BotState>): void {
    this.state = { ...this.state, ...update };
    this.emit("state", this.state);
  }

  private log(line: string): void {
    const lines = line.split(/\r?\n/).filter((l) => l.trim());
    if (!lines.length) return;
    this.state.log = [...this.state.log, ...lines].slice(-400);
    this.emit("state", this.state);
  }

  python(): string {
    return path.join(this.state.folder, ".venv", isWindows ? "Scripts\\python.exe" : "bin/python");
  }

  /** The token the bot created in its .env (APP_TOKEN). */
  async token(): Promise<string | null> {
    try {
      const env = await fs.readFile(path.join(this.state.folder, ".env"), "utf8");
      const match = env.match(/^APP_TOKEN=(.+)$/m);
      return match ? match[1].trim() : null;
    } catch {
      return null;
    }
  }

  async start(): Promise<void> {
    if (!this.state.folder || !existsSync(path.join(this.state.folder, "bot", "server.py"))) {
      this.set({ phase: "needs-folder", message: "" });
      return;
    }
    this.quitting = false;
    // Already running (another window, or started by hand)? Then just use it.
    if (await healthy()) {
      this.set({ phase: "running", message: "Connected to the running bot." });
      return;
    }
    try {
      await this.prepare();
    } catch (e) {
      this.set({ phase: "error", message: (e as Error).message });
      return;
    }
    this.set({ phase: "starting", message: "Starting the bot…" });
    this.child = spawn(this.python(), ["-m", "bot.server", "--port", String(PORT)], {
      cwd: this.state.folder,
      env: { ...process.env, PYTHONUNBUFFERED: "1", PYTHONIOENCODING: "utf-8" },
      windowsHide: true,
    });
    this.child.stdout?.on("data", (d: Buffer) => this.log(d.toString()));
    this.child.stderr?.on("data", (d: Buffer) => this.log(d.toString()));
    this.child.on("exit", (code) => {
      this.child = null;
      if (this.quitting) return this.set({ phase: "stopped", message: "" });
      this.crashes += 1;
      this.set({ phase: "error", message: `The bot program stopped (code ${code}). Restarting in 15 seconds…` });
      if (this.crashes <= 5) setTimeout(() => !this.quitting && this.start(), 15_000);
    });
    for (let i = 0; i < 60; i++) {                    // wait up to 60 s for the server to answer
      await sleep(1000);
      if (!this.child) return;
      if (await healthy()) {
        this.crashes = 0;
        this.set({ phase: "running", message: "" });
        return;
      }
    }
    this.set({ phase: "error", message: "The bot didn't start in time. See the messages below." });
  }

  /** Create .venv and install the packages the first time (setup.bat does the same). */
  private async prepare(): Promise<void> {
    const envFile = path.join(this.state.folder, ".env");
    if (!existsSync(envFile) && existsSync(`${envFile}.example`)) await fs.copyFile(`${envFile}.example`, envFile);
    if (existsSync(this.python())) return;
    this.set({ phase: "preparing", message: "First start: installing Python packages (a few minutes)…" });
    const candidates: [string, string[]][] = isWindows
      ? [["py", ["-3", "-m", "venv", ".venv"]], ["python", ["-m", "venv", ".venv"]]]
      : [["python3", ["-m", "venv", ".venv"]]];
    let made = false;
    for (const [cmd, args] of candidates) {
      if ((await this.run(cmd, args)) === 0) {
        made = true;
        break;
      }
    }
    if (!made) throw new Error("Python 3.11+ was not found. Install it from python.org (tick \"Add python.exe to PATH\"), then press Try again.");
    await this.run(this.python(), ["-m", "pip", "install", "--upgrade", "pip"]);
    if ((await this.run(this.python(), ["-m", "pip", "install", "-r", "requirements.txt"])) !== 0) {
      throw new Error("Installing the Python packages failed. Check your internet connection and press Try again.");
    }
  }

  private run(cmd: string, args: string[]): Promise<number> {
    return new Promise((resolve) => {
      this.log(`> ${cmd} ${args.join(" ")}`);
      const p = spawn(cmd, args, { cwd: this.state.folder, windowsHide: true });
      p.stdout.on("data", (d: Buffer) => this.log(d.toString()));
      p.stderr.on("data", (d: Buffer) => this.log(d.toString()));
      p.on("error", () => resolve(-1));
      p.on("exit", (code) => resolve(code ?? -1));
    });
  }

  /** Graceful stop: ask the trading loop to stop (it finishes the current order first), then end the program. */
  async stop(): Promise<void> {
    this.quitting = true;
    const token = await this.token();
    if (token && this.child) {
      try {
        await fetch(`${URL}/api/control`, {
          method: "POST",
          headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
          body: JSON.stringify({ action: "stop" }),
        });
        for (let i = 0; i < 90; i++) {
          const r = await fetch(`${URL}/api/overview`, { headers: { Authorization: `Bearer ${token}` } });
          const o = (await r.json()) as { engine?: { running?: boolean } };
          if (!o.engine?.running) break;
          await sleep(1000);
        }
      } catch {
        /* server already gone */
      }
    }
    this.child?.kill();
    this.child = null;
    this.set({ phase: "stopped", message: "" });
  }

  async restart(): Promise<void> {
    await this.stop();
    this.crashes = 0;
    await this.start();
  }
}

async function healthy(): Promise<boolean> {
  try {
    const r = await fetch(`${URL}/api/health`, { signal: AbortSignal.timeout(1500) });
    return r.ok;
  } catch {
    return false;
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Copy the bot that ships inside the installer to a writable folder. Only code and default
 *  settings are copied: your .env, database, logs and app settings are never in the installer,
 *  so an update can't overwrite them. */
export async function installBundledBot(source: string, target: string): Promise<void> {
  const skip = new Set([".venv", ".env", "__pycache__", ".pytest_cache"]);
  async function copy(from: string, to: string): Promise<void> {
    await fs.mkdir(to, { recursive: true });
    for (const entry of await fs.readdir(from, { withFileTypes: true })) {
      if (skip.has(entry.name)) continue;
      const src = path.join(from, entry.name);
      const dst = path.join(to, entry.name);
      if (entry.isDirectory()) await copy(src, dst);
      else await fs.copyFile(src, dst);
    }
  }
  await copy(source, target);
}
