/**
 * Theme system: Light · Dark · System.
 *
 * - The preference lives in the synced Preferences record (so it follows the
 *   user across devices) and is cached locally for an instant, flash-free boot.
 * - "System" follows the OS appearance live (Appearance listener).
 * - Tailwind colour tokens (bg-midnight, text-ink, border-line, …) are CSS
 *   variables (see tailwind.config.js) set at the root via NativeWind `vars()`,
 *   so every className-based screen switches automatically.
 * - `T` is the active palette for places that need raw colours (icon props,
 *   native components). The root re-keys on scheme change so everything reads
 *   the new values.
 */
import { useEffect, useState } from 'react';
import { Appearance } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { vars } from 'nativewind';

export type ThemePref = 'system' | 'light' | 'dark';
export type Scheme = 'light' | 'dark';

export interface Palette {
  bg: string; card: string; card2: string; ink: string; muted: string; faint: string; line: string;
  accent: string; accentHover: string; danger: string; success: string; overlay: string;
}

export const DARK: Palette = {
  bg: '#05050A', card: '#0F1219', card2: '#1A1F2E', ink: '#E2E8F0', muted: '#9CA3AF', faint: '#6B7280', line: '#1F2937',
  accent: '#3B82F6', accentHover: '#2563EB', danger: '#F87171', success: '#10B981', overlay: 'rgba(0,0,0,0.6)',
};

export const LIGHT: Palette = {
  bg: '#FFFFFF', card: '#F6F7F9', card2: '#ECEEF2', ink: '#111827', muted: '#4B5563', faint: '#6B7280', line: '#E5E7EB',
  accent: '#2563EB', accentHover: '#1D4ED8', danger: '#DC2626', success: '#059669', overlay: 'rgba(15,23,42,0.45)',
};

/** Active palette (mutated on scheme change; the app root re-renders). */
export const T: Palette = { ...DARK };

const hexToRgb = (h: string) => {
  const n = parseInt(h.slice(1), 16);
  return `${(n >> 16) & 255} ${(n >> 8) & 255} ${n & 255}`;
};

/** NativeWind CSS variables for a scheme (consumed by tailwind.config colours). */
export const themeVars = (p: Palette) => vars({
  '--c-bg': hexToRgb(p.bg), '--c-card': hexToRgb(p.card), '--c-card2': hexToRgb(p.card2),
  '--c-ink': hexToRgb(p.ink), '--c-muted': hexToRgb(p.muted), '--c-line': hexToRgb(p.line),
  '--c-accent': hexToRgb(p.accent), '--c-accent-hover': hexToRgb(p.accentHover),
});

const CACHE_KEY = 'clearmind:themePref';
let pref: ThemePref = 'system';
let scheme: Scheme = (Appearance.getColorScheme() ?? 'dark') === 'light' ? 'light' : 'dark';
const listeners = new Set<() => void>();

const resolve = (p: ThemePref): Scheme => (p === 'system' ? ((Appearance.getColorScheme() ?? 'dark') === 'light' ? 'light' : 'dark') : p);

function apply() {
  const next = resolve(pref);
  scheme = next;
  Object.assign(T, next === 'light' ? LIGHT : DARK);
  listeners.forEach((l) => l());
}

/** Restore the cached preference at boot (before first paint where possible). */
export async function loadThemePref() {
  try {
    const v = (await AsyncStorage.getItem(CACHE_KEY)) as ThemePref | null;
    if (v === 'light' || v === 'dark' || v === 'system') pref = v;
  } catch { /* default system */ }
  apply();
}

export function setThemePref(p: ThemePref) {
  if (p === pref) return;
  pref = p;
  AsyncStorage.setItem(CACHE_KEY, p).catch(() => {});
  apply();
}

export const getThemePref = () => pref;
export const getScheme = () => scheme;

Appearance.addChangeListener(() => { if (pref === 'system') apply(); });
apply();

/** Re-render on theme changes; returns the active scheme. */
export function useScheme(): Scheme {
  const [, force] = useState(0);
  useEffect(() => {
    const l = () => force((x) => x + 1);
    listeners.add(l);
    return () => { listeners.delete(l); };
  }, []);
  return scheme;
}
