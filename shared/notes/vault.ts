/**
 * The vault: an index over notes that resolves [[links]] the way Obsidian does
 * (exact path → title → alias, case-insensitive), and everything built on it —
 * backlinks, unlinked mentions, the graph, rename-with-link-update, search,
 * templates and daily notes. Pure; UI clients keep the index memoised.
 */
import type { Note, Attachment } from '../types';
import { canvasLinks, canvasText, parseCanvas, serializeCanvas } from './canvas';
import { extractLinks, extractTags, extractHeadings, parseFrontmatter, setFrontmatter, plainText, tagAncestors, type WikiLink } from './parse';

// ------------------------------------------------------------------ paths

export const notePath = (n: Pick<Note, 'title' | 'folder'>) => (n.folder ? `${n.folder.replace(/\/+$/, '')}/${n.title}` : n.title);
export const normPath = (p: string) => p.trim().replace(/\\/g, '/').replace(/\.md$/i, '').replace(/^\/+|\/+$/g, '').replace(/\/{2,}/g, '/').toLowerCase();
/** Characters Obsidian forbids in file names. */
export const INVALID_TITLE = /[\\/:*?"<>|#^[\]]/;
export const isValidTitle = (t: string) => !!t.trim() && !INVALID_TITLE.test(t);

export function aliasesOf(n: Note): string[] {
  const v = parseFrontmatter(n.content).props.aliases ?? parseFrontmatter(n.content).props.alias;
  return (Array.isArray(v) ? v : typeof v === 'string' ? v.split(',') : []).map((x) => String(x).trim()).filter(Boolean);
}

// ------------------------------------------------------------------ index

export interface ResolvedLink extends WikiLink {
  from: string;
  to: string | null;
  /** Resolved attachment id when the target is a file in the vault. */
  toAttachment?: string | null;
  /** For links coming from a canvas: the card text / file label (offsets are 0). */
  context?: string;
}

/** Vault path of an attachment ("folder/name.ext"). */
export const attachmentPath = (a: Pick<Attachment, 'name' | 'folder'>) => (a.folder ? `${a.folder.replace(/\/+$/, '')}/${a.name}` : a.name);
const IMAGE_EXT = /\.(png|jpe?g|gif|webp|svg|bmp|avif)$/i;
const AUDIO_EXT = /\.(mp3|wav|m4a|ogg|flac|webm)$/i;
const VIDEO_EXT = /\.(mp4|mov|webm|mkv|ogv)$/i;
export type AttachmentKind = 'image' | 'pdf' | 'audio' | 'video' | 'other';
export function attachmentKind(a: Pick<Attachment, 'name' | 'mime'>): AttachmentKind {
  if (a.mime.startsWith('image/') || IMAGE_EXT.test(a.name)) return 'image';
  if (a.mime === 'application/pdf' || /\.pdf$/i.test(a.name)) return 'pdf';
  if (a.mime.startsWith('video/') || (VIDEO_EXT.test(a.name) && !a.mime.startsWith('audio/'))) return 'video';
  if (a.mime.startsWith('audio/') || AUDIO_EXT.test(a.name)) return 'audio';
  return 'other';
}
/** Does a link target look like a non-note file (has an extension other than .md)? */
export const isFileTarget = (target: string) => /\.[a-z0-9]{1,8}$/i.test(target.trim()) && !/\.md$/i.test(target.trim());

/** Text used for search, tags and previews (canvas JSON → its card text). */
export const searchableText = (n: Pick<Note, 'content' | 'kind'>) => (n.kind === 'canvas' ? canvasText(n.content) : n.content);

export interface VaultIndex {
  notes: Note[];
  byId: Map<string, Note>;
  /** Resolve a link target (path, title or alias) to a note. */
  resolve: (target: string, fromId?: string) => Note | null;
  /** Outgoing links per note id (resolved where possible). */
  links: Map<string, ResolvedLink[]>;
  /** Incoming resolved links per note id. */
  backlinks: Map<string, ResolvedLink[]>;
  /** Unresolved targets (lower-cased) → source note ids. */
  unresolved: Map<string, { target: string; from: Set<string> }>;
  /** tag → note ids (nested tags count for every ancestor). */
  tags: Map<string, Set<string>>;
  tagsOf: Map<string, string[]>;
  folders: string[];
  /** Vault attachments (files). */
  attachments: Attachment[];
  attachmentsById: Map<string, Attachment>;
  /** Resolve a file target ("pic.png", "Folder/pic.png") to an attachment. */
  resolveAttachment: (target: string, fromId?: string) => Attachment | null;
  /** Incoming links per attachment id. */
  attachmentBacklinks: Map<string, ResolvedLink[]>;
}

const live = (notes: Note[]) => notes.filter((n) => !n.deleted);

export function buildIndex(all: Note[], allAttachments: Attachment[] = []): VaultIndex {
  const notes = live(all);
  const attachments = allAttachments.filter((a) => !a.deleted);
  const attachmentsById = new Map(attachments.map((a) => [a.id, a]));
  const attByPath = new Map<string, Attachment>();
  const attByName = new Map<string, Attachment[]>();
  for (const a of [...attachments].sort((x, y) => x.createdAt.localeCompare(y.createdAt))) {
    if (!attByPath.has(normPath(attachmentPath(a)))) attByPath.set(normPath(attachmentPath(a)), a);
    const k = a.name.toLowerCase();
    attByName.set(k, [...(attByName.get(k) ?? []), a]);
  }
  const byId = new Map(notes.map((n) => [n.id, n]));
  const byPath = new Map<string, Note>();
  const byTitle = new Map<string, Note[]>();
  const byAlias = new Map<string, Note>();
  // Oldest first so a duplicate title resolves to the original note deterministically.
  const ordered = [...notes].sort((a, b) => (a.createdAt ?? a.lastEdited ?? '').localeCompare(b.createdAt ?? b.lastEdited ?? '') || a.id.localeCompare(b.id));
  for (const n of ordered) {
    byPath.set(normPath(notePath(n)), byPath.get(normPath(notePath(n))) ?? n);
    const t = n.title.trim().toLowerCase();
    byTitle.set(t, [...(byTitle.get(t) ?? []), n]);
    for (const a of aliasesOf(n)) if (!byAlias.has(a.toLowerCase())) byAlias.set(a.toLowerCase(), n);
  }
  const resolve = (target: string, fromId?: string): Note | null => {
    const t = target.trim();
    if (!t) return fromId ? byId.get(fromId) ?? null : null; // [[#heading]] → same note
    const p = normPath(t);
    const exact = byPath.get(p);
    if (exact) return exact;
    const base = p.split('/').pop()!;
    const titled = byTitle.get(base);
    if (titled?.length) {
      if (titled.length === 1 || !p.includes('/')) {
        // Prefer a note in the same folder as the source.
        const from = fromId ? byId.get(fromId) : undefined;
        return titled.find((n) => (n.folder ?? '') === (from?.folder ?? '')) ?? titled[0];
      }
      const suffix = titled.find((n) => normPath(notePath(n)).endsWith(p));
      if (suffix) return suffix;
    }
    return byAlias.get(t.toLowerCase()) ?? null;
  };
  // normPath strips ".md" only, so file extensions survive here.
  const resolveAttachment = (target: string, fromId?: string): Attachment | null => {
    const p = normPath(target);
    if (!p) return null;
    const exact = attByPath.get(p);
    if (exact) return exact;
    const named = attByName.get(p.split('/').pop()!);
    if (!named?.length) return null;
    const from = fromId ? byId.get(fromId) : undefined;
    return named.find((a) => (a.folder ?? '') === (from?.folder ?? '')) ?? named.find((a) => normPath(attachmentPath(a)).endsWith(p)) ?? named[0];
  };

  const links = new Map<string, ResolvedLink[]>();
  const backlinks = new Map<string, ResolvedLink[]>();
  const unresolved = new Map<string, { target: string; from: Set<string> }>();
  const tags = new Map<string, Set<string>>();
  const tagsOf = new Map<string, string[]>();
  const folders = new Set<string>();
  const attachmentBacklinks = new Map<string, ResolvedLink[]>();
  for (const n of notes) {
    const raw: WikiLink[] = n.kind === 'canvas'
      ? canvasLinks(n.content).map((l) => ({ ...l, start: 0, end: 0, line: 0 }))
      : extractLinks(n.content);
    const out: ResolvedLink[] = raw.map((l) => {
      // A file-looking target prefers an attachment; otherwise notes first (a note may be titled "v1.2").
      const att = isFileTarget(l.target) ? resolveAttachment(l.target, n.id) : null;
      const to = att ? null : resolve(l.target, n.id)?.id ?? null;
      const toAttachment = att?.id ?? (to ? null : resolveAttachment(l.target, n.id)?.id ?? null);
      return { ...l, from: n.id, to, toAttachment, ...(n.kind === 'canvas' ? { context: l.alias ?? l.target } : {}) };
    });
    links.set(n.id, out);
    for (const l of out) {
      if (l.toAttachment) attachmentBacklinks.set(l.toAttachment, [...(attachmentBacklinks.get(l.toAttachment) ?? []), l]);
      else if (l.to) { if (l.to !== n.id || l.target) backlinks.set(l.to, [...(backlinks.get(l.to) ?? []), l]); }
      else if (l.target) {
        const k = normPath(l.target);
        const u = unresolved.get(k) ?? { target: l.target, from: new Set<string>() };
        u.from.add(n.id);
        unresolved.set(k, u);
      }
    }
    const ts = extractTags(searchableText(n));
    tagsOf.set(n.id, ts);
    for (const t of ts) for (const a of tagAncestors(t)) tags.set(a, (tags.get(a) ?? new Set()).add(n.id));
    if (n.folder) { const parts = n.folder.split('/'); parts.forEach((_, i) => folders.add(parts.slice(0, i + 1).join('/'))); }
  }
  for (const a of attachments) if (a.folder) { const parts = a.folder.split('/'); parts.forEach((_, i) => folders.add(parts.slice(0, i + 1).join('/'))); }
  return { notes, byId, resolve, links, backlinks, unresolved, tags, tagsOf, folders: [...folders].sort(), attachments, attachmentsById, resolveAttachment, attachmentBacklinks };
}

// ------------------------------------------------------------------ backlinks & mentions

export interface Mention { noteId: string; line: number; text: string; start: number; end: number }

const lineOf = (content: string, offset: number) => {
  const a = content.lastIndexOf('\n', offset - 1) + 1;
  const b = content.indexOf('\n', offset);
  return { line: content.slice(0, a).split('\n').length - 1, text: content.slice(a, b < 0 ? undefined : b).trim() };
};

/** Linked mentions grouped by source note, with the line each link sits on. */
export function linkedMentions(index: VaultIndex, noteId: string): { note: Note; mentions: Mention[] }[] {
  const groups = new Map<string, Mention[]>();
  for (const l of index.backlinks.get(noteId) ?? []) {
    if (l.from === noteId) continue;
    const src = index.byId.get(l.from)!;
    const { line, text } = src.kind === 'canvas' ? { line: 0, text: `Canvas card: ${l.context ?? l.target}` } : lineOf(src.content, l.start);
    groups.set(l.from, [...(groups.get(l.from) ?? []), { noteId: l.from, line, text, start: l.start, end: l.end }]);
  }
  return [...groups].map(([id, mentions]) => ({ note: index.byId.get(id)!, mentions })).sort((a, b) => a.note.title.localeCompare(b.note.title));
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Plain-text occurrences of the note's title/aliases that aren't links yet. */
export function unlinkedMentions(index: VaultIndex, noteId: string): { note: Note; mentions: Mention[] }[] {
  const note = index.byId.get(noteId);
  if (!note) return [];
  const names = [note.title, ...aliasesOf(note)].filter((x) => x.trim().length >= 3);
  if (!names.length) return [];
  const re = new RegExp(`(?<![\\p{L}\\p{N}])(${names.map(escapeRe).join('|')})(?![\\p{L}\\p{N}])`, 'giu');
  const out: { note: Note; mentions: Mention[] }[] = [];
  for (const n of index.notes) {
    if (n.id === noteId || n.kind === 'canvas') continue;
    const linkSpans = extractLinks(n.content).map((l) => [l.start, l.end] as const);
    const fm = parseFrontmatter(n.content).bodyStart;
    const mentions: Mention[] = [];
    let m: RegExpExecArray | null;
    re.lastIndex = 0;
    while ((m = re.exec(n.content))) {
      const s = m.index, e = s + m[0].length;
      if (s < fm || linkSpans.some(([a, b]) => s >= a && e <= b)) continue;
      const { line, text } = lineOf(n.content, s);
      mentions.push({ noteId: n.id, line, text, start: s, end: e });
    }
    if (mentions.length) out.push({ note: n, mentions });
  }
  return out;
}

/** Turn one unlinked mention into a [[link]] (keeps the original casing as alias when it differs). */
export function linkMention(content: string, m: Mention, title: string): string {
  const found = content.slice(m.start, m.end);
  const link = found === title ? `[[${title}]]` : `[[${title}|${found}]]`;
  return content.slice(0, m.start) + link + content.slice(m.end);
}

// ------------------------------------------------------------------ rename

/**
 * Rewrite every link to `oldPath`/`oldTitle` in other notes after a rename or
 * move. Returns only notes whose content changed (id → new content).
 */
export function rewriteLinksForRename(index: VaultIndex, noteId: string, next: { title: string; folder?: string | null }): Map<string, string> {
  const note = index.byId.get(noteId);
  const changes = new Map<string, string>();
  if (!note) return changes;
  const titles = new Map<string, number>();
  for (const n of index.notes) titles.set(n.title.toLowerCase(), (titles.get(n.title.toLowerCase()) ?? 0) + 1);
  // Use the shortest unambiguous form, like Obsidian's default "shortest path".
  const dupes = (titles.get(next.title.toLowerCase()) ?? 0) + (next.title.toLowerCase() === note.title.toLowerCase() ? 0 : 1) > 1;
  const newTarget = dupes ? notePath({ title: next.title, folder: next.folder ?? null }) : next.title;
  for (const [from, ls] of index.links) {
    const mine = ls.filter((l) => l.to === noteId && l.target);
    if (!mine.length) continue;
    const srcNote = index.byId.get(from)!;
    if (srcNote.kind === 'canvas') {
      const out = rewriteCanvasLinks(srcNote.content, (target, fromText) => {
        if (index.resolve(target, from)?.id !== noteId) return null;
        return fromText ? newTarget : `${notePath({ title: next.title, folder: next.folder ?? null })}.md`;
      });
      if (out !== srcNote.content) changes.set(from, out);
      continue;
    }
    const src = changes.get(from) ?? srcNote.content;
    let out = src;
    for (const l of [...mine].sort((a, b) => b.start - a.start)) {
      const raw = src.slice(l.start, l.end);
      let rep: string;
      if (raw.startsWith('[[') || raw.startsWith('![[')) {
        const frag = l.heading ? `#${l.heading}` : l.block ? `#^${l.block}` : '';
        rep = `${l.embed ? '!' : ''}[[${newTarget}${frag}${l.alias ? `|${l.alias}` : ''}]]`;
      } else {
        rep = raw.replace(/\]\(([^)#\s]+?)\.md/, `](${encodeURI(notePath({ title: next.title, folder: next.folder ?? null }))}.md`);
      }
      out = out.slice(0, l.start) + rep + out.slice(l.end);
    }
    if (out !== index.byId.get(from)!.content) changes.set(from, out);
  }
  return changes;
}

/**
 * Rewrite link targets inside a canvas: file nodes (`fromText=false`) and
 * [[wikilinks]] in text cards (`fromText=true`). `map` returns the new target or null to keep.
 */
export function rewriteCanvasLinks(content: string, map: (target: string, fromText: boolean) => string | null): string {
  const c = parseCanvas(content);
  let changed = false;
  for (const n of c.nodes) {
    if (n.type === 'file') {
      const t = map(n.file.replace(/\.md$/i, ''), false);
      if (t !== null && t !== n.file) { n.file = t; changed = true; }
    } else if (n.type === 'text') {
      const ls = extractLinks(n.text);
      let text = n.text;
      for (const l of [...ls].sort((a, b) => b.start - a.start)) {
        const t = map(l.target, true);
        if (t === null) continue;
        const raw = text.slice(l.start, l.end);
        if (!raw.includes('[[')) continue;
        const frag = l.heading ? `#${l.heading}` : l.block ? `#^${l.block}` : '';
        text = text.slice(0, l.start) + `${l.embed ? '!' : ''}[[${t}${frag}${l.alias ? `|${l.alias}` : ''}]]` + text.slice(l.end);
      }
      if (text !== n.text) { n.text = text; changed = true; }
    }
  }
  return changed ? serializeCanvas(c) : content;
}

/** Rewrite links to an attachment after rename/move (notes + canvases). */
export function rewriteLinksForAttachmentRename(index: VaultIndex, attachmentId: string, next: { name: string; folder?: string | null }): Map<string, string> {
  const a = index.attachmentsById.get(attachmentId);
  const changes = new Map<string, string>();
  if (!a) return changes;
  const dupes = index.attachments.filter((x) => x.id !== a.id && x.name.toLowerCase() === next.name.toLowerCase()).length > 0;
  const newTarget = dupes ? attachmentPath({ name: next.name, folder: next.folder ?? null }) : next.name;
  for (const [from, ls] of index.links) {
    const mine = ls.filter((l) => l.toAttachment === attachmentId);
    if (!mine.length) continue;
    const srcNote = index.byId.get(from)!;
    if (srcNote.kind === 'canvas') {
      const out = rewriteCanvasLinks(srcNote.content, (target) => (index.resolveAttachment(target, from)?.id === attachmentId ? (dupes ? attachmentPath({ name: next.name, folder: next.folder ?? null }) : newTarget) : null));
      if (out !== srcNote.content) changes.set(from, out);
      continue;
    }
    let out = srcNote.content;
    for (const l of [...mine].sort((x, y) => y.start - x.start)) {
      const raw = out.slice(l.start, l.end);
      const rep = raw.includes('[[')
        ? `${l.embed ? '!' : ''}[[${newTarget}${l.alias ? `|${l.alias}` : ''}]]`
        : raw.replace(/\]\(([^)\s]+)\)/, `](${encodeURI(attachmentPath({ name: next.name, folder: next.folder ?? null }))})`);
      out = out.slice(0, l.start) + rep + out.slice(l.end);
    }
    if (out !== srcNote.content) changes.set(from, out);
  }
  return changes;
}

// ------------------------------------------------------------------ graph

export type GraphNodeType = 'note' | 'tag' | 'unresolved' | 'attachment';
export interface GraphNode { id: string; label: string; type: GraphNodeType; degree: number; folder?: string | null; tags?: string[]; noteId?: string }
export interface GraphLink { source: string; target: string; kind: 'link' | 'tag' | 'embed' }
export interface Graph { nodes: GraphNode[]; links: GraphLink[] }

export interface GraphOptions {
  showTags?: boolean;
  showUnresolved?: boolean;
  showOrphans?: boolean;
  /** Search filter (same syntax as vault search) — keeps matching notes only. */
  query?: string;
  /** Include daily notes / templates. */
  showDaily?: boolean;
  showTemplates?: boolean;
  /** Show attachments (files) linked from notes as nodes. */
  showAttachments?: boolean;
  /** Include canvases as nodes. Default true. */
  showCanvases?: boolean;
}

export function buildGraph(index: VaultIndex, opts: GraphOptions = {}): Graph {
  const { showTags = false, showUnresolved = false, showOrphans = true, query, showDaily = true, showTemplates = false, showAttachments = false, showCanvases = true } = opts;
  let keep = index.notes.filter((n) => (showDaily || n.kind !== 'daily') && (showTemplates || n.kind !== 'template') && (showCanvases || n.kind !== 'canvas'));
  if (query?.trim()) { const hits = new Set(searchVault(index, query).map((r) => r.note.id)); keep = keep.filter((n) => hits.has(n.id)); }
  const ids = new Set(keep.map((n) => n.id));
  const nodes = new Map<string, GraphNode>();
  const links: GraphLink[] = [];
  const seen = new Set<string>();
  const addLink = (source: string, target: string, kind: GraphLink['kind']) => {
    if (source === target) return;
    const k = source < target ? `${source}|${target}` : `${target}|${source}`;
    if (seen.has(k)) return;
    seen.add(k);
    links.push({ source, target, kind });
  };
  for (const n of keep) nodes.set(n.id, { id: n.id, label: n.title, type: 'note', degree: 0, folder: n.folder ?? null, tags: index.tagsOf.get(n.id) ?? [], noteId: n.id });
  for (const n of keep) {
    for (const l of index.links.get(n.id) ?? []) {
      if (l.to && ids.has(l.to)) addLink(n.id, l.to, l.embed ? 'embed' : 'link');
      else if (l.toAttachment) {
        if (!showAttachments) continue;
        const a = index.attachmentsById.get(l.toAttachment)!;
        const aid = `attachment:${a.id}`;
        if (!nodes.has(aid)) nodes.set(aid, { id: aid, label: a.name, type: 'attachment', degree: 0, folder: a.folder ?? null });
        addLink(n.id, aid, 'embed');
      } else if (!l.to && l.target && showUnresolved) {
        const uid = `unresolved:${normPath(l.target)}`;
        if (!nodes.has(uid)) nodes.set(uid, { id: uid, label: l.target, type: 'unresolved', degree: 0 });
        addLink(n.id, uid, 'link');
      }
    }
    if (showTags) for (const t of index.tagsOf.get(n.id) ?? []) {
      const tid = `tag:${t}`;
      if (!nodes.has(tid)) nodes.set(tid, { id: tid, label: `#${t}`, type: 'tag', degree: 0 });
      addLink(n.id, tid, 'tag');
    }
  }
  for (const l of links) { nodes.get(l.source)!.degree++; nodes.get(l.target)!.degree++; }
  let out = [...nodes.values()];
  if (!showOrphans) out = out.filter((n) => n.degree > 0);
  const kept = new Set(out.map((n) => n.id));
  return { nodes: out, links: links.filter((l) => kept.has(l.source) && kept.has(l.target)) };
}

/** Neighbourhood of a node up to `depth` hops (Obsidian's local graph). */
export function localGraph(graph: Graph, centerId: string, depth = 1): Graph {
  const adj = new Map<string, Set<string>>();
  for (const l of graph.links) {
    adj.set(l.source, (adj.get(l.source) ?? new Set()).add(l.target));
    adj.set(l.target, (adj.get(l.target) ?? new Set()).add(l.source));
  }
  const keep = new Set([centerId]);
  let frontier = [centerId];
  for (let d = 0; d < depth; d++) {
    const next: string[] = [];
    for (const id of frontier) for (const nb of adj.get(id) ?? []) if (!keep.has(nb)) { keep.add(nb); next.push(nb); }
    frontier = next;
  }
  const nodes = graph.nodes.filter((n) => keep.has(n.id));
  return { nodes, links: graph.links.filter((l) => keep.has(l.source) && keep.has(l.target)) };
}

// ------------------------------------------------------------------ search

export interface SearchHit { note: Note; score: number; matches: { line: number; text: string }[] }

interface Term { field: 'any' | 'tag' | 'path' | 'file' | 'line' | 'content' | 'task' | 'task-todo' | 'task-done' | 'prop'; value: string; neg: boolean; key?: string }

/**
 * Obsidian-style search: words (AND), "exact phrase", -exclude, OR,
 * tag:#x, path:folder, file:name, content:, line:, task:, task-todo:,
 * task-done:, [property:value]. Case-insensitive.
 */
export function parseSearch(q: string): Term[][] {
  const groups: Term[][] = [[]];
  const re = /(-?)(?:\[([^\]:]+):?([^\]]*)\]|(tag|path|file|line|content|task|task-todo|task-done):("[^"]*"|\S+)|"([^"]*)"|(\S+))/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(q))) {
    const neg = m[1] === '-';
    if (!m[2] && !m[4] && !m[6] && m[7] === 'OR') { groups.push([]); continue; }
    const cur = groups[groups.length - 1];
    if (m[2]) cur.push({ field: 'prop', key: m[2].trim().toLowerCase(), value: m[3].trim().replace(/^"|"$/g, '').toLowerCase(), neg });
    else if (m[4]) cur.push({ field: m[4].toLowerCase() as Term['field'], value: m[5].replace(/^"|"$/g, '').replace(/^#/, '').toLowerCase(), neg });
    else cur.push({ field: 'any', value: (m[6] ?? m[7]).toLowerCase(), neg });
  }
  return groups.filter((g) => g.length);
}

export function searchVault(index: VaultIndex, q: string, limit = 200): SearchHit[] {
  const groups = parseSearch(q);
  if (!groups.length) return [];
  const hits: SearchHit[] = [];
  for (const n of index.notes) {
    const body = searchableText(n);
    const lc = body.toLowerCase();
    const lines = body.split('\n');
    const title = n.title.toLowerCase();
    const path = normPath(notePath(n));
    const tags = index.tagsOf.get(n.id) ?? [];
    const props = parseFrontmatter(n.content).props;
    const matchLines = new Set<number>();
    const test = (t: Term): boolean => {
      const v = t.value;
      switch (t.field) {
        case 'tag': return tags.some((x) => x === v || x.startsWith(v + '/'));
        case 'path': return path.includes(v);
        case 'file': return title.includes(v);
        case 'content': return lc.includes(v);
        case 'line': { let ok = false; lines.forEach((l, i) => { if (l.toLowerCase().includes(v)) { ok = true; matchLines.add(i); } }); return ok; }
        case 'task': case 'task-todo': case 'task-done': {
          let ok = false;
          lines.forEach((l, i) => {
            const m = /^\s*[-*+]\s+\[([ xX])\]\s+(.*)$/.exec(l);
            if (!m || !m[2].toLowerCase().includes(v)) return;
            const done = m[1] !== ' ';
            if (t.field === 'task' || (t.field === 'task-done') === done) { ok = true; matchLines.add(i); }
          });
          return ok;
        }
        case 'prop': {
          const key = Object.keys(props).find((k) => k.toLowerCase() === t.key);
          if (!key) return false;
          if (!v) return true;
          const pv = props[key];
          return (Array.isArray(pv) ? pv : [pv]).some((x) => String(x ?? '').toLowerCase().includes(v));
        }
        default: {
          const inTitle = title.includes(v);
          let inBody = false;
          lines.forEach((l, i) => { if (l.toLowerCase().includes(v)) { inBody = true; matchLines.add(i); } });
          return inTitle || inBody;
        }
      }
    };
    const ok = groups.some((g) => g.every((t) => (t.neg ? !test(t) : test(t))));
    if (!ok) continue;
    const positives = groups.flat().filter((t) => !t.neg && (t.field === 'any' || t.field === 'file'));
    const score = positives.reduce((s, t) => s + (title === t.value ? 10 : title.startsWith(t.value) ? 6 : title.includes(t.value) ? 4 : 1), 0) + matchLines.size * 0.1;
    hits.push({ note: n, score, matches: [...matchLines].slice(0, 5).map((i) => ({ line: i, text: lines[i].trim().slice(0, 200) })) });
  }
  return hits.sort((a, b) => b.score - a.score || (b.note.lastEdited ?? '').localeCompare(a.note.lastEdited ?? '')).slice(0, limit);
}

/** Fuzzy title match for the quick switcher (also matches aliases and paths). */
export function quickSwitch(index: VaultIndex, q: string, limit = 30): { note: Note; label: string; via?: string; score: number }[] {
  const query = q.trim().toLowerCase();
  const recent = [...index.notes].sort((a, b) => (b.updatedAt ?? b.lastEdited ?? '').localeCompare(a.updatedAt ?? a.lastEdited ?? ''));
  if (!query) return recent.slice(0, limit).map((note) => ({ note, label: note.title, score: 0 }));
  const fuzzy = (s: string) => {
    const t = s.toLowerCase();
    if (t === query) return 100;
    if (t.startsWith(query)) return 80;
    const i = t.indexOf(query);
    if (i >= 0) return 60 - Math.min(i, 30);
    let qi = 0, gaps = 0, last = -1;
    for (let k = 0; k < t.length && qi < query.length; k++) if (t[k] === query[qi]) { if (last >= 0) gaps += k - last - 1; last = k; qi++; }
    return qi === query.length ? Math.max(1, 30 - gaps) : 0;
  };
  const out: { note: Note; label: string; via?: string; score: number }[] = [];
  for (const n of index.notes) {
    let best = { score: fuzzy(n.title), via: undefined as string | undefined };
    const p = fuzzy(notePath(n)); if (p > best.score) best = { score: p - 1, via: undefined };
    for (const a of aliasesOf(n)) { const s = fuzzy(a); if (s > best.score) best = { score: s, via: a }; }
    if (best.score > 0) out.push({ note: n, label: n.title, via: best.via, score: best.score });
  }
  return out.sort((a, b) => b.score - a.score).slice(0, limit);
}

// ------------------------------------------------------------------ templates & daily notes

const pad = (n: number) => String(n).padStart(2, '0');
const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

/** Moment-style subset: YYYY YY MMMM MMM MM M DD D dddd ddd HH H mm ss A a. */
export function formatDate(d: Date, fmt = 'YYYY-MM-DD'): string {
  const map: Record<string, string> = {
    YYYY: String(d.getFullYear()), YY: String(d.getFullYear()).slice(2),
    MMMM: MONTHS[d.getMonth()], MMM: MONTHS[d.getMonth()].slice(0, 3), MM: pad(d.getMonth() + 1), M: String(d.getMonth() + 1),
    DD: pad(d.getDate()), D: String(d.getDate()), dddd: WEEKDAYS[d.getDay()], ddd: WEEKDAYS[d.getDay()].slice(0, 3),
    HH: pad(d.getHours()), H: String(d.getHours()), hh: pad(d.getHours() % 12 || 12), h: String(d.getHours() % 12 || 12),
    mm: pad(d.getMinutes()), ss: pad(d.getSeconds()), A: d.getHours() < 12 ? 'AM' : 'PM', a: d.getHours() < 12 ? 'am' : 'pm',
  };
  return fmt.replace(/\[([^\]]*)\]|YYYY|YY|MMMM|MMM|MM|M|DD|D|dddd|ddd|HH|H|hh|h|mm|ss|A|a/g, (t, lit) => (lit !== undefined ? lit : map[t]));
}

/** Expand {{title}}, {{date}}, {{date:FORMAT}}, {{time}}, {{time:FORMAT}} like Obsidian core Templates. */
export function applyTemplateVars(text: string, ctx: { title: string; now?: Date; dateFormat?: string; timeFormat?: string }): string {
  const now = ctx.now ?? new Date();
  return text.replace(/\{\{\s*(title|date|time)(?::([^}]+))?\s*\}\}/gi, (_, k: string, fmt?: string) => {
    const key = k.toLowerCase();
    if (key === 'title') return ctx.title;
    if (key === 'date') return formatDate(now, fmt?.trim() || ctx.dateFormat || 'YYYY-MM-DD');
    return formatDate(now, fmt?.trim() || ctx.timeFormat || 'HH:mm');
  });
}

/** Insert a template into a note: merges template frontmatter into the note's, body at `at` (default end). */
export function insertTemplate(content: string, template: string, ctx: { title: string; now?: Date }, at?: number): string {
  const tpl = applyTemplateVars(template, ctx);
  const tfm = parseFrontmatter(tpl);
  const nfm = parseFrontmatter(content);
  const pos = Math.max(nfm.bodyStart, Math.min(at ?? content.length, content.length));
  const body = content.slice(0, pos) + tfm.body + content.slice(pos);
  if (tfm.raw === null) return body;
  return setFrontmatter(body, { ...tfm.props, ...nfm.props });
}

export interface DailyNoteSettings { folder?: string | null; format?: string; templateId?: string | null }

export const dailyTitle = (date: Date, s: DailyNoteSettings = {}) => formatDate(date, s.format || 'YYYY-MM-DD');

export function findDailyNote(index: VaultIndex, date: Date, s: DailyNoteSettings = {}): Note | null {
  const iso = formatDate(date, 'YYYY-MM-DD');
  return index.notes.find((n) => n.kind === 'daily' && n.dailyDate === iso)
    ?? index.resolve(s.folder ? `${s.folder}/${dailyTitle(date, s)}` : dailyTitle(date, s));
}

// ------------------------------------------------------------------ note records

/** Normalise a note for saving: derive tags, stamp times (ISO), keep compatibility fields. */
export function prepareNote(n: Partial<Note> & { id: string; title: string; content: string }, now = new Date()): Note {
  const iso = now.toISOString();
  return {
    ...n,
    title: n.title.trim(),
    content: n.content,
    tags: extractTags(n.content),
    folder: n.folder ? n.folder.replace(/^\/+|\/+$/g, '') || null : null,
    createdAt: n.createdAt ?? iso,
    lastEdited: iso,
  } as Note;
}

/** A fresh, unused "Untitled" (or base) title. */
export function uniqueTitle(index: VaultIndex, base = 'Untitled', folder?: string | null): string {
  const taken = new Set(index.notes.filter((n) => (n.folder ?? '') === (folder ?? '')).map((n) => n.title.toLowerCase()));
  if (!taken.has(base.toLowerCase())) return base;
  for (let i = 1; ; i++) if (!taken.has(`${base} ${i}`.toLowerCase())) return `${base} ${i}`;
}

export const outline = (n: Note) => extractHeadings(n.content);
export const excerpt = (n: Note, len = 160) => plainText(searchableText(n)).slice(0, len);

/** Notes with no links in or out (Obsidian "orphans"). */
export const orphans = (index: VaultIndex) => index.notes.filter((n) => !(index.links.get(n.id) ?? []).some((l) => l.to && l.to !== n.id) && !(index.backlinks.get(n.id) ?? []).some((l) => l.from !== n.id));
