/**
 * Obsidian "Properties" panel: typed editors for the note's YAML frontmatter
 * (text, number, checkbox, date, date & time, list/chips; tags & aliases as
 * chips), add / rename / retype / remove, collapsible. Writes back through
 * setFrontmatter → onChange(newContent).
 */
import React, { useEffect, useId, useMemo, useRef, useState } from 'react';
import { AlignLeft, Calendar, CheckSquare, ChevronRight, Clock, Hash, List, Plus, Tags, X, Link2 } from 'lucide-react';
import { parseFrontmatter, setFrontmatter, type PropValue } from '../../../shared/notes';
import { inferPropType, convertPropValue, renameProp, type PropType } from '../../../shared/notes/markdown';
import type { PropertiesEditorProps } from './types';

const TYPE_LABEL: Record<PropType, string> = { text: 'Text', list: 'List', number: 'Number', checkbox: 'Checkbox', date: 'Date', datetime: 'Date & time' };
const TYPES = Object.keys(TYPE_LABEL) as PropType[];

const TypeIcon = ({ type, k }: { type: PropType; k: string }) => {
  const cls = 'w-3.5 h-3.5 shrink-0';
  if (k === 'tags' || k === 'tag') return <Tags className={cls} aria-hidden />;
  if (k === 'aliases' || k === 'alias') return <Link2 className={cls} aria-hidden />;
  switch (type) {
    case 'list': return <List className={cls} aria-hidden />;
    case 'number': return <Hash className={cls} aria-hidden />;
    case 'checkbox': return <CheckSquare className={cls} aria-hidden />;
    case 'date': return <Calendar className={cls} aria-hidden />;
    case 'datetime': return <Clock className={cls} aria-hidden />;
    default: return <AlignLeft className={cls} aria-hidden />;
  }
};

const COLLAPSE_KEY = 'cm.vault.propsCollapsed';
const readCollapsed = () => { try { return localStorage.getItem(COLLAPSE_KEY) === '1'; } catch { return false; } };

const inputCls = 'w-full min-w-0 bg-transparent rounded px-1.5 py-1 text-sm text-gray-800 dark:text-gray-200 outline-none hover:bg-gray-100 dark:hover:bg-white/5 focus:bg-gray-100 dark:focus:bg-white/5 focus:ring-1 focus:ring-blue-500/50 placeholder:text-gray-400 dark:placeholder:text-gray-600';

export function PropertiesEditor({ note, index, onChange, onTagClick }: PropertiesEditorProps) {
  const fm = useMemo(() => parseFrontmatter(note.content), [note.content]);
  const props = fm.props;
  const keys = Object.keys(props);
  const [collapsed, setCollapsed] = useState(readCollapsed);
  const [adding, setAdding] = useState(false);
  const listId = useId();

  // Property names and tags used across the vault (for suggestions).
  const knownKeys = useMemo(() => {
    const s = new Set<string>(['tags', 'aliases', 'cssclasses', 'status', 'created', 'due', 'type']);
    for (const n of index.notes) for (const k of Object.keys(parseFrontmatter(n.content).props)) s.add(k);
    return [...s].sort();
  }, [index]);
  const knownTags = useMemo(() => [...index.tags.keys()].sort(), [index]);

  const write = (next: Record<string, PropValue>) => {
    const out = setFrontmatter(note.content, next);
    if (out !== note.content) onChange(out);
  };
  const setValue = (k: string, v: PropValue) => write({ ...props, [k]: v });
  const remove = (k: string) => { const next = { ...props }; delete next[k]; write(next); };
  const rename = (from: string, to: string) => {
    const t = to.trim().replace(/:/g, '');
    if (!t || t === from) return false;
    if (t in props) return false;
    write(renameProp(props, from, t));
    return true;
  };
  const toggleCollapsed = () => {
    setCollapsed((c) => { try { localStorage.setItem(COLLAPSE_KEY, c ? '0' : '1'); } catch { /* ignore */ } return !c; });
  };

  if (fm.raw === null && !adding) {
    return (
      <div className="mb-2">
        <button
          type="button"
          onClick={() => setAdding(true)}
          className="inline-flex items-center gap-1.5 text-xs text-gray-400 hover:text-gray-700 dark:text-gray-500 dark:hover:text-gray-300 px-1.5 py-1 rounded hover:bg-gray-100 dark:hover:bg-white/5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-500"
        >
          <Plus className="w-3.5 h-3.5" aria-hidden /> Add property
        </button>
      </div>
    );
  }

  return (
    <section aria-label="Note properties" className="mb-4 text-sm">
      <button
        type="button"
        onClick={toggleCollapsed}
        aria-expanded={!collapsed}
        className="flex items-center gap-1 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 mb-1 px-1 py-0.5 rounded focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-500"
      >
        <ChevronRight className={`w-3.5 h-3.5 transition-transform ${collapsed ? '' : 'rotate-90'}`} aria-hidden />
        Properties
        {collapsed && keys.length > 0 && <span className="ml-1 font-normal normal-case tracking-normal text-gray-400">({keys.length})</span>}
      </button>
      {!collapsed && (
        <div className="space-y-0.5">
          <datalist id={`${listId}-keys`}>{knownKeys.map((k) => <option key={k} value={k} />)}</datalist>
          <datalist id={`${listId}-tags`}>{knownTags.map((k) => <option key={k} value={k} />)}</datalist>
          {keys.map((k) => (
            <PropertyRow
              key={k}
              name={k}
              value={props[k]}
              keysListId={`${listId}-keys`}
              tagsListId={`${listId}-tags`}
              onValue={(v) => setValue(k, v)}
              onRename={(to) => rename(k, to)}
              onRemove={() => remove(k)}
              onTagClick={onTagClick}
            />
          ))}
          {adding ? (
            <AddProperty
              keysListId={`${listId}-keys`}
              existing={keys}
              onCancel={() => setAdding(false)}
              onAdd={(name, type) => {
                setAdding(false);
                const init: PropValue = convertPropValue(name === 'tags' || name === 'aliases' ? [] : '', type);
                write({ ...props, [name]: type === 'text' ? '' : init });
              }}
            />
          ) : (
            <button
              type="button"
              onClick={() => setAdding(true)}
              className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-gray-700 dark:text-gray-500 dark:hover:text-gray-300 px-1.5 py-1 rounded hover:bg-gray-100 dark:hover:bg-white/5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-500"
            >
              <Plus className="w-3.5 h-3.5" aria-hidden /> Add property
            </button>
          )}
        </div>
      )}
      <div className="border-b border-gray-200 dark:border-gray-800 mt-2" />
    </section>
  );
}

interface RowProps {
  name: string;
  value: PropValue;
  keysListId: string;
  tagsListId: string;
  onValue: (v: PropValue) => void;
  onRename: (to: string) => boolean;
  onRemove: () => void;
  onTagClick?: (tag: string) => void;
}

function PropertyRow({ name, value, keysListId, tagsListId, onValue, onRename, onRemove, onTagClick }: RowProps) {
  const inferred = inferPropType(name, value);
  const [type, setType] = useState<PropType>(inferred);
  const [menu, setMenu] = useState(false);
  useEffect(() => setType(inferred), [inferred]);
  const isTags = name === 'tags' || name === 'tag';

  const changeType = (t: PropType) => {
    setMenu(false);
    setType(t);
    onValue(convertPropValue(value, t));
  };

  return (
    <div className="group flex items-start gap-2 rounded hover:bg-gray-50 dark:hover:bg-white/[0.03] px-1">
      <div className="relative flex items-center gap-1.5 w-40 shrink-0 text-gray-500 dark:text-gray-400 pt-1">
        <button
          type="button"
          onClick={() => setMenu((m) => !m)}
          aria-label={`Property type: ${TYPE_LABEL[type]}. Change type`}
          aria-haspopup="menu"
          aria-expanded={menu}
          className="p-0.5 rounded hover:bg-gray-200 dark:hover:bg-white/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-500"
        >
          <TypeIcon type={type} k={name} />
        </button>
        {menu && (
          <div role="menu" className="absolute left-0 top-7 z-20 w-40 rounded-md border border-gray-200 dark:border-gray-700 bg-white dark:bg-[#151a24] shadow-lg py-1" onMouseLeave={() => setMenu(false)}>
            {TYPES.map((t) => (
              <button key={t} type="button" role="menuitemradio" aria-checked={t === type} onClick={() => changeType(t)}
                className={`w-full flex items-center gap-2 px-2.5 py-1.5 text-xs text-left hover:bg-gray-100 dark:hover:bg-white/5 ${t === type ? 'text-blue-600 dark:text-blue-400' : 'text-gray-700 dark:text-gray-300'}`}>
                <TypeIcon type={t} k="" /> {TYPE_LABEL[t]}
              </button>
            ))}
          </div>
        )}
        <input
          key={name}
          defaultValue={name}
          list={keysListId}
          aria-label={`Property name ${name}`}
          className={`${inputCls} !text-gray-500 dark:!text-gray-400 truncate`}
          onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); if (e.key === 'Escape') { (e.target as HTMLInputElement).value = name; (e.target as HTMLInputElement).blur(); } }}
          onBlur={(e) => { if (!onRename(e.target.value)) e.target.value = name; }}
        />
      </div>
      <div className="flex-1 min-w-0 pt-0.5">
        <ValueEditor name={name} type={type} value={value} onValue={onValue} isTags={isTags} tagsListId={tagsListId} onTagClick={onTagClick} />
      </div>
      <button
        type="button"
        onClick={onRemove}
        aria-label={`Remove property ${name}`}
        className="mt-1 p-1 rounded text-gray-400 opacity-0 group-hover:opacity-100 focus:opacity-100 hover:text-red-500 hover:bg-gray-100 dark:hover:bg-white/5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-500"
      >
        <X className="w-3.5 h-3.5" aria-hidden />
      </button>
    </div>
  );
}

function ValueEditor({ name, type, value, onValue, isTags, tagsListId, onTagClick }: {
  name: string; type: PropType; value: PropValue; onValue: (v: PropValue) => void; isTags: boolean; tagsListId: string; onTagClick?: (tag: string) => void;
}) {
  const str = Array.isArray(value) ? value.join(', ') : value === null ? '' : String(value);
  const commitOnEnter = (e: React.KeyboardEvent<HTMLInputElement>) => { if (e.key === 'Enter') e.currentTarget.blur(); };
  switch (type) {
    case 'checkbox':
      return (
        <input type="checkbox" checked={value === true} aria-label={name} onChange={(e) => onValue(e.target.checked)}
          className="mt-1.5 ml-1.5 w-4 h-4 accent-blue-500 cursor-pointer" />
      );
    case 'number':
      return <input key={str} type="number" defaultValue={str} aria-label={name} className={inputCls} onKeyDown={commitOnEnter}
        onBlur={(e) => { const v = e.target.value.trim(); const n = Number(v); if (v === '') { if (value !== null) onValue(null); } else if (!Number.isNaN(n) && n !== value) onValue(n); }} />;
    case 'date':
      return <input key={str} type="date" defaultValue={/^\d{4}-\d{2}-\d{2}/.test(str) ? str.slice(0, 10) : ''} aria-label={name} className={`${inputCls} dark:[color-scheme:dark]`}
        onChange={(e) => { if (e.target.value && e.target.value !== str) onValue(e.target.value); if (!e.target.value) onValue(null); }} />;
    case 'datetime':
      return <input key={str} type="datetime-local" defaultValue={str.replace(' ', 'T').slice(0, 16)} aria-label={name} className={`${inputCls} dark:[color-scheme:dark]`}
        onBlur={(e) => { if (e.target.value !== str) onValue(e.target.value || null); }} />;
    case 'list':
      return <ChipEditor name={name} items={Array.isArray(value) ? value : str ? str.split(/\s*,\s*/).filter(Boolean) : []} onItems={onValue} isTags={isTags} listId={isTags ? tagsListId : undefined} onTagClick={onTagClick} />;
    default:
      return <input key={str} type="text" defaultValue={str} placeholder="Empty" aria-label={name} className={inputCls} onKeyDown={commitOnEnter}
        onBlur={(e) => { if (e.target.value !== str) onValue(e.target.value); }} />;
  }
}

function ChipEditor({ name, items, onItems, isTags, listId, onTagClick }: {
  name: string; items: string[]; onItems: (v: string[]) => void; isTags: boolean; listId?: string; onTagClick?: (tag: string) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const add = (raw: string) => {
    const vals = raw.split(',').map((s) => (isTags ? s.trim().replace(/^#/, '').replace(/\s+/g, '-') : s.trim())).filter(Boolean);
    const next = [...items];
    for (const v of vals) if (!next.includes(v)) next.push(v);
    if (next.length !== items.length) onItems(next);
  };
  return (
    <div className="flex flex-wrap items-center gap-1 px-1 py-0.5 min-h-[30px] rounded focus-within:ring-1 focus-within:ring-blue-500/50" onClick={(e) => { if (e.target === e.currentTarget) input.current?.focus(); }}>
      {items.map((it, i) => (
        <span key={`${it}-${i}`} className={`inline-flex items-center gap-0.5 rounded-full pl-2 pr-0.5 py-0.5 text-xs ${isTags ? 'bg-blue-500/10 text-blue-600 dark:text-blue-300' : 'bg-gray-100 dark:bg-white/10 text-gray-700 dark:text-gray-300'}`}>
          {isTags && onTagClick ? (
            <button type="button" className="hover:underline focus-visible:outline focus-visible:outline-1" onClick={() => onTagClick(it)} aria-label={`Search tag ${it}`}>#{it}</button>
          ) : <span>{it}</span>}
          <button type="button" aria-label={`Remove ${it} from ${name}`} onClick={() => onItems(items.filter((_, j) => j !== i))}
            className="p-0.5 rounded-full opacity-60 hover:opacity-100 hover:bg-black/10 dark:hover:bg-white/10">
            <X className="w-3 h-3" aria-hidden />
          </button>
        </span>
      ))}
      <input
        ref={input}
        list={listId}
        aria-label={`Add to ${name}`}
        placeholder={items.length ? '' : 'Empty'}
        className="flex-1 min-w-[80px] bg-transparent outline-none text-sm py-0.5 text-gray-800 dark:text-gray-200 placeholder:text-gray-400 dark:placeholder:text-gray-600"
        onKeyDown={(e) => {
          const el = e.currentTarget;
          if ((e.key === 'Enter' || e.key === ',') && el.value.trim()) { e.preventDefault(); add(el.value); el.value = ''; }
          else if (e.key === 'Backspace' && !el.value && items.length) onItems(items.slice(0, -1));
        }}
        onBlur={(e) => { if (e.target.value.trim()) { add(e.target.value); e.target.value = ''; } }}
      />
    </div>
  );
}

function AddProperty({ keysListId, existing, onAdd, onCancel }: { keysListId: string; existing: string[]; onAdd: (name: string, type: PropType) => void; onCancel: () => void }) {
  const [name, setName] = useState('');
  const [type, setType] = useState<PropType>('text');
  const [err, setErr] = useState('');
  const submit = () => {
    const n = name.trim().replace(/:/g, '');
    if (!n) { onCancel(); return; }
    if (existing.includes(n)) { setErr('Already exists'); return; }
    onAdd(n, type);
  };
  return (
    <form className="flex items-center gap-2 px-1 py-1" onSubmit={(e) => { e.preventDefault(); submit(); }}>
      <input
        autoFocus
        value={name}
        list={keysListId}
        placeholder="Property name"
        aria-label="New property name"
        className={`${inputCls} !w-40 border border-gray-200 dark:border-gray-700`}
        onChange={(e) => {
          setName(e.target.value); setErr('');
          const k = e.target.value.trim().toLowerCase();
          if (k === 'tags' || k === 'aliases' || k === 'cssclasses') setType('list');
        }}
        onKeyDown={(e) => { if (e.key === 'Escape') onCancel(); }}
      />
      <select value={type} onChange={(e) => setType(e.target.value as PropType)} aria-label="New property type"
        className="text-sm rounded px-1.5 py-1 bg-transparent border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 dark:bg-[#0F1219]">
        {TYPES.map((t) => <option key={t} value={t}>{TYPE_LABEL[t]}</option>)}
      </select>
      <button type="submit" className="text-xs px-2.5 py-1 rounded bg-blue-500 hover:bg-blue-600 text-white">Add</button>
      <button type="button" onClick={onCancel} className="text-xs px-2 py-1 rounded text-gray-500 hover:bg-gray-100 dark:hover:bg-white/5">Cancel</button>
      {err && <span role="alert" className="text-xs text-red-500">{err}</span>}
    </form>
  );
}
