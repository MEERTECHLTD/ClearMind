/**
 * Vault workspace model (Obsidian's "workspace"): up to two side-by-side panes,
 * each with its own tabs. Pure functions over an immutable state, plus
 * per-browser persistence of the workspace and the sidebar layout.
 */

export type ViewMode = 'live' | 'source' | 'reading';

interface TabBase { id: string; pinned?: boolean }
export interface NoteTab extends TabBase { type: 'note'; noteId: string; mode?: ViewMode; back?: string[]; fwd?: string[] }
export interface GraphTab extends TabBase { type: 'graph' }
export interface EmptyTab extends TabBase { type: 'empty' }
export type Tab = NoteTab | GraphTab | EmptyTab;

export interface Pane { id: string; tabs: Tab[]; activeTab: string | null }
export interface Workspace { panes: Pane[]; activePane: string }

export type OpenTarget = { type: 'note'; noteId: string } | { type: 'graph' } | { type: 'empty' };

const uid = (p: string) => `${p}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
const makeTab = (t: OpenTarget): Tab => (t.type === 'note' ? { id: uid('tab'), type: 'note', noteId: t.noteId } : { id: uid('tab'), type: t.type });

export const emptyWorkspace = (): Workspace => {
  const id = uid('pane');
  return { panes: [{ id, tabs: [], activeTab: null }], activePane: id };
};

export const activePaneOf = (ws: Workspace) => ws.panes.find((p) => p.id === ws.activePane) ?? ws.panes[0];
export const activeTabOf = (p: Pane | undefined) => p?.tabs.find((t) => t.id === p.activeTab) ?? null;

const mapPane = (ws: Workspace, paneId: string, f: (p: Pane) => Pane): Workspace => ({ ...ws, panes: ws.panes.map((p) => (p.id === paneId ? f(p) : p)) });

/**
 * Open a target in a pane.
 * - `tab`: always a new tab after the active one.
 * - `replace`: navigate the active tab (pushes history) unless it's pinned / a graph → new tab.
 * Notes already open in that pane are focused instead of duplicated (when not forcing a new tab).
 */
export function openIn(ws: Workspace, paneId: string, target: OpenTarget, how: 'replace' | 'tab'): Workspace {
  const pane = ws.panes.find((p) => p.id === paneId) ?? activePaneOf(ws);
  const focus = (tabId: string) => ({ ...mapPane(ws, pane.id, (p) => ({ ...p, activeTab: tabId })), activePane: pane.id });
  if (target.type === 'graph') {
    const g = pane.tabs.find((t) => t.type === 'graph');
    if (g) return focus(g.id);
  }
  const cur = activeTabOf(pane);
  if (target.type === 'note' && cur?.type === 'note' && cur.noteId === target.noteId) return focus(cur.id);
  // Already open in this pane → just focus it (also makes repeated opens, e.g. a graph double-click, a no-op).
  if (target.type === 'note') {
    const existing = pane.tabs.find((t) => t.type === 'note' && t.noteId === target.noteId);
    if (existing) return focus(existing.id);
  }
  if (how === 'replace' && cur && !cur.pinned && cur.type !== 'graph' && target.type === 'note') {
    const next: NoteTab = cur.type === 'note'
      ? { ...cur, noteId: target.noteId, back: [...(cur.back ?? []), cur.noteId].slice(-50), fwd: [] }
      : { id: cur.id, type: 'note', noteId: target.noteId };
    return { ...mapPane(ws, pane.id, (p) => ({ ...p, tabs: p.tabs.map((t) => (t.id === cur.id ? next : t)) })), activePane: pane.id };
  }
  if (how === 'replace' && cur?.type === 'empty' && target.type === 'graph') {
    const next: Tab = { id: cur.id, type: 'graph' };
    return { ...mapPane(ws, pane.id, (p) => ({ ...p, tabs: p.tabs.map((t) => (t.id === cur.id ? next : t)) })), activePane: pane.id };
  }
  const tab = makeTab(target);
  const at = cur ? pane.tabs.findIndex((t) => t.id === cur.id) + 1 : pane.tabs.length;
  return { ...mapPane(ws, pane.id, (p) => ({ ...p, tabs: [...p.tabs.slice(0, at), tab, ...p.tabs.slice(at)], activeTab: tab.id })), activePane: pane.id };
}

/** Open in the other pane, creating the split if needed. */
export function openInSplit(ws: Workspace, target: OpenTarget): Workspace {
  const cur = activePaneOf(ws);
  const other = ws.panes.find((p) => p.id !== cur.id);
  if (other) return openIn(ws, other.id, target, 'tab');
  const pane: Pane = { id: uid('pane'), tabs: [], activeTab: null };
  const idx = ws.panes.findIndex((p) => p.id === cur.id);
  const withPane = { panes: [...ws.panes.slice(0, idx + 1), pane, ...ws.panes.slice(idx + 1)], activePane: pane.id };
  return openIn(withPane, pane.id, target, 'tab');
}

/** Split right: duplicate the active tab into a new pane (or focus the other pane). */
export function splitActive(ws: Workspace): Workspace {
  const t = activeTabOf(activePaneOf(ws));
  const target: OpenTarget = t?.type === 'note' ? { type: 'note', noteId: t.noteId } : t?.type === 'graph' ? { type: 'graph' } : { type: 'empty' };
  return openInSplit(ws, target);
}

export function closeTab(ws: Workspace, paneId: string, tabId: string): Workspace {
  const pane = ws.panes.find((p) => p.id === paneId);
  if (!pane) return ws;
  const i = pane.tabs.findIndex((t) => t.id === tabId);
  if (i < 0) return ws;
  const tabs = pane.tabs.filter((t) => t.id !== tabId);
  if (!tabs.length && ws.panes.length > 1) {
    const panes = ws.panes.filter((p) => p.id !== paneId);
    return { panes, activePane: ws.activePane === paneId ? panes[0].id : ws.activePane };
  }
  const activeTab = pane.activeTab === tabId ? (tabs[Math.min(i, tabs.length - 1)]?.id ?? null) : pane.activeTab;
  return mapPane(ws, paneId, (p) => ({ ...p, tabs, activeTab }));
}

export function closeOthers(ws: Workspace, paneId: string, tabId: string): Workspace {
  return mapPane(ws, paneId, (p) => ({ ...p, tabs: p.tabs.filter((t) => t.id === tabId || t.pinned), activeTab: tabId }));
}

/** Close every tab showing a note (after delete). */
export function closeNote(ws: Workspace, noteId: string): Workspace {
  let out = ws;
  for (const p of ws.panes) for (const t of p.tabs) if (t.type === 'note' && t.noteId === noteId) out = closeTab(out, p.id, t.id);
  return out;
}

export function moveTab(ws: Workspace, fromPane: string, tabId: string, toPane: string, index: number): Workspace {
  const src = ws.panes.find((p) => p.id === fromPane);
  const tab = src?.tabs.find((t) => t.id === tabId);
  if (!src || !tab || !ws.panes.some((p) => p.id === toPane)) return ws;
  if (fromPane === toPane) {
    const from = src.tabs.indexOf(tab);
    const tabs = src.tabs.filter((t) => t.id !== tabId);
    const to = index > from ? index - 1 : index;
    tabs.splice(Math.max(0, Math.min(to, tabs.length)), 0, tab);
    return { ...mapPane(ws, fromPane, (p) => ({ ...p, tabs, activeTab: tabId })), activePane: toPane };
  }
  let out = closeTab(ws, fromPane, tabId);
  out = mapPane(out, toPane, (p) => {
    const tabs = [...p.tabs];
    tabs.splice(Math.max(0, Math.min(index, tabs.length)), 0, tab);
    return { ...p, tabs, activeTab: tabId };
  });
  return { ...out, activePane: toPane };
}

export const updateTab = (ws: Workspace, paneId: string, tabId: string, patch: Partial<NoteTab>): Workspace =>
  mapPane(ws, paneId, (p) => ({ ...p, tabs: p.tabs.map((t) => (t.id === tabId ? ({ ...t, ...patch } as Tab) : t)) }));

export const focusTab = (ws: Workspace, paneId: string, tabId: string): Workspace => ({ ...mapPane(ws, paneId, (p) => ({ ...p, activeTab: tabId })), activePane: paneId });

export function navigate(ws: Workspace, paneId: string, tabId: string, dir: -1 | 1): Workspace {
  const pane = ws.panes.find((p) => p.id === paneId);
  const t = pane?.tabs.find((x) => x.id === tabId);
  if (!t || t.type !== 'note') return ws;
  const back = [...(t.back ?? [])], fwd = [...(t.fwd ?? [])];
  if (dir < 0) { const prev = back.pop(); if (!prev) return ws; return updateTab(ws, paneId, tabId, { noteId: prev, back, fwd: [t.noteId, ...fwd] }); }
  const [next, ...rest] = fwd;
  if (!next) return ws;
  return updateTab(ws, paneId, tabId, { noteId: next, back: [...back, t.noteId], fwd: rest });
}

/** Drop tabs whose note no longer exists (and history entries pointing at missing notes). */
export function pruneWorkspace(ws: Workspace, exists: (id: string) => boolean): Workspace {
  const panes = ws.panes
    .map((p) => {
      const tabs = p.tabs
        .filter((t) => t.type !== 'note' || exists(t.noteId))
        .map((t) => (t.type === 'note' ? { ...t, back: (t.back ?? []).filter(exists), fwd: (t.fwd ?? []).filter(exists) } : t));
      return { ...p, tabs, activeTab: tabs.some((t) => t.id === p.activeTab) ? p.activeTab : tabs[0]?.id ?? null };
    })
    .filter((p, i, all) => p.tabs.length || all.length === 1 || i === 0);
  const nonEmpty = panes.length > 1 ? panes.filter((p) => p.tabs.length) : panes;
  const final = nonEmpty.length ? nonEmpty : [panes[0]];
  return { panes: final, activePane: final.some((p) => p.id === ws.activePane) ? ws.activePane : final[0].id };
}

// ------------------------------------------------------------------ persistence

const WS_KEY = 'cm.vault.workspace';
const LAYOUT_KEY = 'cm.vault.layout';

export function loadWorkspace(): Workspace {
  try {
    const raw = JSON.parse(localStorage.getItem(WS_KEY) ?? 'null') as Workspace | null;
    if (raw && Array.isArray(raw.panes) && raw.panes.length) return { panes: raw.panes.slice(0, 2), activePane: raw.activePane };
  } catch { /* ignore */ }
  return emptyWorkspace();
}
export function saveWorkspace(ws: Workspace) {
  try { localStorage.setItem(WS_KEY, JSON.stringify(ws)); } catch { /* ignore */ }
}

export type LeftTab = 'files' | 'search' | 'bookmarks' | 'tags';
export type RightTab = 'backlinks' | 'outgoing' | 'outline' | 'graph' | 'info';
export interface Layout {
  leftOpen: boolean; rightOpen: boolean; leftWidth: number; rightWidth: number;
  leftTab: LeftTab; rightTab: RightTab; split: number;
}
export const DEFAULT_LAYOUT: Layout = { leftOpen: true, rightOpen: true, leftWidth: 260, rightWidth: 290, leftTab: 'files', rightTab: 'backlinks', split: 0.5 };
export function loadLayout(): Layout {
  try { return { ...DEFAULT_LAYOUT, ...JSON.parse(localStorage.getItem(LAYOUT_KEY) ?? '{}') }; } catch { return DEFAULT_LAYOUT; }
}
export function saveLayout(l: Layout) {
  try { localStorage.setItem(LAYOUT_KEY, JSON.stringify(l)); } catch { /* ignore */ }
}

/** Tiny persisted JSON helper for per-browser UI prefs. */
export function readPref<T>(key: string, fallback: T): T {
  try { const v = localStorage.getItem(key); return v ? { ...fallback, ...JSON.parse(v) } : fallback; } catch { return fallback; }
}
export function writePref(key: string, v: unknown) {
  try { localStorage.setItem(key, JSON.stringify(v)); } catch { /* ignore */ }
}

// ------------------------------------------------------------------ fuzzy + keys

/** Subsequence fuzzy score (0 = no match); contiguous & prefix matches rank higher. */
export function fuzzyScore(text: string, q: string): number {
  const t = text.toLowerCase(), query = q.trim().toLowerCase();
  if (!query) return 1;
  if (t === query) return 100;
  if (t.startsWith(query)) return 80;
  const i = t.indexOf(query);
  if (i >= 0) return 60 - Math.min(i, 30) + (t[i - 1] === ' ' ? 5 : 0);
  let qi = 0, gaps = 0, last = -1;
  for (let k = 0; k < t.length && qi < query.length; k++) if (t[k] === query[qi]) { if (last >= 0) gaps += k - last - 1; last = k; qi++; }
  return qi === query.length ? Math.max(1, 30 - gaps) : 0;
}

export const IS_MAC = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);
/** Render a hotkey like "Mod+Alt+N" for this platform. */
export function hotkeyLabel(k: string): string {
  return k.split('+').map((p) => {
    if (p === 'Mod') return IS_MAC ? '⌘' : 'Ctrl';
    if (p === 'Alt') return IS_MAC ? '⌥' : 'Alt';
    if (p === 'Shift') return IS_MAC ? '⇧' : 'Shift';
    return p;
  }).join(IS_MAC ? '' : '+');
}
