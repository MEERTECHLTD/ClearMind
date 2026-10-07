/**
 * Pure, framework-free Markdown helpers used by the web note editor (Live
 * Preview decorations) and the reading view: inline span scanning, block line
 * classification, callout headers, embed resolution, task lines, comments.
 * No DOM, no CodeMirror — unit tested in markdown.test.ts.
 */
import { maskCode, parseFrontmatter, parseLinkInner, sectionUnder, blockText } from './parse';

// ------------------------------------------------------------------ inline spans

export type InlineKind =
  | 'code' | 'wikilink' | 'embed' | 'link' | 'image' | 'url'
  | 'bold' | 'italic' | 'bolditalic' | 'strike' | 'highlight'
  | 'tag' | 'comment' | 'blockid' | 'footnote';

export interface InlineSpan {
  kind: InlineKind;
  /** Whole span, offsets into the line. */
  from: number;
  to: number;
  /** Visible content (without markers). */
  contentFrom: number;
  contentTo: number;
  /** wikilink/embed: parsed parts; link/image/url: href; tag: tag name. */
  target?: string;
  heading?: string;
  block?: string;
  alias?: string;
  href?: string;
  tag?: string;
}

const MASK = 'a';
const fill = (s: string, a: number, b: number, ch = MASK) => s.slice(0, a) + ch.repeat(Math.max(0, b - a)) + s.slice(b);

export const TAG_BODY = /[\p{L}\p{N}_\-/]*[\p{L}_\-/][\p{L}\p{N}_\-/]*/u;
const TAG_SCAN = /(^|[\s(,;!?])#([\p{L}\p{N}_\-/]*[\p{L}_\-/][\p{L}\p{N}_\-/]*)/gu;

/**
 * Scan one line of Markdown for inline constructs. Spans may nest (bold around a
 * link) but never partially overlap. Code spans hide everything inside them.
 */
export function scanInline(line: string): InlineSpan[] {
  const out: InlineSpan[] = [];
  let s = line;
  let m: RegExpExecArray | null;

  // 1. inline code
  const code = /(`+)([^`]|[^`][\s\S]*?[^`])\1(?!`)/g;
  while ((m = code.exec(line))) {
    const n = m[1].length;
    out.push({ kind: 'code', from: m.index, to: m.index + m[0].length, contentFrom: m.index + n, contentTo: m.index + m[0].length - n });
    s = fill(s, m.index, m.index + m[0].length, ' ');
  }
  // 2. %%comments%%
  const comment = /%%[\s\S]*?%%/g;
  while ((m = comment.exec(s))) {
    out.push({ kind: 'comment', from: m.index, to: m.index + m[0].length, contentFrom: m.index + 2, contentTo: m.index + m[0].length - 2 });
    s = fill(s, m.index, m.index + m[0].length, ' ');
  }
  // 3. wikilinks / embeds
  const wiki = /(!?)\[\[([^\[\]\n]+?)\]\]/g;
  while ((m = wiki.exec(s))) {
    const embed = m[1] === '!';
    const innerFrom = m.index + m[1].length + 2;
    const inner = line.slice(innerFrom, m.index + m[0].length - 2);
    const p = parseLinkInner(inner);
    // Visible part: the alias if any, otherwise the whole inner text.
    const pipe = inner.indexOf('|');
    const contentFrom = pipe >= 0 ? innerFrom + pipe + 1 : innerFrom;
    out.push({ kind: embed ? 'embed' : 'wikilink', from: m.index, to: m.index + m[0].length, contentFrom, contentTo: m.index + m[0].length - 2, ...p });
    s = fill(s, m.index, m.index + m[0].length);
  }
  // 4. markdown links / images  [text](url "title")
  const md = /(!?)\[([^\]\n]*)\]\(\s*<?([^()\s<>]+(?:\([^()\s]*\)[^()\s<>]*)*)>?(?:\s+"[^"]*")?\s*\)/g;
  while ((m = md.exec(s))) {
    const image = m[1] === '!';
    const textFrom = m.index + m[1].length + 1;
    out.push({ kind: image ? 'image' : 'link', from: m.index, to: m.index + m[0].length, contentFrom: textFrom, contentTo: textFrom + m[2].length, href: line.slice(m.index, m.index + m[0].length).match(/\]\(\s*<?([^\s>)]+(?:\([^()\s]*\)[^()\s<>]*)*)/)?.[1] ?? m[3] });
    // keep the link text scannable for emphasis, mask the url part
    s = fill(s, textFrom + m[2].length, m.index + m[0].length);
    s = fill(s, m.index, textFrom);
  }
  // 5. bare URLs
  const url = /(^|[\s(<])(https?:\/\/[^\s<>()]+[^\s<>().,;:!?'"])/g;
  while ((m = url.exec(s))) {
    const from = m.index + m[1].length;
    out.push({ kind: 'url', from, to: from + m[2].length, contentFrom: from, contentTo: from + m[2].length, href: line.slice(from, from + m[2].length) });
    s = fill(s, from, from + m[2].length);
  }
  // 6. footnote refs [^1]
  const fn = /\[\^([^\]\s]+)\](?!:)/g;
  while ((m = fn.exec(s))) {
    out.push({ kind: 'footnote', from: m.index, to: m.index + m[0].length, contentFrom: m.index + 2, contentTo: m.index + m[0].length - 1, target: m[1] });
    s = fill(s, m.index, m.index + m[0].length);
  }
  // 7. block id at the end of the line
  const bid = /\s\^([A-Za-z0-9-]+)\s*$/.exec(s);
  if (bid) {
    const from = bid.index + 1;
    out.push({ kind: 'blockid', from, to: from + 1 + bid[1].length, contentFrom: from + 1, contentTo: from + 1 + bid[1].length, target: bid[1] });
    s = fill(s, from, from + 1 + bid[1].length);
  }
  // 8. tags
  TAG_SCAN.lastIndex = 0;
  while ((m = TAG_SCAN.exec(s))) {
    const from = m.index + m[1].length;
    if (/^\d+$/.test(m[2])) continue;
    // Not a heading marker: "# Title" has a space so never matches; "#tag" at line start is a tag.
    out.push({ kind: 'tag', from, to: from + 1 + m[2].length, contentFrom: from, contentTo: from + 1 + m[2].length, tag: m[2].replace(/\/+$/, '') });
  }
  for (const t of out) if (t.kind === 'tag') s = fill(s, t.from, t.to);

  // 9. emphasis — each pass masks its markers so later passes don't re-use them.
  const emph: [InlineKind, RegExp, number][] = [
    ['bolditalic', /(\*\*\*|___)(?=\S)([^\n]*?\S)\1/g, 3],
    ['bold', /(\*\*|__)(?=\S)([^\n]*?\S)\1/g, 2],
    ['italic', /(?<![*\\])\*(?=[^\s*])([^\n*]*?[^\s*\\])?\*(?!\*)/g, 1],
    ['italic', /(?<![\p{L}\p{N}_\\])_(?=[^\s_])([^\n_]*?[^\s_\\])?_(?![\p{L}\p{N}_])/gu, 1],
    ['strike', /~~(?=\S)([^\n]*?\S)~~/g, 2],
    ['highlight', /==(?=\S)([^\n]*?\S)==/g, 2],
  ];
  for (const [kind, re, n] of emph) {
    re.lastIndex = 0;
    const found: InlineSpan[] = [];
    while ((m = re.exec(s))) {
      if (kind === 'bold' && m[1] === '__' && (/[\p{L}\p{N}]/u.test(s[m.index - 1] ?? '') || /[\p{L}\p{N}]/u.test(s[m.index + m[0].length] ?? ''))) continue;
      const span: InlineSpan = { kind, from: m.index, to: m.index + m[0].length, contentFrom: m.index + n, contentTo: m.index + m[0].length - n };
      // Must not partially overlap an existing span (e.g. a link).
      if (out.some((o) => crosses(o, span))) continue;
      found.push(span);
    }
    for (const f of found) { out.push(f); s = fill(s, f.from, f.contentFrom, ' '); s = fill(s, f.contentTo, f.to, ' '); }
  }
  return out.sort((a, b) => a.from - b.from || b.to - a.to);
}

const crosses = (a: { from: number; to: number }, b: { from: number; to: number }) =>
  (a.from < b.from && b.from < a.to && a.to < b.to) || (b.from < a.from && a.from < b.to && b.to < a.to);

// ------------------------------------------------------------------ block lines

export interface LineInfo {
  kind: 'heading' | 'task' | 'bullet' | 'ordered' | 'quote' | 'hr' | 'blank' | 'text';
  /** heading level */
  level?: number;
  /** End of the leading markup to hide (e.g. "## ", "> ", "- [ ] "). */
  markerFrom?: number;
  markerTo?: number;
  checked?: boolean;
  /** Offset of the char between [ ] in a task. */
  checkAt?: number;
  /** Number of `>` levels at the start of the line. */
  quoteDepth?: number;
  /** Text after any quote markers. */
  quoteTo?: number;
  callout?: CalloutHeader | null;
}

export function lineInfo(text: string): LineInfo {
  if (!text.trim()) return { kind: 'blank' };
  let quoteDepth = 0;
  let pos = 0;
  const q = /^ {0,3}>[ \t]?/;
  let rest = text;
  let qm: RegExpExecArray | null;
  while ((qm = q.exec(rest))) { quoteDepth++; pos += qm[0].length; rest = text.slice(pos); }
  const base: LineInfo = { kind: 'text', quoteDepth, quoteTo: pos };
  if (quoteDepth) {
    const callout = parseCalloutHeader(rest);
    if (callout) return { ...base, kind: 'quote', callout, markerFrom: 0, markerTo: pos };
  }
  if (/^ {0,3}([-*_])([ \t]*\1){2,}[ \t]*$/.test(rest)) return { ...base, kind: 'hr', markerFrom: pos, markerTo: text.length };
  const h = /^(#{1,6})([ \t]+|$)/.exec(rest);
  if (h) return { ...base, kind: 'heading', level: h[1].length, markerFrom: pos, markerTo: pos + h[0].length };
  const task = /^([ \t]*)([-*+]|\d+[.)])[ \t]+\[([ xX\-/>])\]([ \t]+|$)/.exec(rest);
  if (task) {
    const markerFrom = pos + task[1].length;
    const checkAt = pos + task[0].indexOf('[') + 1;
    return { ...base, kind: 'task', markerFrom, markerTo: pos + task[0].length, checked: task[3] !== ' ', checkAt };
  }
  const bullet = /^([ \t]*)([-*+])([ \t]+|$)/.exec(rest);
  if (bullet) return { ...base, kind: 'bullet', markerFrom: pos + bullet[1].length, markerTo: pos + bullet[0].length };
  const ord = /^([ \t]*)(\d+[.)])([ \t]+|$)/.exec(rest);
  if (ord) return { ...base, kind: 'ordered', markerFrom: pos + ord[1].length, markerTo: pos + ord[0].length };
  if (quoteDepth) return { ...base, kind: 'quote', markerFrom: 0, markerTo: pos };
  return base;
}

/** Toggle the checkbox on a 0-based line (supports `> - [ ]` and ordered tasks). Returns the content unchanged if no task. */
export function toggleTaskLine(content: string, line: number): string {
  const lines = content.split('\n');
  const l = lines[line];
  if (l === undefined) return content;
  const info = lineInfo(l);
  if (info.kind !== 'task' || info.checkAt === undefined) return content;
  lines[line] = l.slice(0, info.checkAt) + (info.checked ? ' ' : 'x') + l.slice(info.checkAt + 1);
  return lines.join('\n');
}

/** Make the line a task / toggle it: "text" → "- [ ] text", "- x" → "- [ ] x", "- [ ] x" ↔ "- [x] x". */
export function cycleTaskLine(text: string): string {
  const info = lineInfo(text);
  if (info.kind === 'task' && info.checkAt !== undefined) return text.slice(0, info.checkAt) + (info.checked ? ' ' : 'x') + text.slice(info.checkAt + 1);
  if (info.kind === 'bullet' || info.kind === 'ordered') return text.slice(0, info.markerTo!) + '[ ] ' + text.slice(info.markerTo!);
  const q = info.quoteTo ?? 0;
  const indent = /^[ \t]*/.exec(text.slice(q))![0];
  return text.slice(0, q) + indent + '- [ ] ' + text.slice(q + indent.length);
}

/**
 * 0-based source lines of every task checkbox in document order (what a
 * GFM renderer emits, including tasks inside blockquotes/callouts), ignoring
 * code blocks and the frontmatter.
 */
export function taskLines(content: string): number[] {
  const out: number[] = [];
  maskCode(content).split('\n').forEach((l, i) => { if (lineInfo(l).kind === 'task' && /\[[ xX]\]/.test(l)) out.push(i); });
  return out;
}

// ------------------------------------------------------------------ callouts

export interface CalloutType { key: string; label: string; color: string; icon: string }

const C = (key: string, color: string, icon: string, label = key[0].toUpperCase() + key.slice(1)): CalloutType => ({ key, label, color, icon });

/** Obsidian's callout types (canonical key → colour (rgb triple) + icon name). */
export const CALLOUTS: Record<string, CalloutType> = {
  note: C('note', '68, 138, 255', 'pencil'),
  abstract: C('abstract', '0, 176, 255', 'clipboard'),
  info: C('info', '0, 184, 212', 'info'),
  todo: C('todo', '0, 184, 212', 'check-circle'),
  tip: C('tip', '0, 191, 165', 'flame'),
  success: C('success', '8, 185, 78', 'check'),
  question: C('question', '236, 117, 0', 'help'),
  warning: C('warning', '236, 117, 0', 'alert'),
  failure: C('failure', '233, 49, 71', 'x'),
  danger: C('danger', '233, 49, 71', 'zap'),
  bug: C('bug', '233, 49, 71', 'bug'),
  example: C('example', '120, 82, 238', 'list'),
  quote: C('quote', '158, 158, 158', 'quote'),
};

const CALLOUT_ALIASES: Record<string, string> = {
  summary: 'abstract', tldr: 'abstract', hint: 'tip', important: 'tip', check: 'success', done: 'success',
  help: 'question', faq: 'question', caution: 'warning', attention: 'warning', fail: 'failure', missing: 'failure',
  error: 'danger', cite: 'quote',
};

export function calloutType(raw: string): CalloutType {
  const k = raw.toLowerCase();
  const key = CALLOUTS[k] ? k : CALLOUT_ALIASES[k];
  return key ? CALLOUTS[key] : { ...CALLOUTS.note, key: k, label: raw ? raw[0].toUpperCase() + raw.slice(1) : 'Note' };
}

export interface CalloutHeader { type: CalloutType; rawType: string; fold: '+' | '-' | null; title: string }

/** Parse `[!type]± Title` (the text after the `> `). */
export function parseCalloutHeader(text: string): CalloutHeader | null {
  const m = /^\[!([\w-]+)\]([+-]?)[ \t]*(.*)$/.exec(text.trim());
  if (!m) return null;
  const type = calloutType(m[1]);
  return { type, rawType: m[1], fold: (m[2] || null) as CalloutHeader['fold'], title: m[3].trim() || type.label };
}

// ------------------------------------------------------------------ comments, embeds

/** Remove Obsidian %%comments%% (inline and multi-line) outside code. */
export function stripComments(content: string, keepLines = false): string {
  const masked = maskCode(content, false);
  let out = '';
  let last = 0;
  const re = /%%[\s\S]*?%%/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(masked))) { out += content.slice(last, m.index) + (keepLines ? m[0].replace(/[^\n]/g, ' ') : ''); last = m.index + m[0].length; }
  return out + content.slice(last);
}

const IMAGE_EXT = /\.(png|jpe?g|gif|webp|svg|bmp|avif|ico)(\?.*)?$/i;
export const isImageTarget = (target: string) => IMAGE_EXT.test(target.trim()) || /^data:image\//i.test(target.trim());
export const isExternalUrl = (s: string) => /^(https?:|mailto:|data:)/i.test(s.trim());

export interface EmbedSource { id: string; title: string; content: string }
export type ResolveFn = (target: string, fromId?: string) => EmbedSource | null;

export interface ResolvedEmbed {
  kind: 'note' | 'image' | 'missing' | 'cycle' | 'depth';
  note?: EmbedSource;
  /** Markdown to render inside the embed box. */
  markdown?: string;
  src?: string;
  width?: number;
  height?: number;
}

/**
 * What an `![[embed]]` shows: an image, the target note's body (no
 * frontmatter), a `#heading` section, or a `#^block`. Guards cycles and depth.
 */
export function resolveEmbed(
  link: { target: string; heading?: string; block?: string; alias?: string },
  resolve: ResolveFn, ctx: { fromId?: string; depth: number; maxDepth?: number; visited: ReadonlySet<string> },
): ResolvedEmbed {
  if (isImageTarget(link.target)) {
    const size = /^(\d+)(?:x(\d+))?$/.exec(link.alias?.trim() ?? '');
    return { kind: 'image', src: link.target.trim(), width: size ? Number(size[1]) : undefined, height: size?.[2] ? Number(size[2]) : undefined };
  }
  const note = resolve(link.target, ctx.fromId);
  if (!note) return { kind: 'missing' };
  if (ctx.depth >= (ctx.maxDepth ?? 3)) return { kind: 'depth', note };
  // A note may embed its own sections (different fragment), but never itself whole.
  if (ctx.visited.has(note.id) && !(note.id === ctx.fromId && (link.heading || link.block))) return { kind: 'cycle', note };
  let markdown: string | null;
  if (link.block) markdown = blockText(note.content, link.block);
  else if (link.heading) markdown = sectionUnder(note.content, link.heading);
  else markdown = parseFrontmatter(note.content).body;
  return { kind: 'note', note, markdown: markdown ?? `*Missing ${link.block ? 'block' : 'heading'} "${link.block ? '^' + link.block : link.heading}"*` };
}

/** How a [[link]] is displayed when no alias is given: "Note > Heading", "Heading", "Note > ^block". */
export function linkDisplay(l: { target: string; heading?: string; block?: string; alias?: string }): string {
  if (l.alias) return l.alias;
  const frag = l.heading ?? (l.block ? '^' + l.block : '');
  if (!l.target) return frag;
  return frag ? `${l.target} > ${frag}` : l.target;
}

/** Context for `[[` autocompletion: where the link starts and what part is being typed. */
export interface LinkCompletionContext {
  /** Offset (in the text before the cursor) where `[[` starts. */
  start: number;
  embed: boolean;
  part: 'target' | 'heading' | 'block' | 'alias';
  target: string;
  /** The text being completed for the current part. */
  query: string;
  /** Offset where the current part's query begins. */
  queryFrom: number;
}

/** Analyse the text before the cursor on the current line for an open `[[…`. */
export function linkCompletionContext(before: string): LinkCompletionContext | null {
  const open = before.lastIndexOf('[[');
  if (open < 0) return null;
  const inner = before.slice(open + 2);
  if (inner.includes(']]') || inner.includes('\n') || inner.includes('[')) return null;
  const embed = before[open - 1] === '!';
  const pipe = inner.indexOf('|');
  if (pipe >= 0) return { start: open, embed, part: 'alias', target: parseLinkInner(inner.slice(0, pipe)).target, query: inner.slice(pipe + 1), queryFrom: open + 2 + pipe + 1 };
  const hash = inner.indexOf('#');
  if (hash >= 0) {
    const target = inner.slice(0, hash).trim();
    if (inner[hash + 1] === '^') return { start: open, embed, part: 'block', target, query: inner.slice(hash + 2), queryFrom: open + 2 + hash + 2 };
    return { start: open, embed, part: 'heading', target, query: inner.slice(hash + 1), queryFrom: open + 2 + hash + 1 };
  }
  return { start: open, embed, part: 'target', target: inner, query: inner, queryFrom: open + 2 };
}

/** `#tag` being typed right before the cursor (after whitespace / line start), or null. */
export function tagCompletionContext(before: string): { from: number; query: string } | null {
  const m = /(^|[\s(,;!?])#([\p{L}\p{N}_\-/]*)$/u.exec(before);
  if (!m) return null;
  // "# " at line start is a heading, but "#" alone at line start could be either — still offer tags.
  return { from: m.index + m[1].length, query: m[2] };
}

/** Minimal single-span diff between two strings (common prefix/suffix). */
export function minimalChange(a: string, b: string): { from: number; to: number; insert: string } | null {
  if (a === b) return null;
  let start = 0;
  const max = Math.min(a.length, b.length);
  while (start < max && a.charCodeAt(start) === b.charCodeAt(start)) start++;
  let ea = a.length, eb = b.length;
  while (ea > start && eb > start && a.charCodeAt(ea - 1) === b.charCodeAt(eb - 1)) { ea--; eb--; }
  return { from: start, to: ea, insert: b.slice(start, eb) };
}

// ------------------------------------------------------------------ properties

export type PropType = 'text' | 'list' | 'number' | 'checkbox' | 'date' | 'datetime';
const LIST_KEYS = new Set(['tags', 'tag', 'aliases', 'alias', 'cssclasses', 'cssclass']);

/** Infer the Properties-panel widget for a frontmatter value. */
export function inferPropType(key: string, v: unknown): PropType {
  if (Array.isArray(v) || LIST_KEYS.has(key.toLowerCase())) return 'list';
  if (typeof v === 'boolean') return 'checkbox';
  if (typeof v === 'number') return 'number';
  if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v)) return 'date';
  if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(:\d{2})?$/.test(v)) return 'datetime';
  return 'text';
}

/** Convert a value when the user changes a property's type. */
export function convertPropValue(v: unknown, to: PropType): string | number | boolean | string[] | null {
  const str = Array.isArray(v) ? v.join(', ') : v === null || v === undefined ? '' : String(v);
  switch (to) {
    case 'list': return Array.isArray(v) ? v.map(String) : str ? str.split(/\s*,\s*/).filter(Boolean) : [];
    case 'checkbox': return v === true || str === 'true';
    case 'number': { const n = Number(str); return str && !Number.isNaN(n) ? n : 0; }
    case 'date': return /^\d{4}-\d{2}-\d{2}/.test(str) ? str.slice(0, 10) : new Date().toISOString().slice(0, 10);
    case 'datetime': return /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}/.test(str) ? str.slice(0, 16).replace(' ', 'T') : new Date().toISOString().slice(0, 16);
    default: return str;
  }
}

/** Rename a key keeping its position. */
export function renameProp<T>(props: Record<string, T>, from: string, to: string): Record<string, T> {
  const out: Record<string, T> = {};
  for (const [k, v] of Object.entries(props)) out[k === from ? to : k] = v;
  return out;
}
