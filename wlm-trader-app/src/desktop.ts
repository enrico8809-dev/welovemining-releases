// What the Windows app's main process offers the screens (electron/preload.ts).
// On the phone `window.wlm` doesn't exist.
import type { Connection } from "./api";

export interface BotState {
  phase: "needs-folder" | "preparing" | "starting" | "running" | "stopped" | "error";
  folder: string;
  message: string;
  log: string[];
}

export interface TailscaleInfo {
  installed: boolean;
  url: string | null;      // https://<this-pc>.<tailnet>.ts.net when phone access is on
  serving: boolean;
}

export interface DesktopBridge {
  version(): Promise<string>;
  connection(): Promise<Connection | null>;
  botState(): Promise<BotState>;
  onBotState(callback: (state: BotState) => void): () => void;
  chooseFolder(): Promise<void>;
  useBundledBot(): Promise<void>;
  restartBot(): Promise<void>;
  openBotFolder(): Promise<void>;
  tailscale(): Promise<TailscaleInfo>;
  enablePhoneAccess(): Promise<TailscaleInfo>;
  getAutoStart(): Promise<boolean>;
  setAutoStart(on: boolean): Promise<void>;
}

declare global {
  interface Window {
    wlm?: DesktopBridge;
  }
}

export const desktop: DesktopBridge | undefined = typeof window !== "undefined" ? window.wlm : undefined;
