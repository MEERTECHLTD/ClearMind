/**
 * Attachment tab: header (name — inline rename —, size, type, download,
 * delete, more) + a viewer per kind (image with fit/zoom, PDF, audio, video,
 * generic file card) + the attachment's backlinks.
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Download, Trash2, MoreHorizontal, ZoomIn, ZoomOut, Maximize, Image as ImageIcon, FileText, Music, Film, File as FileIcon, ChevronRight, Link2,
} from 'lucide-react';
import type { Attachment } from '../../types';
import { attachmentKind, type AttachmentKind } from '../../shared/notes';
import { useAttachmentUrl, downloadAttachment } from './attachments';
import { formatBytes, splitExt } from './attachmentUtils';
import type { AttachmentTab } from './workspace';
import { useVaultApi, vx, ContextMenu, fmtDateTime } from './shell';

export const KIND_ICON: Record<AttachmentKind, React.ComponentType<{ size?: number; className?: string }>> = {
  image: ImageIcon, pdf: FileText, audio: Music, video: Film, other: FileIcon,
};
const KIND_LABEL: Record<AttachmentKind, string> = { image: 'Image', pdf: 'PDF', audio: 'Audio', video: 'Video', other: 'File' };

export function AttachmentPane({ tab, paneId, onClose }: { tab: AttachmentTab; paneId: string; onClose: () => void }) {
  const api = useVaultApi();
  const a = api.vault.index.attachmentsById.get(tab.attachmentId) ?? null;
  const [menuAt, setMenuAt] = useState<{ x: number; y: number } | null>(null);
  if (!a) {
    return (
      <div className="h-full flex flex-col items-center justify-center gap-3 p-6 text-center">
        <p className={`text-sm ${vx.muted}`}>{api.vault.loaded ? 'This file no longer exists.' : 'Loading…'}</p>
        <button onClick={onClose} className={`px-3 py-1.5 rounded-md text-sm ${vx.hover} border ${vx.border} ${vx.text}`}>Close tab</button>
      </div>
    );
  }
  const kind = attachmentKind(a);
  const Icon = KIND_ICON[kind];
  return (
    <div className="h-full flex flex-col min-h-0" aria-label={`File ${a.name}`}>
      <header className={`h-10 shrink-0 flex items-center gap-1 px-2 border-b ${vx.border}`}>
        <Icon size={15} className={`shrink-0 ${vx.faint}`} />
        {a.folder ? <button className={`hidden sm:block truncate max-w-[140px] text-[13px] ${vx.muted} hover:underline`} onClick={() => api.revealAttachment?.(a.id)} title="Show in explorer">{a.folder}/</button> : null}
        <NameInput a={a} onCommit={(v) => api.renameAttachment(a.id, v)} />
        <span className={`hidden sm:inline text-[12px] whitespace-nowrap ${vx.faint}`}>{formatBytes(a.size)} · {KIND_LABEL[kind]}{a.width && a.height ? ` · ${a.width}×${a.height}` : ''}</span>
        <div className="flex-1" />
        <button className={vx.iconBtn} aria-label={`Download ${a.name}`} title="Download" onClick={() => void downloadAttachment(a).catch(() => api.toast('Download failed'))}><Download size={15} /></button>
        <button className={vx.iconBtn} aria-label={`Delete ${a.name}`} title="Delete" onClick={() => api.deleteAttachment(a.id)}><Trash2 size={15} /></button>
        <button className={vx.iconBtn} aria-label="More options" title="More options" onClick={(e) => { const r = e.currentTarget.getBoundingClientRect(); setMenuAt({ x: r.right - 220, y: r.bottom + 4 }); }}><MoreHorizontal size={16} /></button>
      </header>
      <div className="flex-1 min-h-0 flex flex-col">
        <Viewer a={a} kind={kind} />
      </div>
      <Backlinks a={a} />
      <ContextMenu at={menuAt} items={menuAt ? api.attachmentMenu(a, paneId).filter((it) => it === 'sep' || !/^Open( in new tab)?$/.test(it.label)) : []} onClose={() => setMenuAt(null)} />
    </div>
  );
}

function NameInput({ a, onCommit }: { a: Attachment; onCommit: (name: string) => Promise<boolean> }) {
  const [value, setValue] = useState(a.name);
  const [editing, setEditing] = useState(false);
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => { if (!editing) setValue(a.name); }, [a.name, editing]);
  const commit = async () => {
    setEditing(false);
    const v = value.trim();
    if (!v || v === a.name) { setValue(a.name); return; }
    if (!(await onCommit(v))) setValue(a.name);
  };
  return (
    <input
      ref={ref}
      value={value}
      size={Math.max(4, Math.min(value.length + 1, 48))}
      onFocus={(e) => { setEditing(true); const [base] = splitExt(a.name); e.currentTarget.setSelectionRange(0, base.length); }}
      onChange={(e) => setValue(e.target.value)}
      onBlur={() => void commit()}
      onKeyDown={(e) => {
        if (e.key === 'Enter') { e.preventDefault(); (e.target as HTMLInputElement).blur(); }
        if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); setValue(a.name); setEditing(false); requestAnimationFrame(() => ref.current?.blur()); }
      }}
      aria-label="File name"
      data-attachment-name
      spellCheck={false}
      className={`min-w-0 max-w-full bg-transparent outline-none rounded px-1 text-[13px] font-medium truncate ${vx.text} focus:bg-gray-100 dark:focus:bg-white/5`}
    />
  );
}

function Viewer({ a, kind }: { a: Attachment; kind: AttachmentKind }) {
  const { url, loading, error } = useAttachmentUrl(a);
  if (error) return <Center><p className="text-sm text-red-500">{error}</p></Center>;
  if (loading || !url) return <Center><div className="w-7 h-7 border-[3px] border-blue-500 dark:border-violet-400 border-t-transparent rounded-full animate-spin" aria-label="Loading file" /></Center>;
  if (kind === 'image') return <ImageViewer a={a} url={url} />;
  if (kind === 'pdf') return <iframe title={a.name} src={url} className="flex-1 w-full min-h-0 border-0 bg-white" />;
  if (kind === 'video') return <Center><video src={url} controls className="max-w-full max-h-full rounded-lg bg-black" aria-label={a.name} /></Center>;
  if (kind === 'audio') {
    return (
      <Center>
        <div className={`w-full max-w-md rounded-xl border ${vx.border} ${vx.card} p-5 flex flex-col items-center gap-4 shadow-sm`}>
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center"><Music size={24} className="text-white" /></div>
          <p className={`text-sm font-medium text-center break-all ${vx.text}`}>{a.name}</p>
          <audio src={url} controls className="w-full" aria-label={a.name} />
        </div>
      </Center>
    );
  }
  return (
    <Center>
      <div className={`w-full max-w-sm rounded-xl border ${vx.border} ${vx.card} p-6 flex flex-col items-center gap-3 text-center shadow-sm`}>
        <FileIcon size={40} className={vx.faint} />
        <p className={`text-sm font-medium break-all ${vx.text}`}>{a.name}</p>
        <p className={`text-xs ${vx.muted}`}>{formatBytes(a.size)} · {a.mime || 'unknown type'}</p>
        <p className={`text-xs ${vx.faint}`}>Added {fmtDateTime(a.createdAt)}</p>
        <a href={url} download={a.name} className="mt-1 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 dark:bg-violet-600 dark:hover:bg-violet-500"><Download size={14} />Download</a>
      </div>
    </Center>
  );
}

const Center = ({ children }: { children: React.ReactNode }) => <div className="flex-1 min-h-0 flex items-center justify-center p-4 overflow-auto">{children}</div>;

function ImageViewer({ a, url }: { a: Attachment; url: string }) {
  const [zoom, setZoom] = useState<number | 'fit'>('fit');
  const z = zoom === 'fit' ? null : zoom;
  const step = (d: number) => setZoom((cur) => {
    const base = cur === 'fit' ? 1 : cur;
    return Math.max(0.1, Math.min(8, Math.round((d > 0 ? base * 1.25 : base / 1.25) * 100) / 100));
  });
  return (
    <div className="relative flex-1 min-h-0 flex flex-col">
      <div
        className={`flex-1 min-h-0 overflow-auto ${zoom === 'fit' ? 'flex items-center justify-center' : ''} p-4 bg-[repeating-conic-gradient(#f3f4f6_0%_25%,transparent_0%_50%)] dark:bg-[repeating-conic-gradient(#11151e_0%_25%,transparent_0%_50%)] [background-size:20px_20px]`}
        onDoubleClick={() => setZoom((cur) => (cur === 'fit' ? 1 : 'fit'))}
        onWheel={(e) => { if (e.ctrlKey || e.metaKey) { e.preventDefault(); step(-e.deltaY); } }}
      >
        <img
          src={url}
          alt={a.name}
          draggable={false}
          className={zoom === 'fit' ? 'max-w-full max-h-full object-contain shadow-sm' : 'max-w-none shadow-sm mx-auto'}
          style={z && a.width ? { width: a.width * z } : z ? { transform: `scale(${z})`, transformOrigin: 'top left' } : undefined}
        />
      </div>
      <div className={`absolute bottom-3 right-3 flex items-center gap-0.5 rounded-lg border ${vx.border} bg-white/90 dark:bg-[#0F1219]/90 backdrop-blur p-0.5 shadow-sm`} role="group" aria-label="Zoom">
        <button className={vx.iconBtn} aria-label="Zoom out" title="Zoom out" onClick={() => step(-1)}><ZoomOut size={15} /></button>
        <button className={`px-1.5 text-[12px] tabular-nums min-w-[48px] rounded-md ${vx.muted} ${vx.hover}`} aria-label="Actual size" title="Actual size (100%)" onClick={() => setZoom(1)}>{zoom === 'fit' ? 'Fit' : `${Math.round(zoom * 100)}%`}</button>
        <button className={vx.iconBtn} aria-label="Zoom in" title="Zoom in" onClick={() => step(1)}><ZoomIn size={15} /></button>
        <button className={`${vx.iconBtn} ${zoom === 'fit' ? vx.accentText : ''}`} aria-label="Fit to view" aria-pressed={zoom === 'fit'} title="Fit to view" onClick={() => setZoom('fit')}><Maximize size={15} /></button>
      </div>
    </div>
  );
}

function Backlinks({ a }: { a: Attachment }) {
  const api = useVaultApi();
  const [open, setOpen] = useState(true);
  const groups = useMemo(() => {
    const idx = api.vault.index;
    const by = new Map<string, { line: number; text: string }[]>();
    for (const l of idx.attachmentBacklinks.get(a.id) ?? []) {
      const n = idx.byId.get(l.from);
      if (!n) continue;
      let line = 0, text = `Canvas card: ${l.context ?? l.target}`;
      if (n.kind !== 'canvas') {
        const before = n.content.slice(0, l.start);
        line = before.split('\n').length - 1;
        text = n.content.split('\n')[line]?.trim() ?? '';
      }
      by.set(n.id, [...(by.get(n.id) ?? []), { line, text }]);
    }
    return [...by].map(([id, ms]) => ({ note: idx.byId.get(id)!, ms })).sort((x, y) => x.note.title.localeCompare(y.note.title));
  }, [api.vault.index, a.id]);
  return (
    <section className={`shrink-0 border-t ${vx.border} ${vx.side} max-h-[40%] flex flex-col min-h-0`} aria-label="Backlinks">
      <button className={`flex items-center gap-1.5 px-3 h-8 text-[12px] font-semibold uppercase tracking-wide ${vx.muted}`} aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        <ChevronRight size={13} className={`transition-transform ${open ? 'rotate-90' : ''}`} /><Link2 size={13} />Linked mentions<span className={`ml-1 font-normal ${vx.faint}`}>{groups.reduce((s, g) => s + g.ms.length, 0)}</span>
      </button>
      {open ? (
        <div className="overflow-y-auto pb-2 min-h-0">
          {!groups.length ? <p className={`px-4 pb-2 text-[13px] ${vx.muted}`}>No notes link to this file yet. Embed it with <code className="px-1 rounded bg-gray-100 dark:bg-white/10">![[{a.name}]]</code>.</p> : null}
          {groups.map((g) => (
            <div key={g.note.id} className="px-2">
              <button className={`w-full text-left px-2 py-1 rounded-md text-[13px] font-medium truncate ${vx.text} ${vx.hover}`} onClick={(e) => api.openNote(g.note.id, { newTab: e.metaKey || e.ctrlKey })}>{g.note.title}</button>
              {g.ms.map((m, i) => (
                <button key={i} className={`block w-full text-left ml-3 pl-2.5 pr-2 py-0.5 text-[12px] truncate border-l border-gray-200 dark:border-white/[0.06] ${vx.muted} ${vx.hover}`} onClick={(e) => api.openNote(g.note.id, { newTab: e.metaKey || e.ctrlKey, line: m.line })}>{m.text || ' '}</button>
              ))}
            </div>
          ))}
        </div>
      ) : null}
    </section>
  );
}
