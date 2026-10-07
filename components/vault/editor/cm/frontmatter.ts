/**
 * YAML frontmatter: a lezer-markdown block extension (so `key: v\n---` isn't
 * parsed as a setext heading) and a StateField that hides the block in Live
 * Preview when the Properties panel is showing it.
 */
import type { MarkdownConfig } from '@lezer/markdown';
import { tags } from '@lezer/highlight';
import { StateField, type EditorState } from '@codemirror/state';
import { Decoration, EditorView, type DecorationSet } from '@codemirror/view';
import { parseFrontmatter } from '../../../../shared/notes';
import { editorCtx } from './context';

const FENCE = /^---[ \t]*$/;

export const frontmatterSyntax: MarkdownConfig = {
  defineNodes: [
    { name: 'Frontmatter', block: true, style: tags.meta },
    { name: 'FrontmatterMark', style: tags.processingInstruction },
  ],
  parseBlock: [{
    name: 'Frontmatter',
    before: 'HorizontalRule',
    parse(cx, line) {
      if (cx.lineStart !== 0 || !FENCE.test(line.text)) return false;
      const start = cx.lineStart;
      const marks = [cx.elt('FrontmatterMark', start, start + line.text.length)];
      let end = -1;
      while (cx.nextLine()) {
        if (FENCE.test(line.text)) {
          marks.push(cx.elt('FrontmatterMark', cx.lineStart, cx.lineStart + line.text.length));
          end = cx.lineStart + line.text.length;
          cx.nextLine();
          break;
        }
      }
      if (end < 0) end = cx.prevLineEnd();
      cx.addElement(cx.elt('Frontmatter', start, end, marks));
      return true;
    },
  }],
};

/** [0, end of the closing `---` line] when the doc starts with frontmatter. */
export function frontmatterRange(state: EditorState): { from: number; to: number; bodyStart: number } | null {
  const text = state.doc.sliceString(0, Math.min(state.doc.length, 100_000));
  const fm = parseFrontmatter(text);
  if (fm.raw === null) return null;
  const to = text[fm.bodyStart - 1] === '\n' ? fm.bodyStart - 1 - (text[fm.bodyStart - 2] === '\r' ? 1 : 0) : fm.bodyStart;
  return { from: 0, to, bodyStart: fm.bodyStart };
}

function compute(state: EditorState): DecorationSet {
  const ctx = state.facet(editorCtx);
  if (ctx.mode !== 'live' || !ctx.hideFrontmatter) return Decoration.none;
  const r = frontmatterRange(state);
  if (!r) return Decoration.none;
  return Decoration.set([Decoration.replace({ block: true }).range(r.from, r.to)]);
}

export const frontmatterHide = StateField.define<DecorationSet>({
  create: compute,
  update(value, tr) {
    if (tr.docChanged || tr.reconfigured || tr.startState.facet(editorCtx) !== tr.state.facet(editorCtx)) return compute(tr.state);
    return value;
  },
  provide: (f) => [EditorView.decorations.from(f), EditorView.atomicRanges.of((view) => view.state.field(f))],
});
