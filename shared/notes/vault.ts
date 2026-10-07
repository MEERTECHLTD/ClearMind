/**
 * The vault: an index over notes that resolves [[links]] the way Obsidian does
 * (exact path → title → alias, case-insensitive), and everything built on it —
 * backlinks, unlinked mentions, the graph, rename-with-link-update, search,
 * templates and daily notes. Pure; UI clients keep the index memoised.
 */
import type { Note } from '../types';
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

export interface ResolvedLink extends WikiLink { from: string; to: string | null }

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
}

const live = (notes: Note[]) => notes.filter((n) => !n.deleted);

export function buildIndex(all: Note[]): VaultIndex {
  const notes = live(all);
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

  const links = new Map<string, ResolvedLink[]>();
  const backlinks = new Map<string, ResolvedLink[]>();
  const unresolved = new Map<string, { target: string; from: Set<string> }>();
  const tags = new Map<string, Set<string>>();
  const tagsOf = new Map<string, string[]>();
  const folders = new Set<string>();
  for (const n of notes) {
    const out = extractLinks(n.content).map((l) => ({ ...l, from: n.id, to: resolve(l.target, n.id)?.id ?? null }));
    links.set(n.id, out);
    for (const l of out) {
      if (l.to) { if (l.to !== n.id || l.target) backlinks.set(l.to, [...(backlinks.get(l.to) ?? []), l]); }
      else if (l.target) {
        const k = normPath(l.target);
        const u = unresolved.get(k) ?? { target: l.target, from: new Set<string>() };
        u.from.add(n.id);
        unresolved.set(k, u);
      }
    }
    const ts = extractTags(n.content);
    tagsOf.set(n.id, ts);
    for (const t of ts) for (const a of tagAncestors(t)) tags.set(a, (tags.get(a) ?? new Set()).add(n.id));
    if (n.folder) { const parts = n.folder.split('/'); parts.forEach((_, i) => folders.add(parts.slice(0, i + 1).join('/'))); }
  }
  return { notes, byId, resolve, links, backlinks, unresolved, tags, tagsOf, folders: [...folders].sort() };
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
    const { line, text } = lineOf(src.content, l.start);
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
    if (n.id === noteId) continue;
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
    const src = changes.get(from) ?? index.byId.get(from)!.content;
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
}

export function buildGraph(index: VaultIndex, opts: GraphOptions = {}): Graph {
  const { showTags = false, showUnresolved = false, showOrphans = true, query, showDaily = true, showTemplates = false } = opts;
  let keep = index.notes.filter((n) => (showDaily || n.kind !== 'daily') && (showTemplates || n.kind !== 'template'));
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
      else if (!l.to && l.target && showUnresolved) {
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
    const lc = n.content.toLowerCase();
    const lines = n.content.split('\n');
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
export const excerpt = (n: Note, len = 160) => plainText(n.content).slice(0, len);

/** Notes with no links in or out (Obsidian "orphans"). */
export const orphans = (index: VaultIndex) => index.notes.filter((n) => !(index.links.get(n.id) ?? []).some((l) => l.to && l.to !== n.id) && !(index.backlinks.get(n.id) ?? []).some((l) => l.from !== n.id));
