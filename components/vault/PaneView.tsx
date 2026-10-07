/** A workspace pane: scrollable tab strip (drag to reorder / move between panes, pin, middle-click close) + the active tab's view. */
import React, { useEffect, useRef, useState } from 'react';
import { X, Plus, Pin, Columns2, Waypoints, FileText, PanelLeft, PanelRight, FilePlus2, Search as SearchIcon, CalendarDays } from 'lucide-react';
import type { Note } from '../../types';
import type { GraphNode } from '../../shared/notes';
import { GraphPanel } from './GraphPanel';
import type { Pane, Tab } from './workspace';
import { useVaultApi, vx, ContextMenu, Kbd, type MenuItemDef } from './shell';

const DND_TAB = 'application/x-vault-tab';
const DND_NOTE = 'application/x-vault-note';

export interface PaneCtl {
  focusPane: (paneId: string) => void;
  focusTab: (paneId: string, tabId: string) => void;
  closeTab: (paneId: string, tabId: string) => void;
  closeOthers: (paneId: string, tabId: string) => void;
  togglePin: (paneId: string, tabId: string) => void;
  moveTab: (fromPane: string, tabId: string, toPane: string, index: number) => void;
  dropNote: (paneId: string, noteId: string, index: number) => void;
  newTab: (paneId: string) => void;
  splitTab: (paneId: string, tabId: string) => void;
  splitActive: () => void;
  openQuickSwitcher: () => void;
  openDaily: () => void;
}

export function PaneView({ pane, active, ctl, single, leftToggle, rightToggle, renderNote }: {
  pane: Pane; active: boolean; ctl: PaneCtl; single: boolean;
  leftToggle?: { open: boolean; onClick: () => void }; rightToggle?: { open: boolean; onClick: () => void };
  renderNote: (tab: Extract<Tab, { type: 'note' }>) => React.ReactNode;
}) {
  const api = useVaultApi();
  const stripRef = useRef<HTMLDivElement>(null);
  const [dropAt, setDropAt] = useState<number | null>(null);
  const [menu, setMenu] = useState<{ at: { x: number; y: number }; items: MenuItemDef[] } | null>(null);
  const activeTab = pane.tabs.find((t) => t.id === pane.activeTab) ?? null;

  useEffect(() => {
    stripRef.current?.querySelector<HTMLElement>(`[data-tab="${pane.activeTab}"]`)?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }, [pane.activeTab]);

  const titleOf = (t: Tab): { title: string; icon: React.ReactNode; note?: Note } => {
    if (t.type === 'graph') return { title: 'Graph view', icon: <Waypoints size={13} /> };
    if (t.type === 'empty') return { title: 'New tab', icon: <FileText size={13} /> };
    const n = api.vault.index.byId.get(t.noteId);
    return { title: n?.title ?? 'Not found', icon: null, note: n };
  };

  const indexFromEvent = (e: React.DragEvent) => {
    const tabs = [...(stripRef.current?.querySelectorAll<HTMLElement>('[data-tab]') ?? [])];
    for (let i = 0; i < tabs.length; i++) {
      const r = tabs[i].getBoundingClientRect();
      if (e.clientX < r.left + r.width / 2) return i;
    }
    return tabs.length;
  };
  const accepts = (e: React.DragEvent) => [...e.dataTransfer.types].some((t) => t === DND_TAB || t === DND_NOTE);

  const tabMenu = (t: Tab): MenuItemDef[] => {
    const info = titleOf(t);
    return [
      { label: 'Close', icon: <X size={14} />, onClick: () => ctl.closeTab(pane.id, t.id) },
      { label: 'Close others', icon: <X size={14} />, onClick: () => ctl.closeOthers(pane.id, t.id), disabled: pane.tabs.length < 2 },
      { label: t.pinned ? 'Unpin' : 'Pin', icon: <Pin size={14} />, onClick: () => ctl.togglePin(pane.id, t.id) },
      { label: single ? 'Split right' : 'Move to other pane', icon: <Columns2 size={14} />, onClick: () => ctl.splitTab(pane.id, t.id) },
      ...(info.note ? ['sep' as const, ...api.noteMenu(info.note, pane.id)] : []),
    ];
  };

  return (
    <section
      className={`h-full flex flex-col min-w-0 min-h-0 ${vx.main}`}
      onMouseDownCapture={() => { if (!active) ctl.focusPane(pane.id); }}
      onFocusCapture={() => { if (!active) ctl.focusPane(pane.id); }}
      aria-label="Editor pane"
    >
      <div className={`h-10 shrink-0 flex items-end ${vx.side} border-b ${vx.border} ${active && !single ? 'shadow-[inset_0_2px_0_0_rgb(59,130,246)] dark:shadow-[inset_0_2px_0_0_rgb(139,92,246)]' : ''}`}>
        {leftToggle ? (
          <button className={`${vx.iconBtn} self-center ml-1`} aria-label={leftToggle.open ? 'Collapse left sidebar' : 'Expand left sidebar'} title="Toggle left sidebar" onClick={leftToggle.onClick}>
            <PanelLeft size={16} />
          </button>
        ) : null}
        <div
          ref={stripRef}
          role="tablist"
          className="flex-1 min-w-0 flex items-end gap-0.5 overflow-x-auto overflow-y-hidden px-1 h-full [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          onDragOver={(e) => { if (!accepts(e)) return; e.preventDefault(); e.dataTransfer.dropEffect = 'move'; setDropAt(indexFromEvent(e)); }}
          onDragLeave={(e) => { if (!(e.currentTarget as HTMLElement).contains(e.relatedTarget as Node)) setDropAt(null); }}
          onDrop={(e) => {
            e.preventDefault();
            const idx = indexFromEvent(e);
            setDropAt(null);
            const raw = e.dataTransfer.getData(DND_TAB);
            if (raw) { const { paneId, tabId } = JSON.parse(raw); ctl.moveTab(paneId, tabId, pane.id, idx); return; }
            const noteId = e.dataTransfer.getData(DND_NOTE);
            if (noteId) ctl.dropNote(pane.id, noteId, idx);
          }}
          onDoubleClick={(e) => { if (e.target === e.currentTarget) ctl.newTab(pane.id); }}
        >
          {pane.tabs.map((t, i) => {
            const info = titleOf(t);
            const isActive = t.id === pane.activeTab;
            return (
              <div
                key={t.id}
                data-tab={t.id}
                role="tab"
                aria-selected={isActive}
                tabIndex={0}
                draggable
                onDragStart={(e) => { e.dataTransfer.setData(DND_TAB, JSON.stringify({ paneId: pane.id, tabId: t.id })); e.dataTransfer.effectAllowed = 'move'; }}
                onClick={() => ctl.focusTab(pane.id, t.id)}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); ctl.focusTab(pane.id, t.id); } }}
                onMouseDown={(e) => { if (e.button === 1) e.preventDefault(); }}
                onAuxClick={(e) => { if (e.button === 1) { e.preventDefault(); if (!t.pinned) ctl.closeTab(pane.id, t.id); } }}
                onContextMenu={(e) => { e.preventDefault(); setMenu({ at: { x: e.clientX, y: e.clientY }, items: tabMenu(t) }); }}
                title={info.note?.folder ? `${info.note.folder}/${info.title}` : info.title}
                className={`relative group shrink-0 flex items-center gap-1.5 h-[34px] pl-3 pr-1.5 rounded-t-lg text-[12.5px] cursor-default select-none ${t.pinned ? 'max-w-[140px]' : 'flex-1 min-w-[110px] max-w-[200px]'} ${isActive
                  ? `${vx.main} ${vx.text} border border-b-0 ${vx.border} -mb-px h-[35px]`
                  : `text-gray-500 dark:text-gray-400 hover:bg-gray-200/60 dark:hover:bg-white/[0.04]`}`}
              >
                {dropAt === i ? <span className="absolute -left-[3px] top-1 bottom-1 w-0.5 rounded bg-blue-500" /> : null}
                {info.icon ? <span className={vx.faint}>{info.icon}</span> : null}
                <span className="flex-1 truncate">{info.title}</span>
                {t.pinned ? (
                  <button className={`p-0.5 rounded ${vx.faint} hover:text-gray-700 dark:hover:text-gray-200`} aria-label="Unpin tab" title="Unpin" onClick={(e) => { e.stopPropagation(); ctl.togglePin(pane.id, t.id); }}><Pin size={12} className="fill-current" /></button>
                ) : (
                  <button
                    className={`p-0.5 rounded ${vx.faint} hover:text-gray-800 dark:hover:text-gray-100 hover:bg-gray-300/50 dark:hover:bg-white/10 ${isActive ? '' : 'sm:opacity-0 sm:group-hover:opacity-100'}`}
                    aria-label={`Close ${info.title}`}
                    title="Close"
                    onClick={(e) => { e.stopPropagation(); ctl.closeTab(pane.id, t.id); }}
                  ><X size={13} /></button>
                )}
              </div>
            );
          })}
          {dropAt === pane.tabs.length && pane.tabs.length ? <span className="shrink-0 w-0.5 h-6 mb-1 rounded bg-blue-500" /> : null}
          <button className={`${vx.iconBtn} self-center shrink-0 ml-0.5`} aria-label="New tab" title="New tab" onClick={() => ctl.newTab(pane.id)}><Plus size={15} /></button>
        </div>
        {api.desktop ? (
          <button className={`${vx.iconBtn} self-center`} aria-label="Split right" title="Split right (Mod+\)" onClick={() => { ctl.focusPane(pane.id); ctl.splitActive(); }}><Columns2 size={15} /></button>
        ) : null}
        {rightToggle ? (
          <button className={`${vx.iconBtn} self-center mr-1`} aria-label={rightToggle.open ? 'Collapse right sidebar' : 'Expand right sidebar'} title="Toggle right sidebar" onClick={rightToggle.onClick}>
            <PanelRight size={16} />
          </button>
        ) : null}
      </div>
      <div className="flex-1 min-h-0 relative">
        {!activeTab || activeTab.type === 'empty' ? (
          <EmptyPane onClose={activeTab ? () => ctl.closeTab(pane.id, activeTab.id) : undefined} ctl={ctl} />
        ) : activeTab.type === 'graph' ? (
          <div className="absolute inset-0"><GraphPanel
            index={api.vault.index}
            mode="global"
            activeId={api.activeNote?.id ?? null}
            className="h-full"
            onOpen={(node: GraphNode, opts) => {
              if (node.type === 'note' && node.noteId) api.openNote(node.noteId, { newTab: true, split: opts.newTab, paneId: pane.id });
              else if (node.type === 'unresolved') api.openLink(node.label, null, { newTab: true, paneId: pane.id });
              else if (node.type === 'tag') api.openSearch(`tag:${node.label.startsWith('#') ? node.label : `#${node.label}`}`);
            }}
          /></div>
        ) : (
          <div className="absolute inset-0">{renderNote(activeTab)}</div>
        )}
      </div>
      <ContextMenu at={menu?.at ?? null} items={menu?.items ?? []} onClose={() => setMenu(null)} />
    </section>
  );
}

function EmptyPane({ onClose, ctl }: { onClose?: () => void; ctl: PaneCtl }) {
  const api = useVaultApi();
  const link = 'flex items-center gap-2 text-[14px] text-blue-600 dark:text-violet-300 hover:underline';
  return (
    <div className="h-full flex flex-col items-center justify-center gap-3 p-6">
      <p className={`text-base font-semibold mb-1 ${vx.text}`}>No file is open</p>
      <button className={link} onClick={() => api.newNote(undefined)}><FilePlus2 size={15} />Create new note <Kbd k="Mod+Alt+N" /></button>
      <button className={link} onClick={ctl.openQuickSwitcher}><SearchIcon size={15} />Go to file <Kbd k="Mod+O" /></button>
      <button className={link} onClick={ctl.openDaily}><CalendarDays size={15} />Open today’s note <Kbd k="Mod+Alt+D" /></button>
      <button className={link} onClick={() => api.openGraph()}><Waypoints size={15} />Open graph view <Kbd k="Mod+G" /></button>
      {onClose ? <button className={`mt-2 text-[13px] ${vx.muted} hover:underline`} onClick={onClose}>Close</button> : null}
    </div>
  );
}
