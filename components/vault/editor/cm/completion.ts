/**
 * Autocomplete: `[[` → notes (title / path / alias via quickSwitch), then
 * `#` → headings, `#^` → blocks, `|` → aliases; `#` → existing tags.
 */
import { autocompletion, type Completion, type CompletionContext, type CompletionResult } from '@codemirror/autocomplete';
import { syntaxTree } from '@codemirror/language';
import type { EditorView } from '@codemirror/view';
import { quickSwitch, extractHeadings, extractBlocks, aliasesOf, notePath } from '../../../../shared/notes';
import { linkCompletionContext, tagCompletionContext } from '../../../../shared/notes/markdown';
import { editorCtx } from './context';

const CODE_NODES = new Set(['InlineCode', 'FencedCode', 'CodeBlock', 'CodeText', 'CodeMark', 'Frontmatter']);

function inCode(ctx: CompletionContext): boolean {
  for (let n: ReturnType<ReturnType<typeof syntaxTree>['resolveInner']> | null = syntaxTree(ctx.state).resolveInner(ctx.pos, -1); n; n = n.parent) {
    if (CODE_NODES.has(n.name)) return true;
  }
  return false;
}

/** Insert `text` for [from,to) and make sure the link is closed with `]]`; cursor after `]]`. */
const linkApply = (text: string) => (view: EditorView, _c: Completion, from: number, to: number) => {
  const after = view.state.sliceDoc(to, to + 2);
  const closed = after === ']]';
  // Drop a stray single `]` left by bracket auto-close.
  const extra = !closed && after[0] === ']' ? 1 : 0;
  const insert = text + (closed ? '' : ']]');
  view.dispatch({
    changes: { from, to: to + extra, insert },
    selection: { anchor: from + insert.length + (closed ? 2 : 0) },
    userEvent: 'input.complete',
  });
};

function linkSource(cc: CompletionContext): CompletionResult | null {
  const ctx = cc.state.facet(editorCtx);
  const index = ctx.index;
  if (!index || inCode(cc)) return null;
  const line = cc.state.doc.lineAt(cc.pos);
  const lc = linkCompletionContext(line.text.slice(0, cc.pos - line.from));
  if (!lc) return null;
  const from = line.from + lc.queryFrom;
  const dupes = new Map<string, number>();
  for (const n of index.notes) dupes.set(n.title.toLowerCase(), (dupes.get(n.title.toLowerCase()) ?? 0) + 1);
  const linkText = (n: { title: string; folder?: string | null }) => ((dupes.get(n.title.toLowerCase()) ?? 0) > 1 ? notePath(n) : n.title);

  if (lc.part === 'target') {
    const hits = quickSwitch(index, lc.query, 40);
    const options: Completion[] = hits.map((h, i) => ({
      label: h.via ? `${h.via}` : h.note.title,
      detail: h.via ? `→ ${h.note.title}` : h.note.folder ?? undefined,
      type: 'text',
      boost: -i,
      apply: linkApply(h.via ? `${linkText(h.note)}|${h.via}` : linkText(h.note)),
    }));
    const q = lc.query.trim();
    if (q && !index.resolve(q, ctx.noteId)) {
      options.push({ label: `Create “${q}”`, detail: 'new note', type: 'keyword', boost: -999, apply: linkApply(q) });
    }
    return { from, options, filter: false };
  }
  const note = index.resolve(lc.target, ctx.noteId);
  if (!note) return null;
  if (lc.part === 'heading') {
    const q = lc.query.toLowerCase();
    const options: Completion[] = extractHeadings(note.content)
      .filter((h) => !q || h.text.toLowerCase().includes(q))
      .map((h, i) => ({ label: h.text, detail: `H${h.level}`, type: 'property', boost: -i, apply: linkApply(h.text) }));
    return { from, options, filter: false };
  }
  if (lc.part === 'block') {
    const lines = note.content.split('\n');
    const q = lc.query.toLowerCase();
    const options: Completion[] = Object.entries(extractBlocks(note.content))
      .filter(([id, l]) => !q || id.toLowerCase().includes(q) || lines[l].toLowerCase().includes(q))
      .map(([id, l]) => ({ label: id, detail: lines[l].replace(/\s\^[A-Za-z0-9-]+\s*$/, '').trim().slice(0, 60), type: 'constant', apply: linkApply(id) }));
    return { from, options, filter: false };
  }
  // alias
  const names = [note.title, ...aliasesOf(note)];
  return { from, options: names.map((n) => ({ label: n, type: 'text', apply: linkApply(n) })) };
}

function tagSource(cc: CompletionContext): CompletionResult | null {
  const ctx = cc.state.facet(editorCtx);
  const index = ctx.index;
  if (!index || inCode(cc)) return null;
  const line = cc.state.doc.lineAt(cc.pos);
  const before = line.text.slice(0, cc.pos - line.from);
  const tc = tagCompletionContext(before);
  if (!tc) return null;
  // `#` alone at the start of a line is probably a heading being typed.
  if (!tc.query && tc.from === 0 && !cc.explicit) return null;
  const options: Completion[] = [...index.tags.entries()]
    .sort((a, b) => b[1].size - a[1].size || a[0].localeCompare(b[0]))
    .map(([tag, ids]) => ({ label: `#${tag}`, detail: String(ids.size), type: 'keyword' }));
  if (!options.length) return null;
  return { from: line.from + tc.from, options, validFor: /^#[\p{L}\p{N}_\-/]*$/u };
}

export const vaultCompletion = autocompletion({
  override: [linkSource, tagSource],
  activateOnTyping: true,
  icons: false,
  closeOnBlur: true,
  maxRenderedOptions: 60,
});
