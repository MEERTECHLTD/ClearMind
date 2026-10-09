/**
 * Notes as an Obsidian-style vault workspace: ribbon, collapsible/resizable
 * sidebars (Files · Search · Bookmarks · Tags | Backlinks · Outgoing · Outline
 * · Local graph · Info), tabbed panes with a side-by-side split, quick
 * switcher, command palette, daily notes, templates and vault settings.
 * Routes: #notes and #notes/<noteId>.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  FolderClosed, Search, Bookmark, Tags, Link2, ArrowUpRight, ListTree, Waypoints, Info, FileSearch, SquarePen, CalendarDays,
  SquareTerminal, LayoutTemplate, Settings, FilePlus2, Columns2, Pencil, FolderInput, Copy, Trash2, Star, Link as LinkIcon,
  PanelLeft, PanelRight, BookOpen, Bold, Italic, Highlighter, ListChecks, TextSearch, Shuffle, X, Pin, Sparkles, ArrowLeft, ArrowRight,
  Code2, ExternalLink, Locate, Strikethrough, Paperclip, LayoutDashboard, Network,
} from 'lucide-react';
import type { Note } from '../../types';
import { useTaskToast } from '../tasks/ui';
import {
  useVault, useVaultSettings, createNote, renameNote as renameNoteData, deleteNotes, toggleBookmark, createFolder, openDailyNote,
  insertTemplateInto, newNoteFolder, openOrCreateLink, VaultError,
} from '../vault/useVault';
import type { NoteEditorHandle } from '../vault/editor';
import {
  loadWorkspace, saveWorkspace, loadLayout, saveLayout, activePaneOf, activeTabOf, openIn, openInSplit, splitActive, closeTab, closeOthers,
  closeNote, closeAttachment, moveTab, updateTab, focusTab, navigate, pruneWorkspace, type Workspace, type Layout, type LeftTab, type RightTab, type ViewMode,
  type OpenTarget, type NoteTab,
} from '../vault/workspace';
import { VaultCtx, vx, ContextMenu, useMediaQuery, type VaultApi, type MenuItemDef, type OpenOpts } from '../vault/shell';
import { FileExplorer } from '../vault/FileExplorer';
import { SearchPane, BookmarksPane, TagsPane } from '../vault/LeftPanes';
import { RightPane } from '../vault/RightPanes';
import { PaneView, type PaneCtl } from '../vault/PaneView';
import { NotePane, type ScrollReq } from '../vault/NotePane';
import { CanvasView } from '../vault/canvas/CanvasView';
import { serializeCanvas, EMPTY_CANVAS, uniqueTitle } from '../../shared/notes';
import { QuickSwitcher, CommandPalette, TemplatePicker, FolderPicker, VaultSettingsModal, ConfirmModal, type Command } from '../vault/Modals';
import { duplicateNote, seedSampleNotes } from '../vault/vaultActions';
import { AttachmentPane } from '../vault/AttachmentPane';
import { useAttachmentActions } from '../vault/attachmentActions';
import { attachmentFor } from '../vault/editor/attachmentEmbeds';

const LEFT_TABS: { id: LeftTab; label: string; icon: React.ReactNode }[] = [
  { id: 'files', label: 'Files', icon: <FolderClosed size={16} /> },
  { id: 'search', label: 'Search', icon: <Search size={16} /> },
  { id: 'bookmarks', label: 'Bookmarks', icon: <Bookmark size={16} /> },
  { id: 'tags', label: 'Tags', icon: <Tags size={16} /> },
];
const RIGHT_TABS: { id: RightTab; label: string; icon: React.ReactNode }[] = [
  { id: 'backlinks', label: 'Backlinks', icon: <Link2 size={16} /> },
  { id: 'outgoing', label: 'Outgoing links', icon: <ArrowUpRight size={16} /> },
  { id: 'outline', label: 'Outline', icon: <ListTree size={16} /> },
  { id: 'graph', label: 'Local graph', icon: <Waypoints size={16} /> },
  { id: 'info', label: 'Tags & info', icon: <Info size={16} /> },
];

/** Match a hotkey spec ("Mod+Alt+N", "Mod+\\", "F2") against a keyboard event. */
function matches(spec: string, e: KeyboardEvent): boolean {
  const parts = spec.split('+');
  const key = parts.pop()!;
  const want = { mod: parts.includes('Mod'), alt: parts.includes('Alt'), shift: parts.includes('Shift') };
  if ((e.metaKey || e.ctrlKey) !== want.mod || e.altKey !== want.alt || e.shiftKey !== want.shift) return false;
  if (/^F\d+$/.test(key)) return e.key === key;
  const code: Record<string, string> = { '\\': 'Backslash', '[': 'BracketLeft', ']': 'BracketRight', ',': 'Comma' };
  return e.code === (code[key] ?? `Key${key.toUpperCase()}`);
}

export default function VaultView({ noteId }: { noteId?: string }) {
  const vault = useVault();
  const settings = useVaultSettings();
  const toast = useTaskToast();
  const desktop = useMediaQuery('(min-width: 768px)');

  const [ws, setWs] = useState<Workspace>(loadWorkspace);
  const [layout, setLayoutState] = useState<Layout>(loadLayout);
  const setLayout = useCallback((p: Partial<Layout>) => setLayoutState((l) => { const n = { ...l, ...p }; saveLayout(n); return n; }), []);
  const [drawer, setDrawer] = useState<'left' | 'right' | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchFocus, setSearchFocus] = useState(0);
  const [explorerFocus, setExplorerFocus] = useState(0);
  const [modal, setModal] = useState<null | 'switcher' | 'palette' | 'templates' | 'settings'>(null);
  const [movePicker, setMovePicker] = useState<string | null>(null);
  const [confirmState, setConfirmState] = useState<{ title: string; message: string; confirm: string; danger?: boolean } | null>(null);
  const confirmResolve = useRef<((ok: boolean) => void) | null>(null);
  const [menu, setMenu] = useState<{ at: { x: number; y: number }; items: MenuItemDef[] } | null>(null);
  const [scrollReq, setScrollReq] = useState<(ScrollReq & { noteId: string }) | null>(null);
  const [renameReq, setRenameReq] = useState<{ noteId: string; nonce: number } | null>(null);
  const [cursorLine, setCursorLine] = useState(0);
  const [explorerRename, setExplorerRename] = useState<{ key: string; nonce: number } | null>(null);
  const [revealNonce, setRevealNonce] = useState<{ id: string; nonce: number } | null>(null);
  const [seeding, setSeeding] = useState(false);
  const handles = useRef(new Map<string, NoteEditorHandle | null>());
  const flushes = useRef(new Map<string, () => void>());
  const pruned = useRef(false);

  // ---------------------------------------------------------------- derived
  const activePane = activePaneOf(ws);
  const activeTab = activeTabOf(activePane);
  const tabNote = activeTab?.type === 'note' ? vault.index.byId.get(activeTab.noteId) ?? null : null;
  // Sidebars keep showing the last focused note while a graph/empty tab is active (like Obsidian).
  const lastNoteId = useRef<string | null>(null);
  if (tabNote) lastNoteId.current = tabNote.id;
  const activeNote = tabNote ?? (activeTab?.type !== 'note' && lastNoteId.current ? vault.index.byId.get(lastNoteId.current) ?? null : null);
  const modeOf = useCallback((t: NoteTab): ViewMode => t.mode ?? settings.defaultMode, [settings.defaultMode]);
  const wsRef = useRef(ws); wsRef.current = ws;
  const noteRef = useRef(activeNote); noteRef.current = activeNote;
  const vaultRef = useRef(vault); vaultRef.current = vault;

  useEffect(() => { saveWorkspace(ws); }, [ws]);
  useEffect(() => { setCursorLine(0); }, [activeNote?.id]);

  // Drop tabs for notes that no longer exist, once the store has loaded.
  useEffect(() => {
    if (!vault.loaded || pruned.current) return;
    pruned.current = true;
    setWs((cur) => pruneWorkspace(cur, (id) => vault.index.byId.has(id)));
  }, [vault.loaded, vault.index]);

  const flushAll = useCallback(() => { flushes.current.forEach((f) => f()); }, []);
  const registerHandle = useCallback((paneId: string, h: NoteEditorHandle | null) => { if (h) handles.current.set(paneId, h); else handles.current.delete(paneId); }, []);
  const registerFlush = useCallback((paneId: string, f: (() => void) | null) => { if (f) flushes.current.set(paneId, f); else flushes.current.delete(paneId); }, []);
  const activeHandle = () => handles.current.get(wsRef.current.activePane) ?? null;

  // ---------------------------------------------------------------- opening things
  const open = useCallback((target: OpenTarget, opts: OpenOpts = {}) => {
    setWs((cur) => (opts.split ? openInSplit(cur, target) : openIn(cur, opts.paneId ?? cur.activePane, target, opts.newTab ? 'tab' : 'replace')));
    setDrawer(null);
  }, []);
  const openNote = useCallback((id: string, opts: OpenOpts = {}) => {
    open({ type: 'note', noteId: id }, opts);
    if (opts.line !== undefined || opts.heading || opts.block) setScrollReq({ noteId: id, line: opts.line, heading: opts.heading, block: opts.block, nonce: Date.now() });
  }, [open]);
  const openLink = useCallback((target: string, from: Note | null, opts: OpenOpts = {}) => {
    const file = attachmentFor(vaultRef.current.index, target, from?.id);
    if (file) { open({ type: 'attachment', attachmentId: file.id }, opts); return; }
    const existed = !!vaultRef.current.index.resolve(target, from?.id);
    openOrCreateLink(target, from)
      .then((n) => { if (!existed) toast(`Created “${n.title}”`); openNote(n.id, opts); })
      .catch((e) => toast(e instanceof VaultError ? e.message : 'Could not open link'));
  }, [open, openNote, toast]);
  const openGraph = useCallback((opts: { newTab?: boolean; split?: boolean } = {}) => open({ type: 'graph' }, { ...opts, newTab: true }), [open]);
  const openSearch = useCallback((q: string) => {
    setSearchQuery(q);
    setLayout({ leftOpen: true, leftTab: 'search' });
    if (!desktop) setDrawer('left');
    setSearchFocus((n) => n + 1);
  }, [desktop, setLayout]);
  const reveal = useCallback((id: string) => {
    setLayout({ leftOpen: true, leftTab: 'files' });
    if (!desktop) setDrawer('left');
    setRevealNonce({ id, nonce: Date.now() });
  }, [desktop, setLayout]);
  const requestRename = useCallback((id: string) => {
    setRenameReq({ noteId: id, nonce: Date.now() });
    window.setTimeout(() => setRenameReq((r) => (r?.noteId === id ? null : r)), 600);
  }, []);

  const atts = useAttachmentActions({
    toast, open, flushAll, desktop,
    closeTabs: (id) => setWs((cur) => closeAttachment(cur, id)),
    activeEditor: () => { const t = activeTabOf(activePaneOf(wsRef.current)); return t?.type === 'note' && modeOf(t) !== 'reading' ? activeHandle() : null; },
    activeNote: () => noteRef.current,
    reveal: (id) => reveal(`a:${id}`),
  });

  const newNote = useCallback((folder?: string | null, opts: { newTab?: boolean; title?: string } = {}) => {
    const f = folder === undefined ? newNoteFolder(noteRef.current) : folder;
    createNote({ folder: f, title: opts.title })
      .then((n) => {
        const cur = activeTabOf(activePaneOf(wsRef.current));
        open({ type: 'note', noteId: n.id }, { newTab: opts.newTab ?? (cur?.type !== 'empty' && !!cur) });
        if (!opts.title) requestRename(n.id);
      })
      .catch((e) => toast(e instanceof VaultError ? e.message : 'Could not create note'));
  }, [open, requestRename, toast]);
  const newCanvas = useCallback((folder?: string | null) => {
    const f = folder === undefined ? newNoteFolder(noteRef.current) : folder;
    createNote({ folder: f, kind: 'canvas', title: uniqueTitle(vaultRef.current.index, 'Untitled canvas', f), content: serializeCanvas(EMPTY_CANVAS) })
      .then((n) => {
        const cur = activeTabOf(activePaneOf(wsRef.current));
        open({ type: 'note', noteId: n.id }, { newTab: cur?.type !== 'empty' && !!cur });
        requestRename(n.id);
      })
      .catch((e) => toast(e instanceof VaultError ? e.message : 'Could not create canvas'));
  }, [open, requestRename, toast]);
  const newFolder = useCallback((parent: string | null) => {
    const taken = new Set(vaultRef.current.folders.map((f) => f.toLowerCase()));
    const base = parent ? `${parent}/Untitled` : 'Untitled';
    let path = base;
    for (let i = 1; taken.has(path.toLowerCase()); i++) path = `${base} ${i}`;
    try { createFolder(path); } catch (e) { toast(e instanceof VaultError ? e.message : 'Could not create folder'); return; }
    setLayout({ leftOpen: true, leftTab: 'files' });
    if (!desktop) setDrawer('left');
    window.setTimeout(() => setExplorerRename({ key: `f:${path}`, nonce: Date.now() }), 30);
  }, [desktop, setLayout, toast]);

  const renameNote = useCallback(async (id: string, title: string) => {
    flushAll();
    try {
      const count = await renameNoteData(id, { title });
      if (count) toast(`Updated links in ${count} note${count === 1 ? '' : 's'}`);
      return true;
    } catch (e) { toast(e instanceof VaultError ? e.message : 'Rename failed'); return false; }
  }, [flushAll, toast]);
  const moveNote = useCallback(async (id: string, folder: string) => {
    flushAll();
    const n = vaultRef.current.index.byId.get(id);
    try {
      const count = await renameNoteData(id, { folder: folder || null });
      toast(`Moved “${n?.title}” to ${folder || 'vault root'}${count ? ` · updated links in ${count} note${count === 1 ? '' : 's'}` : ''}`);
    } catch (e) { toast(e instanceof VaultError ? e.message : 'Move failed'); }
  }, [flushAll, toast]);
  const deleteNote = useCallback(async (id: string) => {
    flushAll();
    const n = vaultRef.current.index.byId.get(id);
    if (!n) return;
    const undo = await deleteNotes([id]);
    setWs((cur) => closeNote(cur, id));
    toast(`Deleted “${n.title}”`, { label: 'Undo', onClick: () => { void undo().then(() => openNote(id)); } });
  }, [flushAll, toast, openNote]);
  const duplicate = useCallback(async (n: Note) => {
    flushAll();
    try { const d = await duplicateNote(vaultRef.current.index.byId.get(n.id) ?? n, vaultRef.current.notes); openNote(d.id, { newTab: true }); }
    catch (e) { toast(e instanceof VaultError ? e.message : 'Could not duplicate'); }
  }, [flushAll, openNote, toast]);
  const copyLink = useCallback((n: Note) => {
    const link = `[[${n.title}]]`;
    navigator.clipboard?.writeText(link).then(() => toast(`Copied ${link}`), () => toast('Clipboard unavailable'));
  }, [toast]);
  const openDaily = useCallback((opts: OpenOpts = {}) => {
    openDailyNote().then((n) => openNote(n.id, opts)).catch((e) => toast(e instanceof VaultError ? e.message : 'Could not open daily note'));
  }, [openNote, toast]);
  const confirm = useCallback((o: { title: string; message: string; confirm: string; danger?: boolean }) => new Promise<boolean>((res) => { confirmResolve.current = res; setConfirmState(o); }), []);

  const setMode = useCallback((paneId: string, tabId: string, mode: ViewMode) => setWs((cur) => updateTab(cur, paneId, tabId, { mode })), []);
  const toggleReading = useCallback(() => {
    const p = activePaneOf(wsRef.current), t = activeTabOf(p);
    if (t?.type !== 'note') return;
    flushAll();
    const m = t.mode ?? settings.defaultMode;
    setMode(p.id, t.id, m === 'reading' ? (settings.defaultMode === 'reading' ? 'live' : settings.defaultMode) : 'reading');
  }, [flushAll, setMode, settings.defaultMode]);
  const scrollActive = useCallback((req: { line?: number; heading?: string }) => {
    const n = noteRef.current;
    if (n) setScrollReq({ noteId: n.id, ...req, nonce: Date.now() });
    if (!desktop) setDrawer(null);
  }, [desktop]);

  const insertTemplate = useCallback(async (tpl: Note) => {
    const p = activePaneOf(wsRef.current), t = activeTabOf(p);
    const n = noteRef.current;
    if (!n || t?.type !== 'note') { toast('Open a note to insert a template'); return; }
    flushAll();
    const at = modeOf(t) !== 'reading' ? handles.current.get(p.id)?.cursor() : undefined;
    const res = await insertTemplateInto(n.id, tpl.id, at);
    if (res !== null) toast(`Inserted “${tpl.title}”`);
  }, [flushAll, modeOf, toast]);

  const toggleSidebar = useCallback((side: 'left' | 'right') => {
    if (!desktop) { setDrawer((d) => (d === side ? null : side)); return; }
    setLayoutState((l) => { const n = { ...l, [side === 'left' ? 'leftOpen' : 'rightOpen']: !(side === 'left' ? l.leftOpen : l.rightOpen) }; saveLayout(n); return n; });
  }, [desktop]);
  const showLeft = useCallback((tab: LeftTab) => { setLayout({ leftOpen: true, leftTab: tab }); if (!desktop) setDrawer('left'); }, [desktop, setLayout]);
  const showRight = useCallback((tab: RightTab) => { setLayout({ rightOpen: true, rightTab: tab }); if (!desktop) setDrawer('right'); }, [desktop, setLayout]);

  // ---------------------------------------------------------------- menus
  const noteMenu = useCallback((n: Note, paneId?: string): MenuItemDef[] => {
    const isActive = noteRef.current?.id === n.id;
    return [
      { label: 'Open in new tab', icon: <ExternalLink size={14} />, onClick: () => openNote(n.id, { newTab: true }) },
      { label: 'Open to the right', icon: <Columns2 size={14} />, onClick: () => openNote(n.id, { split: true }), disabled: !desktop },
      'sep',
      { label: 'Rename…', icon: <Pencil size={14} />, hint: 'F2', onClick: () => { if (!isActive) openNote(n.id, { paneId }); requestRename(n.id); } },
      { label: 'Move file to…', icon: <FolderInput size={14} />, onClick: () => setMovePicker(n.id) },
      { label: 'Duplicate', icon: <Copy size={14} />, onClick: () => void duplicate(n) },
      { label: n.bookmarked ? 'Remove bookmark' : 'Bookmark', icon: <Star size={14} />, onClick: () => void toggleBookmark(n) },
      { label: 'Copy wikilink', icon: <LinkIcon size={14} />, onClick: () => copyLink(n) },
      ...(isActive ? [{ label: 'Insert template…', icon: <LayoutTemplate size={14} />, onClick: () => setModal('templates') } as MenuItemDef] : []),
      ...(isActive ? [{ label: 'Attach file…', icon: <Paperclip size={14} />, onClick: () => atts.attachFile() } as MenuItemDef] : []),
      { label: 'Reveal in file explorer', icon: <Locate size={14} />, onClick: () => reveal(n.id) },
      { label: 'Open local graph', icon: <Waypoints size={14} />, onClick: () => { if (!isActive) openNote(n.id, { paneId }); showRight('graph'); } },
      'sep',
      { label: 'Delete', icon: <Trash2 size={14} />, danger: true, onClick: () => void deleteNote(n.id) },
    ];
  }, [openNote, desktop, requestRename, duplicate, copyLink, reveal, showRight, deleteNote]);
  const showMenu = useCallback((e: { clientX: number; clientY: number }, items: MenuItemDef[]) => setMenu({ at: { x: e.clientX, y: e.clientY }, items }), []);

  // ---------------------------------------------------------------- commands & hotkeys
  const needNote = () => !!noteRef.current;
  const fmt = (k: Parameters<NoteEditorHandle['format']>[0]) => () => {
    const t = activeTabOf(activePaneOf(wsRef.current));
    if (t?.type !== 'note' || modeOf(t) === 'reading') { toast('Switch to editing view first'); return; }
    activeHandle()?.format(k);
    activeHandle()?.focus();
  };
  const commands: Command[] = [
    { id: 'switcher', name: 'Quick switcher: Open quick switcher', icon: <FileSearch size={14} />, hotkey: 'Mod+O', run: () => setModal('switcher') },
    { id: 'palette', name: 'Command palette: Open command palette', icon: <SquareTerminal size={14} />, hotkey: 'Mod+P', run: () => setModal('palette') },
    { id: 'new-note', name: 'Create new note', icon: <SquarePen size={14} />, hotkey: 'Mod+Alt+N', run: () => newNote(undefined) },
    { id: 'new-canvas', name: 'Canvas: Create new canvas', icon: <LayoutDashboard size={14} />, run: () => newCanvas(undefined) },
    { id: 'new-note-split', name: 'Create new note to the right', icon: <Columns2 size={14} />, run: () => { createNote({ folder: newNoteFolder(noteRef.current) }).then((n) => { openNote(n.id, { split: desktop, newTab: true }); requestRename(n.id); }).catch((e) => toast(e.message)); } },
    { id: 'daily', name: 'Daily notes: Open today’s daily note', icon: <CalendarDays size={14} />, hotkey: 'Mod+Alt+D', run: () => openDaily() },
    // Mind maps live under Notes now (no separate sidebar entry); #mindmap still works.
    { id: 'mindmaps', name: 'Mind maps: Open mind maps', icon: <Network size={14} />, run: () => { window.location.hash = 'mindmap'; } },
    { id: 'graph', name: 'Graph view: Open graph view', icon: <Waypoints size={14} />, hotkey: 'Mod+G', run: () => openGraph() },
    { id: 'local-graph', name: 'Graph view: Open local graph', icon: <Waypoints size={14} />, run: () => showRight('graph'), when: needNote },
    { id: 'reading', name: 'Toggle reading view', icon: <BookOpen size={14} />, hotkey: 'Mod+E', run: toggleReading, when: needNote },
    {
      id: 'source', name: 'Toggle live preview / source mode', icon: <Code2 size={14} />, when: needNote, run: () => {
        const p = activePaneOf(wsRef.current), t = activeTabOf(p);
        if (t?.type === 'note') { flushAll(); setMode(p.id, t.id, modeOf(t) === 'source' ? 'live' : 'source'); }
      },
    },
    { id: 'left', name: 'Toggle left sidebar', icon: <PanelLeft size={14} />, hotkey: 'Mod+Alt+[', run: () => toggleSidebar('left') },
    { id: 'right', name: 'Toggle right sidebar', icon: <PanelRight size={14} />, hotkey: 'Mod+Alt+]', run: () => toggleSidebar('right') },
    { id: 'split', name: 'Split right', icon: <Columns2 size={14} />, hotkey: 'Mod+\\', run: () => (desktop ? setWs((c) => splitActive(c)) : toast('Split view needs a wider screen')) },
    { id: 'close-tab', name: 'Close current tab', icon: <X size={14} />, run: () => { const p = activePaneOf(wsRef.current); if (p.activeTab) setWs((c) => closeTab(c, p.id, p.activeTab!)); }, when: () => !!activePaneOf(wsRef.current).activeTab },
    { id: 'close-others', name: 'Close all other tabs', icon: <X size={14} />, run: () => { const p = activePaneOf(wsRef.current); if (p.activeTab) setWs((c) => closeOthers(c, p.id, p.activeTab!)); }, when: () => activePaneOf(wsRef.current).tabs.length > 1 },
    { id: 'pin', name: 'Pin / unpin current tab', icon: <Pin size={14} />, run: () => { const p = activePaneOf(wsRef.current), t = activeTabOf(p); if (t) setWs((c) => updateTab(c, p.id, t.id, { pinned: !t.pinned })); }, when: () => !!activeTabOf(activePaneOf(wsRef.current)) },
    { id: 'back', name: 'Navigate back', icon: <ArrowLeft size={14} />, run: () => { const p = activePaneOf(wsRef.current); if (p.activeTab) setWs((c) => navigate(c, p.id, p.activeTab!, -1)); }, when: needNote },
    { id: 'forward', name: 'Navigate forward', icon: <ArrowRight size={14} />, run: () => { const p = activePaneOf(wsRef.current); if (p.activeTab) setWs((c) => navigate(c, p.id, p.activeTab!, 1)); }, when: needNote },
    { id: 'attach-file', name: 'Attach file', icon: <Paperclip size={14} />, run: () => atts.attachFile() },
    { id: 'template', name: 'Templates: Insert template', icon: <LayoutTemplate size={14} />, hotkey: 'Mod+Alt+T', run: () => setModal('templates'), when: needNote },
    { id: 'rename', name: 'Rename file', icon: <Pencil size={14} />, hotkey: 'F2', run: () => noteRef.current && requestRename(noteRef.current.id), when: needNote },
    { id: 'move', name: 'Move current file to another folder', icon: <FolderInput size={14} />, hotkey: 'Mod+Alt+M', run: () => noteRef.current && setMovePicker(noteRef.current.id), when: needNote },
    { id: 'duplicate', name: 'Duplicate current file', icon: <Copy size={14} />, run: () => noteRef.current && void duplicate(noteRef.current), when: needNote },
    { id: 'delete', name: 'Delete current file', icon: <Trash2 size={14} />, run: () => noteRef.current && void deleteNote(noteRef.current.id), when: needNote },
    { id: 'bookmark', name: 'Bookmarks: Bookmark / unbookmark current file', icon: <Star size={14} />, run: () => noteRef.current && void toggleBookmark(noteRef.current), when: needNote },
    { id: 'copy-link', name: 'Copy wikilink to current file', icon: <LinkIcon size={14} />, run: () => noteRef.current && copyLink(noteRef.current), when: needNote },
    { id: 'search', name: 'Search: Search in all files', icon: <Search size={14} />, hotkey: 'Mod+Shift+F', run: () => openSearch(searchQuery) },
    { id: 'find', name: 'Search current file', icon: <TextSearch size={14} />, run: () => { const t = activeTabOf(activePaneOf(wsRef.current)); if (t?.type === 'note' && modeOf(t) === 'reading') toggleReading(); window.setTimeout(() => activeHandle()?.openSearch(), 60); }, when: needNote },
    { id: 'bold', name: 'Toggle bold', icon: <Bold size={14} />, run: fmt('bold'), when: needNote },
    { id: 'italic', name: 'Toggle italics', icon: <Italic size={14} />, run: fmt('italic'), when: needNote },
    { id: 'strike', name: 'Toggle strikethrough', icon: <Strikethrough size={14} />, run: fmt('strike'), when: needNote },
    { id: 'highlight', name: 'Toggle highlight', icon: <Highlighter size={14} />, run: fmt('highlight'), when: needNote },
    { id: 'code', name: 'Toggle inline code', icon: <Code2 size={14} />, run: fmt('code'), when: needNote },
    { id: 'task', name: 'Toggle checkbox status', icon: <ListChecks size={14} />, hotkey: 'Mod+Alt+L', run: fmt('task'), when: needNote },
    { id: 'random', name: 'Open random note', icon: <Shuffle size={14} />, run: () => { const ns = vaultRef.current.notes; if (ns.length) openNote(ns[Math.floor(Math.random() * ns.length)].id); }, when: () => vaultRef.current.notes.length > 0 },
    { id: 'explorer', name: 'Files: Show file explorer', icon: <FolderClosed size={14} />, hotkey: 'Mod+Shift+E', run: () => { showLeft('files'); setExplorerFocus((n) => n + 1); } },
    { id: 'reveal', name: 'Files: Reveal current file in navigation', icon: <Locate size={14} />, run: () => noteRef.current && reveal(noteRef.current.id), when: needNote },
    { id: 'bookmarks', name: 'Bookmarks: Show bookmarks', icon: <Bookmark size={14} />, run: () => showLeft('bookmarks') },
    { id: 'tags', name: 'Tags: Show tags', icon: <Tags size={14} />, run: () => showLeft('tags') },
    { id: 'backlinks', name: 'Backlinks: Show backlinks', icon: <Link2 size={14} />, run: () => showRight('backlinks') },
    { id: 'outgoing', name: 'Outgoing links: Show outgoing links', icon: <ArrowUpRight size={14} />, run: () => showRight('outgoing') },
    { id: 'outline', name: 'Outline: Show outline', icon: <ListTree size={14} />, run: () => showRight('outline') },
    { id: 'info', name: 'Show tags & note info', icon: <Info size={14} />, run: () => showRight('info') },
    { id: 'new-folder', name: 'Create new folder', icon: <FolderClosed size={14} />, run: () => newFolder(noteRef.current?.folder ?? null) },
    { id: 'samples', name: 'Create sample notes', icon: <Sparkles size={14} />, run: () => void seed() },
    { id: 'settings', name: 'Open vault settings', icon: <Settings size={14} />, hotkey: 'Mod+,', run: () => setModal('settings') },
  ];
  const commandsRef = useRef(commands); commandsRef.current = commands;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.isComposing) return;
      const target = e.target as HTMLElement | null;
      if (target?.closest('[role="dialog"]')) return; // modals own their keys
      if (e.key === 'F2' && (target?.closest('[role="tree"]') || target?.tagName === 'INPUT')) return;
      if (e.key === 'Escape' && drawerRef.current) { setDrawer(null); return; }
      const alias = matches('Mod+N', e) ? commandsRef.current.find((c) => c.id === 'new-note') : null;
      const cmd = alias ?? commandsRef.current.find((c) => c.hotkey && matches(c.hotkey, e));
      if (!cmd || (cmd.when && !cmd.when())) return;
      e.preventDefault();
      e.stopPropagation();
      cmd.run();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, []);
  const drawerRef = useRef(drawer); drawerRef.current = drawer;

  // ---------------------------------------------------------------- routing (#notes/<id>)
  useEffect(() => {
    if (!vault.loaded || !noteId) return;
    if (vault.index.byId.has(noteId)) openNote(noteId);
  }, [vault.loaded, noteId]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const onHash = () => {
      const m = /^#notes\/(.+)$/.exec(window.location.hash);
      if (!m) return;
      const id = decodeURIComponent(m[1]);
      if (vaultRef.current.index.byId.has(id) && noteRef.current?.id !== id) openNote(id);
    };
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, [openNote]);
  useEffect(() => {
    if (!vault.loaded || !window.location.hash.startsWith('#notes')) return;
    const want = tabNote ? `#notes/${encodeURIComponent(tabNote.id)}` : '#notes';
    if (window.location.hash !== want) window.history.replaceState(window.history.state, '', want);
  }, [tabNote?.id, vault.loaded]); // eslint-disable-line react-hooks/exhaustive-deps

  // ---------------------------------------------------------------- sample vault
  const seed = useCallback(async () => {
    setSeeding(true);
    try {
      const w = await seedSampleNotes(vaultRef.current.notes);
      if (w) openNote(w.id);
      toast('Sample notes created — try the graph view (Mod+G)');
    } finally { setSeeding(false); }
  }, [openNote, toast]);

  // ---------------------------------------------------------------- pane controller
  const paneCtl: PaneCtl = {
    focusPane: (id) => setWs((c) => (c.activePane === id ? c : { ...c, activePane: id })),
    focusTab: (p, t) => setWs((c) => focusTab(c, p, t)),
    closeTab: (p, t) => setWs((c) => closeTab(c, p, t)),
    closeOthers: (p, t) => setWs((c) => closeOthers(c, p, t)),
    togglePin: (p, t) => setWs((c) => { const tab = c.panes.find((x) => x.id === p)?.tabs.find((x) => x.id === t); return tab ? updateTab(c, p, t, { pinned: !tab.pinned }) : c; }),
    moveTab: (from, t, to, i) => setWs((c) => moveTab(c, from, t, to, i)),
    dropNote: (p, id, i) => setWs((c) => { const n = openIn(c, p, { type: 'note', noteId: id }, 'tab'); const tab = n.panes.find((x) => x.id === p)?.activeTab; return tab ? moveTab(n, p, tab, p, i) : n; }),
    newTab: (p) => setWs((c) => openIn({ ...c, activePane: p }, p, { type: 'empty' }, 'tab')),
    splitTab: (p, t) => setWs((c) => {
      const pane = c.panes.find((x) => x.id === p), tab = pane?.tabs.find((x) => x.id === t);
      if (!tab) return c;
      if (c.panes.length > 1) { const other = c.panes.find((x) => x.id !== p)!; return moveTab(c, p, t, other.id, other.tabs.length); }
      const target: OpenTarget = tab.type === 'note' ? { type: 'note', noteId: tab.noteId } : tab.type === 'attachment' ? { type: 'attachment', attachmentId: tab.attachmentId } : { type: tab.type };
      return openInSplit({ ...c, activePane: p }, target);
    }),
    splitActive: () => setWs((c) => splitActive(c)),
    openQuickSwitcher: () => setModal('switcher'),
    openDaily: () => openDaily(),
  };

  // ---------------------------------------------------------------- resizing
  const startResize = (side: 'left' | 'right' | 'split') => (e: React.PointerEvent) => {
    e.preventDefault();
    const startX = e.clientX;
    const start = side === 'left' ? layout.leftWidth : side === 'right' ? layout.rightWidth : layout.split;
    const container = (e.currentTarget as HTMLElement).parentElement;
    const width = container?.getBoundingClientRect().width ?? 1000;
    let last = layout;
    const move = (ev: PointerEvent) => {
      const dx = ev.clientX - startX;
      if (side === 'left') last = { ...last, leftWidth: Math.round(Math.max(180, Math.min(520, start + dx))) };
      else if (side === 'right') last = { ...last, rightWidth: Math.round(Math.max(200, Math.min(560, start - dx))) };
      else last = { ...last, split: Math.max(0.2, Math.min(0.8, start + dx / width)) };
      setLayoutState(last);
    };
    const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); document.body.style.cursor = ''; document.body.style.userSelect = ''; saveLayout(last); };
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };
  const resizer = (side: 'left' | 'right' | 'split', label: string) => (
    <div
      key={`rs-${side}`}
      role="separator"
      aria-orientation="vertical"
      aria-label={label}
      onPointerDown={startResize(side)}
      onDoubleClick={() => setLayout(side === 'split' ? { split: 0.5 } : side === 'left' ? { leftWidth: 260 } : { rightWidth: 290 })}
      className="relative w-px shrink-0 bg-gray-200 dark:bg-white/[0.08] cursor-col-resize group z-10"
    >
      <span className="absolute inset-y-0 -left-1 -right-1 group-hover:bg-blue-500/40 transition-colors" />
    </div>
  );

  // ---------------------------------------------------------------- api
  const api: VaultApi = {
    vault, settings, desktop, activeNote, activePaneId: ws.activePane,
    openNote, openLink, openGraph, openSearch, newNote, newCanvas, newFolder, reveal, renameNote,
    moveNotePrompt: (id) => setMovePicker(id), deleteNote: (id) => void deleteNote(id), noteMenu, showMenu,
    setLeft: showLeft, setRight: showRight, explorerRename, setExplorerRename, revealNonce, toast, confirm,
    cursorLine, setCursorLine, scrollActive, setMode, closeMobile: () => setDrawer(null),
    openAttachment: atts.openAttachment, attachmentMenu: atts.attachmentMenu, renameAttachment: atts.renameAttachment,
    deleteAttachment: atts.deleteAttachment, uploadFiles: atts.uploadFiles, revealAttachment: (id) => reveal(`a:${id}`),
    activeAttachmentId: activeTab?.type === 'attachment' ? activeTab.attachmentId : null,
  };

  // ---------------------------------------------------------------- render pieces
  const ribbonItems = [
    { label: 'Open quick switcher', icon: <FileSearch size={18} />, run: () => setModal('switcher'), hk: 'Mod+O' },
    { label: 'Create new note', icon: <SquarePen size={18} />, run: () => newNote(undefined), hk: 'Mod+Alt+N' },
    { label: 'Create new canvas', icon: <LayoutDashboard size={18} />, run: () => newCanvas(undefined), hk: '' },
    { label: 'Open today’s daily note', icon: <CalendarDays size={18} />, run: () => openDaily(), hk: 'Mod+Alt+D' },
    { label: 'Open graph view', icon: <Waypoints size={18} />, run: () => openGraph(), hk: 'Mod+G' },
    { label: 'Mind maps', icon: <Network size={18} />, run: () => { window.location.hash = 'mindmap'; }, hk: '' },
    { label: 'Open command palette', icon: <SquareTerminal size={18} />, run: () => setModal('palette'), hk: 'Mod+P' },
    { label: 'Insert template', icon: <LayoutTemplate size={18} />, run: () => (noteRef.current ? setModal('templates') : toast('Open a note to insert a template')), hk: 'Mod+Alt+T' },
  ];

  const leftSidebar = (
    <div className={`h-full flex flex-col min-h-0 ${vx.side}`}>
      {!desktop ? (
        <div className={`flex items-center gap-0.5 px-2 h-11 shrink-0 border-b ${vx.border}`}>
          {ribbonItems.map((r) => <button key={r.label} className={vx.iconBtn} aria-label={r.label} title={r.label} onClick={() => { setDrawer(null); r.run(); }}>{r.icon}</button>)}
          <button className={`${vx.iconBtn} ml-auto`} aria-label="Vault settings" onClick={() => { setDrawer(null); setModal('settings'); }}><Settings size={18} /></button>
        </div>
      ) : null}
      <div className={`flex items-center gap-0.5 px-1.5 h-10 shrink-0 border-b ${vx.border}`} role="tablist" aria-label="Left sidebar">
        {LEFT_TABS.map((t) => (
          <button key={t.id} role="tab" aria-selected={layout.leftTab === t.id} aria-label={t.label} title={t.label} onClick={() => setLayout({ leftTab: t.id })} className={`p-1.5 rounded-md ${layout.leftTab === t.id ? vx.active : vx.iconBtn}`}>{t.icon}</button>
        ))}
        {!desktop ? <button className={`${vx.iconBtn} ml-auto`} aria-label="Close sidebar" onClick={() => setDrawer(null)}><X size={16} /></button> : null}
      </div>
      <div className="flex-1 min-h-0">
        {layout.leftTab === 'files' ? <FileExplorer focusNonce={explorerFocus} />
          : layout.leftTab === 'search' ? <SearchPane query={searchQuery} setQuery={setSearchQuery} focusNonce={searchFocus} />
            : layout.leftTab === 'bookmarks' ? <BookmarksPane /> : <TagsPane />}
      </div>
    </div>
  );
  const rightSidebar = (
    <div className={`h-full flex flex-col min-h-0 ${vx.side}`}>
      <div className={`flex items-center gap-0.5 px-1.5 h-10 shrink-0 border-b ${vx.border}`} role="tablist" aria-label="Right sidebar">
        {RIGHT_TABS.map((t) => (
          <button key={t.id} role="tab" aria-selected={layout.rightTab === t.id} aria-label={t.label} title={t.label} onClick={() => setLayout({ rightTab: t.id })} className={`p-1.5 rounded-md ${layout.rightTab === t.id ? vx.active : vx.iconBtn}`}>{t.icon}</button>
        ))}
        {!desktop ? <button className={`${vx.iconBtn} ml-auto`} aria-label="Close sidebar" onClick={() => setDrawer(null)}><X size={16} /></button> : null}
      </div>
      <div className="flex-1 min-h-0"><RightPane tab={layout.rightTab} /></div>
    </div>
  );

  const renderNote = (paneId: string) => (tab: NoteTab) => {
    const note = vault.index.byId.get(tab.noteId);
    const isActive = ws.activePane === paneId;
    if (note?.kind === 'canvas') {
      return (
        <CanvasView
          key={`${tab.id}:${tab.noteId}`}
          paneId={paneId}
          tab={tab}
          note={note}
          activePane={isActive}
          registerFlush={registerFlush}
          renameNonce={renameReq && isActive && renameReq.noteId === tab.noteId ? renameReq.nonce : 0}
          onNavigate={(dir) => setWs((c) => navigate(c, paneId, tab.id, dir))}
          onClose={() => setWs((c) => closeTab(c, paneId, tab.id))}
        />
      );
    }
    return (
      <NotePane
        key={`${tab.id}:${tab.noteId}`}
        paneId={paneId}
        tab={tab}
        note={note}
        mode={modeOf(tab)}
        activePane={isActive}
        registerHandle={registerHandle}
        registerFlush={registerFlush}
        scrollReq={scrollReq && isActive && scrollReq.noteId === tab.noteId ? scrollReq : null}
        renameNonce={renameReq && isActive && renameReq.noteId === tab.noteId ? renameReq.nonce : 0}
        onNavigate={(dir) => setWs((c) => navigate(c, paneId, tab.id, dir))}
        onClose={() => setWs((c) => closeTab(c, paneId, tab.id))}
      />
    );
  };

  const visiblePanes = desktop ? ws.panes : [activePane];
  const empty = vault.loaded && vault.notes.length === 0;

  const center = !vault.loaded ? (
    <div className="flex-1 flex items-center justify-center"><div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" /></div>
  ) : empty ? (
    <div className={`flex-1 min-w-0 flex flex-col ${vx.main}`}>
      <div className={`h-10 shrink-0 flex items-center px-1 border-b ${vx.border} ${vx.side}`}>
        <button className={vx.iconBtn} aria-label="Toggle left sidebar" onClick={() => toggleSidebar('left')}><PanelLeft size={16} /></button>
      </div>
      <EmptyVault seeding={seeding} onCreate={() => newNote(null)} onDaily={() => openDaily()} onSeed={() => void seed()} />
    </div>
  ) : (
    <div className="flex-1 min-w-0 flex min-h-0">
      {visiblePanes.map((p, i) => (
        <React.Fragment key={p.id}>
          {i > 0 ? resizer('split', 'Resize split') : null}
          <div className="min-w-0 min-h-0" style={{ flex: visiblePanes.length > 1 ? `${i === 0 ? layout.split : 1 - layout.split} 1 0` : '1 1 0' }}>
            <PaneView
              pane={p}
              active={p.id === ws.activePane}
              single={visiblePanes.length === 1}
              ctl={paneCtl}
              leftToggle={i === 0 ? { open: desktop ? layout.leftOpen : drawer === 'left', onClick: () => toggleSidebar('left') } : undefined}
              rightToggle={i === visiblePanes.length - 1 ? { open: desktop ? layout.rightOpen : drawer === 'right', onClick: () => toggleSidebar('right') } : undefined}
              renderNote={renderNote(p.id)}
              renderAttachment={(tab) => <AttachmentPane key={tab.id} tab={tab} paneId={p.id} onClose={() => setWs((c) => closeTab(c, p.id, tab.id))} />}
            />
          </div>
        </React.Fragment>
      ))}
    </div>
  );

  return (
    <VaultCtx.Provider value={api}>
      <div className={`h-full w-full flex overflow-hidden ${vx.main} ${vx.text} text-sm`}>
        {desktop ? (
          <nav aria-label="Ribbon" className={`w-11 shrink-0 flex flex-col items-center gap-1 py-2 border-r ${vx.border} ${vx.ribbon}`}>
            {ribbonItems.map((r) => (
              <button key={r.label} className={vx.iconBtn} aria-label={r.label} title={`${r.label}`} onClick={r.run}>{r.icon}</button>
            ))}
            <div className="flex-1" />
            <button className={vx.iconBtn} aria-label="Create sample notes" title="Create sample notes" onClick={() => void seed()}><Sparkles size={18} /></button>
            <button className={vx.iconBtn} aria-label="Vault settings" title="Vault settings" onClick={() => setModal('settings')}><Settings size={18} /></button>
          </nav>
        ) : null}
        {desktop && layout.leftOpen ? (
          <>
            <aside aria-label="Left sidebar" className="shrink-0 min-h-0" style={{ width: layout.leftWidth }}>{leftSidebar}</aside>
            {resizer('left', 'Resize left sidebar')}
          </>
        ) : null}
        {center}
        {desktop && layout.rightOpen ? (
          <>
            {resizer('right', 'Resize right sidebar')}
            <aside aria-label="Right sidebar" className="shrink-0 min-h-0" style={{ width: layout.rightWidth }}>{rightSidebar}</aside>
          </>
        ) : null}
        {!desktop && drawer ? (
          <div className="fixed inset-0 z-[60]" role="dialog" aria-modal="true" aria-label={drawer === 'left' ? 'Files and search' : 'Note details'}>
            <div className="absolute inset-0 bg-black/40" onClick={() => setDrawer(null)} />
            <aside className={`absolute inset-y-0 ${drawer === 'left' ? 'left-0 border-r' : 'right-0 border-l'} w-[86vw] max-w-[340px] ${vx.border} shadow-2xl`}>
              {drawer === 'left' ? leftSidebar : rightSidebar}
            </aside>
          </div>
        ) : null}
      </div>
      <QuickSwitcher
        open={modal === 'switcher'}
        onClose={() => setModal(null)}
        onCreate={(title, newTab) => {
          const parts = title.split('/');
          const t = parts.pop()!.trim();
          newNote(parts.length ? parts.join('/') : undefined, { title: t, newTab });
        }}
      />
      <CommandPalette open={modal === 'palette'} onClose={() => setModal(null)} commands={commands} />
      <TemplatePicker open={modal === 'templates'} onClose={() => setModal(null)} onPick={(t) => void insertTemplate(t)} />
      <FolderPicker open={!!movePicker} onClose={() => setMovePicker(null)} onPick={(f) => { if (movePicker) void moveNote(movePicker, f); }} />
      <VaultSettingsModal open={modal === 'settings'} onClose={() => setModal(null)} settings={settings} />
      <ConfirmModal state={confirmState} onDone={(ok) => { setConfirmState(null); confirmResolve.current?.(ok); confirmResolve.current = null; }} />
      <ContextMenu at={menu?.at ?? null} items={menu?.items ?? []} onClose={() => setMenu(null)} />
      {atts.elements}
    </VaultCtx.Provider>
  );
}

function EmptyVault({ onCreate, onDaily, onSeed, seeding }: { onCreate: () => void; onDaily: () => void; onSeed: () => void; seeding: boolean }) {
  return (
    <div className="flex-1 overflow-y-auto flex items-center justify-center p-6">
      <div className="max-w-md text-center">
        <div className="mx-auto mb-5 w-14 h-14 rounded-2xl bg-gradient-to-br from-blue-500 to-violet-500 flex items-center justify-center shadow-lg shadow-violet-500/20">
          <Waypoints size={26} className="text-white" />
        </div>
        <h2 className={`text-xl font-bold ${vx.text}`}>Your vault is empty</h2>
        <p className={`mt-2 text-sm leading-relaxed ${vx.muted}`}>
          Write in Markdown, connect ideas with <code className="px-1 rounded bg-gray-100 dark:bg-white/10">[[links]]</code>, organise with folders and <code className="px-1 rounded bg-gray-100 dark:bg-white/10">#tags</code>, and watch your knowledge graph grow.
        </p>
        <div className="mt-6 flex flex-col sm:flex-row gap-2 justify-center">
          <button onClick={onCreate} className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold bg-blue-600 hover:bg-blue-700 dark:bg-violet-600 dark:hover:bg-violet-500 text-white"><FilePlus2 size={15} />Create note</button>
          <button onClick={onDaily} className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-gray-700 dark:text-gray-200 bg-gray-100 dark:bg-white/5 hover:bg-gray-200 dark:hover:bg-white/10"><CalendarDays size={15} />Open today’s note</button>
        </div>
        <button onClick={onSeed} disabled={seeding} className="mt-4 inline-flex items-center gap-1.5 text-sm text-blue-600 dark:text-violet-300 hover:underline disabled:opacity-50">
          <Sparkles size={14} />{seeding ? 'Creating…' : 'Create sample notes'}
        </button>
      </div>
    </div>
  );
}
