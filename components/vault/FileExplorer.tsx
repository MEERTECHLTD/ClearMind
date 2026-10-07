/**
 * Obsidian-style file explorer: folder tree, sort, collapse-all, inline rename
 * (F2 / double-click), drag & drop moves, context menus, active note reveal.
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ChevronRight, FilePlus2, FolderPlus, ArrowDownUp, ChevronsDownUp, ChevronsUpDown, Pencil, Trash2, Star, FileText,
  CalendarDays, LayoutTemplate, Folder, FolderOpen, Check, LayoutDashboard,
} from 'lucide-react';
import type { Note, Attachment } from '../../types';
import { attachmentKind } from '../../shared/notes';
import { KIND_ICON } from './AttachmentPane';
import { formatBytes } from './attachmentUtils';
import { renameAttachment } from './attachments';
import { renameFolder, deleteFolder, renameNote, VaultError } from './useVault';
import { readPref, writePref } from './workspace';
import { useVaultApi, vx, PaneHeader, ContextMenu, type MenuItemDef } from './shell';

export type SortKey = 'name-asc' | 'name-desc' | 'mtime-desc' | 'mtime-asc' | 'ctime-desc' | 'ctime-asc';
const SORT_LABEL: Record<SortKey, string> = {
  'name-asc': 'File name (A to Z)', 'name-desc': 'File name (Z to A)',
  'mtime-desc': 'Modified time (new to old)', 'mtime-asc': 'Modified time (old to new)',
  'ctime-desc': 'Created time (new to old)', 'ctime-asc': 'Created time (old to new)',
};

interface FolderNode { path: string; name: string; folders: FolderNode[]; notes: Note[]; files: Attachment[] }

const PREF_KEY = 'cm.vault.explorer';
interface ExplorerPrefs { sort: SortKey; expanded: string[] }

const parentOf = (p: string) => (p.includes('/') ? p.slice(0, p.lastIndexOf('/')) : '');
const baseOf = (p: string) => p.split('/').pop() ?? p;
const DND_NOTE = 'application/x-vault-note';
const DND_FOLDER = 'application/x-vault-folder';
const DND_ATTACHMENT = 'application/x-vault-attachment';
const hasOsFiles = (e: React.DragEvent) => [...e.dataTransfer.types].includes('Files');

function buildTree(folders: string[], notes: Note[], sort: SortKey, files: Attachment[] = []): FolderNode {
  const root: FolderNode = { path: '', name: '', folders: [], notes: [], files: [] };
  const map = new Map<string, FolderNode>([['', root]]);
  const ensure = (p: string): FolderNode => {
    const hit = map.get(p);
    if (hit) return hit;
    const node: FolderNode = { path: p, name: baseOf(p), folders: [], notes: [], files: [] };
    map.set(p, node);
    ensure(parentOf(p)).folders.push(node);
    return node;
  };
  for (const f of folders) ensure(f);
  for (const n of notes) ensure(n.folder ?? '').notes.push(n);
  for (const a of files) ensure(a.folder ?? '').files.push(a);
  const cmpFiles = (a: Attachment, b: Attachment) => {
    switch (sort) {
      case 'name-desc': return b.name.localeCompare(a.name, undefined, { numeric: true });
      case 'mtime-desc': return b.updatedAt.localeCompare(a.updatedAt);
      case 'mtime-asc': return a.updatedAt.localeCompare(b.updatedAt);
      case 'ctime-desc': return b.createdAt.localeCompare(a.createdAt);
      case 'ctime-asc': return a.createdAt.localeCompare(b.createdAt);
      default: return a.name.localeCompare(b.name, undefined, { numeric: true });
    }
  };
  const cmpNotes = (a: Note, b: Note) => {
    switch (sort) {
      case 'name-desc': return b.title.localeCompare(a.title, undefined, { numeric: true });
      case 'mtime-desc': return (b.lastEdited ?? '').localeCompare(a.lastEdited ?? '');
      case 'mtime-asc': return (a.lastEdited ?? '').localeCompare(b.lastEdited ?? '');
      case 'ctime-desc': return (b.createdAt ?? '').localeCompare(a.createdAt ?? '');
      case 'ctime-asc': return (a.createdAt ?? '').localeCompare(b.createdAt ?? '');
      default: return a.title.localeCompare(b.title, undefined, { numeric: true });
    }
  };
  const desc = sort === 'name-desc';
  const walk = (n: FolderNode) => {
    n.folders.sort((a, b) => (desc ? -1 : 1) * a.name.localeCompare(b.name, undefined, { numeric: true }));
    n.notes.sort(cmpNotes);
    n.files.sort(cmpFiles);
    n.folders.forEach(walk);
  };
  walk(root);
  return root;
}

export function FileExplorer({ focusNonce }: { focusNonce?: number }) {
  const api = useVaultApi();
  const { vault, activeNote } = api;
  const [prefs, setPrefs] = useState<ExplorerPrefs>(() => readPref<ExplorerPrefs>(PREF_KEY, { sort: 'name-asc', expanded: [] }));
  const expanded = useMemo(() => new Set(prefs.expanded), [prefs.expanded]);
  const update = (p: Partial<ExplorerPrefs>) => setPrefs((cur) => { const next = { ...cur, ...p }; writePref(PREF_KEY, next); return next; });
  const toggle = (path: string, open?: boolean) => {
    const s = new Set(prefs.expanded);
    if (open ?? !s.has(path)) s.add(path); else s.delete(path);
    update({ expanded: [...s] });
  };
  const files = vault.attachments ?? vault.index.attachments;
  const tree = useMemo(() => buildTree(vault.folders, vault.notes, prefs.sort, files), [vault.folders, vault.notes, prefs.sort, files]);
  const [sortMenu, setSortMenu] = useState<{ x: number; y: number } | null>(null);
  const [menu, setMenu] = useState<{ at: { x: number; y: number }; items: MenuItemDef[] } | null>(null);
  const [renaming, setRenaming] = useState<string | null>(null); // 'n:<id>' | 'f:<path>'
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  // Rename requests from elsewhere (e.g. "New folder" → rename immediately).
  useEffect(() => { if (api.explorerRename) { const k = api.explorerRename.key; setRenaming(k); if (k.startsWith('f:')) { const p = k.slice(2); const parts = parentOf(p); if (parts) revealFolder(parts); } } }, [api.explorerRename]); // eslint-disable-line react-hooks/exhaustive-deps

  const revealFolder = (folder: string) => {
    const parts = folder.split('/');
    const need = parts.map((_, i) => parts.slice(0, i + 1).join('/')).filter((p) => !expanded.has(p));
    if (need.length) update({ expanded: [...prefs.expanded, ...need] });
  };
  // Reveal the active note (expand ancestors, scroll into view).
  useEffect(() => {
    if (!activeNote) return;
    setSelected(null);
    if (activeNote.folder) revealFolder(activeNote.folder);
    window.setTimeout(() => rootRef.current?.querySelector<HTMLElement>(`[data-note="${CSS.escape(activeNote.id)}"]`)?.scrollIntoView({ block: 'nearest' }), 30);
  }, [activeNote?.id, activeNote?.folder]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const r = api.revealNonce;
    if (!r) return;
    if (r.id.startsWith('a:')) {
      const a = vault.index.attachmentsById.get(r.id.slice(2));
      if (a?.folder) revealFolder(a.folder);
      setSelected(r.id);
      window.setTimeout(() => {
        const el = rootRef.current?.querySelector<HTMLElement>(`[data-attachment="${CSS.escape(r.id.slice(2))}"]`);
        el?.scrollIntoView({ block: 'center' });
        el?.focus();
      }, 60);
      return;
    }
    const n = vault.index.byId.get(r.id);
    if (n?.folder) revealFolder(n.folder);
    setSelected(`n:${r.id}`);
    window.setTimeout(() => {
      const el = rootRef.current?.querySelector<HTMLElement>(`[data-note="${CSS.escape(r.id)}"]`);
      el?.scrollIntoView({ block: 'center' });
      el?.focus();
    }, 60);
  }, [api.revealNonce]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (focusNonce) rootRef.current?.querySelector<HTMLElement>('[data-row]')?.focus(); }, [focusNonce]);

  const allExpanded = vault.folders.length > 0 && vault.folders.every((f) => expanded.has(f));

  const commitRename = async (key: string, value: string) => {
    setRenaming(null);
    const v = value.trim();
    if (!v) return;
    if (key.startsWith('n:')) {
      await api.renameNote(key.slice(2), v);
    } else if (key.startsWith('a:')) {
      await api.renameAttachment(key.slice(2), v);
    } else {
      const from = key.slice(2);
      if (v === baseOf(from)) return;
      const to = parentOf(from) ? `${parentOf(from)}/${v}` : v;
      try {
        await renameFolder(from, to);
        if (expanded.has(from)) update({ expanded: prefs.expanded.map((p) => (p === from || p.startsWith(from + '/') ? to + p.slice(from.length) : p)) });
      } catch (e) { api.toast(e instanceof VaultError ? e.message : 'Could not rename folder'); }
    }
  };

  const moveInto = async (e: React.DragEvent, folder: string) => {
    e.preventDefault();
    setDropTarget(null);
    const noteId = e.dataTransfer.getData(DND_NOTE);
    const src = e.dataTransfer.getData(DND_FOLDER);
    const attId = e.dataTransfer.getData(DND_ATTACHMENT);
    try {
      if (attId) {
        const a = vault.index.attachmentsById.get(attId);
        if (!a || (a.folder ?? '') === folder) return;
        await moveAttachmentTo(a, folder);
        if (folder) revealFolder(folder);
      } else if (!noteId && !src && e.dataTransfer.files?.length) {
        api.uploadFiles([...e.dataTransfer.files], folder || null);
        if (folder) revealFolder(folder);
      } else if (noteId) {
        const n = vault.index.byId.get(noteId);
        if (!n || (n.folder ?? '') === folder) return;
        const count = await renameNote(noteId, { folder: folder || null });
        api.toast(`Moved “${n.title}” to ${folder || 'vault root'}${count ? ` · updated links in ${count} note${count === 1 ? '' : 's'}` : ''}`);
        if (folder) revealFolder(folder);
      } else if (src) {
        if (folder === src || folder.startsWith(src + '/') || parentOf(src) === folder) return;
        const to = folder ? `${folder}/${baseOf(src)}` : baseOf(src);
        await renameFolder(src, to);
        api.toast(`Moved folder to ${folder || 'vault root'}`);
      }
    } catch (err) { api.toast(err instanceof VaultError ? err.message : 'Move failed'); }
  };
  const moveAttachmentTo = async (a: Attachment, folder: string) => {
    const before = a.folder ?? '';
    if (before === folder) return;
    try {
      await renameAttachment(a.id, { folder: folder || null });
      api.toast(`Moved “${a.name}” to ${folder || 'vault root'}`);
    } catch (err) { api.toast(err instanceof Error ? err.message : 'Move failed'); }
  };
  const dropProps = (folder: string) => ({
    onDragOver: (e: React.DragEvent) => {
      const os = hasOsFiles(e);
      if (!os && ![...e.dataTransfer.types].some((t) => t === DND_NOTE || t === DND_FOLDER || t === DND_ATTACHMENT)) return;
      e.preventDefault(); e.stopPropagation(); e.dataTransfer.dropEffect = os ? 'copy' : 'move'; setDropTarget(folder);
    },
    onDragLeave: (e: React.DragEvent) => { if (!(e.currentTarget as HTMLElement).contains(e.relatedTarget as Node)) setDropTarget((d) => (d === folder ? null : d)); },
    onDrop: (e: React.DragEvent) => { e.stopPropagation(); void moveInto(e, folder); },
  });

  const folderMenu = (path: string): MenuItemDef[] => [
    { label: 'New note', icon: <FilePlus2 size={14} />, onClick: () => { toggle(path, true); api.newNote(path); } },
    ...(api.newCanvas ? [{ label: 'New canvas', icon: <LayoutDashboard size={14} />, onClick: () => { toggle(path, true); api.newCanvas!(path); } }] : []),
    { label: 'New folder', icon: <FolderPlus size={14} />, onClick: () => { toggle(path, true); api.newFolder(path); } },
    'sep',
    { label: 'Rename', icon: <Pencil size={14} />, hint: 'F2', onClick: () => setRenaming(`f:${path}`) },
    {
      label: 'Delete', icon: <Trash2 size={14} />, danger: true, onClick: async () => {
        const count = vault.notes.filter((n) => n.folder === path || n.folder?.startsWith(path + '/')).length;
        const ok = await api.confirm({ title: 'Delete folder', message: `Delete “${path}”${count ? ` and the ${count} note${count === 1 ? '' : 's'} inside it` : ''}?`, confirm: 'Delete', danger: true });
        if (!ok) return;
        const undo = await deleteFolder(path);
        api.toast(`Deleted folder “${baseOf(path)}”`, { label: 'Undo', onClick: () => void undo() });
      },
    },
  ];

  const onRowKey = (e: React.KeyboardEvent, key: string, onEnter: () => void) => {
    if (e.key === 'F2') { e.preventDefault(); setRenaming(key); }
    else if (e.key === 'Enter') { e.preventDefault(); onEnter(); }
    else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      const rows = [...(rootRef.current?.querySelectorAll<HTMLElement>('[data-row]') ?? [])];
      const i = rows.indexOf(e.currentTarget as HTMLElement);
      rows[i + (e.key === 'ArrowDown' ? 1 : -1)]?.focus();
    }
  };

  const renderFolder = (node: FolderNode, depth: number): React.ReactNode => {
    const open = expanded.has(node.path);
    const key = `f:${node.path}`;
    return (
      <div key={key} {...dropProps(node.path)}>
        <div
          data-row
          tabIndex={0}
          role="treeitem"
          aria-expanded={open}
          draggable={renaming !== key}
          onDragStart={(e) => { e.dataTransfer.setData(DND_FOLDER, node.path); e.dataTransfer.effectAllowed = 'move'; }}
          onClick={() => { setSelected(key); toggle(node.path); }}
          onDoubleClick={(e) => { e.preventDefault(); setRenaming(key); }}
          onContextMenu={(e) => { e.preventDefault(); setSelected(key); setMenu({ at: { x: e.clientX, y: e.clientY }, items: folderMenu(node.path) }); }}
          onKeyDown={(e) => {
            if (e.key === 'ArrowRight') { e.preventDefault(); toggle(node.path, true); }
            else if (e.key === 'ArrowLeft') { e.preventDefault(); toggle(node.path, false); }
            else onRowKey(e, key, () => toggle(node.path));
          }}
          style={{ paddingLeft: 6 + depth * 14 }}
          className={`group flex items-center gap-1 h-7 pr-2 mx-1 rounded-md cursor-pointer select-none outline-none focus-visible:ring-1 focus-visible:ring-blue-500/60 ${dropTarget === node.path ? 'bg-blue-500/15 ring-1 ring-blue-500/40' : selected === key ? 'bg-gray-200/70 dark:bg-white/[0.07]' : vx.hover} ${vx.text}`}
        >
          <ChevronRight size={13} className={`shrink-0 transition-transform ${vx.faint} ${open ? 'rotate-90' : ''}`} />
          {open ? <FolderOpen size={14} className={`shrink-0 ${vx.faint}`} /> : <Folder size={14} className={`shrink-0 ${vx.faint}`} />}
          {renaming === key
            ? <RenameInput initial={node.name} onDone={(v) => void commitRename(key, v)} onCancel={() => setRenaming(null)} />
            : <span className="truncate text-[13px] font-medium">{node.name}</span>}
        </div>
        {open ? (
          <div className="relative">
            <div className="absolute top-0 bottom-0 border-l border-gray-200 dark:border-white/[0.06]" style={{ left: 12 + depth * 14 }} />
            {node.folders.map((f) => renderFolder(f, depth + 1))}
            {node.notes.map((n) => renderNote(n, depth + 1))}
            {node.files.map((a) => renderFile(a, depth + 1))}
          </div>
        ) : null}
      </div>
    );
  };

  const renderNote = (n: Note, depth: number) => {
    const key = `n:${n.id}`;
    const active = activeNote?.id === n.id;
    const Icon = n.kind === 'daily' ? CalendarDays : n.kind === 'template' ? LayoutTemplate : n.kind === 'canvas' ? LayoutDashboard : null;
    return (
      <div
        key={key}
        data-row
        data-note={n.id}
        tabIndex={0}
        role="treeitem"
        aria-selected={active}
        draggable={renaming !== key}
        onDragStart={(e) => { e.dataTransfer.setData(DND_NOTE, n.id); e.dataTransfer.setData('text/plain', `[[${n.title}]]`); e.dataTransfer.effectAllowed = 'copyMove'; }}
        onClick={(e) => { setSelected(key); api.openNote(n.id, { newTab: e.metaKey || e.ctrlKey }); }}
        onAuxClick={(e) => { if (e.button === 1) { e.preventDefault(); api.openNote(n.id, { newTab: true }); } }}
        onDoubleClick={(e) => { e.preventDefault(); setRenaming(key); }}
        onContextMenu={(e) => {
          e.preventDefault();
          setSelected(key);
          setMenu({ at: { x: e.clientX, y: e.clientY }, items: [...api.noteMenu(n), 'sep', { label: 'Rename in explorer', icon: <Pencil size={14} />, hint: 'F2', onClick: () => setRenaming(key) }] });
        }}
        onKeyDown={(e) => onRowKey(e, key, () => api.openNote(n.id, { newTab: e.metaKey || e.ctrlKey }))}
        style={{ paddingLeft: 6 + depth * 14 + 17 }}
        title={n.folder ? `${n.folder}/${n.title}` : n.title}
        className={`flex items-center gap-1.5 h-7 pr-2 mx-1 rounded-md cursor-pointer select-none outline-none focus-visible:ring-1 focus-visible:ring-blue-500/60 ${active ? vx.active : selected === key ? `bg-gray-200/70 dark:bg-white/[0.07] ${vx.text}` : `${vx.hover} text-gray-700 dark:text-gray-300`}`}
      >
        {Icon ? <Icon size={13} className={`shrink-0 ${vx.faint}`} /> : null}
        {renaming === key
          ? <RenameInput initial={n.title} onDone={(v) => void commitRename(key, v)} onCancel={() => setRenaming(null)} />
          : <span className="truncate text-[13px]">{n.title}</span>}
        {n.bookmarked && renaming !== key ? <Star size={11} className="shrink-0 ml-auto text-amber-400 fill-amber-400" /> : null}
      </div>
    );
  };

  const renderFile = (a: Attachment, depth: number) => {
    const key = `a:${a.id}`;
    const kind = attachmentKind(a);
    const Icon = KIND_ICON[kind];
    const open = api.activeAttachmentId === a.id;
    return (
      <div
        key={key}
        data-row
        data-attachment={a.id}
        tabIndex={0}
        role="treeitem"
        aria-selected={open}
        aria-label={`${a.name}, ${kind === 'other' ? 'file' : kind}, ${formatBytes(a.size)}`}
        draggable={renaming !== key}
        onDragStart={(e) => {
          e.dataTransfer.setData(DND_ATTACHMENT, a.id);
          e.dataTransfer.setData('text/plain', `![[${vault.index.attachments.some((x) => x.id !== a.id && x.name.toLowerCase() === a.name.toLowerCase()) && a.folder ? `${a.folder}/${a.name}` : a.name}]]`);
          e.dataTransfer.effectAllowed = 'copyMove';
        }}
        onClick={(e) => { setSelected(key); api.openAttachment(a.id, { newTab: e.metaKey || e.ctrlKey }); }}
        onAuxClick={(e) => { if (e.button === 1) { e.preventDefault(); api.openAttachment(a.id, { newTab: true }); } }}
        onDoubleClick={(e) => { e.preventDefault(); setRenaming(key); }}
        onContextMenu={(e) => {
          e.preventDefault();
          setSelected(key);
          setMenu({ at: { x: e.clientX, y: e.clientY }, items: [...api.attachmentMenu(a), 'sep', { label: 'Rename in explorer', icon: <Pencil size={14} />, hint: 'F2', onClick: () => setRenaming(key) }] });
        }}
        onKeyDown={(e) => onRowKey(e, key, () => api.openAttachment(a.id, { newTab: e.metaKey || e.ctrlKey }))}
        style={{ paddingLeft: 6 + depth * 14 + 17 }}
        title={`${a.folder ? `${a.folder}/` : ''}${a.name} · ${formatBytes(a.size)}`}
        className={`group flex items-center gap-1.5 h-7 pr-2 mx-1 rounded-md cursor-pointer select-none outline-none focus-visible:ring-1 focus-visible:ring-blue-500/60 ${open ? vx.active : selected === key ? `bg-gray-200/70 dark:bg-white/[0.07] ${vx.text}` : `${vx.hover} text-gray-700 dark:text-gray-300`}`}
      >
        <Icon size={13} className={`shrink-0 ${kind === 'image' ? 'text-amber-500' : kind === 'pdf' ? 'text-red-500' : kind === 'audio' ? 'text-fuchsia-500' : kind === 'video' ? 'text-sky-500' : vx.faint}`} />
        {renaming === key
          ? <RenameInput initial={a.name} onDone={(v) => void commitRename(key, v)} onCancel={() => setRenaming(null)} />
          : <>
            <span className="truncate text-[13px]">{a.name}</span>
            <span className={`ml-auto shrink-0 text-[10.5px] ${vx.faint} opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100`}>{formatBytes(a.size)}</span>
          </>}
      </div>
    );
  };

  return (
    <div className="flex flex-col h-full min-h-0">
      <PaneHeader title="Files">
        <button className={vx.iconBtn} title="New note" aria-label="New note" onClick={() => api.newNote(undefined)}><FilePlus2 size={15} /></button>
        <button className={vx.iconBtn} title="New folder" aria-label="New folder" onClick={() => api.newFolder(activeNote?.folder ?? null)}><FolderPlus size={15} /></button>
        <button className={vx.iconBtn} title="Change sort order" aria-label="Change sort order" onClick={(e) => { const r = (e.currentTarget as HTMLElement).getBoundingClientRect(); setSortMenu({ x: r.left, y: r.bottom + 4 }); }}><ArrowDownUp size={15} /></button>
        <button
          className={vx.iconBtn}
          title={allExpanded ? 'Collapse all' : 'Expand all'}
          aria-label={allExpanded ? 'Collapse all' : 'Expand all'}
          onClick={() => update({ expanded: allExpanded ? [] : [...vault.folders] })}
        >{allExpanded ? <ChevronsDownUp size={15} /> : <ChevronsUpDown size={15} />}</button>
      </PaneHeader>
      <div
        ref={rootRef}
        role="tree"
        aria-label="Files"
        className={`flex-1 min-h-0 overflow-y-auto py-1 ${dropTarget === '' ? 'bg-blue-500/5' : ''}`}
        {...dropProps('')}
        onContextMenu={(e) => {
          if (e.target !== e.currentTarget) return;
          e.preventDefault();
          setMenu({ at: { x: e.clientX, y: e.clientY }, items: [
            { label: 'New note', icon: <FilePlus2 size={14} />, onClick: () => api.newNote(null) },
            ...(api.newCanvas ? [{ label: 'New canvas', icon: <LayoutDashboard size={14} />, onClick: () => api.newCanvas!(null) }] : []),
            { label: 'New folder', icon: <FolderPlus size={14} />, onClick: () => api.newFolder(null) },
          ] });
        }}
      >
        {tree.folders.map((f) => renderFolder(f, 0))}
        {tree.notes.map((n) => renderNote(n, 0))}
        {tree.files.map((a) => renderFile(a, 0))}
        {!vault.notes.length && !vault.folders.length && !files.length ? <div className={`px-4 py-6 text-[13px] text-center ${vx.muted}`}>No notes yet</div> : null}
        <div className="h-16" {...dropProps('')} />
      </div>
      <div className={`px-3 py-1.5 border-t ${vx.border} text-[11px] ${vx.faint} flex justify-between`}>
        <span>{vault.notes.length} note{vault.notes.length === 1 ? '' : 's'}{files.length ? ` · ${files.length} file${files.length === 1 ? '' : 's'}` : ''}</span>
        <span>{vault.folders.length} folder{vault.folders.length === 1 ? '' : 's'}</span>
      </div>
      <ContextMenu
        at={sortMenu}
        onClose={() => setSortMenu(null)}
        items={(Object.keys(SORT_LABEL) as SortKey[]).map((k) => ({ label: SORT_LABEL[k], icon: prefs.sort === k ? <Check size={13} /> : <FileText size={13} className="opacity-0" />, onClick: () => update({ sort: k }) }))}
      />
      <ContextMenu at={menu?.at ?? null} items={menu?.items ?? []} onClose={() => setMenu(null)} />
    </div>
  );
}

function RenameInput({ initial, onDone, onCancel }: { initial: string; onDone: (v: string) => void; onCancel: () => void }) {
  const ref = useRef<HTMLInputElement>(null);
  const done = useRef(false);
  useEffect(() => { const el = ref.current; if (el) { el.focus(); el.select(); } }, []);
  return (
    <input
      ref={ref}
      defaultValue={initial}
      aria-label="New name"
      onClick={(e) => e.stopPropagation()}
      onDoubleClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === 'Enter') { e.preventDefault(); done.current = true; onDone((e.target as HTMLInputElement).value); }
        if (e.key === 'Escape') { e.preventDefault(); done.current = true; onCancel(); }
      }}
      onBlur={(e) => { if (!done.current) { done.current = true; onDone(e.target.value); } }}
      className="flex-1 min-w-0 bg-white dark:bg-[#05050A] border border-blue-500/60 rounded px-1 py-0 text-[13px] outline-none text-gray-900 dark:text-gray-100"
    />
  );
}
