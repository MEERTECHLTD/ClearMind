/** Left sidebar panes besides the explorer: Search, Bookmarks, Tags. */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronRight, HelpCircle, X, ChevronsDownUp, ChevronsUpDown, ArrowDownUp, Star, Hash, Search as SearchIcon } from 'lucide-react';
import { searchVault, parseSearch, attachmentPath, attachmentKind } from '../../shared/notes';
import { attachmentMatches, formatBytes } from './attachmentUtils';
import { KIND_ICON } from './AttachmentPane';
import { toggleBookmark } from './useVault';
import { useVaultApi, vx, PaneHeader, Highlight, EmptyHint } from './shell';

// ------------------------------------------------------------------ search

const OPERATORS: { op: string; desc: string }[] = [
  { op: 'tag:#', desc: 'notes with a tag (nested too)' },
  { op: 'path:', desc: 'match the folder/file path' },
  { op: 'file:', desc: 'match the file name' },
  { op: 'line:', desc: 'terms on the same line' },
  { op: 'content:', desc: 'match the body only' },
  { op: 'task:', desc: 'match a task' },
  { op: 'task-todo:', desc: 'an unfinished task' },
  { op: 'task-done:', desc: 'a completed task' },
  { op: '"exact phrase"', desc: 'match a phrase' },
  { op: '-', desc: 'exclude a term, e.g. -draft' },
  { op: 'OR', desc: 'either side matches' },
  { op: '[property:value]', desc: 'frontmatter property' },
];

export function SearchPane({ query, setQuery, focusNonce }: { query: string; setQuery: (q: string) => void; focusNonce: number }) {
  const api = useVaultApi();
  const { vault } = api;
  const inputRef = useRef<HTMLInputElement>(null);
  const [sort, setSort] = useState<'relevance' | 'modified'>('relevance');
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [allCollapsed, setAllCollapsed] = useState(false);
  const [help, setHelp] = useState(false);
  const [debounced, setDebounced] = useState(query);
  useEffect(() => { const t = window.setTimeout(() => setDebounced(query), 120); return () => window.clearTimeout(t); }, [query]);
  useEffect(() => { if (focusNonce) { inputRef.current?.focus(); inputRef.current?.select(); } }, [focusNonce]);

  const hits = useMemo(() => {
    const r = debounced.trim() ? searchVault(vault.index, debounced, 500) : [];
    return sort === 'modified' ? [...r].sort((a, b) => (b.note.lastEdited ?? '').localeCompare(a.note.lastEdited ?? '')) : r;
  }, [vault.index, debounced, sort]);
  const fileHits = useMemo(() => {
    if (!debounced.trim()) return [];
    const groups = parseSearch(debounced);
    return vault.index.attachments.filter((a) => attachmentMatches(attachmentPath(a), groups)).sort((a, b) => a.name.localeCompare(b.name)).slice(0, 100);
  }, [vault.index, debounced]);
  const terms = useMemo(() => parseSearch(debounced).flat().filter((t) => !t.neg && ['any', 'line', 'content', 'task', 'task-todo', 'task-done'].includes(t.field)).map((t) => t.value), [debounced]);
  const isCollapsed = (id: string) => (allCollapsed ? !collapsed.has(id) : collapsed.has(id));
  const flip = (id: string) => setCollapsed((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const insertOp = (op: string) => {
    const q = query.trim() ? `${query.trim()} ${op}` : op;
    setQuery(q);
    setHelp(false);
    window.setTimeout(() => { const el = inputRef.current; if (el) { el.focus(); const pos = op.startsWith('"') ? q.length - 1 : op.startsWith('[') ? q.length - 1 : q.length; el.setSelectionRange(pos, pos); } }, 0);
  };

  return (
    <div className="flex flex-col h-full min-h-0">
      <PaneHeader title="Search">
        <button className={vx.iconBtn} title={`Sort: ${sort === 'relevance' ? 'relevance' : 'last modified'}`} aria-label="Change sort order" onClick={() => setSort((s) => (s === 'relevance' ? 'modified' : 'relevance'))}><ArrowDownUp size={15} /></button>
        <button className={vx.iconBtn} title={allCollapsed ? 'Expand results' : 'Collapse results'} aria-label={allCollapsed ? 'Expand results' : 'Collapse results'} onClick={() => { setAllCollapsed((c) => !c); setCollapsed(new Set()); }}>{allCollapsed ? <ChevronsUpDown size={15} /> : <ChevronsDownUp size={15} />}</button>
        <button className={`${vx.iconBtn} ${help ? vx.accentText : ''}`} title="Search operators" aria-label="Search operators" aria-expanded={help} onClick={() => setHelp((h) => !h)}><HelpCircle size={15} /></button>
      </PaneHeader>
      <div className="p-2 relative">
        <div className="relative">
          <SearchIcon size={14} className={`absolute left-2.5 top-1/2 -translate-y-1/2 ${vx.faint}`} />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Escape' && query) { e.stopPropagation(); setQuery(''); } }}
            placeholder="Search…"
            aria-label="Search vault"
            className={`${vx.input} pl-8 pr-7`}
          />
          {query ? <button className={`absolute right-1.5 top-1/2 -translate-y-1/2 ${vx.iconBtn} !p-0.5`} aria-label="Clear search" onClick={() => { setQuery(''); inputRef.current?.focus(); }}><X size={13} /></button> : null}
        </div>
        {help ? (
          <div className={`mt-2 rounded-lg border ${vx.border} ${vx.card} shadow-lg p-1.5 text-[12px]`}>
            <div className={`px-2 py-1 text-[11px] font-semibold uppercase tracking-wide ${vx.muted}`}>Search options</div>
            {OPERATORS.map((o) => (
              <button key={o.op} onClick={() => insertOp(o.op)} className={`w-full flex items-baseline gap-2 px-2 py-1 rounded text-left ${vx.hover}`}>
                <code className={`shrink-0 font-mono ${vx.accentText}`}>{o.op}</code>
                <span className={`truncate ${vx.muted}`}>{o.desc}</span>
              </button>
            ))}
          </div>
        ) : null}
      </div>
      {debounced.trim() ? <div className={`px-3 pb-1 text-[11px] ${vx.faint}`}>{hits.length} result{hits.length === 1 ? '' : 's'}{hits.length >= 500 ? '+' : ''}{fileHits.length ? ` · ${fileHits.length} file${fileHits.length === 1 ? '' : 's'}` : ''}</div> : null}
      <div className="flex-1 min-h-0 overflow-y-auto pb-6">
        {!debounced.trim() ? <EmptyHint>Type to search titles, text, tags, tasks and properties. Use <button className={vx.accentText} onClick={() => setHelp(true)}>operators</button> to narrow down.</EmptyHint> : null}
        {debounced.trim() && !hits.length && !fileHits.length ? <EmptyHint>No matches found.</EmptyHint> : null}
        {hits.map((h) => {
          const closed = isCollapsed(h.note.id);
          return (
            <div key={h.note.id} className="px-1">
              <div
                onClick={(e) => api.openNote(h.note.id, { newTab: e.metaKey || e.ctrlKey })}
                onAuxClick={(e) => { if (e.button === 1) api.openNote(h.note.id, { newTab: true }); }}
                onContextMenu={(e) => { e.preventDefault(); api.showMenu(e, api.noteMenu(h.note)); }}
                className={`group flex items-center gap-1 px-1.5 h-7 rounded-md cursor-pointer ${api.activeNote?.id === h.note.id ? vx.active : vx.hover}`}
              >
                <button className={`p-0.5 ${vx.faint}`} aria-label={closed ? 'Expand' : 'Collapse'} onClick={(e) => { e.stopPropagation(); flip(h.note.id); }}>
                  <ChevronRight size={13} className={`transition-transform ${closed || !h.matches.length ? '' : 'rotate-90'} ${h.matches.length ? '' : 'opacity-0'}`} />
                </button>
                <span className={`truncate text-[13px] font-medium ${vx.text}`}><Highlight text={h.note.title} terms={terms} /></span>
                {h.note.folder ? <span className={`truncate text-[11px] ${vx.faint}`}>{h.note.folder}</span> : null}
                <span className={`ml-auto text-[11px] ${vx.faint}`}>{h.matches.length || ''}</span>
              </div>
              {!closed && h.matches.length ? (
                <div className="ml-5 mb-1 border-l border-gray-200 dark:border-white/[0.06]">
                  {h.matches.map((m) => (
                    <button
                      key={m.line}
                      onClick={(e) => api.openNote(h.note.id, { newTab: e.metaKey || e.ctrlKey, line: m.line })}
                      className={`block w-full text-left pl-2.5 pr-2 py-1 text-[12px] leading-snug rounded-r-md ${vx.hover} text-gray-600 dark:text-gray-400 break-words`}
                    >
                      <Highlight text={m.text || ' '} terms={terms} />
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
          );
        })}
        {fileHits.length ? (
          <div className="px-1 mt-2" role="group" aria-label="Files">
            <div className={`px-2 pb-1 text-[11px] font-semibold uppercase tracking-wide ${vx.muted}`}>Files</div>
            {fileHits.map((a) => {
              const Icon = KIND_ICON[attachmentKind(a)];
              return (
                <div
                  key={a.id}
                  role="button"
                  tabIndex={0}
                  onClick={(e) => api.openAttachment(a.id, { newTab: e.metaKey || e.ctrlKey })}
                  onKeyDown={(e) => { if (e.key === 'Enter') api.openAttachment(a.id, { newTab: e.metaKey || e.ctrlKey }); }}
                  onContextMenu={(e) => { e.preventDefault(); api.showMenu(e, api.attachmentMenu(a)); }}
                  title={`${attachmentPath(a)} · ${formatBytes(a.size)}`}
                  className={`flex items-center gap-1.5 px-2 h-7 rounded-md cursor-pointer ${api.activeAttachmentId === a.id ? vx.active : vx.hover}`}
                >
                  <Icon size={13} className={`shrink-0 ${vx.faint}`} />
                  <span className={`truncate text-[13px] ${vx.text}`}><Highlight text={a.name} terms={terms} /></span>
                  {a.folder ? <span className={`truncate text-[11px] ${vx.faint}`}>{a.folder}</span> : null}
                </div>
              );
            })}
          </div>
        ) : null}
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ bookmarks

export function BookmarksPane() {
  const api = useVaultApi();
  const marks = useMemo(() => api.vault.notes.filter((n) => n.bookmarked).sort((a, b) => a.title.localeCompare(b.title)), [api.vault.notes]);
  return (
    <div className="flex flex-col h-full min-h-0">
      <PaneHeader title="Bookmarks" />
      <div className="flex-1 min-h-0 overflow-y-auto py-1">
        {!marks.length ? <EmptyHint>No bookmarks yet. Click the <Star size={12} className="inline -mt-0.5" /> in a note’s header to bookmark it.</EmptyHint> : null}
        {marks.map((n) => (
          <div
            key={n.id}
            onClick={(e) => api.openNote(n.id, { newTab: e.metaKey || e.ctrlKey })}
            onAuxClick={(e) => { if (e.button === 1) api.openNote(n.id, { newTab: true }); }}
            onContextMenu={(e) => { e.preventDefault(); api.showMenu(e, api.noteMenu(n)); }}
            className={`group flex items-center gap-2 px-2 h-8 mx-1 rounded-md cursor-pointer ${api.activeNote?.id === n.id ? vx.active : vx.hover}`}
          >
            <button className="p-0.5" aria-label={`Remove bookmark from ${n.title}`} title="Remove bookmark" onClick={(e) => { e.stopPropagation(); void toggleBookmark(n); }}>
              <Star size={13} className="text-amber-400 fill-amber-400" />
            </button>
            <span className={`truncate text-[13px] ${vx.text}`}>{n.title}</span>
            {n.folder ? <span className={`ml-auto truncate text-[11px] ${vx.faint}`}>{n.folder}</span> : null}
          </div>
        ))}
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ tags

interface TagNode { tag: string; name: string; count: number; children: TagNode[] }

export function TagsPane() {
  const api = useVaultApi();
  const [sort, setSort] = useState<'name' | 'count'>('name');
  const [open, setOpen] = useState<Set<string>>(new Set());
  const tree = useMemo(() => {
    const nodes = new Map<string, TagNode>();
    const roots: TagNode[] = [];
    for (const tag of [...api.vault.index.tags.keys()].sort()) {
      const node: TagNode = { tag, name: tag.split('/').pop()!, count: api.vault.index.tags.get(tag)!.size, children: [] };
      nodes.set(tag, node);
      const parent = tag.includes('/') ? nodes.get(tag.slice(0, tag.lastIndexOf('/'))) : null;
      (parent ? parent.children : roots).push(node);
    }
    const cmp = (a: TagNode, b: TagNode) => (sort === 'count' ? b.count - a.count || a.name.localeCompare(b.name) : a.name.localeCompare(b.name));
    const walk = (ns: TagNode[]) => { ns.sort(cmp); ns.forEach((n) => walk(n.children)); };
    walk(roots);
    return roots;
  }, [api.vault.index, sort]);
  const render = (n: TagNode, depth: number): React.ReactNode => (
    <div key={n.tag}>
      <div
        onClick={() => api.openSearch(`tag:#${n.tag}`)}
        style={{ paddingLeft: 6 + depth * 14 }}
        className={`flex items-center gap-1 h-7 pr-2 mx-1 rounded-md cursor-pointer ${vx.hover}`}
        title={`Search tag:#${n.tag}`}
      >
        <button
          className={`p-0.5 ${vx.faint} ${n.children.length ? '' : 'invisible'}`}
          aria-label={open.has(n.tag) ? 'Collapse' : 'Expand'}
          onClick={(e) => { e.stopPropagation(); setOpen((s) => { const x = new Set(s); if (x.has(n.tag)) x.delete(n.tag); else x.add(n.tag); return x; }); }}
        ><ChevronRight size={13} className={open.has(n.tag) ? 'rotate-90' : ''} /></button>
        <Hash size={12} className={vx.faint} />
        <span className={`truncate text-[13px] ${vx.text}`}>{n.name}</span>
        <span className={`ml-auto text-[11px] px-1.5 rounded-full bg-gray-200/70 dark:bg-white/[0.06] ${vx.muted}`}>{n.count}</span>
      </div>
      {open.has(n.tag) ? n.children.map((c) => render(c, depth + 1)) : null}
    </div>
  );
  return (
    <div className="flex flex-col h-full min-h-0">
      <PaneHeader title="Tags">
        <button className={vx.iconBtn} title={`Sort by ${sort === 'name' ? 'frequency' : 'name'}`} aria-label="Change sort order" onClick={() => setSort((s) => (s === 'name' ? 'count' : 'name'))}><ArrowDownUp size={15} /></button>
        <button className={vx.iconBtn} title="Expand all" aria-label="Expand all" onClick={() => setOpen((s) => (s.size ? new Set() : new Set(api.vault.index.tags.keys())))}><ChevronsUpDown size={15} /></button>
      </PaneHeader>
      <div className="flex-1 min-h-0 overflow-y-auto py-1">
        {!tree.length ? <EmptyHint>No tags yet. Add <code>#tags</code> to notes or a <code>tags:</code> property.</EmptyHint> : tree.map((n) => render(n, 0))}
      </div>
    </div>
  );
}

