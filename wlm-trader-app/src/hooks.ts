import { useCallback, useEffect, useState } from "react";
import { useApp } from "./App";
import type { Settings, SettingValue } from "./api";
import { useToast } from "./components/ui";

/** Run an API action, show its message (or error) as a toast, then refresh the dashboard. */
export function useAction() {
  const { refresh } = useApp();
  const toast = useToast();
  return useCallback(async (fn: () => Promise<{ message?: string } | unknown>, success?: string) => {
    try {
      const result = (await fn()) as { message?: string } | undefined;
      toast(success ?? result?.message ?? "Done", "success");
      await refresh();
      return true;
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e), "error");
      return false;
    }
  }, [refresh, toast]);
}

/** Load data once (and again every `every` ms if given). */
export function useLoad<T>(load: () => Promise<T>, every?: number) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState("");
  const reload = useCallback(async () => {
    try {
      setData(await load());
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [load]);
  useEffect(() => {
    reload();
    if (!every) return;
    const id = setInterval(reload, every);
    return () => clearInterval(id);
  }, [reload, every]);
  return { data, error, reload, setData };
}

/** Settings with a local draft: edit freely, then save in one go. */
export function useSettings() {
  const { api, refresh } = useApp();
  const toast = useToast();
  const load = useCallback(() => api.settings(), [api]);
  const { data, error, reload } = useLoad(load);
  const [draft, setDraft] = useState<Record<string, SettingValue>>({});
  const [envDraft, setEnvDraft] = useState<Record<string, SettingValue>>({});
  const [saving, setSaving] = useState(false);

  const value = <T extends SettingValue>(key: string): T =>
    (key in draft ? draft[key] : data?.values[key]) as T;
  const envValue = <T extends SettingValue>(key: keyof Settings["env"]): T =>
    (key in envDraft ? envDraft[key] : data?.env[key]) as T;
  const set = (key: string, v: SettingValue) => setDraft((d) => ({ ...d, [key]: v }));
  const setEnv = (key: keyof Settings["env"], v: SettingValue) => setEnvDraft((d) => ({ ...d, [key]: v }));
  const dirty = Object.keys(draft).length + Object.keys(envDraft).length > 0;

  const save = async () => {
    setSaving(true);
    try {
      const result = await api.saveSettings(draft, envDraft);
      setDraft({});
      setEnvDraft({});
      toast(result.restarted ? "Saved. The bot restarted with the new settings." : "Saved.", "success");
      await reload();
      await refresh();
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e), "error");
    } finally {
      setSaving(false);
    }
  };
  const discard = () => { setDraft({}); setEnvDraft({}); };
  return { data, error, value, envValue, set, setEnv, dirty, save, discard, saving };
}
