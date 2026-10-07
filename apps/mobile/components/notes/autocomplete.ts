/**
 * Pure editor helpers: detect a `[[link` / `#tag` being typed before the
 * cursor and apply a chosen completion (new text + cursor). No RN imports.
 */
import { linkCompletionContext, tagCompletionContext, type LinkCompletionContext } from '@clearmind/shared/notes/markdown';

export type Trigger =
  | { kind: 'link'; ctx: LinkCompletionContext; lineStart: number }
  | { kind: 'tag'; from: number; query: string };

/** What (if anything) is being completed at `cursor`. Offsets are absolute in `text`. */
export function detectTrigger(text: string, cursor: number): Trigger | null {
  const lineStart = text.lastIndexOf('\n', cursor - 1) + 1;
  const before = text.slice(lineStart, cursor);
  const ctx = linkCompletionContext(before);
  if (ctx) return { kind: 'link', ctx, lineStart };
  const t = tagCompletionContext(before);
  if (t) return { kind: 'tag', from: lineStart + t.from, query: t.query };
  return null;
}

export interface Edit { text: string; cursor: number }

/**
 * Complete the current link part with `value` (a note title/path for the
 * target, a heading for `#`, etc.) and close it with `]]` (reusing an
 * existing `]]` right after the cursor).
 */
export function applyLinkCompletion(text: string, cursor: number, trig: Extract<Trigger, { kind: 'link' }>, value: string): Edit {
  const from = trig.lineStart + trig.ctx.queryFrom;
  const after = text.slice(cursor);
  const closed = after.startsWith(']]');
  const head = text.slice(0, from) + value + ']]';
  return { text: head + (closed ? after.slice(2) : after), cursor: head.length };
}

/** Replace the `#query` being typed with `#tag ` and put the cursor after it. */
export function applyTagCompletion(text: string, cursor: number, trig: Extract<Trigger, { kind: 'tag' }>, tag: string): Edit {
  const head = text.slice(0, trig.from) + '#' + tag + ' ';
  const after = text.slice(cursor).replace(/^ /, '');
  return { text: head + after, cursor: head.length };
}

/** Insert a snippet at the selection; `wrap` surrounds the selection (e.g. `**`). */
export function insertSnippet(text: string, sel: { start: number; end: number }, snippet: string, opts: { wrap?: boolean; lineStart?: boolean } = {}): Edit {
  if (opts.wrap) {
    const inner = text.slice(sel.start, sel.end);
    const out = text.slice(0, sel.start) + snippet + inner + snippet + text.slice(sel.end);
    return { text: out, cursor: sel.start + snippet.length + inner.length + (inner ? snippet.length : 0) };
  }
  if (opts.lineStart) {
    const ls = text.lastIndexOf('\n', sel.start - 1) + 1;
    const out = text.slice(0, ls) + snippet + text.slice(ls);
    return { text: out, cursor: sel.start + snippet.length };
  }
  const out = text.slice(0, sel.start) + snippet + text.slice(sel.end);
  return { text: out, cursor: sel.start + snippet.length };
}
