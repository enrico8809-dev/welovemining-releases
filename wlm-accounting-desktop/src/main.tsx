import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { C } from "@engine/theme";
import { LedgerProvider } from "@engine/LedgerContext";
import { desktopPersistence } from "./persistence";
import { ToastProvider } from "./components/Toast";
import App from "./App";
import "./styles.css";

/**
 * The palette is defined once, in the engine, and handed to CSS here. Nothing
 * in the stylesheet names a colour, so the desktop app cannot drift from the
 * phone's brand by someone editing one and not the other.
 */
function applyPalette(): void {
  const style = document.documentElement.style;
  for (const [token, value] of Object.entries(C)) {
    style.setProperty(`--${kebab(token)}`, value);
  }
}

function kebab(token: string): string {
  return token.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);
}

applyPalette();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ToastProvider>
      <LedgerProvider persistence={desktopPersistence}>
        <App />
      </LedgerProvider>
    </ToastProvider>
  </StrictMode>
);
