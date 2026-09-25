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
    // The engine's sources live outside this package, so Node would look for
    // their imports next to *them* — in the phone app's node_modules. That
    // fails outright where Expo isn't installed, which is what the Windows
    // build does, and is worse where it is installed: the engine would get the
    // phone's copy of React while the screens got this one, and two Reacts in
    // one page means every hook throws.
    dedupe: ["react", "react-dom"],
  },
  server: { port: 5183, strictPort: true },
  build: { outDir: "dist", emptyOutDir: true, sourcemap: false },
});
