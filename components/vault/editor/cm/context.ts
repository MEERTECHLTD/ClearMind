/**
 * Editor context facet: everything the CodeMirror extensions need from React
 * (vault index, mode, callbacks). Living in a facet (reconfigured through a
 * module-level Compartment) means cached per-note EditorStates never hold
 * stale React closures.
 */
import { Annotation, Compartment, Facet } from '@codemirror/state';
import type { EditorView } from '@codemirror/view';
import type { VaultIndex } from '../../../../shared/notes';
import type { EditorMode, OpenLinkOpts } from '../types';

export interface HoverLink { target: string; heading?: string; block?: string }

export interface EditorCtx {
  index: VaultIndex | null;
  noteId: string;
  mode: EditorMode;
  hideFrontmatter: boolean;
  emitChange(content: string): void;
  cursorLine(line: number): void;
  openLink(target: string, opts: OpenLinkOpts): void;
  tagClick(tag: string): void;
  hoverLink(el: HTMLElement, link: HoverLink): void;
  hoverEnd(): void;
}

const noop = () => {};
export const DEFAULT_CTX: EditorCtx = {
  index: null, noteId: '', mode: 'live', hideFrontmatter: true,
  emitChange: noop, cursorLine: noop, openLink: noop, tagClick: noop, hoverLink: noop, hoverEnd: noop,
};

export const editorCtx = Facet.define<EditorCtx, EditorCtx>({ combine: (v) => v[v.length - 1] ?? DEFAULT_CTX });

/** Marks transactions that apply content coming from outside the editor (sync, renames). */
export const External = Annotation.define<boolean>();

export const ctxCompartment = new Compartment();
export const themeCompartment = new Compartment();
export const attrsCompartment = new Compartment();

/** Lines (1-based) touched by the selection while focused — those show raw markdown in Live Preview. */
export function activeLines(view: EditorView): Set<number> {
  const out = new Set<number>();
  if (!view.hasFocus) return out;
  const { doc, selection } = view.state;
  for (const r of selection.ranges) {
    const a = doc.lineAt(r.from).number, b = doc.lineAt(r.to).number;
    for (let i = a; i <= b; i++) out.add(i);
  }
  return out;
}
