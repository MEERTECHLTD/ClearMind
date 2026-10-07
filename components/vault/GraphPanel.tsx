/**
 * Obsidian-style graph view. `global` = the whole vault with the settings
 * drawer (filters, colour groups, display, forces); `local` = the active
 * note's neighbourhood, compact enough for the right sidebar.
 * Rendering lives in ./graph (canvas + d3-force engine).
 */
import React, { useCallback, useMemo, useRef, useState } from 'react';
import { Maximize2, Settings2 } from 'lucide-react';
import { buildGraph, localGraph, type Graph, type GraphNode, type GraphOptions, type VaultIndex } from '../../shared/notes';
import { groupColors, withoutNeighborLinks, type GraphDisplaySettings, type GraphForceSettings, type GraphGroup } from '../../shared/notes/graphStyle';
import { setVaultSettings, useVaultSettings } from './useVault';
import { GraphCanvas, type GraphCanvasHandle } from './graph/GraphCanvas';
import { GraphSettingsDrawer } from './graph/GraphSettingsDrawer';
import { useGraphSettings } from './graph/useGraphSettings';

export interface GraphPanelProps {
  index: VaultIndex;
  /** Note currently open (highlighted; centre of the local graph). */
  activeId?: string | null;
  /** 'global' = whole vault with full settings; 'local' = neighbourhood of activeId (compact, for the right sidebar). */
  mode: 'global' | 'local';
  /** Open a node (note, or unresolved target → create, or tag → search). `newTab` when Cmd/Ctrl/middle-click. */
  onOpen: (node: GraphNode, opts: { newTab: boolean }) => void;
  className?: string;
  /** Global mode: start with the settings drawer open. */
  defaultSettingsOpen?: boolean;
}

export function GraphPanel(props: GraphPanelProps) {
  return props.mode === 'global' ? <GlobalGraph {...props} /> : <LocalGraph {...props} />;
}

const EMPTY_GROUPS: GraphGroup[] = [];

/** Display/force objects are memoised by value so unrelated settings changes don't reheat the simulation. */
function useDisplay(d: GraphDisplaySettings): GraphDisplaySettings {
  return useMemo(() => ({ ...d }), [d.arrows, d.textFade, d.nodeSize, d.linkThickness]); // eslint-disable-line react-hooks/exhaustive-deps
}
function useForces(f: GraphForceSettings): GraphForceSettings {
  return useMemo(() => ({ ...f }), [f.center, f.repel, f.link, f.linkDistance]); // eslint-disable-line react-hooks/exhaustive-deps
}

function useGroupColors(index: VaultIndex, graph: Graph | null): Map<string, string> {
  const groups = useVaultSettings().graphGroups ?? EMPTY_GROUPS;
  return useMemo(() => (graph ? groupColors(index, graph.nodes, groups) : new Map<string, string>()), [index, graph, groups]);
}

const iconBtn = 'p-1.5 rounded-lg text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors';

// ------------------------------------------------------------------ global

function GlobalGraph({ index, activeId, onOpen, className, defaultSettingsOpen = false }: GraphPanelProps) {
  const [settings] = useGraphSettings();
  const vault = useVaultSettings();
  const [drawer, setDrawer] = useState(defaultSettingsOpen);
  const canvas = useRef<GraphCanvasHandle>(null);
  const f = settings.filters;

  const opts = useMemo<GraphOptions>(
    () => ({ query: f.query, showTags: f.showTags, showUnresolved: f.showUnresolved, showOrphans: f.showOrphans, showDaily: f.showDaily, showTemplates: f.showTemplates }),
    [f.query, f.showTags, f.showUnresolved, f.showOrphans, f.showDaily, f.showTemplates],
  );
  const graph = useMemo(() => buildGraph(index, opts), [index, opts]);
  const colors = useGroupColors(index, graph);
  const display = useDisplay(settings.display);
  const forces = useForces(settings.forces);
  const onGroups = useCallback((graphGroups: GraphGroup[]) => setVaultSettings({ graphGroups }), []);

  return (
    <div className={`relative w-full overflow-hidden ${className || 'h-full'}`}>
      <GraphCanvas ref={canvas} graph={graph} colors={colors} display={display} forces={forces} activeId={activeId} onOpen={onOpen} label="Graph view" fitMaxZoom={1.6} padding={48} insetRight={drawer ? 300 : 0} />

      {graph.nodes.length === 0 && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <p className="text-sm text-gray-500 dark:text-gray-400">{f.query.trim() ? 'No notes match this filter.' : 'No notes to show yet.'}</p>
        </div>
      )}

      <div className="absolute top-3 right-3 bottom-3 flex flex-col items-end gap-2 pointer-events-none">
        <div className="flex items-center gap-1 rounded-xl border border-gray-200 dark:border-gray-800 bg-white/90 dark:bg-[#0F1219]/90 backdrop-blur p-0.5 shadow-sm pointer-events-auto">
          <button type="button" className={iconBtn} onClick={() => canvas.current?.zoomToFit()} title="Zoom to fit (double-click empty space)" aria-label="Zoom to fit">
            <Maximize2 size={16} />
          </button>
          <button
            type="button"
            className={`${iconBtn} ${drawer ? 'text-blue-600 dark:text-blue-400 bg-gray-100 dark:bg-gray-800' : ''}`}
            onClick={() => setDrawer((v) => !v)}
            aria-expanded={drawer}
            title="Graph settings"
            aria-label="Graph settings"
          >
            <Settings2 size={16} />
          </button>
        </div>
        {drawer && (
          <div className="min-h-0 flex pointer-events-auto">
            <GraphSettingsDrawer
              settings={settings}
              groups={vault.graphGroups ?? EMPTY_GROUPS}
              onGroups={onGroups}
              onAnimate={() => canvas.current?.animate()}
              onClose={() => setDrawer(false)}
            />
          </div>
        )}
      </div>

      <div className="absolute left-3 bottom-3 rounded-md bg-white/80 dark:bg-[#0F1219]/80 backdrop-blur px-2 py-0.5 text-[11px] tabular-nums text-gray-500 dark:text-gray-400 pointer-events-none" aria-live="polite">
        {graph.nodes.length.toLocaleString()} {graph.nodes.length === 1 ? 'node' : 'nodes'} · {graph.links.length.toLocaleString()} {graph.links.length === 1 ? 'link' : 'links'}
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ local

const LOCAL_FORCES: GraphForceSettings = { center: 0.35, repel: 10, link: 1, linkDistance: 70 };

function LocalGraph({ index, activeId, onOpen, className }: GraphPanelProps) {
  const [settings, update] = useGraphSettings();
  const canvas = useRef<GraphCanvasHandle>(null);
  const { depth, showTags, neighborLinks } = settings.local;

  const full = useMemo(
    () => buildGraph(index, { showTags, showUnresolved: true, showOrphans: true, showDaily: true, showTemplates: true }),
    [index, showTags],
  );
  const graph = useMemo<Graph | null>(() => {
    if (!activeId || !full.nodes.some((n) => n.id === activeId)) return null;
    const g = localGraph(full, activeId, depth);
    return neighborLinks ? g : withoutNeighborLinks(g, activeId);
  }, [full, activeId, depth, neighborLinks]);
  const colors = useGroupColors(index, graph);
  // The local graph is small: show labels earlier than in the global view.
  const display = useDisplay({ ...settings.display, textFade: Math.min(3, settings.display.textFade + 2) });

  const pill = (on: boolean) =>
    `px-1.5 py-0.5 rounded-md text-[11px] font-medium transition-colors ${on ? 'bg-blue-600/10 text-blue-700 dark:bg-blue-500/20 dark:text-blue-300' : 'text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800'}`;

  return (
    <div className={`relative w-full overflow-hidden ${className || 'h-[280px]'}`}>
      {graph ? (
        <GraphCanvas ref={canvas} graph={graph} colors={colors} display={display} forces={LOCAL_FORCES} activeId={activeId} onOpen={onOpen} label="Local graph" fitOnChange fitMaxZoom={1.4} padding={24} insetTop={30} />
      ) : (
        <div className="absolute inset-0 flex items-center justify-center p-4 text-center">
          <p className="text-xs text-gray-500 dark:text-gray-400">Open a note to see its local graph.</p>
        </div>
      )}
      <div className="absolute top-1.5 left-1.5 right-1.5 flex items-center gap-1 pointer-events-none">
        <div className="flex items-center gap-0.5 rounded-lg border border-gray-200 dark:border-gray-800 bg-white/90 dark:bg-[#0F1219]/90 backdrop-blur p-0.5 pointer-events-auto" role="group" aria-label="Depth">
          <span className="pl-1 pr-0.5 text-[11px] text-gray-400">Depth</span>
          {[1, 2, 3].map((d) => (
            <button key={d} type="button" className={pill(depth === d)} aria-pressed={depth === d} onClick={() => update({ local: { depth: d } })}>{d}</button>
          ))}
        </div>
        <div className="flex items-center gap-0.5 rounded-lg border border-gray-200 dark:border-gray-800 bg-white/90 dark:bg-[#0F1219]/90 backdrop-blur p-0.5 pointer-events-auto">
          <button type="button" className={pill(showTags)} aria-pressed={showTags} onClick={() => update({ local: { showTags: !showTags } })} title="Show tags">Tags</button>
          <button type="button" className={pill(neighborLinks)} aria-pressed={neighborLinks} onClick={() => update({ local: { neighborLinks: !neighborLinks } })} title="Show links between neighbours">Links</button>
        </div>
        {graph && (
          <button type="button" className={`ml-auto ${iconBtn} p-1 pointer-events-auto bg-white/90 dark:bg-[#0F1219]/90`} onClick={() => canvas.current?.zoomToFit()} title="Zoom to fit" aria-label="Zoom to fit">
            <Maximize2 size={13} />
          </button>
        )}
      </div>
    </div>
  );
}
