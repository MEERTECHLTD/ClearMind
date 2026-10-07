/**
 * The note editor: CodeMirror 6 with Obsidian-style Live Preview (or plain
 * source mode), wikilink/tag autocomplete, formatting shortcuts, search, and
 * per-note EditorState caching so switching notes keeps undo history and
 * scroll position. External content changes (sync, rename rewrites) are
 * applied as minimal diffs that don't enter the undo history.
 */
import React, { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { EditorState, Transaction, type Extension } from '@codemirror/state';
import {
  EditorView, keymap, drawSelection, dropCursor, rectangularSelection, crosshairCursor, highlightSpecialChars, placeholder,
} from '@codemirror/view';
import { history, historyKeymap, defaultKeymap } from '@codemirror/commands';
import { search, searchKeymap, highlightSelectionMatches, openSearchPanel } from '@codemirror/search';
import { closeBrackets, closeBracketsKeymap, completionKeymap } from '@codemirror/autocomplete';
import { bracketMatching, indentOnInput, indentUnit } from '@codemirror/language';
import { markdown, markdownLanguage } from '@codemirror/lang-markdown';
import { languages } from '@codemirror/language-data';
import type { NoteEditorHandle, NoteEditorProps, OpenLinkOpts } from './types';
import { ensureStyles } from './styles';
import { useLinkPreview } from './LinkPreview';
import { editorCtx, ctxCompartment, themeCompartment, attrsCompartment, External, type EditorCtx, type HoverLink } from './cm/context';
import { editorTheme, isDarkDoc } from './cm/theme';
import { frontmatterSyntax, frontmatterHide, frontmatterRange } from './cm/frontmatter';
import { livePreview, linkInteractions } from './cm/livePreview';
import { vaultCompletion } from './cm/completion';
import { formattingKeymap, pasteUrl, runFormat } from './cm/commands';
import { attachDrop, attachFilesAt } from './cm/attachDrop';
import { minimalChange } from '../../../shared/notes/markdown';

// ------------------------------------------------------------------ per-note state cache

interface Cached { state: EditorState; scrollTop: number }
const stateCache = new Map<string, Cached>();
const MAX_CACHED = 40;
const remember = (id: string, c: Cached) => {
  stateCache.delete(id);
  stateCache.set(id, c);
  if (stateCache.size > MAX_CACHED) stateCache.delete(stateCache.keys().next().value!);
};
/** Drop cached undo history for a note (e.g. after it was deleted). */
export const forgetEditorState = (id: string) => { stateCache.delete(id); };

const changeListener = EditorView.updateListener.of((u) => {
  const ctx = u.state.facet(editorCtx);
  if (u.docChanged && !u.transactions.some((t) => t.annotation(External))) ctx.emitChange(u.state.doc.toString());
  if (u.selectionSet || u.docChanged) ctx.cursorLine(u.state.doc.lineAt(u.state.selection.main.head).number - 1);
});

const markdownLang = markdown({ base: markdownLanguage, codeLanguages: languages, extensions: [frontmatterSyntax], addKeymap: true });

interface Attrs { spellcheck: boolean; readable: boolean }
const attrsExt = ({ spellcheck, readable }: Attrs): Extension => [
  EditorView.contentAttributes.of({ spellcheck: spellcheck ? 'true' : 'false', autocorrect: spellcheck ? 'on' : 'off', autocapitalize: 'sentences', 'aria-label': 'Note editor' }),
  EditorView.editorAttributes.of({ class: readable ? 'cm-readable' : '' }),
];

function createState(doc: string, ctx: EditorCtx, dark: boolean, attrs: Attrs): EditorState {
  const fm = ctx.mode === 'live' && ctx.hideFrontmatter ? null : undefined;
  let anchor = 0;
  if (fm === null) {
    const tmp = EditorState.create({ doc });
    const r = frontmatterRange(tmp);
    if (r) anchor = Math.min(r.bodyStart, doc.length);
  }
  return EditorState.create({
    doc,
    selection: { anchor },
    extensions: [
      ctxCompartment.of(editorCtx.of(ctx)),
      themeCompartment.of(editorTheme(dark)),
      attrsCompartment.of(attrsExt(attrs)),
      history(),
      drawSelection(),
      dropCursor(),
      highlightSpecialChars(),
      EditorState.allowMultipleSelections.of(true),
      rectangularSelection(),
      crosshairCursor(),
      indentOnInput(),
      bracketMatching(),
      closeBrackets(),
      highlightSelectionMatches(),
      search({ top: true }),
      EditorView.lineWrapping,
      indentUnit.of('\t'),
      EditorState.tabSize.of(4),
      placeholder('Start writing…'),
      markdownLang,
      frontmatterHide,
      livePreview,
      linkInteractions,
      attachDrop,
      pasteUrl,
      vaultCompletion,
      formattingKeymap,
      keymap.of([...closeBracketsKeymap, ...completionKeymap, ...searchKeymap, ...historyKeymap, ...defaultKeymap]),
      changeListener,
    ],
  });
}

// ------------------------------------------------------------------ component

export const NoteEditor = forwardRef<NoteEditorHandle, NoteEditorProps>(function NoteEditor(props, ref) {
  const { note, index, mode, readableLineLength = true, spellcheck = true, hideFrontmatter = true, autoFocus } = props;
  ensureStyles();
  const host = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const noteIdRef = useRef(note.id);
  /** Contents we've reported via onChange — a prop echo of one of these is not an external change. */
  const emitted = useRef<string[]>([]);
  const latest = useRef(props);
  latest.current = props;
  const [dark, setDark] = useState(isDarkDoc);

  const preview = useLinkPreview({
    index,
    onOpenLink: (t, o) => latest.current.onOpenLink(t, o),
    onTagClick: (t) => latest.current.onTagClick?.(t),
  });
  const previewRef = useRef(preview);
  previewRef.current = preview;

  const lastLine = useRef(-1);
  const ctx = useMemo<EditorCtx>(() => ({
    index,
    noteId: note.id,
    mode,
    hideFrontmatter,
    emitChange: (content) => {
      emitted.current.push(content);
      if (emitted.current.length > 30) emitted.current.shift();
      latest.current.onChange(content);
    },
    cursorLine: (line) => { if (line !== lastLine.current) { lastLine.current = line; latest.current.onCursorLine?.(line); } },
    openLink: (target: string, opts: OpenLinkOpts) => latest.current.onOpenLink(target, opts),
    tagClick: (tag) => latest.current.onTagClick?.(tag),
    hoverLink: (el: HTMLElement, link: HoverLink) => previewRef.current.schedule(el, link, noteIdRef.current),
    hoverEnd: () => previewRef.current.leave(),
  }), [index, note.id, mode, hideFrontmatter]);
  const ctxRef = useRef(ctx);
  ctxRef.current = ctx;
  const attrs = useMemo(() => ({ spellcheck, readable: readableLineLength }), [spellcheck, readableLineLength]);
  const attrsRef = useRef(attrs);
  attrsRef.current = attrs;
  const darkRef = useRef(dark);
  darkRef.current = dark;

  /** Bring a (possibly cached) state in line with the current props. */
  const syncCompartments = (view: EditorView) => {
    view.dispatch({
      effects: [
        ctxCompartment.reconfigure(editorCtx.of(ctxRef.current)),
        themeCompartment.reconfigure(editorTheme(darkRef.current)),
        attrsCompartment.reconfigure(attrsExt(attrsRef.current)),
      ],
    });
  };

  const applyExternal = (view: EditorView, content: string) => {
    const cur = view.state.doc.toString();
    const ch = minimalChange(cur, content);
    if (!ch) return;
    view.dispatch({ changes: ch, annotations: [External.of(true), Transaction.addToHistory.of(false)] });
  };

  const loadNote = (view: EditorView | null, id: string, content: string): EditorView => {
    const cached = stateCache.get(id);
    const state = cached?.state ?? createState(content, ctxRef.current, darkRef.current, attrsRef.current);
    let v = view;
    if (!v) v = new EditorView({ state, parent: host.current! });
    else v.setState(state);
    syncCompartments(v);
    if (cached) applyExternal(v, content);
    const scrollTop = cached?.scrollTop ?? 0;
    requestAnimationFrame(() => { v!.scrollDOM.scrollTop = scrollTop; });
    return v;
  };

  // Mount / unmount.
  useEffect(() => {
    const view = loadNote(null, note.id, note.content);
    viewRef.current = view;
    noteIdRef.current = note.id;
    if (autoFocus) view.focus();
    return () => {
      remember(noteIdRef.current, { state: view.state, scrollTop: view.scrollDOM.scrollTop });
      view.destroy();
      viewRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Switching notes: stash the old state, restore / create the new one.
  useEffect(() => {
    const view = viewRef.current;
    if (!view || noteIdRef.current === note.id) return;
    remember(noteIdRef.current, { state: view.state, scrollTop: view.scrollDOM.scrollTop });
    previewRef.current.hide();
    emitted.current = [];
    lastLine.current = -1;
    noteIdRef.current = note.id;
    loadNote(view, note.id, note.content);
    if (autoFocus) view.focus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [note.id]);

  // External content updates for the same note.
  useEffect(() => {
    const view = viewRef.current;
    if (!view || noteIdRef.current !== note.id) return;
    const cur = view.state.doc.toString();
    if (cur === note.content) { emitted.current = []; return; }
    if (emitted.current.includes(note.content)) return; // an echo of our own (debounced) save
    applyExternal(view, note.content);
    emitted.current = [];
  }, [note.content, note.id]);

  // Context (index, mode, callbacks) → facet.
  useEffect(() => {
    const view = viewRef.current;
    if (view && view.state.facet(editorCtx) !== ctx) view.dispatch({ effects: ctxCompartment.reconfigure(editorCtx.of(ctx)) });
  }, [ctx]);

  useEffect(() => {
    viewRef.current?.dispatch({ effects: attrsCompartment.reconfigure(attrsExt(attrs)) });
  }, [attrs]);

  // Follow the app's light/dark class.
  useEffect(() => {
    const obs = new MutationObserver(() => setDark(isDarkDoc()));
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    return () => obs.disconnect();
  }, []);
  useEffect(() => {
    viewRef.current?.dispatch({ effects: themeCompartment.reconfigure(editorTheme(dark)) });
  }, [dark]);

  // Releasing Cmd/Ctrl hides a Cmd-hover preview.
  useEffect(() => {
    const up = (e: KeyboardEvent) => { if (e.key === 'Meta' || e.key === 'Control') previewRef.current.leave(); };
    window.addEventListener('keyup', up);
    return () => window.removeEventListener('keyup', up);
  }, []);

  useImperativeHandle(ref, () => ({
    focus: () => viewRef.current?.focus(),
    insertText: (text: string) => {
      const view = viewRef.current;
      if (!view) return;
      view.dispatch(view.state.replaceSelection(text), { scrollIntoView: true, userEvent: 'input' });
      view.focus();
    },
    cursor: () => viewRef.current?.state.selection.main.head ?? 0,
    scrollToLine: (line: number) => {
      const view = viewRef.current;
      if (!view) return;
      const n = Math.max(1, Math.min(view.state.doc.lines, line + 1));
      const pos = view.state.doc.line(n).from;
      view.dispatch({ selection: { anchor: pos }, effects: EditorView.scrollIntoView(pos, { y: 'start', yMargin: 48 }) });
    },
    format: (kind) => { const view = viewRef.current; if (view) { runFormat(view, kind); view.focus(); } },
    openSearch: () => { const view = viewRef.current; if (view) openSearchPanel(view); },
    attachFiles: (files: File[]) => { const view = viewRef.current; if (view) { view.focus(); void attachFilesAt(view, files); } },
  }), []);

  return (
    <div className="mdv-root h-full min-h-0 flex flex-col" data-mode={mode}>
      <div ref={host} className="flex-1 min-h-0" />
      {preview.element}
    </div>
  );
});
