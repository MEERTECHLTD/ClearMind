/** Formatting commands + keymap (bold, italic, highlight, link, task, list indent, URL paste). */
import { EditorSelection, Prec, type ChangeSpec, type SelectionRange } from '@codemirror/state';
import { EditorView, keymap, type Command } from '@codemirror/view';
import { indentLess, indentMore, insertTab } from '@codemirror/commands';
import { startCompletion } from '@codemirror/autocomplete';
import { cycleTaskLine, lineInfo } from '../../../../shared/notes/markdown';

export type FormatKind = 'bold' | 'italic' | 'strike' | 'highlight' | 'code' | 'link' | 'task';

/** Wrap / unwrap each selection with a marker. Empty selection inserts a pair and puts the cursor inside. */
export const wrapWith = (marker: string): Command => (view) => {
  const { state } = view;
  const n = marker.length;
  const tr = state.changeByRange((r) => {
    const before = state.sliceDoc(r.from - n, r.from);
    const after = state.sliceDoc(r.to, r.to + n);
    // Already wrapped outside the selection → unwrap.
    if (before === marker && after === marker) {
      return { changes: [{ from: r.from - n, to: r.from }, { from: r.to, to: r.to + n }], range: EditorSelection.range(r.from - n, r.to - n) };
    }
    const text = state.sliceDoc(r.from, r.to);
    // Selection includes the markers → unwrap.
    if (text.length >= 2 * n && text.startsWith(marker) && text.endsWith(marker)) {
      return { changes: { from: r.from, to: r.to, insert: text.slice(n, -n) }, range: EditorSelection.range(r.from, r.to - 2 * n) };
    }
    if (r.empty) {
      // Cursor inside a word → wrap the word.
      const word = state.wordAt(r.from);
      if (word && word.from < r.from && word.to > r.from) {
        return { changes: [{ from: word.from, insert: marker }, { from: word.to, insert: marker }], range: EditorSelection.cursor(r.from + n) };
      }
      return { changes: { from: r.from, insert: marker + marker }, range: EditorSelection.cursor(r.from + n) };
    }
    return { changes: [{ from: r.from, insert: marker }, { from: r.to, insert: marker }], range: EditorSelection.range(r.from + n, r.to + n) };
  });
  view.dispatch(state.update(tr, { scrollIntoView: true, userEvent: 'input.format' }));
  return true;
};

const URL_RE = /^(https?:\/\/|mailto:|www\.)\S+$/i;

export const insertLink: Command = (view) => {
  const { state } = view;
  const main = state.selection.main;
  if (main.empty && state.selection.ranges.length === 1) {
    const after = state.sliceDoc(main.from, main.from + 2);
    view.dispatch({ changes: { from: main.from, insert: after === ']]' ? '[[' : '[[]]' }, selection: { anchor: main.from + 2 }, userEvent: 'input.format' });
    startCompletion(view);
    return true;
  }
  const tr = state.changeByRange((r: SelectionRange) => {
    const text = state.sliceDoc(r.from, r.to);
    if (URL_RE.test(text.trim())) {
      const insert = `[](${text.trim()})`;
      return { changes: { from: r.from, to: r.to, insert }, range: EditorSelection.cursor(r.from + 1) };
    }
    const insert = `[${text}]()`;
    return { changes: { from: r.from, to: r.to, insert }, range: EditorSelection.cursor(r.from + insert.length - 1) };
  });
  view.dispatch(state.update(tr, { scrollIntoView: true, userEvent: 'input.format' }));
  return true;
};

export const toggleTask: Command = (view) => {
  const { state } = view;
  const seen = new Set<number>();
  const changes: ChangeSpec[] = [];
  for (const r of state.selection.ranges) {
    for (let pos = r.from; pos <= r.to;) {
      const line = state.doc.lineAt(pos);
      if (!seen.has(line.number)) {
        seen.add(line.number);
        const next = cycleTaskLine(line.text);
        if (next !== line.text) changes.push({ from: line.from, to: line.to, insert: next });
      }
      pos = line.to + 1;
    }
  }
  if (!changes.length) return false;
  view.dispatch({ changes, userEvent: 'input.format', scrollIntoView: true });
  return true;
};

const isListLine = (text: string) => ['bullet', 'ordered', 'task'].includes(lineInfo(text).kind);

const listIndent = (more: boolean): Command => (view) => {
  const { state } = view;
  const multi = state.selection.ranges.some((r) => state.doc.lineAt(r.from).number !== state.doc.lineAt(r.to).number);
  const list = state.selection.ranges.some((r) => isListLine(state.doc.lineAt(r.from).text));
  if (more) return list || multi ? indentMore(view) : insertTab(view);
  return indentLess(view);
};

export function runFormat(view: EditorView, kind: FormatKind): boolean {
  switch (kind) {
    case 'bold': return wrapWith('**')(view);
    case 'italic': return wrapWith('*')(view);
    case 'strike': return wrapWith('~~')(view);
    case 'highlight': return wrapWith('==')(view);
    case 'code': return wrapWith('`')(view);
    case 'link': return insertLink(view);
    case 'task': return toggleTask(view);
  }
}

export const formattingKeymap = Prec.high(keymap.of([
  { key: 'Mod-b', run: wrapWith('**') },
  { key: 'Mod-i', run: wrapWith('*') },
  { key: 'Mod-Shift-h', run: wrapWith('==') },
  { key: 'Mod-Shift-x', run: wrapWith('~~') },
  { key: 'Mod-e', run: wrapWith('`') },
  { key: 'Mod-k', run: insertLink },
  { key: 'Mod-l', run: toggleTask },
  { key: 'Mod-Enter', run: toggleTask },
  { key: 'Tab', run: listIndent(true), shift: listIndent(false) },
]));

/** Pasting a URL over a selection makes `[selection](url)`. */
export const pasteUrl = EditorView.domEventHandlers({
  paste(e, view) {
    const text = e.clipboardData?.getData('text/plain')?.trim();
    if (!text || !URL_RE.test(text)) return false;
    const { state } = view;
    if (state.selection.ranges.every((r) => r.empty)) return false;
    e.preventDefault();
    const tr = state.changeByRange((r) => {
      if (r.empty) return { changes: { from: r.from, insert: text }, range: EditorSelection.cursor(r.from + text.length) };
      const insert = `[${state.sliceDoc(r.from, r.to)}](${text})`;
      return { changes: { from: r.from, to: r.to, insert }, range: EditorSelection.cursor(r.from + insert.length) };
    });
    view.dispatch(state.update(tr, { userEvent: 'input.paste', scrollIntoView: true }));
    return true;
  },
});
