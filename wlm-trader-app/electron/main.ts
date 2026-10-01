import { app, BrowserWindow, dialog, ipcMain, Menu, nativeImage, Notification, shell, Tray } from "electron";
import { execFile } from "node:child_process";
import { existsSync, promises as fs } from "node:fs";
import path from "node:path";
import { BotManager, installBundledBot, PORT, URL } from "./bot";

// WLM Trader for Windows: runs the trading bot in the background and shows the app.
// Closing the window keeps the bot trading (tray icon); "Quit" stops it gracefully.

const DEV_SERVER = process.env.VITE_DEV_SERVER_URL;
const settingsFile = () => path.join(app.getPath("userData"), "settings.json");
let win: BrowserWindow | null = null;
let tray: Tray | null = null;
let bot: BotManager;
let quitting = false;

interface AppSettings { botFolder?: string; bundledVersion?: string; trayHintShown?: boolean }

async function readSettings(): Promise<AppSettings> {
  try {
    return JSON.parse(await fs.readFile(settingsFile(), "utf8")) as AppSettings;
  } catch {
    return {};
  }
}

async function writeSettings(update: Partial<AppSettings>): Promise<void> {
  const current = await readSettings();
  await fs.mkdir(path.dirname(settingsFile()), { recursive: true });
  await fs.writeFile(settingsFile(), JSON.stringify({ ...current, ...update }, null, 2));
}

const bundledSource = () => path.join(process.resourcesPath, "trading-bot");
const bundledTarget = () => path.join(app.getPath("userData"), "trading-bot");

// ---------------------------------------------------------------- window and tray
function createWindow(show = true): void {
  win = new BrowserWindow({
    width: 1440, height: 900, minWidth: 980, minHeight: 640, show: false,
    backgroundColor: "#0A0D12", title: "WLM Trader", autoHideMenuBar: true,
    icon: path.join(__dirname, "../build/icon.ico"),
    webPreferences: { preload: path.join(__dirname, "preload.js"), contextIsolation: true, nodeIntegration: false, sandbox: true },
  });
  win.once("ready-to-show", () => show && win?.show());
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/.test(url)) shell.openExternal(url);
    return { action: "deny" };
  });
  if (DEV_SERVER) win.loadURL(DEV_SERVER);
  else win.loadFile(path.join(__dirname, "../dist/index.html"));

  // Closing the window hides it: the bot keeps trading in the background
  win.on("close", async (e) => {
    if (quitting) return;
    e.preventDefault();
    win?.hide();
    const settings = await readSettings();
    if (!settings.trayHintShown && Notification.isSupported()) {
      new Notification({ title: "WLM Trader is still running", body: "The bot keeps trading. Right-click the tray icon and choose Quit to stop it." }).show();
      await writeSettings({ trayHintShown: true });
    }
  });
}

function showWindow(): void {
  if (!win) createWindow();
  win!.show();
  win!.focus();
}

function createTray(): void {
  const icon = nativeImage.createFromPath(path.join(__dirname, "../build/icon.ico"));
  tray = new Tray(icon.isEmpty() ? nativeImage.createEmpty() : icon);
  tray.setToolTip("WLM Trader");
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: "Open WLM Trader", click: showWindow },
    { type: "separator" },
    { label: "Quit (stops the bot)", click: () => quit() },
  ]));
  tray.on("double-click", showWindow);
}

async function quit(): Promise<void> {
  const choice = await dialog.showMessageBox({
    type: "question", buttons: ["Quit and stop the bot", "Cancel"], defaultId: 1, cancelId: 1,
    title: "Quit WLM Trader?", message: "Quitting stops the trading bot.",
    detail: "Forex stop-losses stay at your broker. Crypto and stock stop-losses only work while the bot runs.",
  });
  if (choice.response !== 0) return;
  quitting = true;
  tray?.setToolTip("WLM Trader: stopping the bot…");
  await bot.stop();
  app.quit();
}

// ---------------------------------------------------------------- Tailscale (phone access)
const TAILSCALE = process.platform === "win32" ? ["tailscale", "C:\\Program Files\\Tailscale\\tailscale.exe"] : ["tailscale"];

function tailscale(args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const attempt = (i: number) => {
      if (i >= TAILSCALE.length) return reject(new Error("Tailscale is not installed"));
      execFile(TAILSCALE[i], args, { timeout: 20_000, windowsHide: true }, (err, stdout, stderr) => {
        if (err && (err as NodeJS.ErrnoException).code === "ENOENT") return attempt(i + 1);
        if (err) return reject(new Error((stderr || stdout || err.message).trim()));
        resolve(stdout);
      });
    };
    attempt(0);
  });
}

async function tailscaleInfo() {
  try {
    const status = JSON.parse(await tailscale(["status", "--json"])) as { Self?: { DNSName?: string } };
    const name = status.Self?.DNSName?.replace(/\.$/, "");
    let serving = false;
    try {
      serving = (await tailscale(["serve", "status"])).includes(String(PORT));
    } catch {
      serving = false;
    }
    return { installed: true, url: name ? `https://${name}` : null, serving };
  } catch {
    return { installed: false, url: null, serving: false };
  }
}

async function enablePhoneAccess() {
  try {
    await tailscale(["serve", "--bg", String(PORT)]);
  } catch (e) {
    const message = (e as Error).message;
    const link = message.match(/https:\/\/login\.tailscale\.com\/\S+/);
    if (link) {
      shell.openExternal(link[0]);
      throw new Error("Tailscale opened a page in your browser: click Enable there, then press the button again.");
    }
    throw new Error(message);
  }
  return tailscaleInfo();
}

// ---------------------------------------------------------------- bot folder
async function chooseFolder(): Promise<void> {
  const result = await dialog.showOpenDialog(win!, {
    title: "Choose your trading-bot folder (the one with start_bot.bat)", properties: ["openDirectory"],
  });
  if (result.canceled || !result.filePaths[0]) return;
  let folder = result.filePaths[0];
  // Accept the parent folder too (the zip extracts to trading-bot\trading-bot)
  if (!existsSync(path.join(folder, "bot", "server.py")) && existsSync(path.join(folder, "trading-bot", "bot", "server.py"))) {
    folder = path.join(folder, "trading-bot");
  }
  if (!existsSync(path.join(folder, "bot", "server.py"))) {
    await dialog.showMessageBox(win!, { type: "warning", message: "That isn't the bot folder (or it's an older version without the app server).",
      detail: "Choose the folder that contains start_bot.bat and config.yaml, or use Install a fresh bot." });
    return;
  }
  await writeSettings({ botFolder: folder });
  await bot.stop();
  bot.state.folder = folder;
  bot.start();
}

async function useBundledBot(): Promise<void> {
  await installBundledBot(bundledSource(), bundledTarget());
  await writeSettings({ botFolder: bundledTarget(), bundledVersion: app.getVersion() });
  bot.state.folder = bundledTarget();
  bot.start();
}

// ---------------------------------------------------------------- start
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on("second-instance", showWindow);
  app.whenReady().then(async () => {
    const settings = await readSettings();
    // The bundled bot is updated with the app (code only: your keys and history stay)
    if (settings.botFolder === bundledTarget() && settings.bundledVersion !== app.getVersion() && existsSync(bundledSource())) {
      await installBundledBot(bundledSource(), bundledTarget());
      await writeSettings({ bundledVersion: app.getVersion() });
    }
    bot = new BotManager(settings.botFolder ?? "");
    bot.on("state", (state) => win?.webContents.send("bot-state", state));
    registerHandlers();
    createWindow(!process.argv.includes("--hidden"));
    createTray();
    bot.start();
  });
}

app.on("before-quit", (e) => {
  if (!quitting) {
    e.preventDefault();
    quit();
  }
});

function registerHandlers(): void {
  ipcMain.handle("app:version", () => app.getVersion());
  ipcMain.handle("bot:state", () => bot.state);
  ipcMain.handle("bot:connection", async () => {
    const token = await bot.token();
    return bot.state.phase === "running" && token ? { url: URL, token } : null;
  });
  ipcMain.handle("bot:choose-folder", chooseFolder);
  ipcMain.handle("bot:use-bundled", useBundledBot);
  ipcMain.handle("bot:restart", () => bot.restart());
  ipcMain.handle("bot:open-folder", () => bot.state.folder && shell.openPath(bot.state.folder));
  ipcMain.handle("tailscale:info", tailscaleInfo);
  ipcMain.handle("tailscale:enable", enablePhoneAccess);
  ipcMain.handle("autostart:get", () => app.getLoginItemSettings().openAtLogin);
  ipcMain.handle("autostart:set", (_e, on: boolean) => app.setLoginItemSettings({ openAtLogin: on, args: ["--hidden"] }));
}
