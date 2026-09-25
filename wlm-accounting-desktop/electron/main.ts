import { app, BrowserWindow, dialog, ipcMain, shell } from "electron";
import { promises as fs } from "node:fs";
import path from "node:path";
import { LedgerStore } from "./store";

const DEV_SERVER = process.env.VITE_DEV_SERVER_URL;

let store: LedgerStore;
let mainWindow: BrowserWindow | null = null;

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1024,
    minHeight: 680,
    show: false,
    backgroundColor: "#0A0D12",
    title: "WLM Accounting",
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  // Shown only once it has something to paint, so the app never appears as a
  // white rectangle before the dark theme loads.
  mainWindow.once("ready-to-show", () => mainWindow?.show());

  // Anything that isn't this app opens in the real browser, not in a window
  // with no address bar.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/.test(url)) shell.openExternal(url);
    return { action: "deny" };
  });

  if (DEV_SERVER) {
    mainWindow.loadURL(DEV_SERVER);
  } else {
    mainWindow.loadFile(path.join(__dirname, "../dist/index.html"));
  }

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

app.whenReady().then(() => {
  store = new LedgerStore(app.getPath("userData"));
  registerHandlers();
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

function registerHandlers(): void {
  ipcMain.handle("ledger:read", () => store.read());
  ipcMain.handle("ledger:write", (_e, ledger: unknown) => store.write(ledger));
  ipcMain.handle("ledger:path", () => store.path);
  ipcMain.handle("app:version", () => app.getVersion());

  ipcMain.handle(
    "file:open",
    async (_e, options: { title: string; extensions: string[] }) => {
      const result = await dialog.showOpenDialog(mainWindow!, {
        title: options.title,
        properties: ["openFile"],
        filters: [{ name: options.title, extensions: options.extensions }],
      });
      if (result.canceled || !result.filePaths[0]) return null;

      const file = result.filePaths[0];
      return { name: path.basename(file), text: await fs.readFile(file, "utf8") };
    }
  );

  ipcMain.handle(
    "file:save",
    async (_e, options: { defaultName: string; extensions: string[]; text: string }) => {
      const result = await dialog.showSaveDialog(mainWindow!, {
        defaultPath: options.defaultName,
        filters: [{ name: options.defaultName, extensions: options.extensions }],
      });
      if (result.canceled || !result.filePath) return null;

      await fs.writeFile(result.filePath, options.text, "utf8");
      return result.filePath;
    }
  );

  ipcMain.handle("image:pick", async () => {
    const result = await dialog.showOpenDialog(mainWindow!, {
      title: "Choose a logo",
      properties: ["openFile"],
      filters: [{ name: "Images", extensions: ["png", "jpg", "jpeg"] }],
    });
    if (result.canceled || !result.filePaths[0]) return null;

    const file = result.filePaths[0];
    const bytes = await fs.readFile(file);
    const mime = /\.png$/i.test(file) ? "image/png" : "image/jpeg";
    return { dataUri: `data:${mime};base64,${bytes.toString("base64")}`, bytes: bytes.length };
  });

  ipcMain.handle("pdf:save", (_e, options: { html: string; defaultName: string }) =>
    savePdf(options.html, options.defaultName)
  );
}

/**
 * Renders a document to PDF in an off-screen window.
 *
 * The markup is the same markup the phone prints — it comes from the shared
 * engine — so an invoice is the same document whichever app produced it. It is
 * loaded as a data URL into a window with no preload and no node access: this
 * page is generated from customer names and line descriptions, and it should
 * not be able to reach anything if any of that ever contains markup.
 */
async function savePdf(html: string, defaultName: string): Promise<string | null> {
  const target = await dialog.showSaveDialog(mainWindow!, {
    defaultPath: defaultName,
    filters: [{ name: "PDF", extensions: ["pdf"] }],
  });
  if (target.canceled || !target.filePath) return null;

  const renderer = new BrowserWindow({
    show: false,
    webPreferences: { contextIsolation: true, nodeIntegration: false, javascript: false },
  });

  try {
    await renderer.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
    const pdf = await renderer.webContents.printToPDF({
      printBackground: true,
      pageSize: "A4",
      margins: { top: 0, bottom: 0, left: 0, right: 0 },
    });
    await fs.writeFile(target.filePath, pdf);
    return target.filePath;
  } finally {
    renderer.destroy();
  }
}
