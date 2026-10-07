/**
 * One open note inside a pane: header (history, breadcrumb, inline title, mode
 * toggle, bookmark, more menu), properties, and the editor / reading view.
 * Edits are debounced into saveContent and flushed on blur, tab switch,
 * unmount and page hide.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, BookOpen, Code2, PencilLine, Star, MoreHorizontal, ChevronRight } from 'lucide-react';
import type { Note } from '../../types';
import { extractHeadings, extractBlocks, slugify } from '../../shared/notes';
import { NoteEditor, MarkdownView, PropertiesEditor, type NoteEditorHandle, type OpenLinkOpts } from './editor';
import { saveContent, toggleBookmark } from './useVault';
import { toggleTask } from './vaultActions';
import type { NoteTab, ViewMode } from './workspace';
import { useVaultApi, vx, ContextMenu, type MenuItemDef } from './shell';

export interface ScrollReq { line?: number; heading?: string; block?: string; nonce: number }

export interface NotePaneProps {
  paneId: string;
  tab: NoteTab;
  note: Note | undefined;
  mode: ViewMode;
  activePane: boolean;
  registerHandle: (paneId: string, h: NoteEditorHandle | null) => void;
  registerFlush: (paneId: string, f: (() => void) | null) => void;
  scrollReq: ScrollReq | null;
  renameNonce: number;
  onNavigate: (dir: -1 | 1) => void;
  onClose: () => void;
}

const SAVE_DELAY = 400;

export function NotePane({ paneId, tab, note, mode, activePane, registerHandle, registerFlush, scrollReq, renameNonce, onNavigate, onClose }: NotePaneProps) {
  const api = useVaultApi();
  const { settings } = api;
  const editorRef = useRef<NoteEditorHandle | null>(null);
  const scrollerRef = useRef<HTMLDivElement>(null);
  const draft = useRef<string | null>(null);
  const timer = useRef<number | null>(null);
  const [menuAt, setMenuAt] = useState<{ x: number; y: number } | null>(null);
  const noteId = note?.id;
  const storeContent = note?.content;

  const flush = useCallback(() => {
    if (timer.current) { window.clearTimeout(timer.current); timer.current = null; }
    const d = draft.current;
    draft.current = null;
    if (d !== null && noteId) void saveContent(noteId, d);
  }, [noteId]);

  // Outside changes (other pane, sync, link rewrites, templates, properties) arrive
  // via `note.content`; NoteEditor applies them as a minimal diff, keeping the cursor
  // and ignoring echoes of its own saves — no remount needed.

  const onChange = useCallback((content: string) => {
    draft.current = content;
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(flush, SAVE_DELAY);
  }, [flush]);

  useEffect(() => {
    registerFlush(paneId, flush);
    const onHide = () => flush();
    const onVis = () => { if (document.visibilityState === 'hidden') flush(); };
    window.addEventListener('beforeunload', onHide);
    window.addEventListener('pagehide', onHide);
    document.addEventListener('visibilitychange', onVis);
    return () => {
      flush();
      registerFlush(paneId, null);
      window.removeEventListener('beforeunload', onHide);
      window.removeEventListener('pagehide', onHide);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, [paneId, flush, registerFlush]);

  const setHandle = useCallback((h: NoteEditorHandle | null) => { editorRef.current = h; registerHandle(paneId, h); }, [paneId, registerHandle]);

  // ---------------------------------------------------------------- scrolling to a line / heading / block
  const scrollTo = useCallback((req: { line?: number; heading?: string; block?: string }) => {
    if (!note) return;
    let line = req.line;
    if (line === undefined && req.heading) {
      const want = slugify(req.heading);
      line = extractHeadings(note.content).find((h) => h.slug === want || h.text.toLowerCase() === req.heading!.toLowerCase())?.line;
    }
    if (line === undefined && req.block) line = extractBlocks(note.content)[req.block];
    if (line === undefined) return;
    if (mode !== 'reading') { editorRef.current?.scrollToLine(line); return; }
    const root = scrollerRef.current;
    if (!root) return;
    const byLine = root.querySelector<HTMLElement>(`[data-line="${line}"]`);
    const heading = req.heading ? [...root.querySelectorAll<HTMLElement>('h1,h2,h3,h4,h5,h6')].find((h) => h.textContent?.trim().toLowerCase() === req.heading!.trim().toLowerCase()) : null;
    const el = heading ?? byLine;
    if (el) { el.scrollIntoView({ block: 'start', behavior: 'smooth' }); return; }
    const total = Math.max(1, note.content.split('\n').length);
    root.scrollTo({ top: (line / total) * root.scrollHeight - 40, behavior: 'smooth' });
  }, [note, mode]);

  useEffect(() => {
    if (!scrollReq) return;
    const t = window.setTimeout(() => scrollTo(scrollReq), 80);
    return () => window.clearTimeout(t);
  }, [scrollReq?.nonce]); // eslint-disable-line react-hooks/exhaustive-deps

  // ---------------------------------------------------------------- callbacks for the editor/reader
  const onOpenLink = useCallback((target: string, opts: OpenLinkOpts) => {
    flush();
    if (!target.trim()) { scrollTo({ heading: opts.heading, block: opts.block }); return; }
    api.openLink(target, note ?? null, { newTab: opts.newTab, heading: opts.heading, block: opts.block, paneId });
  }, [api, note, paneId, flush, scrollTo]);
  const onTagClick = useCallback((tag: string) => api.openSearch(`tag:#${tag.replace(/^#/, '')}`), [api]);
  const onToggleTask = useCallback((line: number) => { if (note) void toggleTask(note, line); }, [note]);
  const onCursorLine = useCallback((l: number) => { if (activePane) api.setCursorLine(l); }, [api, activePane]);
  const onProps = useCallback((content: string) => { flush(); if (noteId) void saveContent(noteId, content); }, [noteId, flush]);

  const setMode = (m: ViewMode) => { flush(); api.setMode(paneId, tab.id, m); };

  // Header density follows the pane's own width (split panes are narrow even on desktop).
  const rootRef = useRef<HTMLDivElement>(null);
  const [narrow, setNarrow] = useState(false);
  useEffect(() => {
    const el = rootRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(([e]) => setNarrow(e.contentRect.width < 480));
    ro.observe(el);
    return () => ro.disconnect();
  }, [noteId]);

  const crumbs = useMemo(() => (note?.folder ? note.folder.split('/') : []), [note?.folder]);

  if (!note) {
    return (
      <div className="h-full flex flex-col items-center justify-center gap-3 p-6 text-center">
        <p className={`text-sm ${vx.muted}`}>This note no longer exists.</p>
        <button onClick={onClose} className={`px-3 py-1.5 rounded-md text-sm ${vx.hover} border ${vx.border} ${vx.text}`}>Close tab</button>
      </div>
    );
  }

  const readable = settings.readableLineLength;
  const menuItems: MenuItemDef[] = [
    { label: mode === 'reading' ? 'Edit' : 'Reading view', icon: mode === 'reading' ? <PencilLine size={14} /> : <BookOpen size={14} />, hint: 'Mod+E', onClick: () => setMode(mode === 'reading' ? (settings.defaultMode === 'reading' ? 'live' : settings.defaultMode) : 'reading') },
    { label: mode === 'source' ? 'Live preview' : 'Source mode', icon: <Code2 size={14} />, onClick: () => setMode(mode === 'source' ? 'live' : 'source'), disabled: mode === 'reading' },
    'sep',
    ...api.noteMenu(note, paneId),
  ];

  return (
    <div ref={rootRef} className="h-full flex flex-col min-h-0" onBlurCapture={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) flush(); }}>
      <header className={`h-10 shrink-0 flex items-center gap-0.5 px-1.5 border-b ${vx.border}`}>
        <button className={`${vx.iconBtn} ${narrow ? 'hidden' : ''}`} aria-label="Navigate back" title="Navigate back" disabled={!tab.back?.length} onClick={() => { flush(); onNavigate(-1); }}><ArrowLeft size={15} /></button>
        <button className={`${vx.iconBtn} ${narrow ? 'hidden' : ''}`} aria-label="Navigate forward" title="Navigate forward" disabled={!tab.fwd?.length} onClick={() => { flush(); onNavigate(1); }}><ArrowRight size={15} /></button>
        <nav aria-label="Breadcrumb" className="flex-1 min-w-0 flex items-center justify-center gap-0.5 text-[13px] px-1">
          {crumbs.map((c, i) => (
            <React.Fragment key={i}>
              <button className={`${narrow ? 'hidden' : ''} truncate max-w-[120px] ${vx.muted} hover:underline`} onClick={() => api.reveal(note.id)} title="Show in explorer">{c}</button>
              <ChevronRight size={12} className={`${narrow ? 'hidden' : ''} shrink-0 ${vx.faint}`} />
            </React.Fragment>
          ))}
          <TitleInput note={note} compact onCommit={async (v) => { flush(); return api.renameNote(note.id, v); }} />
        </nav>
        <div className={`${narrow ? 'hidden' : 'flex'} items-center rounded-md border ${vx.border} p-0.5 mr-1`} role="group" aria-label="View mode">
          {([['live', PencilLine, 'Live preview'], ['source', Code2, 'Source mode'], ['reading', BookOpen, 'Reading view']] as const).map(([m, Icon, label]) => (
            <button key={m} onClick={() => setMode(m)} aria-pressed={mode === m} title={label} aria-label={label} className={`p-1 rounded ${mode === m ? vx.active : `${vx.muted} ${vx.hover}`}`}>
              <Icon size={14} />
            </button>
          ))}
        </div>
        <button className={`${vx.iconBtn} ${narrow ? '' : 'hidden'}`} aria-label={mode === 'reading' ? 'Edit' : 'Reading view'} onClick={() => setMode(mode === 'reading' ? (settings.defaultMode === 'reading' ? 'live' : settings.defaultMode) : 'reading')}>
          {mode === 'reading' ? <PencilLine size={15} /> : <BookOpen size={15} />}
        </button>
        <button className={vx.iconBtn} aria-label={note.bookmarked ? 'Remove bookmark' : 'Bookmark'} aria-pressed={!!note.bookmarked} title={note.bookmarked ? 'Remove bookmark' : 'Bookmark'} onClick={() => void toggleBookmark(note)}>
          <Star size={15} className={note.bookmarked ? 'text-amber-400 fill-amber-400' : ''} />
        </button>
        <button className={vx.iconBtn} aria-label="More options" title="More options" onClick={(e) => { const r = e.currentTarget.getBoundingClientRect(); setMenuAt({ x: r.right - 220, y: r.bottom + 4 }); }}>
          <MoreHorizontal size={16} />
        </button>
      </header>
      <div ref={scrollerRef} className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden flex flex-col">
        <div className={`w-full px-4 sm:px-8 pt-6 ${readable ? 'max-w-[760px] mx-auto' : ''}`}>
          <TitleInput note={note} focusNonce={renameNonce} onCommit={async (v) => { flush(); return api.renameNote(note.id, v); }} />
          {settings.showFrontmatter ? <div className="mt-2"><PropertiesEditor note={note} index={api.vault.index} onChange={onProps} onTagClick={onTagClick} /></div> : null}
        </div>
        <div className="flex-1 min-h-[50vh] flex flex-col">
          {mode === 'reading' ? (
            <MarkdownView note={note} index={api.vault.index} onOpenLink={onOpenLink} onTagClick={onTagClick} onToggleTask={onToggleTask} readableLineLength={readable} />
          ) : (
            <NoteEditor
              key={note.id}
              ref={setHandle}
              note={note}
              index={api.vault.index}
              mode={mode}
              onChange={onChange}
              onOpenLink={onOpenLink}
              onTagClick={onTagClick}
              onCursorLine={onCursorLine}
              readableLineLength={readable}
              spellcheck={settings.spellcheck}
              hideFrontmatter={settings.showFrontmatter && mode === 'live'}
            />
          )}
        </div>
      </div>
      <ContextMenu at={menuAt} items={menuItems} onClose={() => setMenuAt(null)} />
    </div>
  );
}

/** Obsidian's inline title: editing it renames the note (links are rewritten). */
export function TitleInput({ note, compact, focusNonce, onCommit }: { note: Note; compact?: boolean; focusNonce?: number; onCommit: (v: string) => Promise<boolean> }) {
  const [value, setValue] = useState(note.title);
  const [editing, setEditing] = useState(false);
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => { if (!editing) setValue(note.title); }, [note.title, editing]);
  useEffect(() => { if (focusNonce) { ref.current?.focus(); ref.current?.select(); } }, [focusNonce]);
  const commit = async () => {
    setEditing(false);
    const v = value.trim();
    if (!v || v === note.title) { setValue(note.title); return; }
    const ok = await onCommit(v);
    if (!ok) setValue(note.title);
  };
  return (
    <input
      ref={ref}
      value={value}
      size={compact ? Math.max(4, Math.min(value.length + 1, 40)) : undefined}
      onFocus={() => setEditing(true)}
      onChange={(e) => setValue(e.target.value)}
      onBlur={() => void commit()}
      onKeyDown={(e) => {
        if (e.key === 'Enter') { e.preventDefault(); (e.target as HTMLInputElement).blur(); }
        if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); setValue(note.title); setEditing(false); requestAnimationFrame(() => ref.current?.blur()); }
      }}
      aria-label="Note title"
      spellCheck={false}
      className={compact
        ? `min-w-0 max-w-full bg-transparent outline-none rounded px-1 text-[13px] font-medium truncate text-center ${vx.text} focus:bg-gray-100 dark:focus:bg-white/5`
        : `w-full bg-transparent outline-none text-[1.9rem] leading-tight font-bold tracking-tight ${vx.text} placeholder:text-gray-300`}
      placeholder="Untitled"
    />
  );
}

