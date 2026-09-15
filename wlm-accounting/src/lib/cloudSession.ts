import AsyncStorage from "@react-native-async-storage/async-storage";
import { CloudSession } from "./sync";

// Kept apart from the ledger so signing out never risks the books, and a
// restored backup can't drag someone else's session along with it.
const KEY = "wlm:cloud:v1";

export async function loadSession(): Promise<CloudSession | null> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CloudSession;
    return parsed?.token && parsed?.serverUrl ? parsed : null;
  } catch {
    return null;
  }
}

export async function saveSession(session: CloudSession): Promise<void> {
  try {
    await AsyncStorage.setItem(KEY, JSON.stringify(session));
  } catch (e) {
    console.warn("Failed to save cloud session", e);
  }
}

export async function clearSession(): Promise<void> {
  try {
    await AsyncStorage.removeItem(KEY);
  } catch (e) {
    console.warn("Failed to clear cloud session", e);
  }
}
