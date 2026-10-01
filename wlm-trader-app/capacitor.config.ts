import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "za.co.welovemining.trader",
  appName: "WLM Trader",
  webDir: "dist",
  backgroundColor: "#0A0D12",
  android: {
    // The bot is reached over HTTPS (Tailscale). Plain HTTP is only allowed to this phone itself.
    allowMixedContent: false,
  },
};

export default config;
