import type { Note } from '../../../types';
import type { VaultIndex } from '../../../shared/notes';

export type EditorMode = 'live' | 'source';

export interface OpenLinkOpts { newTab: boolean; heading?: string; block?: string }

export interface NoteEditorProps {
  note: Note;
  index: VaultIndex;
  mode: EditorMode;
  /** Called on every change with the full markdown; the shell debounces saving. */
  onChange: (content: string) => void;
  /** Follow a [[link]] (Cmd/Ctrl-click in live/source mode). Target as written; the shell resolves/creates. */
  onOpenLink: (target: string, opts: OpenLinkOpts) => void;
  /** Click on a #tag → the shell opens search `tag:#x`. */
  onTagClick?: (tag: string) => void;
  /** Cursor moved to this 0-based line (outline highlighting). */
  onCursorLine?: (line: number) => void;
  readableLineLength?: boolean;
  spellcheck?: boolean;
  /** Hide the frontmatter block in live mode (the Properties panel edits it). */
  hideFrontmatter?: boolean;
  autoFocus?: boolean;
}

/** Imperative API exposed via ref. */
export interface NoteEditorHandle {
  focus(): void;
  /** Insert at the cursor (replacing the selection). */
  insertText(text: string): void;
  /** Character offset of the cursor. */
  cursor(): number;
  scrollToLine(line: number): void;
  /** Wrap selection: bold, italic, strike, highlight, code, link; or toggle a task checkbox on the current line. */
  format(kind: 'bold' | 'italic' | 'strike' | 'highlight' | 'code' | 'link' | 'task'): void;
  /** Open the editor's find/replace panel. */
  openSearch(): void;
  /** Upload files as attachments and embed them at the cursor (with an inline progress placeholder). */
  attachFiles?(files: File[]): void;
}

export interface MarkdownViewProps {
  note: Note;
  index: VaultIndex;
  onOpenLink: (target: string, opts: OpenLinkOpts) => void;
  onTagClick?: (tag: string) => void;
  /** Toggle the checkbox on a 0-based source line. */
  onToggleTask?: (line: number) => void;
  readableLineLength?: boolean;
}

export interface PropertiesEditorProps {
  note: Note;
  index: VaultIndex;
  /** New full content with the frontmatter rewritten. */
  onChange: (content: string) => void;
  onTagClick?: (tag: string) => void;
}
