/** Right sidebar panes for the active note: Backlinks, Outgoing links, Outline, Local graph, Info. */
import React, { useMemo, useState } from 'react';
import { ChevronRight, Link2, FilePlus2, Hash, Unlink, Paperclip } from 'lucide-react';
import type { Note, Attachment } from '../../types';
import { linkedMentions, unlinkedMentions, extractHeadings, plainText, notePath, normPath, type GraphNode, type Mention } from '../../shared/notes';
import { GraphPanel } from './GraphPanel';
import { linkUnlinked, linkAllUnlinked } from './vaultActions';
import { useVaultApi, vx, PaneHeader, EmptyHint, Highlight, fmtDateTime } from './shell';

const NoNote = () => <EmptyHint>No note is open.</EmptyHint>;

function Section({ title, count, children, defaultOpen = true, extra }: { title: string; count?: number; children: React.ReactNode; defaultOpen?: boolean; extra?: React.ReactNode }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="mb-1">
      <div className="flex items-center pr-2">
        <button onClick={() => setOpen((o) => !o)} aria-expanded={open} className={`flex-1 flex items-center gap-1 px-2 h-8 text-[12px] font-semibold ${vx.text}`}>
          <ChevronRight size={13} className={`transition-transform ${vx.faint} ${open ? 'rotate-90' : ''}`} />
          {title}
          {count !== undefined ? <span className={`ml-1 font-normal ${vx.faint}`}>{count}</span> : null}
        </button>
        {extra}
      </div>
      {open ? children : null}
    </div>
  );
}

function MentionGroup({ note, mentions, title, action }: { note: Note; mentions: Mention[]; title: string; action?: (m: Mention) => React.ReactNode }) {
  const api = useVaultApi();
  const [open, setOpen] = useState(true);
  return (
    <div className="mx-1.5 mb-1.5 rounded-md border border-gray-200/80 dark:border-white/[0.06] overflow-hidden">
      <div
        className={`flex items-center gap-1 px-1.5 h-7 cursor-pointer ${vx.hover}`}
        onClick={(e) => api.openNote(note.id, { newTab: e.metaKey || e.ctrlKey })}
        onAuxClick={(e) => { if (e.button === 1) api.openNote(note.id, { newTab: true }); }}
        onContextMenu={(e) => { e.preventDefault(); api.showMenu(e, api.noteMenu(note)); }}
      >
        <button className={`p-0.5 ${vx.faint}`} aria-label={open ? 'Collapse' : 'Expand'} onClick={(e) => { e.stopPropagation(); setOpen((o) => !o); }}>
          <ChevronRight size={12} className={open ? 'rotate-90' : ''} />
        </button>
        <span className={`truncate text-[12.5px] font-medium ${vx.text}`}>{note.title}</span>
        {note.folder ? <span className={`truncate text-[10.5px] ${vx.faint}`}>{note.folder}</span> : null}
      </div>
      {open ? mentions.map((m) => (
        <div key={`${m.start}`} className="group flex items-start gap-1 border-t border-gray-200/70 dark:border-white/[0.05]">
          <button
            onClick={(e) => api.openNote(note.id, { newTab: e.metaKey || e.ctrlKey, line: m.line })}
            className={`flex-1 min-w-0 text-left px-2.5 py-1.5 text-[12px] leading-snug text-gray-600 dark:text-gray-400 break-words ${vx.hover}`}
          >
            <Highlight text={m.text || ' '} terms={[title]} />
          </button>
          {action?.(m)}
        </div>
      )) : null}
    </div>
  );
}

export function BacklinksPane() {
  const api = useVaultApi();
  const note = api.activeNote;
  const index = api.vault.index;
  const [showUnlinked, setShowUnlinked] = useState(false);
  const linked = useMemo(() => (note ? linkedMentions(index, note.id) : []), [index, note]);
  const unlinked = useMemo(() => (note && showUnlinked ? unlinkedMentions(index, note.id) : []), [index, note, showUnlinked]);
  if (!note) return <NoNote />;
  const linkedCount = linked.reduce((s, g) => s + g.mentions.length, 0);
  return (
    <div className="py-1">
      <Section title="Linked mentions" count={linkedCount}>
        {linked.length ? linked.map((g) => <MentionGroup key={g.note.id} note={g.note} mentions={g.mentions} title={note.title} />) : <EmptyHint>No backlinks found.</EmptyHint>}
      </Section>
      <div className="mb-1">
        <button onClick={() => setShowUnlinked((o) => !o)} aria-expanded={showUnlinked} className={`w-full flex items-center gap-1 px-2 h-8 text-[12px] font-semibold ${vx.text}`}>
          <ChevronRight size={13} className={`transition-transform ${vx.faint} ${showUnlinked ? 'rotate-90' : ''}`} />
          Unlinked mentions
          {showUnlinked ? <span className={`ml-1 font-normal ${vx.faint}`}>{unlinked.reduce((s, g) => s + g.mentions.length, 0)}</span> : null}
        </button>
        {showUnlinked ? (unlinked.length ? unlinked.map((g) => (
          <div key={g.note.id} className="relative">
            {g.mentions.length > 1 ? (
              <button
                className={`absolute right-3 top-1 z-10 text-[11px] px-1.5 py-0.5 rounded ${vx.accentText} hover:bg-blue-500/10`}
                onClick={async () => { await linkAllUnlinked(g.note, g.mentions, note); api.toast(`Linked ${g.mentions.length} mentions in “${g.note.title}”`); }}
              >Link all</button>
            ) : null}
            <MentionGroup
              note={g.note}
              mentions={g.mentions}
              title={note.title}
              action={(m) => (
                <button
                  className={`shrink-0 m-1 text-[11px] px-1.5 py-0.5 rounded border border-blue-500/30 ${vx.accentText} hover:bg-blue-500/10`}
                  title={`Turn into [[${note.title}]]`}
                  onClick={async () => { await linkUnlinked(g.note, m, note); api.toast(`Linked mention in “${g.note.title}”`); }}
                >Link</button>
              )}
            />
          </div>
        )) : <EmptyHint>No unlinked mentions found.</EmptyHint>) : null}
      </div>
    </div>
  );
}

export function OutgoingPane() {
  const api = useVaultApi();
  const note = api.activeNote;
  const index = api.vault.index;
  const { resolved, unresolved, files } = useMemo(() => {
    const ls = note ? index.links.get(note.id) ?? [] : [];
    const r = new Map<string, { note: Note; count: number }>();
    const u = new Map<string, { target: string; count: number }>();
    const f = new Map<string, { file: Attachment; count: number }>();
    for (const l of ls) {
      if (!l.target) continue;
      if (l.toAttachment) { const a = index.attachmentsById.get(l.toAttachment); if (a) f.set(a.id, { file: a, count: (f.get(a.id)?.count ?? 0) + 1 }); }
      else if (l.to) { const n = index.byId.get(l.to); if (n) r.set(n.id, { note: n, count: (r.get(n.id)?.count ?? 0) + 1 }); }
      else { const k = normPath(l.target); u.set(k, { target: l.target, count: (u.get(k)?.count ?? 0) + 1 }); }
    }
    return { resolved: [...r.values()].sort((a, b) => a.note.title.localeCompare(b.note.title)), unresolved: [...u.values()], files: [...f.values()].sort((a, b) => a.file.name.localeCompare(b.file.name)) };
  }, [index, note]);
  if (!note) return <NoNote />;
  return (
    <div className="py-1">
      <Section title="Links" count={resolved.length}>
        {resolved.length ? resolved.map(({ note: n, count }) => (
          <div
            key={n.id}
            onClick={(e) => api.openNote(n.id, { newTab: e.metaKey || e.ctrlKey })}
            onAuxClick={(e) => { if (e.button === 1) api.openNote(n.id, { newTab: true }); }}
            onContextMenu={(e) => { e.preventDefault(); api.showMenu(e, api.noteMenu(n)); }}
            className={`flex items-center gap-2 px-3 h-7 mx-1 rounded-md cursor-pointer ${vx.hover}`}
          >
            <Link2 size={12} className={vx.faint} />
            <span className={`truncate text-[13px] ${vx.text}`}>{n.title}</span>
            {n.folder ? <span className={`truncate text-[11px] ${vx.faint}`}>{n.folder}</span> : null}
            {count > 1 ? <span className={`ml-auto text-[11px] ${vx.faint}`}>{count}</span> : null}
          </div>
        )) : <EmptyHint>No outgoing links.</EmptyHint>}
      </Section>
      {files.length ? (
        <Section title="Files" count={files.length}>
          {files.map(({ file, count }) => (
            <div
              key={file.id}
              onClick={(e) => api.openAttachment(file.id, { newTab: e.metaKey || e.ctrlKey })}
              onContextMenu={(e) => { e.preventDefault(); api.showMenu(e, api.attachmentMenu(file)); }}
              className={`flex items-center gap-2 px-3 h-7 mx-1 rounded-md cursor-pointer ${vx.hover}`}
            >
              <Paperclip size={12} className={vx.faint} />
              <span className={`truncate text-[13px] ${vx.text}`}>{file.name}</span>
              {file.folder ? <span className={`truncate text-[11px] ${vx.faint}`}>{file.folder}</span> : null}
              {count > 1 ? <span className={`ml-auto text-[11px] ${vx.faint}`}>{count}</span> : null}
            </div>
          ))}
        </Section>
      ) : null}
      <Section title="Unresolved" count={unresolved.length}>
        {unresolved.length ? unresolved.map((u) => (
          <div
            key={u.target}
            onClick={(e) => api.openLink(u.target, note, { newTab: e.metaKey || e.ctrlKey })}
            title="Click to create this note"
            className={`flex items-center gap-2 px-3 h-7 mx-1 rounded-md cursor-pointer ${vx.hover}`}
          >
            <Unlink size={12} className={vx.faint} />
            <span className="truncate text-[13px] text-gray-500 dark:text-gray-400 italic">{u.target}</span>
            <FilePlus2 size={12} className={`ml-auto ${vx.faint}`} />
          </div>
        )) : <EmptyHint>None.</EmptyHint>}
      </Section>
    </div>
  );
}

export function OutlinePane() {
  const api = useVaultApi();
  const note = api.activeNote;
  const headings = useMemo(() => (note ? extractHeadings(note.content) : []), [note]);
  if (!note) return <NoNote />;
  if (!headings.length) return <EmptyHint>No headings in this note.</EmptyHint>;
  const minLevel = Math.min(...headings.map((h) => h.level));
  let current = -1;
  headings.forEach((h, i) => { if (h.line <= api.cursorLine) current = i; });
  return (
    <div className="py-1.5">
      {headings.map((h, i) => (
        <button
          key={`${h.line}`}
          onClick={() => api.scrollActive({ line: h.line, heading: h.text })}
          style={{ paddingLeft: 10 + (h.level - minLevel) * 14 }}
          className={`block w-full text-left pr-2 py-1 text-[13px] truncate rounded-md mx-1 max-w-[calc(100%-8px)] ${i === current ? `${vx.active} font-medium` : `${vx.hover} text-gray-700 dark:text-gray-300`}`}
          title={h.text}
        >
          {h.text}
        </button>
      ))}
    </div>
  );
}

export function LocalGraphPane() {
  const api = useVaultApi();
  const note = api.activeNote;
  if (!note) return <NoNote />;
  return (
    <div className="h-full min-h-[280px] flex flex-col">
      <GraphPanel
        index={api.vault.index}
        mode="local"
        activeId={note.id}
        className="flex-1 min-h-[280px]"
        onOpen={(node: GraphNode, opts) => {
          if (node.type === 'note' && node.noteId) api.openNote(node.noteId, { newTab: opts.newTab });
          else if (node.type === 'unresolved') api.openLink(node.label, note, { newTab: opts.newTab });
          else if (node.type === 'tag') api.openSearch(`tag:${node.label.startsWith('#') ? node.label : `#${node.label}`}`);
          else if (node.type === 'attachment') api.openAttachment(node.id.replace(/^attachment:/, ''), { newTab: opts.newTab });
        }}
      />
    </div>
  );
}

export function InfoPane() {
  const api = useVaultApi();
  const note = api.activeNote;
  const stats = useMemo(() => {
    if (!note) return null;
    const text = plainText(note.content);
    return { words: text ? text.split(/\s+/).filter(Boolean).length : 0, chars: text.length };
  }, [note]);
  if (!note || !stats) return <NoNote />;
  const tags = api.vault.index.tagsOf.get(note.id) ?? [];
  const backlinks = linkedMentions(api.vault.index, note.id).length;
  const outgoing = (api.vault.index.links.get(note.id) ?? []).filter((l) => l.target).length;
  const row = (k: string, v: React.ReactNode) => (
    <div className="flex items-baseline gap-3 px-3 py-1 text-[12.5px]"><span className={`w-24 shrink-0 ${vx.muted}`}>{k}</span><span className={`min-w-0 break-words ${vx.text}`}>{v}</span></div>
  );
  return (
    <div className="py-1">
      <Section title="Tags in note" count={tags.length}>
        <div className="px-3 pb-2 flex flex-wrap gap-1.5">
          {tags.length ? tags.map((t) => (
            <button key={t} onClick={() => api.openSearch(`tag:#${t}`)} className="inline-flex items-center gap-0.5 text-[12px] px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-700 dark:bg-violet-500/15 dark:text-violet-200 hover:bg-blue-500/20">
              <Hash size={11} />{t}
            </button>
          )) : <span className={`text-[12px] ${vx.muted}`}>No tags.</span>}
        </div>
      </Section>
      <Section title="Note info">
        {row('Path', notePath(note))}
        {row('Words', stats.words.toLocaleString())}
        {row('Characters', stats.chars.toLocaleString())}
        {row('Backlinks', backlinks)}
        {row('Outgoing', outgoing)}
        {row('Created', fmtDateTime(note.createdAt))}
        {row('Modified', fmtDateTime(note.lastEdited))}
        {note.kind && note.kind !== 'note' ? row('Type', note.kind === 'daily' ? `Daily note${note.dailyDate ? ` · ${note.dailyDate}` : ''}` : 'Template') : null}
      </Section>
    </div>
  );
}

export const RIGHT_TITLES = { backlinks: 'Backlinks', outgoing: 'Outgoing links', outline: 'Outline', graph: 'Local graph', info: 'Tags & info' } as const;

export function RightPane({ tab }: { tab: keyof typeof RIGHT_TITLES }) {
  const api = useVaultApi();
  const body = tab === 'backlinks' ? <BacklinksPane /> : tab === 'outgoing' ? <OutgoingPane /> : tab === 'outline' ? <OutlinePane /> : tab === 'graph' ? <LocalGraphPane /> : <InfoPane />;
  return (
    <div className="flex flex-col h-full min-h-0">
      <PaneHeader title={`${RIGHT_TITLES[tab]}${api.activeNote ? ` · ${api.activeNote.title}` : ''}`} />
      <div className={`flex-1 min-h-0 ${tab === 'graph' ? 'flex flex-col' : 'overflow-y-auto'}`}>{body}</div>
    </div>
  );
}
