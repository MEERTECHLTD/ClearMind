/**
 * Obsidian-flavoured Markdown parsing — pure, dependency-free, shared by every
 * client. Understands YAML frontmatter, [[wikilinks]] (with #heading, ^block
 * and |alias), ![[embeds]], #tags (nested a/b), headings and ^block ids.
 * Anything inside fenced code blocks or `inline code` is ignored.
 */

export type PropValue = string | number | boolean | null | string[];
export interface Frontmatter { props: Record<string, PropValue>; body: string; /** char offset where the body starts */ bodyStart: number; raw: string | null }

export interface WikiLink {
  /** Link target as written (path or title, no heading/alias). */
  target: string;
  heading?: string;
  block?: string;
  alias?: string;
  embed: boolean;
  /** Offsets of the whole `[[…]]` / `![[…]]` in the content. */
  start: number;
  end: number;
  line: number;
}

export interface Heading { level: number; text: string; line: number; slug: string }

// ------------------------------------------------------------------ masking

/**
 * Replace code (fenced blocks, inline code) and the frontmatter with spaces so
 * offsets are preserved while their contents are ignored by other scanners.
 */
export function maskCode(content: string, maskFrontmatter = true): string {
  const out = content.split('');
  const blank = (a: number, b: number) => { for (let i = a; i < b; i++) if (out[i] !== '\n') out[i] = ' '; };
  if (maskFrontmatter) { const fm = parseFrontmatter(content); if (fm.raw !== null) blank(0, fm.bodyStart); }
  // Fenced blocks ``` or ~~~ (until the matching fence or end of file).
  const fence = /^( {0,3})(`{3,}|~{3,})[^\n]*$/gm;
  let m: RegExpExecArray | null;
  while ((m = fence.exec(content))) {
    const marker = m[2];
    const close = new RegExp(`^ {0,3}${marker[0] === '`' ? '`' : '~'}{${marker.length},}\\s*$`, 'gm');
    close.lastIndex = m.index + m[0].length;
    const c = close.exec(content);
    const end = c ? c.index + c[0].length : content.length;
    blank(m.index, end);
    fence.lastIndex = end;
  }
  // Inline code spans (on the already-masked text so fences don't interfere).
  const masked = out.join('');
  const inline = /(`+)([^`\n]|[^`\n][\s\S]*?[^`\n])\1(?!`)/g;
  while ((m = inline.exec(masked))) blank(m.index, m.index + m[0].length);
  return out.join('');
}

const lineAt = (content: string, offset: number) => {
  let n = 0;
  for (let i = 0; i < offset && i < content.length; i++) if (content.charCodeAt(i) === 10) n++;
  return n;
};

// ------------------------------------------------------------------ frontmatter

function parseScalar(v: string): PropValue {
  const t = v.trim();
  if (t === '' || t === '~' || t === 'null') return null;
  if (t === 'true') return true;
  if (t === 'false') return false;
  if (/^-?\d+(\.\d+)?$/.test(t)) return Number(t);
  if ((t.startsWith('"') && t.endsWith('"')) || (t.startsWith("'") && t.endsWith("'"))) return t.slice(1, -1);
  if (t.startsWith('[') && t.endsWith(']')) return t.slice(1, -1).split(',').map((x) => String(parseScalar(x) ?? '').trim()).filter(Boolean);
  return t;
}

/** Minimal YAML frontmatter (scalars, inline lists, `- item` lists) — what Obsidian Properties use. */
export function parseFrontmatter(content: string): Frontmatter {
  const m = /^---[ \t]*\r?\n([\s\S]*?)\r?\n---[ \t]*(\r?\n|$)/.exec(content);
  if (!m) return { props: {}, body: content, bodyStart: 0, raw: null };
  const props: Record<string, PropValue> = {};
  let listKey: string | null = null;
  for (const line of m[1].split(/\r?\n/)) {
    const item = /^\s*-\s+(.*)$/.exec(line);
    if (item && listKey) { const cur = props[listKey]; props[listKey] = [...(Array.isArray(cur) ? cur : []), String(parseScalar(item[1]) ?? '')]; continue; }
    const kv = /^([A-Za-z0-9_\- ]+):\s*(.*)$/.exec(line);
    if (!kv) continue;
    const key = kv[1].trim();
    // `key:` with nothing after it is null until `- item` lines turn it into a list.
    if (kv[2].trim() === '') { props[key] = null; listKey = key; } else { props[key] = parseScalar(kv[2]); listKey = null; }
  }
  return { props, body: content.slice(m[0].length), bodyStart: m[0].length, raw: m[1] };
}

const yamlValue = (v: PropValue): string => {
  if (v === null) return '';
  if (Array.isArray(v)) return v.length ? '\n' + v.map((x) => `  - ${x}`).join('\n') : '[]';
  if (typeof v === 'string' && (/^[\s]|[\s]$|^[\[{>|*&!%@`#'"]|: | #/.test(v) || v === '' || /^(true|false|null|-?\d+(\.\d+)?)$/.test(v))) return JSON.stringify(v);
  return String(v);
};

/** Write properties back as frontmatter (empty props remove the block). */
export function setFrontmatter(content: string, props: Record<string, PropValue>): string {
  const { body } = parseFrontmatter(content);
  const keys = Object.keys(props);
  if (!keys.length) return body;
  const yaml = keys.map((k) => { const v = yamlValue(props[k]); return v.startsWith('\n') ? `${k}:${v}` : `${k}: ${v}`.trimEnd(); }).join('\n');
  return `---\n${yaml}\n---\n${body}`;
}

// ------------------------------------------------------------------ links

const LINK_RE = /(!?)\[\[([^\[\]\n]+?)\]\]/g;

export function parseLinkInner(inner: string): Pick<WikiLink, 'target' | 'heading' | 'block' | 'alias'> {
  let s = inner;
  let alias: string | undefined;
  const pipe = s.indexOf('|');
  if (pipe >= 0) { alias = s.slice(pipe + 1).trim() || undefined; s = s.slice(0, pipe); }
  let heading: string | undefined;
  let block: string | undefined;
  const hash = s.indexOf('#');
  if (hash >= 0) {
    const frag = s.slice(hash + 1).trim();
    s = s.slice(0, hash);
    if (frag.startsWith('^')) block = frag.slice(1); else heading = frag || undefined;
  }
  return { target: s.trim(), heading, block, alias };
}

export function extractLinks(content: string): WikiLink[] {
  const masked = maskCode(content);
  const out: WikiLink[] = [];
  let m: RegExpExecArray | null;
  LINK_RE.lastIndex = 0;
  while ((m = LINK_RE.exec(masked))) {
    const inner = content.slice(m.index + m[1].length + 2, m.index + m[0].length - 2);
    out.push({ ...parseLinkInner(inner), embed: m[1] === '!', start: m.index, end: m.index + m[0].length, line: lineAt(content, m.index) });
  }
  // Markdown links to local notes: [text](Note%20Name.md)
  const md = /(!?)\[([^\]\n]*)\]\(([^)\s]+?\.md)(#[^)\s]*)?\)/g;
  while ((m = md.exec(masked))) {
    const raw = content.slice(m.index, m.index + m[0].length);
    const mm = /(!?)\[([^\]\n]*)\]\(([^)\s]+?\.md)(#[^)\s]*)?\)/.exec(raw)!;
    if (/^[a-z]+:\/\//i.test(mm[3])) continue;
    const target = decodeURIComponent(mm[3]).replace(/\.md$/i, '');
    const frag = mm[4] ? decodeURIComponent(mm[4].slice(1)) : undefined;
    out.push({ target, heading: frag && !frag.startsWith('^') ? frag : undefined, block: frag?.startsWith('^') ? frag.slice(1) : undefined, alias: mm[2] || undefined, embed: mm[1] === '!', start: m.index, end: m.index + m[0].length, line: lineAt(content, m.index) });
  }
  return out.sort((a, b) => a.start - b.start);
}

// ------------------------------------------------------------------ tags

// #tag — letters, digits, _ - / ; must contain a non-digit; not part of a word, URL or heading marker.
const TAG_RE = /(^|[\s(,;!?])#([\p{L}\p{N}_\-/]*[\p{L}_\-/][\p{L}\p{N}_\-/]*)/gu;

const normTag = (t: string) => t.replace(/^#/, '').replace(/\/+$/, '').trim();

/** Tags in the body (#a, #a/b) plus frontmatter `tags`/`tag`. Lower-cased, unique, without '#'. */
export function extractTags(content: string): string[] {
  const { props } = parseFrontmatter(content);
  const masked = maskCode(content);
  const set = new Map<string, string>();
  const add = (t: string) => { const n = normTag(t); if (n && !/^\d+$/.test(n)) { const k = n.toLowerCase(); if (!set.has(k)) set.set(k, n); } };
  let m: RegExpExecArray | null;
  TAG_RE.lastIndex = 0;
  while ((m = TAG_RE.exec(masked))) add(m[2]);
  for (const key of ['tags', 'tag']) {
    const v = props[key];
    if (Array.isArray(v)) v.forEach((x) => String(x).split(/[ ,]+/).forEach(add));
    else if (typeof v === 'string') v.split(/[ ,]+/).forEach(add);
  }
  return [...set.keys()];
}

/** Every prefix of nested tags: "a/b/c" → ["a", "a/b", "a/b/c"]. */
export const tagAncestors = (tag: string) => tag.split('/').map((_, i, a) => a.slice(0, i + 1).join('/'));

// ------------------------------------------------------------------ headings, blocks, tasks

export const slugify = (s: string) => s.toLowerCase().trim().replace(/[^\p{L}\p{N}\s-]/gu, '').replace(/\s+/g, '-');

export function extractHeadings(content: string): Heading[] {
  const masked = maskCode(content);
  const out: Heading[] = [];
  masked.split('\n').forEach((l, i) => {
    const m = /^(#{1,6})\s+(.+?)\s*#*\s*$/.exec(l);
    if (m) out.push({ level: m[1].length, text: m[2], line: i, slug: slugify(m[2]) });
  });
  return out;
}

/** `^block-id` markers at the end of a line → { id: line }. */
export function extractBlocks(content: string): Record<string, number> {
  const out: Record<string, number> = {};
  maskCode(content).split('\n').forEach((l, i) => { const m = /\s\^([A-Za-z0-9-]+)\s*$/.exec(l); if (m) out[m[1]] = i; });
  return out;
}

export interface NoteTask { line: number; text: string; done: boolean }
export function extractTasks(content: string): NoteTask[] {
  const out: NoteTask[] = [];
  maskCode(content).split('\n').forEach((l, i) => { const m = /^\s*[-*+]\s+\[([ xX])\]\s+(.*)$/.exec(l); if (m) out.push({ line: i, text: m[2], done: m[1] !== ' ' }); });
  return out;
}

/** The section under a heading (until the next heading of the same or higher level). */
export function sectionUnder(content: string, heading: string): string | null {
  const lines = content.split('\n');
  const hs = extractHeadings(content);
  const want = slugify(heading);
  const h = hs.find((x) => x.slug === want || x.text.toLowerCase() === heading.toLowerCase());
  if (!h) return null;
  const next = hs.find((x) => x.line > h.line && x.level <= h.level);
  return lines.slice(h.line, next ? next.line : lines.length).join('\n').trimEnd();
}

/** The paragraph / list item carrying `^id`. */
export function blockText(content: string, id: string): string | null {
  const line = extractBlocks(content)[id];
  if (line === undefined) return null;
  const lines = content.split('\n');
  let a = line;
  // A list item is its own block; a paragraph extends up to a blank line, heading or list item.
  const boundary = /^\s*([-*+]|\d+\.)\s|^#{1,6}\s|^\s*$/;
  if (!/^\s*([-*+]|\d+\.)\s/.test(lines[line])) while (a > 0 && !boundary.test(lines[a - 1])) a--;
  return lines.slice(a, line + 1).join('\n').replace(/\s\^[A-Za-z0-9-]+\s*$/, '');
}

/** Plain-text excerpt (no frontmatter / markdown noise) for previews & search snippets. */
export function plainText(content: string): string {
  return parseFrontmatter(content).body
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/!?\[\[([^\]|]+)\|?([^\]]*)\]\]/g, (_, t, a) => a || t)
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/[*_~`>]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}
