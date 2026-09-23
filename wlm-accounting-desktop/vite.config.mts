import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";

export default defineConfig({
  plugins: [react()],
  // Electron loads the built page from disk, so asset URLs have to be relative.
  base: "./",
  resolve: {
    alias: {
      "@engine": fileURLToPath(new URL("../wlm-accounting/src/lib", import.meta.url)),
    },
  },
  server: { port: 5183, strictPort: true },
  build: { outDir: "dist", emptyOutDir: true, sourcemap: false },
});
