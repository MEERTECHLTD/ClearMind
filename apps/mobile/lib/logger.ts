/**
 * Lightweight crash/runtime logger — a persisted ring buffer + a global JS error
 * handler. Complements ErrorBoundary (which only catches render errors): this also
 * captures async/module-eval throws and console.error, and survives a crash via
 * AsyncStorage so the next launch's Diagnostics screen can show what happened.
 *
 * (Sentry/Crashlytics can layer on top once a DSN / google-services Crashlytics
 * config is provided — this is the dependency-free local fallback.)
 */
import { useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

export type LogLevel = 'error' | 'warn' | 'info';
export interface LogEntry { ts: string; level: LogLevel; msg: string; stack?: string }

const RING = 150;
const KEY = 'clearmind:logs';
let ring: LogEntry[] = [];
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((l) => l());

/** ms since the JS bundle started evaluating (this module loads near the top). */
export const appStartMs = Date.now();
export const uptimeMs = (): number => Date.now() - appStartMs;

let persistTimer: ReturnType<typeof setTimeout> | null = null;
function persist() {
  if (persistTimer) return;
  persistTimer = setTimeout(async () => {
    persistTimer = null;
    try { await AsyncStorage.setItem(KEY, JSON.stringify(ring.slice(-RING))); } catch { /* noop */ }
  }, 400);
}

export function log(level: LogLevel, msg: string, stack?: string): void {
  ring.push({ ts: new Date().toISOString(), level, msg: String(msg).slice(0, 1000), stack });
  if (ring.length > RING) ring = ring.slice(-RING);
  notify();
  persist();
}
export const logInfo = (m: string) => log('info', m);
export const logWarn = (m: string) => log('warn', m);
export const logError = (m: string, stack?: string) => log('error', m, stack);

export const getLogs = (): LogEntry[] => ring.slice().reverse();
export async function clearLogs(): Promise<void> {
  ring = [];
  notify();
  try { await AsyncStorage.removeItem(KEY); } catch { /* noop */ }
}
export async function loadLogs(): Promise<void> {
  try { const raw = await AsyncStorage.getItem(KEY); if (raw) ring = JSON.parse(raw); } catch { /* noop */ }
  notify();
}

let installed = false;
/** Install the global JS error handler + console.error capture. Idempotent. */
export function installCrashHandler(): void {
  if (installed) return;
  installed = true;
  const g: any = global;
  const prev = g.ErrorUtils?.getGlobalHandler?.();
  g.ErrorUtils?.setGlobalHandler?.((err: any, isFatal?: boolean) => {
    try { logError(`[${isFatal ? 'FATAL' : 'ERROR'}] ${err?.message ?? String(err)}`, err?.stack); } catch { /* noop */ }
    prev?.(err, isFatal);
  });
  const ce = console.error.bind(console);
  console.error = (...args: any[]) => {
    try { logError(args.map((a) => (typeof a === 'string' ? a : JSON.stringify(a))).join(' ').slice(0, 500)); } catch { /* noop */ }
    ce(...args);
  };
}

export function useLogs(): LogEntry[] {
  const [, force] = useState(0);
  useEffect(() => {
    const l = () => force((x) => x + 1);
    listeners.add(l);
    return () => { listeners.delete(l); };
  }, []);
  return getLogs();
}
