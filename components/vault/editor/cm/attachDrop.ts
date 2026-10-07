/**
 * Paste / drop files into the editor → upload them as vault attachments and
 * insert `![[name.ext]]` where they landed. While uploading, an inline
 * "Uploading… 40%" widget sits at that position (a decoration, not document
 * text, so it never gets saved); its position follows edits made meanwhile.
 */
import { StateEffect, StateField, type Extension } from '@codemirror/state';
import { Decoration, EditorView, WidgetType, type DecorationSet } from '@codemirror/view';
import { editorCtx } from './context';
import { uploadFiles, getAttachments } from '../../attachments';
import { getVaultSettings, saveContent } from '../../useVault';
import { getStore } from '../../../tasks/store';
import { STORES } from '../../../../services/db';
import type { Note } from '../../../../types';
import { attachmentFolderFor, embedText, linkTargetFor } from '../../attachmentUtils';
import { ensureAttachmentStyles } from '../attachmentEmbeds';

interface Upload { id: string; pos: number; label: string; pct: number }

const addUpload = StateEffect.define<Upload>({ map: (u, ch) => ({ ...u, pos: ch.mapPos(u.pos, 1) }) });
const progressUpload = StateEffect.define<{ id: string; pct: number }>();
const removeUpload = StateEffect.define<string>();
/** Uploads that finished while their note wasn't shown (cached states drop them on next update). */
const finished = new Set<string>();

class UploadWidget extends WidgetType {
  constructor(readonly u: Upload) { super(); }
  eq(o: UploadWidget) { return o.u.id === this.u.id && o.u.pct === this.u.pct && o.u.label === this.u.label; }
  toDOM() {
    ensureAttachmentStyles();
    const s = document.createElement('span');
    s.className = 'cm-lp-upload';
    s.setAttribute('role', 'status');
    s.setAttribute('aria-live', 'polite');
    s.textContent = `Uploading${this.u.label ? ` ${this.u.label}` : ''}… ${Math.round(this.u.pct * 100)}%`;
    return s;
  }
  ignoreEvent() { return true; }
}

const uploads = StateField.define<Upload[]>({
  create: () => [],
  update(list, tr) {
    let out = tr.docChanged ? list.map((u) => ({ ...u, pos: tr.changes.mapPos(u.pos, 1) })) : list;
    for (const e of tr.effects) {
      if (e.is(addUpload)) out = [...out, e.value];
      else if (e.is(progressUpload)) out = out.map((u) => (u.id === e.value.id ? { ...u, pct: e.value.pct } : u));
      else if (e.is(removeUpload)) out = out.filter((u) => u.id !== e.value);
    }
    if (finished.size && out.some((u) => finished.has(u.id))) out = out.filter((u) => !finished.has(u.id));
    return out;
  },
  provide: (f) => EditorView.decorations.from(f, (list): DecorationSet =>
    Decoration.set(list.map((u) => Decoration.widget({ widget: new UploadWidget(u), side: 1 }).range(Math.max(0, u.pos))), true)),
});

const short = (name: string) => (name.length > 28 ? `${name.slice(0, 18)}…${name.slice(-8)}` : name);

/** Upload `files` and insert embeds at `pos` (default: the selection, which is replaced). */
export function attachFilesAt(view: EditorView, files: File[], pos?: number, pasted = false): Promise<void> {
  if (!files.length) return Promise.resolve();
  const ctx = view.state.facet(editorCtx);
  const noteId = ctx.noteId;
  const folder = attachmentFolderFor(getVaultSettings(), ctx.index?.byId.get(noteId)?.folder ?? null);
  const id = `up-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
  const sel = view.state.selection.main;
  let at = pos ?? sel.from;
  const changes = pos === undefined && !sel.empty ? { from: sel.from, to: sel.to, insert: '' } : undefined;
  view.dispatch({ changes, effects: addUpload.of({ id, pos: at, pct: 0, label: files.length > 1 ? `${files.length} files` : short(files[0].name || 'file') }) });
  const live = () => !view.dom.isConnected ? false : view.state.facet(editorCtx).noteId === noteId && view.state.field(uploads, false)?.some((u) => u.id === id);
  let lastPct = -1;
  return uploadFiles(files, folder, {
    pasted,
    onProgress: (f) => {
      const pct = Math.round(f * 100) / 100;
      if (pct === lastPct || !live()) return;
      lastPct = pct;
      view.dispatch({ effects: progressUpload.of({ id, pct }) });
    },
  }).then((created) => {
    finished.add(id);
    const text = embedText(created.map((a) => linkTargetFor(a, getAttachments())));
    if (live()) {
      at = view.state.field(uploads).find((u) => u.id === id)!.pos;
      view.dispatch({
        changes: text ? { from: at, insert: text } : undefined,
        selection: text ? { anchor: at + text.length } : undefined,
        effects: removeUpload.of(id),
        userEvent: 'input.paste',
        scrollIntoView: true,
      });
    } else if (text) {
      // The note was switched away from: append to it directly.
      const n = getStore<Note>(STORES.NOTES).getSnapshot().items.find((x) => x.id === noteId);
      if (n) void saveContent(noteId, `${n.content.replace(/\n*$/, '')}\n${text}\n`);
    }
  }).catch(() => {
    finished.add(id);
    if (live()) view.dispatch({ effects: removeUpload.of(id) });
  });
}

const handlers = EditorView.domEventHandlers({
  paste(e, view) {
    const dt = e.clipboardData;
    if (!dt?.files?.length) return false;
    // Rich text copies (Word, web pages) often carry an image rendition too — prefer the text then.
    if ((dt.getData('text/plain') ?? '').trim()) return false;
    e.preventDefault();
    void attachFilesAt(view, [...dt.files], undefined, true);
    return true;
  },
  dragover(e) {
    if (e.dataTransfer && [...e.dataTransfer.types].includes('Files')) { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; }
    return false;
  },
  drop(e, view) {
    const files = e.dataTransfer?.files;
    if (!files?.length) return false;
    e.preventDefault();
    const pos = view.posAtCoords({ x: e.clientX, y: e.clientY }) ?? view.state.selection.main.head;
    void attachFilesAt(view, [...files], pos);
    return true;
  },
});

export const attachDrop: Extension = [uploads, handlers];
