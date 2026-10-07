/**
 * Pure note operations for agents (MCP / REST / CLI). Like the task domain ops,
 * each returns `edits` ({coll:'notes', id, edit}) that the caller commits
 * through the field-level sync path, so changes reach every device.
 *
 * Semantics match the web vault: titles are unique per folder, renames/moves
 * rewrite [[links]] everywhere, tags are derived from content, deletes are
 * tombstones.
 */
import type { Note, ChangeSource } from '../types';
import { parseFrontmatter, setFrontmatter, extractHeadings, type PropValue } from './parse';
import {
  buildIndex, notePath, normPath, isValidTitle, prepareNote, rewriteLinksForRename, linkedMentions, dailyTitle, formatDate,
  applyTemplateVars, excerpt, type VaultIndex,
} from './vault';

export interface NoteCtx { now?: Date; source?: ChangeSource; agent?: string | null }
export interface NoteEdit { coll: 'notes'; id: string; edit: Partial<Note> & Record<string, unknown> }

export class NoteOpError extends Error {
  constructor(public code: 'invalid' | 'not_found' | 'conflict', message: string) { super(message); }
}

const live = (notes: Note[]) => notes.filter((n) => !n.deleted);
const cleanFolder = (f?: string | null) => (f ? f.trim().replace(/\\/g, '/').replace(/^\/+|\/+$/g, '').replace(/\/{2,}/g, '/') || null : null);

/** FNV-1a → stable id for idempotent creates. */
export function noteIdFromKey(key: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < key.length; i++) { h ^= key.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  let h2 = 0x01000193;
  for (let i = key.length - 1; i >= 0; i--) { h2 ^= key.charCodeAt(i); h2 = Math.imul(h2, 0x811c9dc5) >>> 0; }
  return `note-k${h.toString(36)}${h2.toString(36)}`;
}
const newNoteId = (now: Date) => `note-${now.getTime().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

function validate(title: string, folder: string | null) {
  if (!isValidTitle(title)) throw new NoteOpError('invalid', 'Note titles can’t be empty or contain \\ / : * ? " < > | # ^ [ ]');
  if (title.length > 200) throw new NoteOpError('invalid', 'Title is too long (max 200 characters)');
  if (folder && folder.split('/').some((p) => !isValidTitle(p))) throw new NoteOpError('invalid', `Invalid folder "${folder}"`);
}

const clash = (notes: Note[], title: string, folder: string | null, exceptId?: string) =>
  live(notes).find((n) => n.id !== exceptId && (n.folder ?? null) === folder && n.title.trim().toLowerCase() === title.trim().toLowerCase());

const stamp = (ctx: NoteCtx) => ({ ...(ctx.source ? { source: ctx.source } : {}), ...(ctx.agent !== undefined ? { agent: ctx.agent } : {}) });

/** Find a note by id, vault path ("Folder/Title"), title or alias. */
export function findNote(index: VaultIndex, ref: string): Note | null {
  const r = String(ref ?? '').trim();
  if (!r) return null;
  return index.byId.get(r) ?? index.notes.find((n) => normPath(notePath(n)) === normPath(r)) ?? index.resolve(r);
}

export function requireNote(index: VaultIndex, ref: string): Note {
  const n = findNote(index, ref);
  if (!n) throw new NoteOpError('not_found', `No note matches "${ref}"`);
  return n;
}

/** Merge properties into frontmatter; a null value removes the key. */
export function mergeProperties(content: string, props: Record<string, PropValue | undefined>): string {
  const cur = parseFrontmatter(content).props;
  const next: Record<string, PropValue> = { ...cur };
  for (const [k, v] of Object.entries(props)) {
    if (v === null || v === undefined) delete next[k];
    else next[k] = v;
  }
  return setFrontmatter(content, next);
}

// ------------------------------------------------------------------ create

export interface CreateNoteInput {
  title: string;
  folder?: string | null;
  content?: string;
  kind?: Note['kind'];
  properties?: Record<string, PropValue>;
  bookmarked?: boolean;
  dailyDate?: string | null;
  /** Retry-safe: the same key never creates a second note. */
  idempotencyKey?: string | null;
}

export function createNoteOp(notes: Note[], input: CreateNoteInput, ctx: NoteCtx = {}): { note: Note; edits: NoteEdit[]; existed: boolean } {
  const now = ctx.now ?? new Date();
  const title = String(input.title ?? '').trim();
  const folder = cleanFolder(input.folder);
  if (input.idempotencyKey) {
    const id = noteIdFromKey(`note:${input.idempotencyKey}`);
    const prior = notes.find((n) => n.id === id && !n.deleted);
    if (prior) return { note: prior, edits: [], existed: true };
  }
  validate(title, folder);
  if (clash(notes, title, folder)) throw new NoteOpError('conflict', `A note "${notePath({ title, folder })}" already exists`);
  let content = input.content ?? '';
  if (input.properties && Object.keys(input.properties).length) content = mergeProperties(content, input.properties);
  const id = input.idempotencyKey ? noteIdFromKey(`note:${input.idempotencyKey}`) : newNoteId(now);
  const note = prepareNote({ id, title, folder, content, kind: input.kind ?? 'note', dailyDate: input.dailyDate ?? null, bookmarked: !!input.bookmarked, ...stamp(ctx) }, now);
  return { note, edits: [{ coll: 'notes', id, edit: { ...note, deleted: false } }], existed: false };
}

// ------------------------------------------------------------------ update

export interface UpdateNoteInput {
  /** Replace the whole body (frontmatter included). */
  content?: string;
  /** Add text at the end (on a new line). */
  append?: string;
  /** Add text right after the frontmatter. */
  prepend?: string;
  /** Rename — links to this note are rewritten everywhere. */
  title?: string;
  /** Move to a folder ("" or null = vault root) — links are rewritten. */
  folder?: string | null;
  /** Merge frontmatter properties; null removes a key. */
  properties?: Record<string, PropValue | null>;
  bookmarked?: boolean;
}

export function updateNoteOp(notes: Note[], ref: string, input: UpdateNoteInput, ctx: NoteCtx = {}): { note: Note; edits: NoteEdit[]; linksUpdated: number } {
  const now = ctx.now ?? new Date();
  const index = buildIndex(notes);
  const n = requireNote(index, ref);
  let content = n.content;
  if (input.content !== undefined) content = String(input.content);
  if (input.prepend) {
    const fm = parseFrontmatter(content);
    content = content.slice(0, fm.bodyStart) + input.prepend.replace(/\n*$/, '\n') + content.slice(fm.bodyStart);
  }
  if (input.append) content = content.replace(/\n*$/, content.trim() ? '\n' : '') + input.append;
  if (input.properties) content = mergeProperties(content, input.properties);

  const title = input.title !== undefined ? String(input.title).trim() : n.title;
  const folder = input.folder !== undefined ? cleanFolder(input.folder) : n.folder ?? null;
  const renamed = title !== n.title || folder !== (n.folder ?? null);
  const edits: NoteEdit[] = [];
  let linksUpdated = 0;
  if (renamed) {
    validate(title, folder);
    if (clash(notes, title, folder, n.id)) throw new NoteOpError('conflict', `A note "${notePath({ title, folder })}" already exists`);
    const changes = rewriteLinksForRename(index, n.id, { title, folder });
    for (const [id, c] of changes) {
      if (id === n.id) { if (input.content === undefined) content = rewriteSelf(c, content, n.content); continue; }
      const other = index.byId.get(id)!;
      const next = prepareNote({ ...other, content: c }, now);
      edits.push({ coll: 'notes', id, edit: { content: next.content, tags: next.tags, lastEdited: next.lastEdited, ...stamp(ctx) } });
      linksUpdated++;
    }
  }
  const next = prepareNote({ ...n, title, folder, content, ...(input.bookmarked !== undefined ? { bookmarked: input.bookmarked } : {}), ...stamp(ctx) }, now);
  const edit: NoteEdit['edit'] = { title: next.title, folder: next.folder ?? null, content: next.content, tags: next.tags, lastEdited: next.lastEdited, ...stamp(ctx) };
  if (input.bookmarked !== undefined) edit.bookmarked = !!input.bookmarked;
  edits.unshift({ coll: 'notes', id: n.id, edit });
  return { note: next, edits, linksUpdated };
}

/** Self-links in the renamed note: keep the agent's content edits, but use the rewritten links. */
function rewriteSelf(rewrittenOriginal: string, edited: string, original: string): string {
  return edited === original ? rewrittenOriginal : edited;
}

// ------------------------------------------------------------------ delete

export function deleteNotesOp(notes: Note[], refs: string[], ctx: NoteCtx = {}): { deleted: Note[]; edits: NoteEdit[] } {
  const now = (ctx.now ?? new Date()).toISOString();
  const index = buildIndex(notes);
  const found = [...new Map(refs.map((r) => requireNote(index, r)).map((n) => [n.id, n])).values()];
  return { deleted: found, edits: found.map((n) => ({ coll: 'notes', id: n.id, edit: { deleted: true, deletedAt: now, ...stamp(ctx) } })) };
}

// ------------------------------------------------------------------ daily notes

export function dailyNoteOp(notes: Note[], date: Date, opts: { folder?: string | null; format?: string; template?: string | null; append?: string | null } = {}, ctx: NoteCtx = {}): { note: Note; edits: NoteEdit[]; created: boolean } {
  const iso = formatDate(date, 'YYYY-MM-DD');
  const folder = opts.folder === undefined ? 'Daily' : cleanFolder(opts.folder);
  const title = dailyTitle(date, { format: opts.format });
  const existing = live(notes).find((n) => n.kind === 'daily' && n.dailyDate === iso) ?? clash(notes, title, folder);
  if (existing) {
    if (!opts.append) return { note: existing, edits: [], created: false };
    const r = updateNoteOp(notes, existing.id, { append: opts.append }, ctx);
    return { note: r.note, edits: r.edits, created: false };
  }
  const body = opts.template ? applyTemplateVars(opts.template, { title, now: date }) : '';
  const content = opts.append ? (body ? body.replace(/\n*$/, '\n') : '') + opts.append : body;
  const r = createNoteOp(notes, { title, folder, content, kind: 'daily', dailyDate: iso }, ctx);
  return { note: r.note, edits: r.edits, created: true };
}

// ------------------------------------------------------------------ import

export interface ImportItem { title: string; folder?: string | null; content?: string; properties?: Record<string, PropValue> }
export type IfExists = 'skip' | 'update' | 'error';

/** Plan a bulk import (pure). Items are matched to existing notes by folder + title. */
export function importNotesOp(notes: Note[], items: ImportItem[], ifExists: IfExists, ctx: NoteCtx = {}): { created: Note[]; updated: Note[]; skipped: string[]; edits: NoteEdit[] } {
  let state = [...notes];
  const created: Note[] = [], updated: Note[] = [], skipped: string[] = [];
  const edits: NoteEdit[] = [];
  const seen = new Set<string>();
  for (const it of items) {
    const title = String(it.title ?? '').trim();
    const folder = cleanFolder(it.folder);
    const key = normPath(notePath({ title, folder }));
    if (seen.has(key)) throw new NoteOpError('invalid', `Duplicate item in import: "${notePath({ title, folder })}"`);
    seen.add(key);
    const existing = clash(state, title, folder);
    if (existing) {
      if (ifExists === 'skip') { skipped.push(notePath({ title, folder })); continue; }
      if (ifExists === 'error') throw new NoteOpError('conflict', `"${notePath({ title, folder })}" already exists (use if_exists: "skip" or "update")`);
      let content = it.content ?? existing.content;
      if (it.properties) content = mergeProperties(content, it.properties);
      const next = prepareNote({ ...existing, content, ...stamp(ctx) }, ctx.now);
      edits.push({ coll: 'notes', id: existing.id, edit: { content: next.content, tags: next.tags, lastEdited: next.lastEdited, ...stamp(ctx) } });
      updated.push(next);
      state = state.map((n) => (n.id === next.id ? next : n));
      continue;
    }
    const r = createNoteOp(state, { title, folder, content: it.content, properties: it.properties }, ctx);
    created.push(r.note);
    edits.push(...r.edits);
    state.push(r.note);
  }
  return { created, updated, skipped, edits };
}

// ------------------------------------------------------------------ agent-friendly shapes

export function describeNote(index: VaultIndex, n: Note, opts: { content?: boolean } = {}) {
  const out = index.links.get(n.id) ?? [];
  return {
    id: n.id,
    title: n.title,
    folder: n.folder ?? null,
    path: notePath(n),
    kind: n.kind ?? 'note',
    tags: index.tagsOf.get(n.id) ?? n.tags ?? [],
    bookmarked: !!n.bookmarked,
    created_at: n.createdAt ?? null,
    updated_at: n.lastEdited ?? null,
    ...(n.agent ? { written_by: { agent: n.agent, source: n.source ?? null } } : {}),
    backlink_count: (index.backlinks.get(n.id) ?? []).filter((l) => l.from !== n.id).length,
    outgoing_link_count: out.filter((l) => l.target).length,
    ...(opts.content ? { content: n.content } : { excerpt: excerpt(n, 200) }),
  };
}

export function noteDetail(index: VaultIndex, n: Note) {
  const out = index.links.get(n.id) ?? [];
  const fm = parseFrontmatter(n.content);
  return {
    ...describeNote(index, n, { content: true }),
    properties: fm.props,
    headings: n.kind === 'canvas' ? [] : extractHeadings(n.content).map((h) => ({ level: h.level, text: h.text })),
    outgoing_links: out.filter((l) => l.target).map((l) => ({
      target: l.target, heading: l.heading ?? null, embed: l.embed,
      note_id: l.to, path: l.to ? notePath(index.byId.get(l.to)!) : null,
      attachment_id: l.toAttachment ?? null, resolved: !!(l.to || l.toAttachment),
    })),
    backlinks: linkedMentions(index, n.id).map((g) => ({ note_id: g.note.id, path: notePath(g.note), lines: g.mentions.map((m) => m.text).slice(0, 5) })),
  };
}

/** Folder tree with note counts (direct + nested). */
export function folderSummary(index: VaultIndex) {
  const counts = new Map<string, number>();
  for (const n of index.notes) {
    const parts = (n.folder ?? '').split('/').filter(Boolean);
    for (let i = 1; i <= parts.length; i++) { const f = parts.slice(0, i).join('/'); counts.set(f, (counts.get(f) ?? 0) + 1); }
  }
  return index.folders.map((f) => ({ folder: f, notes: counts.get(f) ?? 0 }));
}

