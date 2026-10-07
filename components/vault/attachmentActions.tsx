/**
 * Attachment actions for the vault shell (kept out of VaultView so the shell
 * only wires them up): open in a tab, context menu, rename/move with link
 * rewrite, delete with undo, uploads from the OS / file picker, and the
 * "Attach file" flow that embeds into the active editor.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ExternalLink, Pencil, FolderInput, Download, Copy, Trash2, Columns2, Locate } from 'lucide-react';
import type { Attachment, Note } from '../../types';
import {
  setAttachmentToast, uploadFiles as upload, renameAttachment as renameData, deleteAttachments, downloadAttachment, getAttachments, AttachmentError,
} from './attachments';
import { attachmentFolderFor, embedText, linkTargetFor } from './attachmentUtils';
import { getVaultSettings, VaultError } from './useVault';
import { FolderPicker } from './Modals';
import type { MenuItemDef, OpenOpts } from './shell';
import type { NoteEditorHandle } from './editor';
import type { OpenTarget } from './workspace';

export interface AttachmentActionDeps {
  toast: (msg: string, action?: { label: string; onClick: () => void }) => void;
  open: (target: OpenTarget, opts?: OpenOpts) => void;
  /** Close tabs showing a deleted attachment. */
  closeTabs: (attachmentId: string) => void;
  flushAll: () => void;
  /** The focused editor when the active tab is a note in an editing mode. */
  activeEditor: () => NoteEditorHandle | null;
  activeNote: () => Note | null;
  desktop: boolean;
  reveal?: (id: string) => void;
}

const errMsg = (e: unknown, fallback: string) => (e instanceof AttachmentError || e instanceof VaultError ? e.message : fallback);

export function useAttachmentActions(d: AttachmentActionDeps) {
  const deps = useRef(d);
  deps.current = d;
  const [movePicker, setMovePicker] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { setAttachmentToast((m, a) => deps.current.toast(m, a)); }, [d.toast]);

  const openAttachment = useCallback((id: string, opts: OpenOpts = {}) => deps.current.open({ type: 'attachment', attachmentId: id }, opts), []);

  const renameAttachment = useCallback(async (id: string, name: string) => {
    deps.current.flushAll();
    try { await renameData(id, { name }); return true; } catch (e) { deps.current.toast(errMsg(e, 'Rename failed')); return false; }
  }, []);

  const moveAttachment = useCallback(async (id: string, folder: string) => {
    deps.current.flushAll();
    const a = getAttachments().find((x) => x.id === id);
    try {
      await renameData(id, { folder: folder || null });
      deps.current.toast(`Moved “${a?.name}” to ${folder || 'vault root'}`);
    } catch (e) { deps.current.toast(errMsg(e, 'Move failed')); }
  }, []);

  const deleteAttachment = useCallback(async (id: string) => {
    const a = getAttachments().find((x) => x.id === id);
    if (!a) return;
    try {
      const undo = await deleteAttachments([id]);
      deps.current.closeTabs(id);
      deps.current.toast(`Deleted “${a.name}”`, { label: 'Undo', onClick: () => { void undo().then(() => deps.current.toast(`Restored “${a.name}”`), () => deps.current.toast('Could not restore the file')); } });
    } catch (e) { deps.current.toast(errMsg(e, 'Delete failed')); }
  }, []);

  const uploadFiles = useCallback((files: File[], folder: string | null) => {
    if (!files.length) return;
    const label = files.length === 1 ? `“${files[0].name}”` : `${files.length} files`;
    deps.current.toast(`Uploading ${label}…`);
    void upload(files, folder).then((created) => {
      if (created.length) deps.current.toast(`Added ${created.length === 1 ? `“${created[0].name}”` : `${created.length} files`} to ${folder || 'vault root'}`, created.length === 1 ? { label: 'Open', onClick: () => openAttachment(created[0].id) } : undefined);
    });
  }, [openAttachment]);

  const copyEmbed = useCallback((a: Attachment) => {
    const text = embedText([linkTargetFor(a, getAttachments())]);
    navigator.clipboard?.writeText(text).then(() => deps.current.toast(`Copied ${text}`), () => deps.current.toast('Clipboard unavailable'));
  }, []);

  const attachmentMenu = useCallback((a: Attachment, paneId?: string): MenuItemDef[] => [
    { label: 'Open', icon: <ExternalLink size={14} />, onClick: () => openAttachment(a.id, { paneId }) },
    { label: 'Open in new tab', icon: <ExternalLink size={14} />, onClick: () => openAttachment(a.id, { newTab: true }) },
    { label: 'Open to the right', icon: <Columns2 size={14} />, onClick: () => openAttachment(a.id, { split: true }), disabled: !deps.current.desktop },
    'sep',
    { label: 'Rename…', icon: <Pencil size={14} />, onClick: () => {
      openAttachment(a.id, { paneId });
      window.setTimeout(() => { const el = document.querySelector<HTMLInputElement>('[data-attachment-name]'); el?.focus(); }, 80);
    } },
    { label: 'Move file to…', icon: <FolderInput size={14} />, onClick: () => setMovePicker(a.id) },
    { label: 'Download', icon: <Download size={14} />, onClick: () => void downloadAttachment(a).catch(() => deps.current.toast('Download failed')) },
    { label: 'Copy embed link', icon: <Copy size={14} />, onClick: () => copyEmbed(a) },
    ...(deps.current.reveal ? [{ label: 'Reveal in file explorer', icon: <Locate size={14} />, onClick: () => deps.current.reveal?.(a.id) } as MenuItemDef] : []),
    'sep',
    { label: 'Delete', icon: <Trash2 size={14} />, danger: true, onClick: () => void deleteAttachment(a.id) },
  ], [openAttachment, copyEmbed, deleteAttachment]);

  /** "Attach file": pick files → embed at the cursor of the active editor (or just upload). */
  const attachFile = useCallback(() => {
    const el = inputRef.current;
    if (!el) return;
    el.value = '';
    el.click();
  }, []);
  const onPicked = useCallback((files: File[]) => {
    if (!files.length) return;
    const ed = deps.current.activeEditor();
    if (ed?.attachFiles) { ed.attachFiles(files); return; }
    const note = deps.current.activeNote();
    const folder = attachmentFolderFor(getVaultSettings(), note?.folder ?? null);
    uploadFiles(files, folder);
  }, [uploadFiles]);

  const elements = (
    <>
      <input
        ref={inputRef}
        type="file"
        multiple
        hidden
        aria-label="Attach file"
        data-testid="vault-attach-input"
        onChange={(e) => { const files = [...(e.target.files ?? [])]; e.target.value = ''; onPicked(files); }}
      />
      <FolderPicker open={!!movePicker} onClose={() => setMovePicker(null)} title="Move file to folder…" onPick={(f) => { if (movePicker) void moveAttachment(movePicker, f); }} />
    </>
  );

  return { openAttachment, attachmentMenu, renameAttachment, moveAttachment, deleteAttachment: (id: string) => void deleteAttachment(id), uploadFiles, attachFile, copyEmbed, elements, onPicked };
}
