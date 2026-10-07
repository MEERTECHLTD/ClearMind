/**
 * Mobile vault data layer — the same mutation semantics as the web vault
 * (components/vault/useVault.ts): create, save (derived tags + ISO stamp),
 * rename with link rewrite across the vault, delete with undo (tombstones),
 * bookmarks, daily notes and open-or-create for [[links]].
 *
 * Writes go through the shared per-collection store (optimistic for every
 * screen) → dbService → sync engine, so notes sync with the web vault.
 */
import { useMemo, useSyncExternalStore } from 'react';
import type { Note } from '@clearmind/shared';
import {
  buildIndex, prepareNote, rewriteLinksForRename, uniqueTitle, isValidTitle, findDailyNote, dailyTitle, notePath,
  type VaultIndex, type DailyNoteSettings,
} from '@clearmind/shared/notes';
import { getStore } from '../lib/collectionStore';
import { STORES } from './db';
import { migrateLegacyTags } from './notesCore';

export { migrateLegacyTags } from './notesCore';

const newId = () => `note-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
const store = () => getStore<Note>(STORES.NOTES);
const current = () => store().getSnapshot().items.filter((n) => !n.deleted);
const indexNow = () => buildIndex(current());

/** Daily notes match the web vault's defaults. */
export const DAILY: DailyNoteSettings = { folder: 'Daily', format: 'YYYY-MM-DD', templateId: null };

/** Normalise for saving, preserving legacy manual tags (see migrateLegacyTags). */
const prep = (n: Note, content: string): Note => prepareNote({ ...n, content: migrateLegacyTags(n, content) });

// ------------------------------------------------------------------ hook

export interface Vault {
  notes: Note[];
  index: VaultIndex;
  loaded: boolean;
}

/** Live notes + a memoised VaultIndex (rebuilt when the store changes). */
export function useVault(): Vault {
  const s = store();
  const snap = useSyncExternalStore(s.subscribe, s.getSnapshot);
  return useMemo(() => {
    const live = snap.items.filter((n) => !n.deleted);
    return { notes: live, index: buildIndex(live), loaded: snap.loaded };
  }, [snap]);
}

export const getNote = (id: string): Note | undefined => current().find((n) => n.id === id);

// ------------------------------------------------------------------ mutations

export class VaultError extends Error {}

const cleanFolder = (f: string | null | undefined) => f?.trim().replace(/^\/+|\/+$/g, '') || null;

const assertTitle = (title: string, folder: string | null, exceptId?: string) => {
  if (!isValidTitle(title)) throw new VaultError('Note names can’t be empty or contain \\ / : * ? " < > | # ^ [ ]');
  const clash = current().find((n) => n.id !== exceptId && (n.folder ?? null) === folder && n.title.trim().toLowerCase() === title.trim().toLowerCase());
  if (clash) throw new VaultError(`“${notePath({ title, folder })}” already exists`);
};

export async function createNote(input: { title?: string; folder?: string | null; content?: string; kind?: Note['kind']; dailyDate?: string | null } = {}): Promise<Note> {
  const folder = cleanFolder(input.folder);
  const title = input.title?.trim() || uniqueTitle(indexNow(), 'Untitled', folder);
  assertTitle(title, folder);
  const n = prepareNote({ id: newId(), title, folder, content: input.content ?? '', kind: input.kind ?? 'note', dailyDate: input.dailyDate ?? null, bookmarked: false });
  await store().putMany([n]);
  return n;
}

/** Save content (derives tags, stamps lastEdited). No-op when unchanged. */
export async function saveContent(id: string, content: string): Promise<void> {
  const n = getNote(id);
  if (!n || n.content === content) return;
  await store().putMany([prep(n, content)]);
}

export async function updateNote(id: string, patch: Partial<Pick<Note, 'bookmarked' | 'kind' | 'dailyDate'>>): Promise<void> {
  const n = getNote(id);
  if (n) await store().putMany([{ ...n, ...patch }]);
}

export const toggleBookmark = (n: Note) => updateNote(n.id, { bookmarked: !n.bookmarked });

/**
 * Rename and/or move a note; links in every other note are rewritten.
 * Returns how many other notes had links updated. Throws VaultError on an
 * invalid or clashing name.
 */
export async function renameNote(id: string, next: { title?: string; folder?: string | null }): Promise<number> {
  const idx = indexNow();
  const n = idx.byId.get(id);
  if (!n) return 0;
  const title = next.title?.trim() ?? n.title;
  const folder = next.folder === undefined ? n.folder ?? null : cleanFolder(next.folder);
  if (title === n.title && folder === (n.folder ?? null)) return 0;
  if (folder && folder.split('/').some((s) => !isValidTitle(s))) throw new VaultError('Invalid folder name');
  assertTitle(title, folder, id);
  const changes = rewriteLinksForRename(idx, id, { title, folder });
  const updated: Note[] = [];
  for (const [nid, content] of changes) if (nid !== id) updated.push(prep(idx.byId.get(nid)!, content));
  updated.push(prep({ ...n, title, folder }, changes.get(id) ?? n.content));
  await store().putMany(updated);
  return [...changes.keys()].filter((k) => k !== id).length;
}

/** Delete notes (tombstones — sync to every device). Returns an undo. */
export async function deleteNotes(ids: string[]): Promise<() => Promise<void>> {
  const before = current().filter((n) => ids.includes(n.id));
  await store().removeMany(ids);
  return async () => { await store().putMany(before.map((n) => ({ ...n, deleted: false, deletedAt: null }))); };
}

const isoDay = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/** Open (creating if needed) the daily note for `date`. */
export async function openDailyNote(date = new Date()): Promise<Note> {
  const existing = findDailyNote(indexNow(), date, DAILY);
  if (existing) return existing;
  return createNote({ title: dailyTitle(date, DAILY), folder: DAILY.folder, kind: 'daily', dailyDate: isoDay(date) });
}

/** Open-or-create for tapping an unresolved [[link]] (new note goes next to the source note). */
export async function openOrCreateLink(target: string, fromNote?: Note | null): Promise<Note> {
  const hit = indexNow().resolve(target, fromNote?.id);
  if (hit) return hit;
  const parts = target.replace(/\.md$/i, '').split('/');
  const title = parts.pop()!.trim();
  const folder = parts.length ? parts.join('/') : fromNote?.folder ?? null;
  return createNote({ title, folder });
}
