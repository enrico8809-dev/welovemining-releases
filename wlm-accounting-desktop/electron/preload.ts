import { contextBridge, ipcRenderer } from "electron";

/**
 * The only way the page can reach the machine.
 *
 * Each call is a named operation, never a path or a command the page chooses:
 * the renderer can ask to save a PDF, but it cannot say where to — every file
 * that is read or written is one the user picked in a dialog. The books
 * themselves are the single exception, and their location is fixed by the main
 * process.
 */
const api = {
  ledger: {
    read: (): Promise<unknown | null> => ipcRenderer.invoke("ledger:read"),
    write: (ledger: unknown): Promise<void> => ipcRenderer.invoke("ledger:write", ledger),
    path: (): Promise<string> => ipcRenderer.invoke("ledger:path"),
  },
  appVersion: (): Promise<string> => ipcRenderer.invoke("app:version"),
  openTextFile: (
    title: string,
    extensions: string[]
  ): Promise<{ name: string; text: string } | null> =>
    ipcRenderer.invoke("file:open", { title, extensions }),
  saveTextFile: (
    defaultName: string,
    extensions: string[],
    text: string
  ): Promise<string | null> =>
    ipcRenderer.invoke("file:save", { defaultName, extensions, text }),
  pickImage: (): Promise<{ dataUri: string; bytes: number } | null> =>
    ipcRenderer.invoke("image:pick"),
  savePdf: (html: string, defaultName: string): Promise<string | null> =>
    ipcRenderer.invoke("pdf:save", { html, defaultName }),
};

contextBridge.exposeInMainWorld("wlm", api);

export type WlmApi = typeof api;
