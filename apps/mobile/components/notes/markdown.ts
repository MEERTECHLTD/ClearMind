/**
 * Pure Markdown → block/inline tokens for the mobile reading view (rendered by
 * MarkdownBlocks.tsx with RN <Text>/<View>). Obsidian flavour: [[wikilinks]],
 * ![[embeds]], #tags, ==highlight==, callouts, task lists, %%comments%%.
 * Inline scanning reuses the shared, tested scanner. No React Native imports.
 *
 * Every block keeps its 0-based source line in the full note content so the
 * renderer can edit the source (e.g. toggle a task checkbox).
 */
import { parseFrontmatter, slugify, type PropValue } from '@clearmind/shared/notes';
import { scanInline, stripComments, parseCalloutHeader, type InlineSpan, type CalloutHeader } from '@clearmind/shared/notes/markdown';

// ------------------------------------------------------------------ inline

export type EmphasisKind = 'bold' | 'italic' | 'bolditalic' | 'strike' | 'highlight';

export type Inline =
  | { t: 'text'; text: string }
  | { t: EmphasisKind; children: Inline[] }
  | { t: 'code'; text: string }
  | { t: 'wikilink'; target: string; heading?: string; block?: string; alias?: string; text: string }
  | { t: 'embed'; target: string; heading?: string; block?: string; alias?: string; text: string }
  | { t: 'link'; href: string; children: Inline[] }
  | { t: 'image'; href: string; alt: string }
  | { t: 'tag'; tag: string; text: string };

const EMPH = new Set(['bold', 'italic', 'bolditalic', 'strike', 'highlight']);

/** Visible text of a wikilink without alias: "Note", "Note > Heading", "Heading". */
export function wikiDisplay(s: { target: string; heading?: string; block?: string; alias?: string }): string {
  if (s.alias) return s.alias;
  const frag = s.heading ?? (s.block ? '^' + s.block : '');
  if (!s.target) return frag;
  return frag ? `${s.target} > ${frag}` : s.target;
}

function build(line: string, spans: InlineSpan[], from: number, to: number): Inline[] {
  const out: Inline[] = [];
  let pos = from;
  const pushText = (a: number, b: number) => {
    if (b <= a) return;
    const last = out[out.length - 1];
    if (last?.t === 'text') last.text += line.slice(a, b); else out.push({ t: 'text', text: line.slice(a, b) });
  };
  let i = 0;
  while (i < spans.length) {
    const s = spans[i];
    if (s.from < pos || s.to > to) { i++; continue; }
    // spans nested inside s
    const inner: InlineSpan[] = [];
    let j = i + 1;
    while (j < spans.length && spans[j].from < s.to) { if (spans[j].to <= s.to) inner.push(spans[j]); j++; }
    pushText(pos, s.from);
    if (EMPH.has(s.kind)) out.push({ t: s.kind as EmphasisKind, children: build(line, inner, s.contentFrom, s.contentTo) });
    else if (s.kind === 'code') out.push({ t: 'code', text: line.slice(s.contentFrom, s.contentTo) });
    else if (s.kind === 'wikilink' || s.kind === 'embed') {
      const l = { target: s.target ?? '', heading: s.heading, block: s.block, alias: s.alias };
      out.push({ t: s.kind, ...l, text: wikiDisplay(l) });
    } else if (s.kind === 'link') out.push({ t: 'link', href: s.href ?? '', children: build(line, inner, s.contentFrom, s.contentTo) });
    else if (s.kind === 'url') out.push({ t: 'link', href: s.href ?? '', children: [{ t: 'text', text: line.slice(s.from, s.to) }] });
    else if (s.kind === 'image') out.push({ t: 'image', href: s.href ?? '', alt: line.slice(s.contentFrom, s.contentTo) });
    else if (s.kind === 'tag') out.push({ t: 'tag', tag: s.tag ?? '', text: line.slice(s.from, s.to) });
    else if (s.kind === 'footnote') out.push({ t: 'text', text: `[${s.target}]` });
    // comment / blockid: hidden
    pos = s.to;
    i = j;
  }
  pushText(pos, to);
  return out;
}

/** Tokenise one line (or a multi-line paragraph joined with \n) into inline nodes. */
export function parseInline(text: string): Inline[] {
  // Scan per line so offsets stay simple, re-joining with newline text nodes.
  const out: Inline[] = [];
  text.split('\n').forEach((line, i) => {
    if (i) out.push({ t: 'text', text: '\n' });
    out.push(...build(line, scanInline(line), 0, line.length));
  });
  // merge adjacent text nodes
  const merged: Inline[] = [];
  for (const n of out) {
    const last = merged[merged.length - 1];
    if (n.t === 'text' && last?.t === 'text') last.text += n.text; else merged.push(n);
  }
  return merged;
}

// ------------------------------------------------------------------ blocks

export type Block =
  | { t: 'heading'; level: number; text: string; slug: string; line: number }
  | { t: 'paragraph'; text: string; line: number }
  | { t: 'item'; ordered: boolean; marker: string; depth: number; text: string; line: number; task?: { checked: boolean } }
  | { t: 'quote'; children: Block[]; line: number }
  | { t: 'callout'; callout: CalloutHeader; children: Block[]; line: number }
  | { t: 'code'; lang: string; text: string; line: number }
  | { t: 'hr'; line: number }
  | { t: 'embed'; target: string; heading?: string; block?: string; alias?: string; line: number }
  | { t: 'table'; header: string[]; rows: string[][]; line: number };

interface Src { text: string; line: number }

const FENCE = /^ {0,3}(`{3,}|~{3,})\s*([^\s`]*)/;
const HEADING = /^ {0,3}(#{1,6})[ \t]+(.*?)[ \t]*#*[ \t]*$/;
const HR = /^ {0,3}([-*_])([ \t]*\1){2,}[ \t]*$/;
const ITEM = /^([ \t]*)([-*+]|\d+[.)])[ \t]+(.*)$/;
const TASK = /^\[([ xX\-/>])\][ \t]+(.*)$|^\[([ xX\-/>])\]$/;
const QUOTE = /^ {0,3}>[ \t]?/;
const EMBED_LINE = /^\s*!\[\[([^\[\]\n]+?)\]\]\s*$/;
const TABLE_SEP = /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/;

const splitRow = (l: string) => l.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((c) => c.trim());
const isBreak = (l: string) => !l.trim() || HEADING.test(l) || HR.test(l) || ITEM.test(l) || QUOTE.test(l) || FENCE.test(l) || EMBED_LINE.test(l);

function parseEmbedInner(inner: string) {
  const pipe = inner.indexOf('|');
  const alias = pipe >= 0 ? inner.slice(pipe + 1).trim() || undefined : undefined;
  let s = pipe >= 0 ? inner.slice(0, pipe) : inner;
  let heading: string | undefined, block: string | undefined;
  const hash = s.indexOf('#');
  if (hash >= 0) { const f = s.slice(hash + 1).trim(); s = s.slice(0, hash); if (f.startsWith('^')) block = f.slice(1); else heading = f || undefined; }
  return { target: s.trim(), heading, block, alias };
}

function parseBlocks(src: Src[]): Block[] {
  const out: Block[] = [];
  let i = 0;
  while (i < src.length) {
    const { text, line } = src[i];
    if (!text.trim()) { i++; continue; }

    const fence = FENCE.exec(text);
    if (fence) {
      const marker = fence[1];
      const close = new RegExp(`^ {0,3}${marker[0] === '`' ? '`' : '~'}{${marker.length},}\\s*$`);
      const body: string[] = [];
      i++;
      while (i < src.length && !close.test(src[i].text)) body.push(src[i++].text);
      i++; // closing fence (or EOF)
      out.push({ t: 'code', lang: fence[2] ?? '', text: body.join('\n'), line });
      continue;
    }
    const h = HEADING.exec(text);
    if (h) { out.push({ t: 'heading', level: h[1].length, text: h[2], slug: slugify(h[2]), line }); i++; continue; }
    if (HR.test(text)) { out.push({ t: 'hr', line }); i++; continue; }
    const em = EMBED_LINE.exec(text);
    if (em) { out.push({ t: 'embed', ...parseEmbedInner(em[1]), line }); i++; continue; }
    if (QUOTE.test(text)) {
      const inner: Src[] = [];
      while (i < src.length && QUOTE.test(src[i].text)) { inner.push({ text: src[i].text.replace(QUOTE, ''), line: src[i].line }); i++; }
      const callout = parseCalloutHeader(inner[0].text);
      if (callout) out.push({ t: 'callout', callout, children: parseBlocks(inner.slice(1)), line });
      else out.push({ t: 'quote', children: parseBlocks(inner), line });
      continue;
    }
    const item = ITEM.exec(text);
    if (item) {
      const depth = Math.floor(item[1].replace(/\t/g, '    ').length / 2);
      const ordered = /\d/.test(item[2]);
      const task = TASK.exec(item[3]);
      out.push({
        t: 'item', ordered, marker: item[2], depth, line,
        text: task ? (task[2] ?? '') : item[3],
        ...(task ? { task: { checked: (task[1] ?? task[3]) !== ' ' } } : {}),
      });
      i++;
      continue;
    }
    if (text.includes('|') && i + 1 < src.length && TABLE_SEP.test(src[i + 1].text)) {
      const header = splitRow(text);
      const rows: string[][] = [];
      i += 2;
      while (i < src.length && src[i].text.includes('|') && src[i].text.trim()) rows.push(splitRow(src[i++].text));
      out.push({ t: 'table', header, rows, line });
      continue;
    }
    // paragraph: until a blank line or another block starts
    const lines = [text.trim()];
    i++;
    while (i < src.length && !isBreak(src[i].text)) lines.push(src[i++].text.trim());
    out.push({ t: 'paragraph', text: lines.join('\n'), line });
  }
  return out;
}

export interface ParsedNote {
  props: Record<string, PropValue>;
  blocks: Block[];
}

/** Parse a whole note: frontmatter properties + body blocks (line numbers refer to `content`). */
export function parseNote(content: string): ParsedNote {
  const fm = parseFrontmatter(content);
  const stripped = stripComments(content, true); // keeps line numbering
  const firstBodyLine = content.slice(0, fm.bodyStart).split('\n').length - 1;
  const src = stripped.split('\n').map((text, line) => ({ text, line })).slice(fm.raw === null ? 0 : firstBodyLine);
  return { props: fm.props, blocks: parseBlocks(src) };
}

/** Plain lines for previews (embed cards): strips markdown noise, keeps line structure. */
export function previewLines(md: string, max = 5): string[] {
  return parseFrontmatter(md).body
    .split('\n')
    .map((l) => l
      .replace(/^\s*>\s?/, '')
      .replace(/^\s*([-*+]|\d+[.)])\s+\[[ xX]\]\s+/, '☐ ')
      .replace(/^\s*[-*+]\s+/, '• ')
      .replace(/^#{1,6}\s+/, '')
      .replace(/!?\[\[([^\]|]+)\|?([^\]]*)\]\]/g, (_, t, a) => a || t)
      .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')
      .replace(/[*_~`=]{1,3}/g, '')
      .replace(/\s\^[A-Za-z0-9-]+\s*$/, '')
      .trim())
    .filter((l) => l && !/^(```|~~~|---)/.test(l))
    .slice(0, max);
}
