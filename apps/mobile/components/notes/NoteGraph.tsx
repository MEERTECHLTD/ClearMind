/**
 * Note graph (Obsidian-style) for mobile: react-native-svg + d3-force.
 *
 * - mode 'global': full-screen vault graph with header, filter sheet
 *   (search, tags, unresolved, orphans, daily notes — toggles persisted in
 *   AsyncStorage `cm.graph.mobile`), zoom to fit and a list-view fallback.
 * - mode 'local': compact card around `activeId` with a depth 1/2/3 control,
 *   expand button and an empty state when the note has no links.
 */
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { View, Text, Pressable, Switch, FlatList } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { SlidersHorizontal, Scan, List, Maximize2, Waypoints, FileText, Hash, FilePlus2 } from 'lucide-react-native';
import { buildGraph, localGraph, type Graph, type GraphNode, type VaultIndex } from '@clearmind/shared/notes';
import { DEFAULT_GRAPH_SETTINGS, mergeGraphSettings, groupColors, type GraphFilterSettings, type GraphGroup } from '@clearmind/shared/notes/graphStyle';
import { AppHeader, Input, Sheet } from '../ui';
import { T, useScheme } from '../../lib/theme';
import { GraphCanvas, type GraphCanvasHandle } from './graph/GraphCanvas';
import { capGraph, MAX_NODES } from './graph/layout';

export interface NoteGraphProps {
  index: VaultIndex;
  /** Highlighted note; centre of the local graph. Global mode also selects and centres it once the layout settles. */
  activeId?: string | null;
  /** 'global' = whole vault, full screen with filter controls; 'local' = neighbourhood of activeId, compact card (~260px tall). */
  mode: 'global' | 'local';
  /** Tap a node: note → open it; unresolved → create & open; tag → search tag. */
  onOpen: (node: GraphNode) => void;
  /** Local mode only: tap the expand button → open the full graph screen. */
  onExpand?: () => void;
  height?: number;
  /** Colour groups (first match wins); mobile has no group editor, so default none. */
  groups?: GraphGroup[];
  /** Global mode: header title (default "Graph view"). */
  title?: string;
  /** Global mode: back handler (default: AppHeader's router back). */
  onBack?: () => void;
}

const STORAGE_KEY = 'cm.graph.mobile';
type Toggles = Pick<GraphFilterSettings, 'showTags' | 'showUnresolved' | 'showOrphans' | 'showDaily'>;
const DEFAULT_TOGGLES: Toggles = (({ showTags, showUnresolved, showOrphans, showDaily }) => ({ showTags, showUnresolved, showOrphans, showDaily }))(DEFAULT_GRAPH_SETTINGS.filters);

function summarize(g: Graph) {
  let notes = 0, tags = 0, unresolved = 0;
  for (const n of g.nodes) {
    if (n.type === 'note') notes++;
    else if (n.type === 'tag') tags++;
    else if (n.type === 'unresolved') unresolved++;
  }
  return { notes, tags, unresolved, links: g.links.length };
}

function a11ySummary(g: Graph, kind: string) {
  const s = summarize(g);
  const parts = [`${s.notes} note${s.notes === 1 ? '' : 's'}`];
  if (s.tags) parts.push(`${s.tags} tag${s.tags === 1 ? '' : 's'}`);
  if (s.unresolved) parts.push(`${s.unresolved} unresolved`);
  parts.push(`${s.links} link${s.links === 1 ? '' : 's'}`);
  return `${kind}: ${parts.join(', ')}. Use List view for an accessible list.`;
}

export function NoteGraph(props: NoteGraphProps) {
  useScheme();
  return props.mode === 'global' ? <GlobalGraph {...props} /> : <LocalGraph {...props} />;
}

// ------------------------------------------------------------------ shared bits

function IconButton({ onPress, label, children }: { onPress: () => void; label: string; children: ReactNode }) {
  return (
    <Pressable onPress={onPress} hitSlop={8} className="p-2 rounded-full active:opacity-60" accessibilityRole="button" accessibilityLabel={label}>
      {children}
    </Pressable>
  );
}

function NodeListSheet({ visible, onClose, graph, onOpen }: { visible: boolean; onClose: () => void; graph: Graph; onOpen: (n: GraphNode) => void }) {
  const rows = useMemo(() => [...graph.nodes].sort((a, b) => b.degree - a.degree || a.label.localeCompare(b.label)), [graph]);
  return (
    <Sheet visible={visible} onClose={onClose} title={`Nodes (${rows.length})`} fill padded={false}>
      <FlatList
        data={rows}
        keyExtractor={(n) => n.id}
        initialNumToRender={30}
        renderItem={({ item }) => {
          const Icon = item.type === 'tag' ? Hash : item.type === 'unresolved' ? FilePlus2 : FileText;
          const kind = item.type === 'tag' ? 'tag' : item.type === 'unresolved' ? 'unresolved, create note' : 'note';
          return (
            <Pressable
              onPress={() => { onClose(); onOpen(item); }}
              className="flex-row items-center px-5 py-3 border-b border-line active:opacity-70"
              accessibilityRole="button"
              accessibilityLabel={`${item.label}, ${kind}, ${item.degree} link${item.degree === 1 ? '' : 's'}`}
            >
              <Icon size={16} color={item.type === 'tag' ? T.success : T.muted} />
              <Text className={`flex-1 ml-3 text-base ${item.type === 'unresolved' ? 'text-ink-muted italic' : 'text-ink'}`} numberOfLines={1}>{item.label}</Text>
              <Text className="text-ink-muted text-xs ml-2">{item.degree}</Text>
            </Pressable>
          );
        }}
        ListEmptyComponent={<Text className="text-ink-muted text-center py-8">No nodes</Text>}
      />
    </Sheet>
  );
}

// ------------------------------------------------------------------ global

function GlobalGraph({ index, activeId, onOpen, groups, title = 'Graph view', onBack }: NoteGraphProps) {
  const canvas = useRef<GraphCanvasHandle>(null);
  const [toggles, setToggles] = useState<Toggles>(DEFAULT_TOGGLES);
  const [loaded, setLoaded] = useState(false);
  const [queryInput, setQueryInput] = useState('');
  const [query, setQuery] = useState('');
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [listOpen, setListOpen] = useState(false);

  useEffect(() => {
    let alive = true;
    AsyncStorage.getItem(STORAGE_KEY)
      .then((raw) => {
        if (!alive || !raw) return;
        const f = mergeGraphSettings({ filters: JSON.parse(raw)?.filters }).filters;
        setToggles({ showTags: f.showTags, showUnresolved: f.showUnresolved, showOrphans: f.showOrphans, showDaily: f.showDaily });
      })
      .catch(() => {})
      .finally(() => { if (alive) setLoaded(true); });
    return () => { alive = false; };
  }, []);

  const setToggle = (key: keyof Toggles, v: boolean) => {
    setToggles((t) => {
      const next = { ...t, [key]: v };
      AsyncStorage.setItem(STORAGE_KEY, JSON.stringify({ filters: next })).catch(() => {});
      return next;
    });
  };

  useEffect(() => {
    const id = setTimeout(() => setQuery(queryInput.trim()), 250);
    return () => clearTimeout(id);
  }, [queryInput]);

  const full = useMemo(() => buildGraph(index, { ...toggles, query, showTemplates: false }), [index, toggles, query]);
  const { graph, total } = useMemo(() => capGraph(full, MAX_NODES), [full]);
  const colors = useMemo(() => (groups?.length ? groupColors(index, graph.nodes, groups) : undefined), [index, graph, groups]);
  const stats = summarize(graph);
  const capped = total > graph.nodes.length;
  const subtitle = `${capped ? `Showing ${graph.nodes.length} of ${total}` : graph.nodes.length} node${graph.nodes.length === 1 && !capped ? '' : 's'} · ${stats.links} link${stats.links === 1 ? '' : 's'}`;
  const filtered = !!query || (Object.keys(DEFAULT_TOGGLES) as (keyof Toggles)[]).some((k) => toggles[k] !== DEFAULT_TOGGLES[k]);

  const TOGGLES: { key: keyof Toggles; label: string; hint: string }[] = [
    { key: 'showTags', label: 'Tags', hint: 'Show tags as nodes' },
    { key: 'showUnresolved', label: 'Unresolved links', hint: 'Links to notes that don’t exist yet' },
    { key: 'showOrphans', label: 'Orphans', hint: 'Notes without any links' },
    { key: 'showDaily', label: 'Daily notes', hint: 'Include daily journal notes' },
  ];

  return (
    <View className="flex-1 bg-midnight">
      <AppHeader
        title={title}
        subtitle={subtitle}
        onBack={onBack}
        right={
          <>
            <IconButton onPress={() => canvas.current?.fit(true)} label="Zoom to fit"><Scan size={20} color={T.ink} /></IconButton>
            <IconButton onPress={() => setListOpen(true)} label="List view"><List size={20} color={T.ink} /></IconButton>
            <IconButton onPress={() => setFiltersOpen(true)} label={filtered ? 'Filters (active)' : 'Filters'}>
              <SlidersHorizontal size={20} color={filtered ? T.accent : T.ink} />
            </IconButton>
          </>
        }
      />
      <View className="flex-1">
        {!loaded ? null : graph.nodes.length === 0 ? (
          <View className="flex-1 items-center justify-center px-10">
            <Waypoints size={36} color={T.faint} />
            <Text className="text-ink text-lg font-semibold mt-3 text-center">{index.notes.length ? 'Nothing matches these filters' : 'No notes yet'}</Text>
            <Text className="text-ink-muted text-sm mt-1 text-center">
              {index.notes.length ? 'Adjust the search or toggles in Filters.' : 'Create notes and link them with [[links]] to grow your graph.'}
            </Text>
          </View>
        ) : (
          <GraphCanvas
            ref={canvas}
            graph={graph}
            activeId={activeId}
            onOpen={onOpen}
            colors={colors}
            focusId={activeId}
            accessibilityLabel={a11ySummary(graph, 'Note graph')}
          />
        )}
      </View>

      <Sheet visible={filtersOpen} onClose={() => setFiltersOpen(false)} title="Filters">
        <Input
          value={queryInput}
          onChangeText={setQueryInput}
          placeholder="Search notes (e.g. tag:#project)"
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="search"
          accessibilityLabel="Filter graph by search"
        />
        <View className="mt-3">
          {TOGGLES.map((t) => (
            <View key={t.key} className="flex-row items-center py-2.5 border-b border-line">
              <View className="flex-1 pr-3">
                <Text className="text-ink text-base">{t.label}</Text>
                <Text className="text-ink-muted text-xs mt-0.5">{t.hint}</Text>
              </View>
              <Switch
                value={toggles[t.key]}
                onValueChange={(v) => setToggle(t.key, v)}
                trackColor={{ true: T.accent, false: T.line }}
                thumbColor="#ffffff"
                accessibilityLabel={t.label}
              />
            </View>
          ))}
        </View>
        <Pressable
          onPress={() => { setFiltersOpen(false); setTimeout(() => canvas.current?.fit(true), 50); }}
          className="mt-4 mb-2 flex-row items-center justify-center rounded-2xl border border-line py-3 active:opacity-70"
          accessibilityRole="button"
        >
          <Scan size={18} color={T.ink} />
          <Text className="text-ink font-semibold ml-2">Zoom to fit</Text>
        </Pressable>
      </Sheet>

      <NodeListSheet visible={listOpen} onClose={() => setListOpen(false)} graph={graph} onOpen={onOpen} />
    </View>
  );
}

// ------------------------------------------------------------------ local

const DEPTHS = [1, 2, 3] as const;

function LocalGraph({ index, activeId, onOpen, onExpand, height = 260, groups }: NoteGraphProps) {
  const [depth, setDepth] = useState<number>(DEFAULT_GRAPH_SETTINGS.local.depth);
  const [listOpen, setListOpen] = useState(false);

  const full = useMemo(() => buildGraph(index, { showTags: false, showUnresolved: true, showOrphans: true, showDaily: true, showTemplates: true }), [index]);
  const graph = useMemo<Graph>(() => {
    if (!activeId || !full.nodes.some((n) => n.id === activeId)) return { nodes: [], links: [] };
    return capGraph(localGraph(full, activeId, depth), MAX_NODES).graph;
  }, [full, activeId, depth]);
  const colors = useMemo(() => (groups?.length ? groupColors(index, graph.nodes, groups) : undefined), [index, graph, groups]);
  const empty = graph.links.length === 0;

  return (
    <View className="rounded-2xl bg-midnight-light border border-line overflow-hidden">
      <View className="flex-row items-center pl-4 pr-1.5 pt-2 pb-1.5">
        <Text className="text-ink font-semibold flex-1" accessibilityRole="header">Local graph</Text>
        <View className="flex-row bg-midnight rounded-full p-0.5 border border-line mr-1" accessibilityRole="radiogroup" accessibilityLabel="Depth">
          {DEPTHS.map((d) => {
            const sel = d === depth;
            return (
              <Pressable
                key={d}
                onPress={() => setDepth(d)}
                className={`px-2.5 py-1 rounded-full ${sel ? 'bg-accent' : ''}`}
                accessibilityRole="radio"
                accessibilityState={{ selected: sel }}
                accessibilityLabel={`Depth ${d}`}
              >
                <Text className={`text-xs font-semibold ${sel ? 'text-white' : 'text-ink-muted'}`}>{d}</Text>
              </Pressable>
            );
          })}
        </View>
        {!empty ? <IconButton onPress={() => setListOpen(true)} label="List view"><List size={18} color={T.muted} /></IconButton> : null}
        {onExpand ? <IconButton onPress={onExpand} label="Open full graph"><Maximize2 size={18} color={T.muted} /></IconButton> : null}
      </View>
      <View style={{ height }} className="border-t border-line">
        {empty ? (
          <View className="flex-1 items-center justify-center px-8">
            <Waypoints size={28} color={T.faint} />
            <Text className="text-ink-muted text-sm text-center mt-2">No links yet — add [[links]] to connect notes</Text>
          </View>
        ) : (
          <GraphCanvas
            graph={graph}
            activeId={activeId}
            onOpen={onOpen}
            colors={colors}
            textFade={1.5}
            labelActiveNeighbours
            scrollFriendly
            fitPad={28}
            fitMaxK={1.6}
            forces={LOCAL_FORCES}
            accessibilityLabel={a11ySummary(graph, 'Local graph')}
          />
        )}
      </View>
      {!empty ? <NodeListSheet visible={listOpen} onClose={() => setListOpen(false)} graph={graph} onOpen={onOpen} /> : null}
    </View>
  );
}

const LOCAL_FORCES = { center: 0.6, repel: 8, link: 1, linkDistance: 60 };
