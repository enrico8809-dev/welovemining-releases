import { useEffect } from "react";
import { AppState } from "react-native";
import { useLedger } from "../lib/LedgerContext";

/**
 * Syncs when the app comes back to the front.
 *
 * A phone spends most of its life asleep, and timers don't run while it is. The
 * moment that matters is picking it up again: whatever was done on the Windows
 * machine in the meantime should be on screen before anything is captured on
 * top of it. The schedule ignores a quick flick away, so this costs nothing
 * when the app is merely switched to and back.
 */
export default function ForegroundSync() {
  const { syncOnReturn } = useLedger();

  useEffect(() => {
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") syncOnReturn();
    });
    return () => subscription.remove();
  }, [syncOnReturn]);

  return null;
}
