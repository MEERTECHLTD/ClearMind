/** Obsidian-style collapsible settings drawer for the global graph: Filters, Groups, Display, Forces. */
import React, { useEffect, useId, useRef, useState } from 'react';
import { ChevronRight, Plus, RotateCcw, Search, X } from 'lucide-react';
import { GRAPH_LIMITS, GROUP_SWATCHES, type GraphGroup, type GraphSettings } from '../../../shared/notes/graphStyle';
import { resetGraphSettings, updateGraphSettings } from './useGraphSettings';

interface Props {
  settings: GraphSettings;
  groups: GraphGroup[];
  onGroups: (groups: GraphGroup[]) => void;
  onAnimate: () => void;
  onClose: () => void;
}

export function GraphSettingsDrawer({ settings, groups, onGroups, onAnimate, onClose }: Props) {
  const { filters, display, forces, open } = settings;
  return (
    <div
      className="w-72 max-w-[calc(100vw-2rem)] max-h-full overflow-y-auto rounded-xl border border-gray-200 dark:border-gray-800 bg-white/95 dark:bg-[#0F1219]/95 backdrop-blur shadow-xl text-sm text-gray-700 dark:text-gray-300"
      role="region"
      aria-label="Graph settings"
    >
      <div className="flex items-center justify-between px-3 pt-2.5 pb-1">
        <span className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">Graph settings</span>
        <button type="button" onClick={onClose} className="p-1 rounded-md text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800" aria-label="Close graph settings">
          <X size={14} />
        </button>
      </div>

      <Section title="Filters" open={open.filters} onToggle={() => updateGraphSettings({ open: { filters: !open.filters } })} onReset={() => resetGraphSettings('filters')}>
        <SearchBox value={filters.query} onChange={(query) => updateGraphSettings({ filters: { query } })} />
        <Toggle label="Tags" checked={filters.showTags} onChange={(v) => updateGraphSettings({ filters: { showTags: v } })} />
        <Toggle label="Unresolved links" hint="Links to notes that don’t exist yet" checked={filters.showUnresolved} onChange={(v) => updateGraphSettings({ filters: { showUnresolved: v } })} />
        <Toggle label="Orphans" hint="Notes without any links" checked={filters.showOrphans} onChange={(v) => updateGraphSettings({ filters: { showOrphans: v } })} />
        <Toggle label="Daily notes" checked={filters.showDaily} onChange={(v) => updateGraphSettings({ filters: { showDaily: v } })} />
        <Toggle label="Templates" checked={filters.showTemplates} onChange={(v) => updateGraphSettings({ filters: { showTemplates: v } })} />
      </Section>

      <Section title="Groups" open={open.groups} onToggle={() => updateGraphSettings({ open: { groups: !open.groups } })}>
        <Groups groups={groups} onChange={onGroups} />
      </Section>

      <Section title="Display" open={open.display} onToggle={() => updateGraphSettings({ open: { display: !open.display } })} onReset={() => resetGraphSettings('display')}>
        <Toggle label="Arrows" checked={display.arrows} onChange={(v) => updateGraphSettings({ display: { arrows: v } })} />
        <Slider label="Text fade threshold" value={display.textFade} range={GRAPH_LIMITS.textFade} step={0.1} onChange={(v) => updateGraphSettings({ display: { textFade: v } })} />
        <Slider label="Node size" value={display.nodeSize} range={GRAPH_LIMITS.nodeSize} step={0.05} onChange={(v) => updateGraphSettings({ display: { nodeSize: v } })} />
        <Slider label="Link thickness" value={display.linkThickness} range={GRAPH_LIMITS.linkThickness} step={0.05} onChange={(v) => updateGraphSettings({ display: { linkThickness: v } })} />
        <button
          type="button"
          onClick={onAnimate}
          className="mt-1 w-full rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-medium py-1.5 transition-colors"
        >
          Animate
        </button>
      </Section>

      <Section title="Forces" open={open.forces} onToggle={() => updateGraphSettings({ open: { forces: !open.forces } })} onReset={() => resetGraphSettings('forces')} last>
        <Slider label="Center force" value={forces.center} range={GRAPH_LIMITS.center} step={0.01} onChange={(v) => updateGraphSettings({ forces: { center: v } })} />
        <Slider label="Repel force" value={forces.repel} range={GRAPH_LIMITS.repel} step={0.1} onChange={(v) => updateGraphSettings({ forces: { repel: v } })} />
        <Slider label="Link force" value={forces.link} range={GRAPH_LIMITS.link} step={0.01} onChange={(v) => updateGraphSettings({ forces: { link: v } })} />
        <Slider label="Link distance" value={forces.linkDistance} range={GRAPH_LIMITS.linkDistance} step={1} onChange={(v) => updateGraphSettings({ forces: { linkDistance: v } })} />
      </Section>
    </div>
  );
}

function Section(props: { title: string; open: boolean; onToggle: () => void; onReset?: () => void; last?: boolean; children: React.ReactNode }) {
  const id = useId();
  return (
    <div className={props.last ? 'pb-1' : 'border-b border-gray-100 dark:border-gray-800/80'}>
      <div className="flex items-center group">
        <button
          type="button"
          onClick={props.onToggle}
          aria-expanded={props.open}
          aria-controls={id}
          className="flex-1 flex items-center gap-1.5 px-3 py-2 text-left font-medium text-gray-800 dark:text-gray-200 hover:text-gray-950 dark:hover:text-white"
        >
          <ChevronRight size={14} className={`text-gray-400 transition-transform duration-150 ${props.open ? 'rotate-90' : ''}`} />
          {props.title}
        </button>
        {props.onReset && props.open && (
          <button
            type="button"
            onClick={props.onReset}
            title={`Reset ${props.title.toLowerCase()}`}
            aria-label={`Reset ${props.title.toLowerCase()}`}
            className="mr-2 p-1 rounded-md text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800"
          >
            <RotateCcw size={12} />
          </button>
        )}
      </div>
      {props.open && <div id={id} className="px-3 pb-3 space-y-2.5">{props.children}</div>}
    </div>
  );
}

function Toggle({ label, hint, checked, onChange }: { label: string; hint?: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-center justify-between gap-3 cursor-pointer" title={hint}>
      <span className="text-[13px]">{label}</span>
      <span className="relative inline-flex shrink-0">
        <input type="checkbox" role="switch" className="peer sr-only" checked={checked} onChange={(e) => onChange(e.target.checked)} />
        <span className="w-8 h-[18px] rounded-full bg-gray-300 dark:bg-gray-700 peer-checked:bg-blue-600 transition-colors peer-focus-visible:ring-2 peer-focus-visible:ring-blue-500/60" />
        <span className="absolute top-[2px] left-[2px] w-[14px] h-[14px] rounded-full bg-white shadow transition-transform peer-checked:translate-x-[14px]" />
      </span>
    </label>
  );
}

function Slider({ label, value, range, step, onChange }: { label: string; value: number; range: readonly [number, number]; step: number; onChange: (v: number) => void }) {
  const id = useId();
  const decimals = step >= 1 ? 0 : step >= 0.1 ? 1 : 2;
  return (
    <div>
      <div className="flex items-center justify-between text-[13px]">
        <label htmlFor={id}>{label}</label>
        <span className="tabular-nums text-xs text-gray-400">{value.toFixed(decimals)}</span>
      </div>
      <input
        id={id}
        type="range"
        min={range[0]}
        max={range[1]}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full h-1.5 mt-1 accent-blue-600 cursor-pointer"
      />
    </div>
  );
}

/** Debounced search input: the graph filter re-runs vault search, so don't do it on every keystroke. */
function SearchBox({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [draft, setDraft] = useState(value);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => { setDraft(value); }, [value]);
  useEffect(() => () => clearTimeout(timer.current), []);
  const set = (v: string, now = false) => {
    setDraft(v);
    clearTimeout(timer.current);
    if (now) onChange(v); else timer.current = setTimeout(() => onChange(v), 250);
  };
  return (
    <div className="relative">
      <Search size={13} className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
      <input
        type="search"
        value={draft}
        onChange={(e) => set(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter') set(draft, true); if (e.key === 'Escape' && draft) { e.stopPropagation(); set('', true); } }}
        placeholder="Search files…"
        aria-label="Filter graph by search"
        className="w-full rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 pl-7 pr-7 py-1.5 text-[13px] outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500/40 [&::-webkit-search-cancel-button]:hidden"
      />
      {draft && (
        <button type="button" onClick={() => set('', true)} className="absolute right-1.5 top-1/2 -translate-y-1/2 p-0.5 rounded text-gray-400 hover:text-gray-600 dark:hover:text-gray-200" aria-label="Clear search">
          <X size={12} />
        </button>
      )}
    </div>
  );
}

function Groups({ groups, onChange }: { groups: GraphGroup[]; onChange: (g: GraphGroup[]) => void }) {
  // Local draft so typing a query doesn't re-run vault search per keystroke.
  const [draft, setDraft] = useState(groups);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const pending = useRef(false);
  useEffect(() => { if (!pending.current) setDraft(groups); }, [groups]);
  useEffect(() => () => clearTimeout(timer.current), []);
  const commit = (next: GraphGroup[], delay: number) => {
    setDraft(next);
    clearTimeout(timer.current);
    pending.current = true;
    timer.current = setTimeout(() => { pending.current = false; onChange(next); }, delay);
  };
  const patch = (i: number, p: Partial<GraphGroup>, delay: number) => commit(draft.map((g, j) => (j === i ? { ...g, ...p } : g)), delay);
  return (
    <div className="space-y-2">
      {draft.length === 0 && <p className="text-xs text-gray-500 dark:text-gray-400">Colour notes matching a search, e.g. <code className="font-mono">tag:#project</code> or <code className="font-mono">path:Daily</code>.</p>}
      {draft.map((g, i) => (
        <div key={i} className="flex items-center gap-2">
          <input
            type="color"
            value={/^#[0-9a-f]{6}$/i.test(g.color) ? g.color : '#3b82f6'}
            onChange={(e) => patch(i, { color: e.target.value }, 150)}
            aria-label={`Colour for group ${i + 1}`}
            className="w-6 h-6 shrink-0 cursor-pointer rounded-full border-0 bg-transparent p-0 [&::-webkit-color-swatch-wrapper]:p-0 [&::-webkit-color-swatch]:rounded-full [&::-webkit-color-swatch]:border [&::-webkit-color-swatch]:border-black/10 [&::-moz-color-swatch]:rounded-full"
          />
          <input
            type="text"
            value={g.query}
            onChange={(e) => patch(i, { query: e.target.value }, 350)}
            placeholder="Enter query…"
            aria-label={`Query for group ${i + 1}`}
            className="flex-1 min-w-0 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 px-2 py-1 text-[13px] outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500/40"
          />
          <button type="button" onClick={() => commit(draft.filter((_, j) => j !== i), 0)} className="p-1 rounded-md text-gray-400 hover:text-red-500 hover:bg-gray-100 dark:hover:bg-gray-800" aria-label={`Remove group ${i + 1}`}>
            <X size={14} />
          </button>
        </div>
      ))}
      <button
        type="button"
        onClick={() => commit([...draft, { query: '', color: GROUP_SWATCHES.find((c) => !draft.some((g) => g.color.toLowerCase() === c)) ?? GROUP_SWATCHES[draft.length % GROUP_SWATCHES.length] }], 0)}
        className="w-full flex items-center justify-center gap-1 rounded-lg border border-dashed border-gray-300 dark:border-gray-700 py-1.5 text-xs font-medium text-gray-600 dark:text-gray-300 hover:border-blue-500 hover:text-blue-600 dark:hover:text-blue-400"
      >
        <Plus size={13} /> New group
      </button>
    </div>
  );
}
