/**
 * Web vault data layer: the live notes store + a memoised VaultIndex, and every
 * vault mutation (create, save, rename with link rewrite, move, delete with
 * undo, bookmarks, folders, daily notes, templates). Writes go through the
 * shared notes store → IndexedDB → sync engine, so they sync like tasks do.
 */
import { useMemo, useSyncExternalStore } from 'react';
import type { Note } from '../../types';
import { STORES } from '../../services/db';
import { getStore, useStore } from '../tasks/store';
import {
  buildIndex, prepareNote, rewriteLinksForRename, uniqueTitle, isValidTitle, findDailyNote, dailyTitle, applyTemplateVars,
  insertTemplate, notePath, normPath, type VaultIndex, type DailyNoteSettings,
} from '../../shared/notes';

const newId = () => `note-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
const notes = () => getStore<Note>(STORES.NOTES);
const current = () => notes().getSnapshot().items.filter((n) => !n.deleted);
const indexNow = () => buildIndex(current());

// ------------------------------------------------------------------ settings (per browser)

export interface VaultSettings {
  daily: DailyNoteSettings;
  templatesFolder: string;
  /** Where "New note" goes: vault root, a fixed folder, or the active note's folder. */
  newNoteLocation: 'root' | 'folder' | 'current';
  newNoteFolder: string;
  defaultMode: 'live' | 'source' | 'reading';
  readableLineLength: boolean;
  showFrontmatter: boolean;
  spellcheck: boolean;
  /** Graph colour groups: search query → colour. */
  graphGroups: { query: string; color: string }[];
}

export const DEFAULT_VAULT_SETTINGS: VaultSettings = {
  daily: { folder: 'Daily', format: 'YYYY-MM-DD', templateId: null },
  templatesFolder: 'Templates',
  newNoteLocation: 'current',
  newNoteFolder: '',
  defaultMode: 'live',
  readableLineLength: true,
  showFrontmatter: true,
  spellcheck: true,
  graphGroups: [],
};

const SETTINGS_KEY = 'cm.vault.settings';
const FOLDERS_KEY = 'cm.vault.folders';
type L = () => void;
const settingsListeners = new Set<L>();
let settingsCache: VaultSettings | null = null;

export function getVaultSettings(): VaultSettings {
  if (settingsCache) return settingsCache;
  try { settingsCache = { ...DEFAULT_VAULT_SETTINGS, ...JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? '{}') }; }
  catch { settingsCache = DEFAULT_VAULT_SETTINGS; }
  return settingsCache!;
}
export function setVaultSettings(patch: Partial<VaultSettings>) {
  settingsCache = { ...getVaultSettings(), ...patch };
  try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(settingsCache)); } catch { /* storage unavailable */ }
  settingsListeners.forEach((l) => l());
}
export const useVaultSettings = () => useSyncExternalStore((l) => { settingsListeners.add(l); return () => settingsListeners.delete(l); }, getVaultSettings);

// Empty folders have no notes to derive them from, so they're remembered per browser.
let foldersCache: string[] | null = null;
const folderListeners = new Set<L>();
const getEmptyFolders = (): string[] => {
  if (foldersCache) return foldersCache;
  try { foldersCache = JSON.parse(localStorage.getItem(FOLDERS_KEY) ?? '[]'); } catch { foldersCache = []; }
  return foldersCache!;
};
const setEmptyFolders = (f: string[]) => {
  foldersCache = [...new Set(f)].sort();
  try { localStorage.setItem(FOLDERS_KEY, JSON.stringify(foldersCache)); } catch { /* ignore */ }
  folderListeners.forEach((l) => l());
};

// ------------------------------------------------------------------ hook

export interface Vault {
  notes: Note[];
  index: VaultIndex;
  /** All folders (from notes + explicitly created empty ones), sorted. */
  folders: string[];
  loaded: boolean;
}

export function useVault(): Vault {
  const snap = useStore<Note>(STORES.NOTES);
  const empty = useSyncExternalStore((l) => { folderListeners.add(l); return () => folderListeners.delete(l); }, getEmptyFolders);
  return useMemo(() => {
    const live = snap.items.filter((n) => !n.deleted);
    const index = buildIndex(live);
    const all = new Set(index.folders);
    for (const f of empty) { const parts = f.split('/'); parts.forEach((_, i) => all.add(parts.slice(0, i + 1).join('/'))); }
    return { notes: live, index, folders: [...all].sort(), loaded: snap.loaded };
  }, [snap, empty]);
}

// ------------------------------------------------------------------ mutations

export class VaultError extends Error {}

const assertTitle = (title: string, folder: string | null | undefined, exceptId?: string) => {
  if (!isValidTitle(title)) throw new VaultError('Note names can’t be empty or contain \\ / : * ? " < > | # ^ [ ]');
  const clash = current().find((n) => n.id !== exceptId && (n.folder ?? '') === (folder ?? '') && n.title.trim().toLowerCase() === title.trim().toLowerCase());
  if (clash) throw new VaultError(`“${notePath({ title, folder: folder ?? null })}” already exists`);
};

export async function createNote(input: { title?: string; folder?: string | null; content?: string; kind?: Note['kind']; dailyDate?: string | null } = {}): Promise<Note> {
  const folder = input.folder?.replace(/^\/+|\/+$/g, '') || null;
  const title = (input.title?.trim() || uniqueTitle(indexNow(), 'Untitled', folder));
  assertTitle(title, folder);
  const n = prepareNote({ id: newId(), title, folder, content: input.content ?? '', kind: input.kind ?? 'note', dailyDate: input.dailyDate ?? null, bookmarked: false });
  await notes().putMany([n]);
  if (folder) setEmptyFolders(getEmptyFolders().filter((f) => f !== folder));
  return n;
}

/** Save content (derives tags, stamps lastEdited). Cheap to call on every debounced keystroke batch. */
export async function saveContent(id: string, content: string): Promise<void> {
  const n = notes().getSnapshot().items.find((x) => x.id === id);
  if (!n || n.content === content) return;
  await notes().putMany([prepareNote({ ...n, content })]);
}

export async function updateNote(id: string, patch: Partial<Pick<Note, 'bookmarked' | 'kind' | 'dailyDate'>>): Promise<void> {
  const n = notes().getSnapshot().items.find((x) => x.id === id);
  if (n) await notes().putMany([{ ...n, ...patch }]);
}

/**
 * Rename and/or move a note. Links in every other note are rewritten
 * (Obsidian's "Automatically update internal links"). Returns how many notes
 * had links updated.
 */
export async function renameNote(id: string, next: { title?: string; folder?: string | null }): Promise<number> {
  const idx = indexNow();
  const n = idx.byId.get(id);
  if (!n) return 0;
  const title = next.title?.trim() ?? n.title;
  const folder = next.folder === undefined ? n.folder ?? null : (next.folder?.replace(/^\/+|\/+$/g, '') || null);
  if (title === n.title && (folder ?? null) === (n.folder ?? null)) return 0;
  assertTitle(title, folder, id);
  const changes = rewriteLinksForRename(idx, id, { title, folder });
  const updated: Note[] = [];
  for (const [nid, content] of changes) if (nid !== id) updated.push(prepareNote({ ...idx.byId.get(nid)!, content }));
  const selfContent = changes.get(id) ?? n.content;
  updated.push(prepareNote({ ...n, title, folder, content: selfContent }));
  await notes().putMany(updated);
  return [...changes.keys()].filter((k) => k !== id).length;
}

/** Delete notes (tombstones — sync to every device). Returns an undo. */
export async function deleteNotes(ids: string[]): Promise<() => Promise<void>> {
  const before = notes().getSnapshot().items.filter((n) => ids.includes(n.id));
  await notes().removeMany(ids);
  return async () => { await notes().putMany(before.map((n) => ({ ...n, deleted: false, deletedAt: null }))); };
}

export const toggleBookmark = (n: Note) => updateNote(n.id, { bookmarked: !n.bookmarked });

// ------------------------------------------------------------------ folders

export function createFolder(path: string) {
  const p = path.trim().replace(/^\/+|\/+$/g, '');
  if (!p || p.split('/').some((s) => !isValidTitle(s))) throw new VaultError('Invalid folder name');
  setEmptyFolders([...getEmptyFolders(), p]);
}

/** Rename/move a folder: every note under it moves, links are rewritten. */
export async function renameFolder(from: string, to: string): Promise<void> {
  const src = from.replace(/^\/+|\/+$/g, '');
  const dst = to.trim().replace(/^\/+|\/+$/g, '');
  if (!dst || dst === src || dst.startsWith(src + '/')) throw new VaultError('Invalid destination');
  const inside = current().filter((n) => n.folder === src || n.folder?.startsWith(src + '/'));
  for (const n of inside) await renameNote(n.id, { folder: dst + (n.folder!.slice(src.length)) });
  setEmptyFolders(getEmptyFolders().map((f) => (f === src || f.startsWith(src + '/') ? dst + f.slice(src.length) : f)));
}

/** Delete a folder and every note inside it. Returns an undo. */
export async function deleteFolder(path: string): Promise<() => Promise<void>> {
  const inside = current().filter((n) => n.folder === path || n.folder?.startsWith(path + '/')).map((n) => n.id);
  const prevFolders = getEmptyFolders();
  setEmptyFolders(prevFolders.filter((f) => f !== path && !f.startsWith(path + '/')));
  const undo = await deleteNotes(inside);
  return async () => { setEmptyFolders(prevFolders); await undo(); };
}

// ------------------------------------------------------------------ daily notes & templates

export function templates(): Note[] {
  const s = getVaultSettings();
  const folder = normPath(s.templatesFolder || 'Templates');
  return current().filter((n) => n.kind === 'template' || (n.folder && (normPath(n.folder) === folder || normPath(n.folder).startsWith(folder + '/')))).sort((a, b) => a.title.localeCompare(b.title));
}

/** Open (creating if needed) the daily note for `date`. */
export async function openDailyNote(date = new Date()): Promise<Note> {
  const s = getVaultSettings().daily;
  const existing = findDailyNote(indexNow(), date, s);
  if (existing) return existing;
  const title = dailyTitle(date, s);
  const tpl = s.templateId ? current().find((n) => n.id === s.templateId) : null;
  const iso = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  return createNote({ title, folder: s.folder || null, kind: 'daily', dailyDate: iso, content: tpl ? applyTemplateVars(tpl.content, { title, now: date }) : '' });
}

/** Insert a template into a note at `at` (default: end). */
export async function insertTemplateInto(noteId: string, templateId: string, at?: number): Promise<string | null> {
  const n = current().find((x) => x.id === noteId);
  const t = current().find((x) => x.id === templateId);
  if (!n || !t) return null;
  const content = insertTemplate(n.content, t.content, { title: n.title }, at);
  await saveContent(noteId, content);
  return content;
}

/** Folder for a new note per settings. */
export function newNoteFolder(activeNote?: Note | null): string | null {
  const s = getVaultSettings();
  if (s.newNoteLocation === 'folder') return s.newNoteFolder || null;
  if (s.newNoteLocation === 'current') return activeNote?.folder ?? null;
  return null;
}

/** Open-or-create for clicking an unresolved [[link]]. */
export async function openOrCreateLink(target: string, fromNote?: Note | null): Promise<Note> {
  const idx = indexNow();
  const hit = idx.resolve(target, fromNote?.id);
  if (hit) return hit;
  const parts = target.replace(/\.md$/i, '').split('/');
  const title = parts.pop()!.trim();
  const folder = parts.length ? parts.join('/') : newNoteFolder(fromNote);
  return createNote({ title, folder });
}
