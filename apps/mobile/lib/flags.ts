/**
 * Feature flags — staged activation for risky/native features so development never
 * halts on runtime uncertainty. Persisted to AsyncStorage; toggled in Diagnostics.
 * Defaults: safe features ON, unproven native features OFF until validated on device.
 */
import { useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

export type FlagKey = 'reminders' | 'autoSyncOnForeground' | 'githubAuth' | 'verboseLogging';

const DEFAULTS: Record<FlagKey, boolean> = {
  reminders: true,            // schedule-on-write local notifications (permission-gated)
  autoSyncOnForeground: true, // re-sync when the app returns to foreground / regains network
  githubAuth: false,          // staged OFF — needs a GitHub OAuth app + token exchange
  verboseLogging: false,
};

export const FLAG_LABELS: Record<FlagKey, string> = {
  reminders: 'Task reminders (notifications)',
  autoSyncOnForeground: 'Auto-sync on foreground / reconnect',
  githubAuth: 'GitHub sign-in (experimental)',
  verboseLogging: 'Verbose diagnostics logging',
};

const KEY = 'clearmind:flags';
let cache: Record<FlagKey, boolean> = { ...DEFAULTS };
let loaded = false;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((l) => l());

export async function loadFlags(): Promise<void> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (raw) cache = { ...DEFAULTS, ...JSON.parse(raw) };
  } catch {
    /* keep defaults */
  }
  loaded = true;
  notify();
}

export const getFlag = (k: FlagKey): boolean => cache[k];

export async function setFlag(k: FlagKey, v: boolean): Promise<void> {
  cache = { ...cache, [k]: v };
  notify();
  try {
    await AsyncStorage.setItem(KEY, JSON.stringify(cache));
  } catch {
    /* in-memory still applied */
  }
}

export function useFlags(): { flags: Record<FlagKey, boolean>; loaded: boolean; setFlag: typeof setFlag } {
  const [, force] = useState(0);
  useEffect(() => {
    const l = () => force((x) => x + 1);
    listeners.add(l);
    if (!loaded) loadFlags();
    return () => { listeners.delete(l); };
  }, []);
  return { flags: cache, loaded, setFlag };
}
