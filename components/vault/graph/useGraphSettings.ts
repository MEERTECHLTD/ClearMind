/** Graph view settings (filters, display, forces, local graph), persisted per browser under `cm.graph.settings`. */
import { useCallback, useSyncExternalStore } from 'react';
import { mergeGraphSettings, type GraphSettings } from '../../../shared/notes/graphStyle';

const KEY = 'cm.graph.settings';
const listeners = new Set<() => void>();
let cache: GraphSettings | null = null;

function read(): GraphSettings {
  if (cache) return cache;
  let raw: unknown = null;
  try { raw = JSON.parse(localStorage.getItem(KEY) ?? 'null'); } catch { /* unavailable or corrupt */ }
  cache = mergeGraphSettings(raw);
  return cache;
}

type Patch = { [S in keyof GraphSettings]?: Partial<GraphSettings[S]> };

export function updateGraphSettings(patch: Patch) {
  const cur = read();
  const next: GraphSettings = {
    filters: { ...cur.filters, ...patch.filters },
    display: { ...cur.display, ...patch.display },
    forces: { ...cur.forces, ...patch.forces },
    local: { ...cur.local, ...patch.local },
    open: { ...cur.open, ...patch.open },
  };
  cache = mergeGraphSettings(next);
  try { localStorage.setItem(KEY, JSON.stringify(cache)); } catch { /* storage unavailable */ }
  listeners.forEach((l) => l());
}

export function resetGraphSettings(section: 'filters' | 'display' | 'forces') {
  const d = mergeGraphSettings(null);
  updateGraphSettings({ [section]: d[section] });
}

const subscribe = (l: () => void) => { listeners.add(l); return () => { listeners.delete(l); }; };

export function useGraphSettings(): [GraphSettings, (patch: Patch) => void] {
  const s = useSyncExternalStore(subscribe, read, read);
  return [s, useCallback((p: Patch) => updateGraphSettings(p), [])];
}
