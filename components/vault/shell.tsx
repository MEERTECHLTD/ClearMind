/**
 * Shared pieces of the vault workspace shell: the controller context every
 * panel talks to, a right-click context menu, Obsidian's "suggest modal"
 * (quick switcher / command palette / pickers), and small styled atoms.
 */
import React, { createContext, useContext, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { Note, Attachment } from '../../types';
import type { Vault, VaultSettings } from './useVault';
import type { LeftTab, RightTab, ViewMode } from './workspace';
import { hotkeyLabel } from './workspace';

// ------------------------------------------------------------------ palette

export const vx = {
  text: 'text-gray-900 dark:text-gray-100',
  muted: 'text-gray-500 dark:text-gray-400',
  faint: 'text-gray-400 dark:text-gray-500',
  border: 'border-gray-200 dark:border-white/[0.08]',
  main: 'bg-white dark:bg-[#0A0C12]',
  side: 'bg-gray-50 dark:bg-[#0E1118]',
  ribbon: 'bg-gray-100/70 dark:bg-[#0B0D13]',
  hover: 'hover:bg-gray-200/60 dark:hover:bg-white/[0.06]',
  active: 'bg-blue-500/10 text-blue-700 dark:bg-violet-500/15 dark:text-violet-200',
  accentText: 'text-blue-600 dark:text-violet-300',
  input: 'w-full bg-white dark:bg-[#05050A] border border-gray-200 dark:border-white/10 rounded-md px-2.5 py-1.5 text-sm text-gray-900 dark:text-gray-100 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500/40 dark:focus:ring-violet-500/40',
  iconBtn: 'p-1.5 rounded-md text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 hover:bg-gray-200/60 dark:hover:bg-white/[0.06] disabled:opacity-30 disabled:pointer-events-none',
  card: 'bg-white dark:bg-[#121621]',
};

// ------------------------------------------------------------------ controller context

export interface OpenOpts { newTab?: boolean; split?: boolean; line?: number; heading?: string; block?: string; paneId?: string }

export interface MenuEntry { label: string; icon?: React.ReactNode; hint?: string; danger?: boolean; onClick: () => void; disabled?: boolean }
export type MenuItemDef = MenuEntry | 'sep';

export interface VaultApi {
  vault: Vault;
  settings: VaultSettings;
  desktop: boolean;
  activeNote: Note | null;
  activePaneId: string;
  openNote: (id: string, opts?: OpenOpts) => void;
  openLink: (target: string, from: Note | null, opts?: OpenOpts) => void;
  openGraph: (opts?: { newTab?: boolean; split?: boolean }) => void;
  openSearch: (query: string) => void;
  newNote: (folder?: string | null, opts?: { newTab?: boolean; title?: string }) => void;
  /** Create a new canvas (JSON Canvas note) and open it. */
  newCanvas?: (folder?: string | null) => void;
  newFolder: (parent: string | null) => void;
  reveal: (noteId: string) => void;
  renameNote: (id: string, title: string) => Promise<boolean>;
  moveNotePrompt: (id: string) => void;
  deleteNote: (id: string) => void;
  noteMenu: (note: Note, paneId?: string) => MenuItemDef[];
  showMenu: (e: { clientX: number; clientY: number }, items: MenuItemDef[]) => void;
  setLeft: (tab: LeftTab) => void;
  setRight: (tab: RightTab) => void;
  /** Explorer rename request (folder path or note id). */
  explorerRename: { key: string; nonce: number } | null;
  setExplorerRename: (r: { key: string; nonce: number } | null) => void;
  revealNonce: { id: string; nonce: number } | null;
  toast: (msg: string, action?: { label: string; onClick: () => void }) => void;
  confirm: (opts: { title: string; message: string; confirm: string; danger?: boolean }) => Promise<boolean>;
  cursorLine: number;
  setCursorLine: (l: number) => void;
  scrollActive: (req: { line?: number; heading?: string }) => void;
  setMode: (paneId: string, tabId: string, mode: ViewMode) => void;
  closeMobile: () => void;
  // ---- attachments (files in the vault)
  openAttachment: (id: string, opts?: OpenOpts) => void;
  attachmentMenu: (a: Attachment, paneId?: string) => MenuItemDef[];
  renameAttachment: (id: string, name: string) => Promise<boolean>;
  deleteAttachment: (id: string) => void;
  /** Upload files (e.g. dropped from the OS) into a folder. */
  uploadFiles: (files: File[], folder: string | null) => void;
  /** Attachment shown in the active pane's active tab, if any. */
  activeAttachmentId?: string | null;
  /** Reveal an attachment in the file explorer (explorer key `a:<id>`). */
  revealAttachment?: (id: string) => void;
}

export const VaultCtx = createContext<VaultApi | null>(null);
export const useVaultApi = () => {
  const v = useContext(VaultCtx);
  if (!v) throw new Error('useVaultApi outside VaultView');
  return v;
};

// ------------------------------------------------------------------ context menu

export function ContextMenu({ at, items, onClose }: { at: { x: number; y: number } | null; items: MenuItemDef[]; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  useLayoutEffect(() => {
    if (!at) return;
    const el = ref.current;
    const w = el?.offsetWidth ?? 220, h = el?.offsetHeight ?? 300;
    setPos({ left: Math.max(8, Math.min(at.x, window.innerWidth - w - 8)), top: Math.max(8, Math.min(at.y, window.innerHeight - h - 8)) });
  }, [at, items]);
  useEffect(() => {
    if (!at) return;
    const down = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) onClose(); };
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); onClose(); } };
    const t = window.setTimeout(() => { document.addEventListener('mousedown', down); document.addEventListener('touchstart', down as never); });
    window.addEventListener('keydown', key, true);
    window.addEventListener('resize', onClose);
    return () => { window.clearTimeout(t); document.removeEventListener('mousedown', down); document.removeEventListener('touchstart', down as never); window.removeEventListener('keydown', key, true); window.removeEventListener('resize', onClose); };
  }, [at, onClose]);
  if (!at) return null;
  return createPortal(
    <div
      ref={ref}
      role="menu"
      style={{ left: pos?.left ?? -9999, top: pos?.top ?? -9999 }}
      className={`fixed z-[140] min-w-[200px] max-w-[280px] ${vx.card} border ${vx.border} rounded-lg shadow-2xl py-1 text-[13px] max-h-[80vh] overflow-y-auto`}
      onContextMenu={(e) => e.preventDefault()}
    >
      {items.map((it, i) => it === 'sep'
        ? <div key={i} className={`my-1 border-t ${vx.border}`} />
        : (
          <button
            key={i}
            role="menuitem"
            disabled={it.disabled}
            onClick={() => { onClose(); it.onClick(); }}
            className={`w-full flex items-center gap-2.5 px-3 py-1.5 text-left disabled:opacity-40 ${vx.hover} ${it.danger ? 'text-red-500' : vx.text}`}
          >
            <span className={`w-4 flex justify-center ${it.danger ? '' : vx.muted}`}>{it.icon}</span>
            <span className="flex-1 truncate">{it.label}</span>
            {it.hint ? <span className={`text-[11px] ${vx.faint}`}>{it.hint}</span> : null}
          </button>
        ))}
    </div>,
    document.body,
  );
}

// ------------------------------------------------------------------ suggest modal

export interface SuggestModalProps<T> {
  open: boolean;
  onClose: () => void;
  placeholder: string;
  /** Items for the current query (already filtered/sorted). */
  items: (q: string) => T[];
  render: (item: T, q: string, selected: boolean) => React.ReactNode;
  itemKey: (item: T) => string;
  onChoose: (item: T, how: { mod: boolean; shift: boolean; query: string }) => void;
  /** Shift+Enter (e.g. create note from query). */
  onShiftEnter?: (query: string, how: { mod: boolean }) => void;
  empty?: (q: string) => React.ReactNode;
  footer?: React.ReactNode;
  initialQuery?: string;
}

export function SuggestModal<T>({ open, onClose, placeholder, items, render, itemKey, onChoose, onShiftEnter, empty, footer, initialQuery = '' }: SuggestModalProps<T>) {
  const [q, setQ] = useState(initialQuery);
  const [sel, setSel] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => { if (open) { setQ(initialQuery); setSel(0); window.setTimeout(() => inputRef.current?.focus(), 0); } }, [open, initialQuery]);
  const list = open ? items(q) : [];
  useEffect(() => { setSel(0); }, [q]);
  useEffect(() => {
    listRef.current?.querySelector<HTMLElement>(`[data-idx="${sel}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [sel]);
  if (!open) return null;
  const choose = (i: number, e: { metaKey?: boolean; ctrlKey?: boolean; shiftKey?: boolean }) => {
    const it = list[i];
    if (it === undefined) return;
    onClose();
    onChoose(it, { mod: !!(e.metaKey || e.ctrlKey), shift: !!e.shiftKey, query: q });
  };
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown' || (e.ctrlKey && e.key === 'n')) { e.preventDefault(); setSel((s) => Math.min(list.length - 1, s + 1)); }
    else if (e.key === 'ArrowUp' || (e.ctrlKey && e.key === 'p')) { e.preventDefault(); setSel((s) => Math.max(0, s - 1)); }
    else if (e.key === 'Enter') {
      e.preventDefault();
      if (e.shiftKey && onShiftEnter) { onClose(); onShiftEnter(q, { mod: e.metaKey || e.ctrlKey }); return; }
      choose(sel, e);
    } else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); onClose(); }
  };
  return createPortal(
    <div className="fixed inset-0 z-[125] flex justify-center items-start bg-black/40 pt-[10vh] px-3" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div role="dialog" aria-label={placeholder} className={`w-full max-w-[600px] ${vx.card} border ${vx.border} rounded-xl shadow-2xl overflow-hidden flex flex-col max-h-[70vh]`}>
        <input
          ref={inputRef}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={onKey}
          placeholder={placeholder}
          aria-label={placeholder}
          className={`w-full px-4 py-3 text-[15px] bg-transparent outline-none border-b ${vx.border} ${vx.text} placeholder:text-gray-400`}
        />
        <div ref={listRef} className="overflow-y-auto py-1" role="listbox">
          {list.length ? list.map((it, i) => (
            <div
              key={itemKey(it)}
              data-idx={i}
              role="option"
              aria-selected={i === sel}
              onMouseMove={() => setSel(i)}
              onMouseDown={(e) => e.preventDefault()}
              onClick={(e) => choose(i, e)}
              className={`mx-1 px-3 py-2 rounded-md cursor-pointer ${i === sel ? 'bg-blue-500/10 dark:bg-violet-500/15' : ''}`}
            >
              {render(it, q, i === sel)}
            </div>
          )) : <div className={`px-4 py-6 text-sm text-center ${vx.muted}`}>{empty ? empty(q) : 'No matches'}</div>}
        </div>
        {footer ? <div className={`hidden sm:flex flex-wrap gap-x-4 gap-y-1 px-4 py-2 border-t ${vx.border} text-[11px] ${vx.faint}`}>{footer}</div> : null}
      </div>
    </div>,
    document.body,
  );
}

export const Kbd = ({ k }: { k: string }) => (
  <kbd className="px-1.5 py-0.5 rounded border border-gray-300 dark:border-white/15 bg-gray-100 dark:bg-white/5 font-sans text-[10px] text-gray-600 dark:text-gray-300 whitespace-nowrap">{hotkeyLabel(k)}</kbd>
);

/** Highlight case-insensitive occurrences of `terms` in `text`. */
export function Highlight({ text, terms }: { text: string; terms: string[] }) {
  const ts = terms.filter((t) => t.length > 0);
  if (!ts.length) return <>{text}</>;
  const re = new RegExp(`(${ts.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})`, 'gi');
  const parts = text.split(re);
  return <>{parts.map((p, i) => (i % 2 ? <mark key={i} className="bg-amber-200/80 dark:bg-amber-400/30 text-inherit rounded-sm px-0.5">{p}</mark> : p))}</>;
}

/** Fuzzy highlight: bold the matched subsequence. */
export function FuzzyText({ text, q }: { text: string; q: string }) {
  const query = q.trim().toLowerCase();
  if (!query) return <>{text}</>;
  const i = text.toLowerCase().indexOf(query);
  if (i >= 0) return <>{text.slice(0, i)}<b className={vx.accentText}>{text.slice(i, i + query.length)}</b>{text.slice(i + query.length)}</>;
  let qi = 0;
  return <>{text.split('').map((c, k) => {
    if (qi < query.length && c.toLowerCase() === query[qi]) { qi++; return <b key={k} className={vx.accentText}>{c}</b>; }
    return <React.Fragment key={k}>{c}</React.Fragment>;
  })}</>;
}

export function PaneHeader({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <div className={`flex items-center gap-0.5 px-2 h-9 shrink-0 border-b ${vx.border}`}>
      <span className={`flex-1 text-[11px] font-semibold uppercase tracking-wide truncate ${vx.muted}`}>{title}</span>
      {children}
    </div>
  );
}

export function EmptyHint({ children }: { children: React.ReactNode }) {
  return <div className={`px-4 py-6 text-[13px] text-center ${vx.muted}`}>{children}</div>;
}

export const useMediaQuery = (q: string) => {
  const get = () => (typeof window !== 'undefined' && window.matchMedia ? window.matchMedia(q).matches : true);
  const [m, setM] = useState(get);
  useEffect(() => {
    const mq = window.matchMedia(q);
    const on = () => setM(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, [q]);
  return m;
};

export const fmtDateTime = (iso?: string | null) => {
  if (!iso) return '—';
  const d = new Date(iso);
  return isNaN(+d) ? '—' : d.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
};
