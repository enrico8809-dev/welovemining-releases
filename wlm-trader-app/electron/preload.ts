import { contextBridge, ipcRenderer, IpcRendererEvent } from "electron";

// The only things the app's screens may ask the Windows side to do (see src/desktop.ts).
contextBridge.exposeInMainWorld("wlm", {
  version: () => ipcRenderer.invoke("app:version"),
  connection: () => ipcRenderer.invoke("bot:connection"),
  botState: () => ipcRenderer.invoke("bot:state"),
  onBotState: (callback: (state: unknown) => void) => {
    const listener = (_e: IpcRendererEvent, state: unknown) => callback(state);
    ipcRenderer.on("bot-state", listener);
    return () => ipcRenderer.removeListener("bot-state", listener);
  },
  chooseFolder: () => ipcRenderer.invoke("bot:choose-folder"),
  useBundledBot: () => ipcRenderer.invoke("bot:use-bundled"),
  restartBot: () => ipcRenderer.invoke("bot:restart"),
  openBotFolder: () => ipcRenderer.invoke("bot:open-folder"),
  tailscale: () => ipcRenderer.invoke("tailscale:info"),
  enablePhoneAccess: () => ipcRenderer.invoke("tailscale:enable"),
  getAutoStart: () => ipcRenderer.invoke("autostart:get"),
  setAutoStart: (on: boolean) => ipcRenderer.invoke("autostart:set", on),
});
