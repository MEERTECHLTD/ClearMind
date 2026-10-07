/**
 * The canvas viewport lives outside React state: panning/zooming writes a CSS
 * transform directly and only the few widgets that display it (zoom %, the
 * selection toolbar) subscribe, so 300+ cards never re-render on pan.
 */
import { useSyncExternalStore } from 'react';
import type { Viewport } from './model';

export interface ViewportStore {
  get: () => Viewport;
  set: (v: Viewport) => void;
  subscribe: (l: () => void) => () => void;
}

export function createViewportStore(initial: Viewport): ViewportStore {
  let v = initial;
  const ls = new Set<() => void>();
  return {
    get: () => v,
    set: (next) => { if (next.x === v.x && next.y === v.y && next.zoom === v.zoom) return; v = next; ls.forEach((l) => l()); },
    subscribe: (l) => { ls.add(l); return () => { ls.delete(l); }; },
  };
}

export const useViewport = (s: ViewportStore) => useSyncExternalStore(s.subscribe, s.get, s.get);

const KEY = (id: string) => `cm.vault.canvas.vp.${id}`;
export function loadViewport(id: string): Viewport | null {
  try {
    const v = JSON.parse(localStorage.getItem(KEY(id)) ?? 'null');
    return v && [v.x, v.y, v.zoom].every((n) => typeof n === 'number' && Number.isFinite(n)) && v.zoom > 0 ? v : null;
  } catch { return null; }
}
export function saveViewport(id: string, v: Viewport) {
  try { localStorage.setItem(KEY(id), JSON.stringify({ x: Math.round(v.x), y: Math.round(v.y), zoom: +v.zoom.toFixed(4) })); } catch { /* ignore */ }
}
