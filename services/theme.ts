/**
 * Web theme: Light · Dark · System. The preference is part of the synced
 * Preferences record (same as mobile) and cached in localStorage for a
 * flash-free first paint. "System" follows prefers-color-scheme live.
 */
export type ThemePref = 'system' | 'light' | 'dark';

const KEY = 'cm.themePref';
const mq = typeof window !== 'undefined' && window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;
let current: ThemePref = 'system';
const listeners = new Set<(dark: boolean) => void>();

export function cachedThemePref(): ThemePref {
  try {
    const v = localStorage.getItem(KEY) as ThemePref | null;
    if (v === 'light' || v === 'dark' || v === 'system') return v;
    const legacy = localStorage.getItem('theme'); // older light/dark toggle
    if (legacy === 'light' || legacy === 'dark') return legacy;
  } catch { /* ignore */ }
  return 'system';
}

export const resolveDark = (p: ThemePref) => p === 'dark' || (p === 'system' && !!mq?.matches);

export function applyTheme(p: ThemePref): boolean {
  current = p;
  const dark = resolveDark(p);
  document.documentElement.classList.toggle('dark', dark);
  try { localStorage.setItem(KEY, p); localStorage.setItem('theme', dark ? 'dark' : 'light'); } catch { /* ignore */ }
  listeners.forEach((l) => l(dark));
  return dark;
}

export const onThemeChange = (l: (dark: boolean) => void) => { listeners.add(l); return () => { listeners.delete(l); }; };
export const getThemePref = () => current;

mq?.addEventListener?.('change', () => { if (current === 'system') applyTheme('system'); });
