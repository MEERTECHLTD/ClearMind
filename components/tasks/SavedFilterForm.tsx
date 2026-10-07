import React, { useMemo, useState } from 'react';
import { Star, Trash2, HelpCircle } from 'lucide-react';
import type { Preferences, SavedFilter, Section } from '../../types';
import { runFilter, FilterSyntaxError } from '../../shared/domain';
import { LIST_COLORS } from '../../shared/tasks';
import { STORES } from '../../services/db';
import { useStore } from './store';
import { useTaskData } from './TaskContext';
import { Modal, cx, useTaskToast } from './ui';
import { saveFilterAction, deleteFilterAction } from './actions';

export const FILTER_EXAMPLES = ['p1 & !@waiting', '(today | overdue) & #Work', 'no date & !subtask', 'this week & #Work', '@waiting', 'search: invoice', 'created by: mcp'];

const SYNTAX: [string, string][] = [
  ['today · tomorrow · overdue', 'due dates'],
  ['"no date" · "this week" · "next 7 days"', 'date ranges'],
  ['due before: 2026-12-31', 'before / after a date'],
  ['p1 … p4', 'priority'],
  ['#Project · ##Project', 'project (with / without sub-projects)'],
  ['/Section · @label · @wait*', 'section, label, label prefix'],
  ['search: words', 'text in title / description'],
  ['recurring · subtask · "no labels" · inbox', 'task properties'],
  ['completed', 'include completed tasks'],
  ['created by: mcp|web|android…', 'source / agent'],
  ['&  |  !  ( )', 'and, or, not, grouping'],
];

/** Live-validated, live-counted preview of a filter query. */
export function useFilterPreview(query: string) {
  const { tasks, projects, labels } = useTaskData();
  const sections = useStore<Section>(STORES.SECTIONS).items;
  const prefs = useStore<Preferences>(STORES.PREFERENCES).items[0];
  return useMemo(() => {
    if (!query.trim()) return { count: null as number | null, error: null as string | null };
    try { return { count: runFilter(tasks, query, { projects, labels, sections, weekStart: prefs?.weekStart ?? 1 }).length, error: null }; }
    catch (e) { return { count: null, error: e instanceof FilterSyntaxError ? `Syntax error: ${e.message}` : 'Invalid query' }; }
  }, [query, tasks, projects, labels, sections, prefs?.weekStart]);
}

/** Create / edit / delete a saved filter (synced; also usable by AI agents). */
export function SavedFilterForm({ open, onClose, initial, onDeleted }: { open: boolean; onClose: () => void; initial?: SavedFilter | null; onDeleted?: () => void }) {
  const toast = useTaskToast();
  const [name, setName] = useState('');
  const [query, setQuery] = useState('');
  const [color, setColor] = useState<string>(LIST_COLORS[0].hex);
  const [fav, setFav] = useState(false);
  const [help, setHelp] = useState(false);
  const [was, setWas] = useState(false);
  if (open !== was) {
    setWas(open);
    if (open) { setName(initial?.name ?? ''); setQuery(initial?.query ?? ''); setColor(initial?.color ?? LIST_COLORS[0].hex); setFav(!!initial?.favorite); setHelp(false); }
  }
  const preview = useFilterPreview(query);
  const valid = !!name.trim() && !!query.trim() && !preview.error;

  const save = () => {
    if (!valid) return;
    saveFilterAction({ id: initial?.id, name, query, color, favorite: fav });
    toast(initial ? 'Filter saved' : `Filter “${name.trim()}” added`);
    onClose();
  };
  const remove = () => {
    if (!initial || !confirm(`Delete filter “${initial.name}”?`)) return;
    deleteFilterAction(initial.id);
    toast('Filter deleted');
    onClose();
    onDeleted?.();
  };

  return (
    <Modal open={open} onClose={onClose} title={initial ? 'Edit filter' : 'Add filter'}>
      <div className="p-5 space-y-4 overflow-y-auto">
        <label className="block">
          <span className={`text-xs font-semibold ${cx.muted}`}>Name</span>
          <input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Work blockers" className={`${cx.input} w-full mt-1`} />
        </label>
        <label className="block">
          <span className={`text-xs font-semibold ${cx.muted} flex items-center`}>
            <span className="flex-1">Query</span>
            <button type="button" onClick={() => setHelp((h) => !h)} className="inline-flex items-center gap-1 text-blue-600 dark:text-blue-400 hover:underline font-normal" aria-expanded={help}><HelpCircle size={12} />Syntax</button>
          </span>
          <input value={query} onChange={(e) => setQuery(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && save()} placeholder="e.g. p1 & #Work & !@waiting"
            spellCheck={false} autoCapitalize="off" autoCorrect="off" className={`${cx.input} w-full mt-1 font-mono`} aria-invalid={!!preview.error} />
          <span className={`block text-xs mt-1.5 ${preview.error ? 'text-red-500' : cx.muted}`} aria-live="polite">
            {preview.error ?? (preview.count != null ? `${preview.count} matching task${preview.count === 1 ? '' : 's'}` : 'Combine terms with & | ! ( )')}
          </span>
        </label>
        {help ? (
          <div className={`rounded-lg border ${cx.border} p-3 text-xs space-y-1`}>
            {SYNTAX.map(([k, v]) => (
              <div key={k} className="flex flex-wrap gap-x-3"><code className={`font-mono ${cx.text}`}>{k}</code><span className={cx.muted}>{v}</span></div>
            ))}
          </div>
        ) : null}
        <div className="flex flex-wrap gap-1.5">
          {FILTER_EXAMPLES.map((e) => (
            <button key={e} type="button" onClick={() => setQuery(e)} className={`text-xs font-mono px-2 py-1 rounded-md border ${cx.border} ${cx.hover} ${cx.muted}`}>{e}</button>
          ))}
        </div>
        <div className="flex flex-wrap gap-2 items-center" role="radiogroup" aria-label="Colour">
          {LIST_COLORS.slice(0, 12).map((c) => (
            <button key={c.hex} type="button" onClick={() => setColor(c.hex)} role="radio" aria-checked={color === c.hex} aria-label={c.name} title={c.name}
              className={`w-6 h-6 rounded-full ring-offset-2 ring-offset-white dark:ring-offset-[#0F1219] ${color === c.hex ? 'ring-2 ring-gray-400' : ''}`} style={{ background: c.hex }} />
          ))}
        </div>
        <label className={`inline-flex items-center gap-2 text-sm cursor-pointer ${cx.text}`}>
          <input type="checkbox" checked={fav} onChange={(e) => setFav(e.target.checked)} className="sr-only" />
          <Star size={16} className={fav ? 'text-amber-500' : cx.muted} fill={fav ? 'currentColor' : 'none'} /> Add to favorites
        </label>
        <div className="flex items-center gap-2">
          {initial ? <button onClick={remove} className="inline-flex items-center gap-1.5 text-sm text-red-500 hover:underline"><Trash2 size={14} />Delete</button> : null}
          <div className="flex-1" />
          <button onClick={onClose} className={cx.btnGhost}>Cancel</button>
          <button onClick={save} disabled={!valid} className={cx.btnPrimary}>{initial ? 'Save' : 'Add'}</button>
        </div>
      </div>
    </Modal>
  );
}
