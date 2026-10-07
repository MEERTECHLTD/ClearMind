/**
 * Pure helpers for the graph view: persisted settings (merge + clamp), colour
 * groups, node sizing, label fading, fit-to-view maths, position merging and
 * the local graph's "neighbor links" filter. Kept free of DOM/React so they
 * can be unit-tested and reused by other clients.
 */
import type { Graph, GraphNode, VaultIndex } from './vault';
import { parseSearch, searchVault } from './vault';

// ------------------------------------------------------------------ settings

export interface GraphFilterSettings {
  query: string;
  showTags: boolean;
  showUnresolved: boolean;
  showOrphans: boolean;
  showDaily: boolean;
  showTemplates: boolean;
}
export interface GraphDisplaySettings {
  arrows: boolean;
  /** -3 … 3: higher shows labels earlier when zooming in (Obsidian's "Text fade threshold"). */
  textFade: number;
  /** Node size multiplier, 0.5 … 3. */
  nodeSize: number;
  /** Link thickness multiplier, 0.25 … 4. */
  linkThickness: number;
}
export interface GraphForceSettings {
  /** 0 … 1 */
  center: number;
  /** 0 … 20 */
  repel: number;
  /** 0 … 1 */
  link: number;
  /** 20 … 400 */
  linkDistance: number;
}
export interface LocalGraphSettings {
  depth: number;
  showTags: boolean;
  neighborLinks: boolean;
}
export interface GraphSettings {
  filters: GraphFilterSettings;
  display: GraphDisplaySettings;
  forces: GraphForceSettings;
  local: LocalGraphSettings;
  /** Which drawer sections are open. */
  open: { filters: boolean; groups: boolean; display: boolean; forces: boolean };
}

export const DEFAULT_GRAPH_SETTINGS: GraphSettings = {
  filters: { query: '', showTags: false, showUnresolved: false, showOrphans: true, showDaily: true, showTemplates: false },
  display: { arrows: false, textFade: 0, nodeSize: 1, linkThickness: 1 },
  forces: { center: 0.5, repel: 10, link: 1, linkDistance: 80 },
  local: { depth: 1, showTags: false, neighborLinks: true },
  open: { filters: true, groups: false, display: false, forces: false },
};

export const GRAPH_LIMITS = {
  textFade: [-3, 3],
  nodeSize: [0.5, 3],
  linkThickness: [0.25, 4],
  center: [0, 1],
  repel: [0, 20],
  link: [0, 1],
  linkDistance: [20, 400],
  depth: [1, 3],
} as const satisfies Record<string, readonly [number, number]>;

export const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

/** Merge a section of untrusted (stored) values onto defaults, keeping only keys whose type matches. */
function mergeSection<T extends object>(defaults: T, raw: unknown, limits: Partial<Record<keyof T, readonly [number, number]>> = {}): T {
  const out = { ...defaults };
  if (!isObj(raw)) return out;
  for (const key of Object.keys(defaults) as (keyof T)[]) {
    const v = raw[key as string];
    const d = defaults[key];
    if (typeof d === 'number' && typeof v === 'number' && Number.isFinite(v)) {
      const lim = limits[key];
      (out[key] as number) = lim ? clamp(v, lim[0], lim[1]) : v;
    } else if (typeof d === typeof v && typeof v !== 'number') {
      (out[key] as unknown) = v;
    }
  }
  return out;
}

/** Parse stored graph settings (any shape, any version) into a complete, clamped GraphSettings. */
export function mergeGraphSettings(raw: unknown): GraphSettings {
  const r = isObj(raw) ? raw : {};
  const D = DEFAULT_GRAPH_SETTINGS;
  const L = GRAPH_LIMITS;
  const local = mergeSection(D.local, r.local, { depth: L.depth });
  local.depth = Math.round(local.depth);
  return {
    filters: mergeSection(D.filters, r.filters),
    display: mergeSection(D.display, r.display, { textFade: L.textFade, nodeSize: L.nodeSize, linkThickness: L.linkThickness }),
    forces: mergeSection(D.forces, r.forces, { center: L.center, repel: L.repel, link: L.link, linkDistance: L.linkDistance }),
    local,
    open: mergeSection(D.open, r.open),
  };
}

// ------------------------------------------------------------------ colour groups

export interface GraphGroup { query: string; color: string }

/**
 * Colour per node id from the ordered colour groups — first matching group
 * wins. Notes match via vault search; tag nodes match `tag:` terms (and bare
 * words) against the tag; unresolved nodes match bare words / `file:` against
 * their target.
 */
export function groupColors(index: VaultIndex, nodes: readonly GraphNode[], groups: readonly GraphGroup[]): Map<string, string> {
  const out = new Map<string, string>();
  const active = groups.filter((g) => g.query.trim() && g.color);
  if (!active.length) return out;
  const noteHits = active.map((g) => new Set(searchVault(index, g.query, Number.POSITIVE_INFINITY).map((h) => h.note.id)));
  const parsed = active.map((g) => parseSearch(g.query));
  for (const n of nodes) {
    for (let i = 0; i < active.length; i++) {
      let hit = false;
      if (n.type === 'note' && n.noteId) hit = noteHits[i].has(n.noteId);
      else if (n.type === 'tag' || n.type === 'unresolved') hit = matchLabelNode(n, parsed[i]);
      if (hit) { out.set(n.id, active[i].color); break; }
    }
  }
  return out;
}

type Terms = ReturnType<typeof parseSearch>;
function matchLabelNode(n: GraphNode, groups: Terms): boolean {
  const isTag = n.type === 'tag';
  const name = (isTag ? n.label.replace(/^#/, '') : n.label).toLowerCase();
  const test = (field: string, v: string): boolean => {
    if (field === 'tag') return isTag && (name === v || name.startsWith(v + '/'));
    if (field === 'any') return name.includes(v.replace(/^#/, ''));
    if (field === 'file') return !isTag && name.includes(v);
    return false;
  };
  return groups.some((g) => g.length > 0 && g.every((t) => (t.neg ? !test(t.field, t.value) : test(t.field, t.value))));
}

// ------------------------------------------------------------------ sizing & fading

/** Node radius in world units: grows with sqrt(degree) like Obsidian. */
export const nodeRadius = (degree: number, sizeMul = 1) => sizeMul * (3.5 + Math.sqrt(Math.max(0, degree)) * 1.6);

/**
 * Label opacity for a zoom level. `threshold` (-3 … 3) shifts the zoom at
 * which labels start to appear: 0 → around k≈0.9, +3 → much earlier.
 */
export function labelAlpha(k: number, threshold = 0): number {
  const start = 0.9 * Math.pow(1.6, -threshold);
  return clamp((k - start) / (start * 0.6), 0, 1);
}

// ------------------------------------------------------------------ view maths

export interface Transform { k: number; x: number; y: number }
export interface Bounds { minX: number; minY: number; maxX: number; maxY: number }

/** Transform (screen = world·k + offset) fitting `b` into a w×h viewport with padding, zoom clamped. */
export function fitTransform(b: Bounds | null, w: number, h: number, pad = 40, kMin = 0.05, kMax = 2.5): Transform {
  if (!b || !Number.isFinite(b.minX) || w <= 0 || h <= 0) return { k: 1, x: w / 2, y: h / 2 };
  const bw = Math.max(1, b.maxX - b.minX);
  const bh = Math.max(1, b.maxY - b.minY);
  const k = clamp(Math.min((w - pad * 2) / bw, (h - pad * 2) / bh), kMin, kMax);
  const cx = (b.minX + b.maxX) / 2;
  const cy = (b.minY + b.maxY) / 2;
  return { k, x: w / 2 - cx * k, y: h / 2 - cy * k };
}

/** Zoom about a screen point (px,py) by `factor`, clamped. */
export function zoomAt(t: Transform, px: number, py: number, factor: number, kMin = 0.05, kMax = 8): Transform {
  const k = clamp(t.k * factor, kMin, kMax);
  const f = k / t.k;
  return { k, x: px - (px - t.x) * f, y: py - (py - t.y) * f };
}

// ------------------------------------------------------------------ positions

export interface Positioned { x?: number; y?: number }

/**
 * Initial position for a node joining an existing layout: next to the
 * centroid of its already-placed neighbours, or near the layout's centroid.
 * Returns null when nothing is placed yet (let the simulation seed it).
 */
export function seedPosition(
  neighbours: readonly Positioned[],
  placed: readonly Positioned[],
  rand: () => number = Math.random,
  spread = 30,
): { x: number; y: number } | null {
  const pts = neighbours.filter((p): p is { x: number; y: number } => Number.isFinite(p.x) && Number.isFinite(p.y));
  const base = pts.length ? pts : placed.filter((p): p is { x: number; y: number } => Number.isFinite(p.x) && Number.isFinite(p.y));
  if (!base.length) return null;
  let x = 0, y = 0;
  for (const p of base) { x += p.x; y += p.y; }
  x /= base.length; y /= base.length;
  const a = rand() * Math.PI * 2;
  const r = (pts.length ? spread * 0.5 : spread * 2) * (0.5 + rand());
  return { x: x + Math.cos(a) * r, y: y + Math.sin(a) * r };
}

// ------------------------------------------------------------------ local graph

/** Hop distance from `centerId` for every node reachable in the graph. */
export function hopDistances(graph: Graph, centerId: string): Map<string, number> {
  const adj = new Map<string, string[]>();
  for (const l of graph.links) {
    (adj.get(l.source) ?? adj.set(l.source, []).get(l.source)!).push(l.target);
    (adj.get(l.target) ?? adj.set(l.target, []).get(l.target)!).push(l.source);
  }
  const dist = new Map([[centerId, 0]]);
  let frontier = [centerId];
  while (frontier.length) {
    const next: string[] = [];
    for (const id of frontier) for (const nb of adj.get(id) ?? []) if (!dist.has(nb)) { dist.set(nb, dist.get(id)! + 1); next.push(nb); }
    frontier = next;
  }
  return dist;
}

/**
 * Local graph without "neighbor links": drop links between two nodes at the
 * same distance from the centre, so only links leading outwards remain.
 */
export function withoutNeighborLinks(graph: Graph, centerId: string): Graph {
  const d = hopDistances(graph, centerId);
  return { nodes: graph.nodes, links: graph.links.filter((l) => d.get(l.source) !== d.get(l.target)) };
}

/** Order for the "Animate" time-lapse: BFS from the best-connected node, component by component. */
export function growthOrder(graph: Graph): string[] {
  const adj = new Map<string, string[]>();
  for (const l of graph.links) {
    (adj.get(l.source) ?? adj.set(l.source, []).get(l.source)!).push(l.target);
    (adj.get(l.target) ?? adj.set(l.target, []).get(l.target)!).push(l.source);
  }
  const byDegree = [...graph.nodes].sort((a, b) => b.degree - a.degree || a.id.localeCompare(b.id));
  const seen = new Set<string>();
  const order: string[] = [];
  for (const start of byDegree) {
    if (seen.has(start.id)) continue;
    seen.add(start.id);
    const queue = [start.id];
    for (let i = 0; i < queue.length; i++) {
      order.push(queue[i]);
      for (const nb of adj.get(queue[i]) ?? []) if (!seen.has(nb)) { seen.add(nb); queue.push(nb); }
    }
  }
  return order;
}

// ------------------------------------------------------------------ palette

export interface GraphTheme {
  note: string;
  tag: string;
  unresolved: string;
  attachment: string;
  link: string;
  linkHighlight: string;
  accent: string;
  text: string;
  textMuted: string;
  labelHalo: string;
}

export const GRAPH_THEMES: { light: GraphTheme; dark: GraphTheme } = {
  light: {
    note: '#6b7280', tag: '#10b981', unresolved: '#9ca3af', attachment: '#f59e0b',
    link: 'rgba(100,116,139,0.35)', linkHighlight: '#3b82f6', accent: '#3b82f6',
    text: '#1f2937', textMuted: '#6b7280', labelHalo: 'rgba(255,255,255,0.85)',
  },
  dark: {
    note: '#a8b0bd', tag: '#34d399', unresolved: '#6b7280', attachment: '#fbbf24',
    link: 'rgba(148,163,184,0.28)', linkHighlight: '#60a5fa', accent: '#60a5fa',
    text: '#e5e7eb', textMuted: '#9ca3af', labelHalo: 'rgba(5,5,10,0.8)',
  },
};

/** Preset swatches for new colour groups. */
export const GROUP_SWATCHES = ['#ef4444', '#f97316', '#eab308', '#22c55e', '#06b6d4', '#3b82f6', '#8b5cf6', '#ec4899'];
