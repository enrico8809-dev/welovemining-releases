import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  // Electron and the Android app load the built page from disk: asset URLs must be relative.
  base: "./",
  server: { port: 5190, strictPort: true },
  build: { outDir: "dist", emptyOutDir: true, sourcemap: false },
  test: { environment: "node" },
} as never);
