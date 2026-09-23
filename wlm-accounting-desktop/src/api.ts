import type { WlmApi } from "../electron/preload";

declare global {
  interface Window {
    wlm: WlmApi;
  }
}

/** Everything the page can ask the machine to do. */
export const api: WlmApi = window.wlm;
