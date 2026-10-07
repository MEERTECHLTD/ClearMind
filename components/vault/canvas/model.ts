/**
 * Framework-free canvas editor logic: viewport math, hit testing, selection
 * rectangles, snapping, moving (with group contents), resizing, an undo/redo
 * history reducer, edges (connect / reconnect / geometry), clipboard payloads,
 * duplication and align/distribute. Everything here is pure and unit-tested.
 */
import {
  canvasBounds, canvasId, nodesInGroup, sidePoint, autoSides, edgePath, serializeCanvas,
  type CanvasData, type CanvasEdge, type CanvasNode, type CanvasSide,
} from '../../../shared/notes/canvas';

export interface Point { x: number; y: number }
export interface Rect { x: number; y: number; width: number; height: number }
/** screen = world * zoom + (x, y), relative to the board element. */
export interface Viewport { x: number; y: number; zoom: number }

export const MIN_ZOOM = 0.1;
export const MAX_ZOOM = 3;
export const GRID = 20;
export const MIN_SIZE = { width: 60, height: 40 };
export const DEFAULT_SIZE = {
  text: { width: 260, height: 80 },
  file: { width: 400, height: 400 },
  canvasFile: { width: 400, height: 100 },
  media: { width: 400, height: 300 },
  link: { width: 400, height: 140 },
  group: { width: 600, height: 420 },
};

/** Non-empty content that isn't a JSON object: shown read-only instead of being silently overwritten. */
export function isBrokenCanvas(content: string | null | undefined): boolean {
  if (!content?.trim()) return false;
  try { const v = JSON.parse(content); return !v || typeof v !== 'object' || Array.isArray(v); } catch { return true; }
}

// ------------------------------------------------------------------ viewport

export const clampZoom = (z: number) => Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, z));
export const screenToWorld = (v: Viewport, p: Point): Point => ({ x: (p.x - v.x) / v.zoom, y: (p.y - v.y) / v.zoom });
export const worldToScreen = (v: Viewport, p: Point): Point => ({ x: p.x * v.zoom + v.x, y: p.y * v.zoom + v.y });

/** Zoom by `factor` keeping the world point under screen point `at` fixed. */
export function zoomAt(v: Viewport, factor: number, at: Point): Viewport {
  const zoom = clampZoom(v.zoom * factor);
  const k = zoom / v.zoom;
  return { zoom, x: at.x - (at.x - v.x) * k, y: at.y - (at.y - v.y) * k };
}

/** Viewport showing `r` centred in a `w`×`h` board with `pad` screen pixels around it. */
export function fitRect(r: Rect, w: number, h: number, pad = 60, maxZoom = 1): Viewport {
  const zoom = clampZoom(Math.min(maxZoom, (w - pad * 2) / Math.max(1, r.width), (h - pad * 2) / Math.max(1, r.height)));
  return { zoom, x: w / 2 - (r.x + r.width / 2) * zoom, y: h / 2 - (r.y + r.height / 2) * zoom };
}

/** Viewport centred on world point `c` at `zoom`. */
export const centerOn = (c: Point, w: number, h: number, zoom: number): Viewport => ({ zoom, x: w / 2 - c.x * zoom, y: h / 2 - c.y * zoom });

// ------------------------------------------------------------------ geometry & hit testing

export const normRect = (a: Point, b: Point): Rect => ({ x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), width: Math.abs(a.x - b.x), height: Math.abs(a.y - b.y) });
export const rectContains = (r: Rect, p: Point) => p.x >= r.x && p.y >= r.y && p.x <= r.x + r.width && p.y <= r.y + r.height;
export const rectsIntersect = (a: Rect, b: Rect) => a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
export const rectInside = (inner: Rect, outer: Rect) => inner.x >= outer.x && inner.y >= outer.y && inner.x + inner.width <= outer.x + outer.width && inner.y + inner.height <= outer.y + outer.height;

/** Topmost node at a world point: cards (last drawn wins) before groups (smallest wins). */
export function nodeAt(nodes: CanvasNode[], p: Point, exclude?: Set<string>): CanvasNode | null {
  for (let i = nodes.length - 1; i >= 0; i--) {
    const n = nodes[i];
    if (n.type !== 'group' && !exclude?.has(n.id) && rectContains(n, p)) return n;
  }
  let best: CanvasNode | null = null;
  for (const n of nodes) if (n.type === 'group' && !exclude?.has(n.id) && rectContains(n, p) && (!best || n.width * n.height < best.width * best.height)) best = n;
  return best;
}

/** Nodes selected by a rubber band: cards that intersect it, groups fully inside it. */
export function nodesInRect(nodes: CanvasNode[], r: Rect): string[] {
  return nodes.filter((n) => (n.type === 'group' ? rectInside(n, r) : rectsIntersect(n, r))).map((n) => n.id);
}

/** Order for drawing: groups first (larger behind smaller), then cards in document order. */
export function drawOrder(nodes: CanvasNode[]): { groups: CanvasNode[]; cards: CanvasNode[] } {
  const groups = nodes.filter((n) => n.type === 'group').sort((a, b) => b.width * b.height - a.width * a.height);
  return { groups, cards: nodes.filter((n) => n.type !== 'group') };
}

// ------------------------------------------------------------------ snapping, moving, resizing

export const snap = (v: number, grid = GRID) => Math.round(v / grid) * grid;

/** Snap a drag delta so the primary node's top-left lands on the grid. */
export function snapDelta(primary: Point, dx: number, dy: number, grid = GRID): Point {
  return { x: snap(primary.x + dx, grid) - primary.x, y: snap(primary.y + dy, grid) - primary.y };
}

/** Everything that moves when `ids` are dragged: the nodes plus whatever sits inside selected groups. */
export function dragSet(data: CanvasData, ids: Iterable<string>): Set<string> {
  const out = new Set<string>();
  for (const id of ids) {
    const n = data.nodes.find((x) => x.id === id);
    if (!n) continue;
    out.add(id);
    if (n.type === 'group') for (const c of nodesInGroup(data, id)) out.add(c.id);
  }
  return out;
}

export function moveNodes(data: CanvasData, ids: Set<string>, dx: number, dy: number): CanvasData {
  if (!dx && !dy) return data;
  return { ...data, nodes: data.nodes.map((n) => (ids.has(n.id) ? { ...n, x: n.x + dx, y: n.y + dy } : n)) };
}

/** Move nodes from their positions in `base` (used while dragging so rounding never accumulates). */
export function moveFrom(base: CanvasData, current: CanvasData, ids: Set<string>, dx: number, dy: number): CanvasData {
  const start = new Map(base.nodes.filter((n) => ids.has(n.id)).map((n) => [n.id, n]));
  return { ...current, nodes: current.nodes.map((n) => { const s = start.get(n.id); return s ? { ...n, x: s.x + dx, y: s.y + dy } : n; }) };
}

export type Handle = 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw';
export const HANDLES: Handle[] = ['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw'];

/** Resize a rect by dragging `handle` by (dx, dy), honouring a minimum size and optional grid snapping. */
export function resizeRect(r: Rect, handle: Handle, dx: number, dy: number, opts: { min?: { width: number; height: number }; grid?: number } = {}): Rect {
  const min = opts.min ?? MIN_SIZE;
  const g = opts.grid;
  let x1 = r.x, y1 = r.y, x2 = r.x + r.width, y2 = r.y + r.height;
  if (handle.includes('w')) x1 = g ? snap(x1 + dx, g) : x1 + dx;
  if (handle.includes('e')) x2 = g ? snap(x2 + dx, g) : x2 + dx;
  if (handle.includes('n')) y1 = g ? snap(y1 + dy, g) : y1 + dy;
  if (handle.includes('s')) y2 = g ? snap(y2 + dy, g) : y2 + dy;
  if (x2 - x1 < min.width) { if (handle.includes('w')) x1 = x2 - min.width; else x2 = x1 + min.width; }
  if (y2 - y1 < min.height) { if (handle.includes('n')) y1 = y2 - min.height; else y2 = y1 + min.height; }
  return { x: x1, y: y1, width: x2 - x1, height: y2 - y1 };
}

export function updateNode(data: CanvasData, id: string, patch: Partial<CanvasNode>): CanvasData {
  return { ...data, nodes: data.nodes.map((n) => (n.id === id ? ({ ...n, ...patch } as CanvasNode) : n)) };
}
export function updateEdge(data: CanvasData, id: string, patch: Partial<CanvasEdge>): CanvasData {
  return { ...data, edges: data.edges.map((e) => (e.id === id ? { ...e, ...patch } : e)) };
}

/** Remove nodes (and every edge touching them) and edges. */
export function deleteItems(data: CanvasData, nodeIds: Iterable<string>, edgeIds: Iterable<string> = []): CanvasData {
  const ns = new Set(nodeIds), es = new Set(edgeIds);
  if (!ns.size && !es.size) return data;
  return {
    nodes: data.nodes.filter((n) => !ns.has(n.id)),
    edges: data.edges.filter((e) => !es.has(e.id) && !ns.has(e.fromNode) && !ns.has(e.toNode)),
  };
}

/** Place a new node of size w×h centred at `c`, shifted down-right until it doesn't sit exactly on another node. */
export function freeSpot(nodes: CanvasNode[], c: Point, w: number, h: number, grid = GRID): Rect {
  let x = snap(c.x - w / 2, grid), y = snap(c.y - h / 2, grid);
  for (let i = 0; i < 50 && nodes.some((n) => Math.abs(n.x - x) < grid && Math.abs(n.y - y) < grid); i++) { x += grid * 2; y += grid * 2; }
  return { x, y, width: w, height: h };
}

// ------------------------------------------------------------------ history

export interface History { past: CanvasData[]; present: CanvasData; future: CanvasData[] }
export type HistoryAction =
  /** Replace the document. `record` (default) makes it one undo step; false = transient (mid-gesture). */
  | { type: 'apply'; data: CanvasData; record?: boolean }
  /** End of a gesture: record `before` as the undo step if anything changed. */
  | { type: 'commit'; before: CanvasData }
  | { type: 'undo' }
  | { type: 'redo' }
  | { type: 'reset'; data: CanvasData };

export const HISTORY_LIMIT = 200;
export const initHistory = (data: CanvasData): History => ({ past: [], present: data, future: [] });
const same = (a: CanvasData, b: CanvasData) => a === b || serializeCanvas(a) === serializeCanvas(b);

export function historyReducer(h: History, a: HistoryAction): History {
  switch (a.type) {
    case 'apply':
      if (a.data === h.present) return h;
      if (a.record === false) return { ...h, present: a.data };
      return { past: [...h.past, h.present].slice(-HISTORY_LIMIT), present: a.data, future: [] };
    case 'commit':
      if (same(a.before, h.present)) return h;
      return { past: [...h.past, a.before].slice(-HISTORY_LIMIT), present: h.present, future: [] };
    case 'undo': {
      if (!h.past.length) return h;
      const prev = h.past[h.past.length - 1];
      return { past: h.past.slice(0, -1), present: prev, future: [h.present, ...h.future] };
    }
    case 'redo': {
      if (!h.future.length) return h;
      const [next, ...rest] = h.future;
      return { past: [...h.past, h.present], present: next, future: rest };
    }
    case 'reset':
      return initHistory(a.data);
  }
}

// ------------------------------------------------------------------ edges

export const OPPOSITE: Record<CanvasSide, CanvasSide> = { top: 'bottom', bottom: 'top', left: 'right', right: 'left' };
const NORMAL: Record<CanvasSide, Point> = { top: { x: 0, y: -1 }, bottom: { x: 0, y: 1 }, left: { x: -1, y: 0 }, right: { x: 1, y: 0 } };

/** Side of `r` whose midpoint is closest to `p`. */
export function nearestSide(r: Rect, p: Point): CanvasSide {
  let best: CanvasSide = 'top', d = Infinity;
  for (const s of ['top', 'right', 'bottom', 'left'] as CanvasSide[]) {
    const q = sidePoint(r, s);
    const dd = (q.x - p.x) ** 2 + (q.y - p.y) ** 2;
    if (dd < d) { d = dd; best = s; }
  }
  return best;
}

/** The side a free end (pointer) "enters" from, given where the edge starts. */
export function sideFacing(from: Point, p: Point): CanvasSide {
  const dx = p.x - from.x, dy = p.y - from.y;
  if (Math.abs(dx) >= Math.abs(dy)) return dx >= 0 ? 'left' : 'right';
  return dy >= 0 ? 'top' : 'bottom';
}

export interface EdgeGeom { from: Point; to: Point; fromSide: CanvasSide; toSide: CanvasSide; path: string; mid: Point }

/** Bezier geometry between two endpoints (control points as in shared `edgePath`). */
export function curve(from: Point, fromSide: CanvasSide, to: Point, toSide: CanvasSide): EdgeGeom {
  const d = Math.max(40, Math.min(200, Math.hypot(to.x - from.x, to.y - from.y) / 2));
  const c1 = { x: from.x + NORMAL[fromSide].x * d, y: from.y + NORMAL[fromSide].y * d };
  const c2 = { x: to.x + NORMAL[toSide].x * d, y: to.y + NORMAL[toSide].y * d };
  const mid = { x: 0.125 * from.x + 0.375 * c1.x + 0.375 * c2.x + 0.125 * to.x, y: 0.125 * from.y + 0.375 * c1.y + 0.375 * c2.y + 0.125 * to.y };
  return { from, to, fromSide, toSide, path: edgePath(from, fromSide, to, toSide), mid };
}

export function edgeGeometry(a: Rect, b: Rect, e: Pick<CanvasEdge, 'fromSide' | 'toSide'>): EdgeGeom {
  const [af, at] = autoSides(a, b);
  const fs = e.fromSide ?? af, ts = e.toSide ?? at;
  return curve(sidePoint(a, fs), fs, sidePoint(b, ts), ts);
}

/** Arrowhead polygon with its tip at `tip`, pointing into the node through `side`. */
export function arrowHead(tip: Point, side: CanvasSide, size = 12): string {
  const n = NORMAL[side];
  const bx = tip.x + n.x * size, by = tip.y + n.y * size; // base centre (outside the node)
  const px = -n.y * size * 0.5, py = n.x * size * 0.5;
  return `${tip.x},${tip.y} ${bx + px},${by + py} ${bx - px},${by - py}`;
}

export function addEdge(data: CanvasData, from: string, fromSide: CanvasSide | undefined, to: string, toSide: CanvasSide | undefined, id = canvasId()): { data: CanvasData; id: string | null } {
  if (from === to || !data.nodes.some((n) => n.id === from) || !data.nodes.some((n) => n.id === to)) return { data, id: null };
  if (data.edges.some((e) => e.fromNode === from && e.toNode === to && e.fromSide === fromSide && e.toSide === toSide)) return { data, id: null };
  const edge: CanvasEdge = { id, fromNode: from, toNode: to, ...(fromSide ? { fromSide } : {}), ...(toSide ? { toSide } : {}) };
  return { data: { ...data, edges: [...data.edges, edge] }, id };
}

/** Move one end of an edge to another node/side. No-op if it would create a self-loop. */
export function reconnectEdge(data: CanvasData, edgeId: string, end: 'from' | 'to', nodeId: string, side?: CanvasSide): CanvasData {
  const e = data.edges.find((x) => x.id === edgeId);
  if (!e || !data.nodes.some((n) => n.id === nodeId)) return data;
  const other = end === 'from' ? e.toNode : e.fromNode;
  if (other === nodeId) return data;
  const patch: Partial<CanvasEdge> = end === 'from' ? { fromNode: nodeId, fromSide: side } : { toNode: nodeId, toSide: side };
  const next = { ...e, ...patch };
  if (!side) delete next[end === 'from' ? 'fromSide' : 'toSide'];
  return { ...data, edges: data.edges.map((x) => (x.id === edgeId ? next : x)) };
}

/** Swap an edge's direction (ends + arrowheads follow). */
export function flipEdge(e: CanvasEdge): CanvasEdge {
  const out: CanvasEdge = { ...e, fromNode: e.toNode, toNode: e.fromNode, fromSide: e.toSide, toSide: e.fromSide, fromEnd: e.toEnd, toEnd: e.fromEnd };
  (['fromSide', 'toSide', 'fromEnd', 'toEnd'] as const).forEach((k) => { if (out[k] === undefined) delete out[k]; });
  return out;
}

export type ArrowMode = 'forward' | 'both' | 'none';
/** JSON Canvas defaults: fromEnd 'none', toEnd 'arrow'. */
export const arrowsOf = (e: Partial<CanvasEdge>) => ({ from: e.fromEnd === 'arrow', to: (e.toEnd ?? 'arrow') === 'arrow' });
export const arrowMode = (e: Partial<CanvasEdge>): ArrowMode => { const a = arrowsOf(e); return a.from && a.to ? 'both' : a.to ? 'forward' : a.from ? 'both' : 'none'; };
export function setArrowMode(e: CanvasEdge, m: ArrowMode): CanvasEdge {
  const out = { ...e };
  delete out.fromEnd; delete out.toEnd;
  if (m === 'both') out.fromEnd = 'arrow';
  if (m === 'none') out.toEnd = 'none';
  return out;
}

/** A new text card for an edge dropped on empty space at `p`, entered through `side`. */
export function rectForDrop(p: Point, side: CanvasSide, size = DEFAULT_SIZE.text): Rect {
  switch (side) {
    case 'left': return { x: p.x, y: p.y - size.height / 2, ...size };
    case 'right': return { x: p.x - size.width, y: p.y - size.height / 2, ...size };
    case 'top': return { x: p.x - size.width / 2, y: p.y, ...size };
    default: return { x: p.x - size.width / 2, y: p.y - size.height, ...size };
  }
}

// ------------------------------------------------------------------ clipboard, duplicate

export const CLIP_TYPE = 'clearmind/canvas';

/** Clipboard payload for the given nodes (+ edges between them), as JSON Canvas with a type marker. */
export function clipboardFor(data: CanvasData, ids: Iterable<string>): string | null {
  const set = new Set(ids);
  const nodes = data.nodes.filter((n) => set.has(n.id));
  if (!nodes.length) return null;
  const edges = data.edges.filter((e) => set.has(e.fromNode) && set.has(e.toNode));
  return JSON.stringify({ type: CLIP_TYPE, nodes, edges });
}

export type PasteContent = { kind: 'canvas'; data: CanvasData } | { kind: 'url'; url: string } | { kind: 'text'; text: string } | null;

const URL_RE = /^(https?:\/\/[^\s]+|www\.[^\s]+\.[a-z]{2,}[^\s]*)$/i;
export const normalizeUrl = (s: string): string | null => {
  const t = s.trim();
  if (!URL_RE.test(t)) return null;
  return /^www\./i.test(t) ? `https://${t}` : t;
};

/** Classify pasted text: our own (or Obsidian's) canvas JSON, a single URL, or plain text. */
export function parsePaste(text: string): PasteContent {
  const t = text.trim();
  if (!t) return null;
  if (t.startsWith('{')) {
    try {
      const raw = JSON.parse(t);
      if (Array.isArray(raw?.nodes) && (raw.type === CLIP_TYPE || raw.nodes.every((n: unknown) => typeof (n as { id?: unknown })?.id === 'string'))) {
        const nodes = (raw.nodes as CanvasNode[]).filter((n) => n && typeof n.id === 'string' && ['text', 'file', 'link', 'group'].includes(n.type));
        if (nodes.length) {
          const ids = new Set(nodes.map((n) => n.id));
          const edges = (Array.isArray(raw.edges) ? raw.edges as CanvasEdge[] : []).filter((e) => e && ids.has(e.fromNode) && ids.has(e.toNode));
          return { kind: 'canvas', data: { nodes, edges } };
        }
      }
    } catch { /* plain text */ }
  }
  const url = normalizeUrl(t);
  if (url) return { kind: 'url', url };
  return { kind: 'text', text };
}

/**
 * Insert copies of `clip` into `data` with fresh ids. Positioned with the clip's
 * top-left at `at`, or offset by `offset` from where the originals were.
 */
export function insertClip(data: CanvasData, clip: CanvasData, place: { at: Point } | { offset: Point }, newId: () => string = canvasId): { data: CanvasData; ids: string[] } {
  const b = canvasBounds(clip.nodes);
  if (!b) return { data, ids: [] };
  const dx = 'at' in place ? place.at.x - b.x : place.offset.x;
  const dy = 'at' in place ? place.at.y - b.y : place.offset.y;
  const map = new Map<string, string>();
  const nodes = clip.nodes.map((n) => { const id = newId(); map.set(n.id, id); return { ...n, id, x: n.x + dx, y: n.y + dy }; });
  const edges = clip.edges.filter((e) => map.has(e.fromNode) && map.has(e.toNode)).map((e) => ({ ...e, id: newId(), fromNode: map.get(e.fromNode)!, toNode: map.get(e.toNode)! }));
  return { data: { nodes: [...data.nodes, ...nodes], edges: [...data.edges, ...edges] }, ids: nodes.map((n) => n.id) };
}

/** Duplicate nodes (and group contents and edges among them) offset by one grid step down-right. */
export function duplicate(data: CanvasData, ids: Iterable<string>, newId?: () => string): { data: CanvasData; ids: string[] } {
  const set = dragSet(data, ids);
  const nodes = data.nodes.filter((n) => set.has(n.id));
  const edges = data.edges.filter((e) => set.has(e.fromNode) && set.has(e.toNode));
  return insertClip(data, { nodes, edges }, { offset: { x: GRID * 2, y: GRID * 2 } }, newId);
}

// ------------------------------------------------------------------ align & distribute

export type Align = 'left' | 'center' | 'right' | 'top' | 'middle' | 'bottom';
export function alignNodes(data: CanvasData, ids: Iterable<string>, how: Align): CanvasData {
  const set = new Set(ids);
  const sel = data.nodes.filter((n) => set.has(n.id));
  const b = canvasBounds(sel);
  if (!b || sel.length < 2) return data;
  const pos = (n: CanvasNode): Point => {
    switch (how) {
      case 'left': return { x: b.x, y: n.y };
      case 'right': return { x: b.x + b.width - n.width, y: n.y };
      case 'center': return { x: b.x + b.width / 2 - n.width / 2, y: n.y };
      case 'top': return { x: n.x, y: b.y };
      case 'bottom': return { x: n.x, y: b.y + b.height - n.height };
      default: return { x: n.x, y: b.y + b.height / 2 - n.height / 2 };
    }
  };
  return { ...data, nodes: data.nodes.map((n) => (set.has(n.id) ? { ...n, ...pos(n) } : n)) };
}

/** Equal gaps between nodes along an axis (first and last stay put). */
export function distributeNodes(data: CanvasData, ids: Iterable<string>, axis: 'h' | 'v'): CanvasData {
  const set = new Set(ids);
  const sel = data.nodes.filter((n) => set.has(n.id));
  if (sel.length < 3) return data;
  const k = axis === 'h' ? 'x' : 'y', size = axis === 'h' ? 'width' : 'height';
  const sorted = [...sel].sort((a, b) => a[k] - b[k]);
  const first = sorted[0], last = sorted[sorted.length - 1];
  const total = sorted.reduce((s, n) => s + n[size], 0);
  const gap = (last[k] + last[size] - first[k] - total) / (sorted.length - 1);
  const at = new Map<string, number>();
  let cur = first[k];
  for (const n of sorted) { at.set(n.id, cur); cur += n[size] + gap; }
  return { ...data, nodes: data.nodes.map((n) => (at.has(n.id) ? { ...n, [k]: at.get(n.id)! } : n)) };
}

/** Bounding rect of the selected nodes (and of selected edges' endpoints' nodes). */
export function selectionBounds(data: CanvasData, nodeIds: Set<string>, edgeIds: Set<string> = new Set()): Rect | null {
  const ids = new Set(nodeIds);
  for (const e of data.edges) if (edgeIds.has(e.id)) { ids.add(e.fromNode); ids.add(e.toNode); }
  return canvasBounds(data.nodes.filter((n) => ids.has(n.id)));
}

/** "Folder/Note.md" for a vault note, the file-node path Obsidian writes. */
export const fileNodePath = (n: { title: string; folder?: string | null }) => `${n.folder ? `${n.folder.replace(/\/+$/, '')}/` : ''}${n.title}.md`;

/** Domain shown on link cards. */
export function urlParts(url: string): { host: string; path: string } {
  try { const u = new URL(url); return { host: u.hostname.replace(/^www\./, ''), path: (u.pathname + u.search).replace(/\/$/, '') }; }
  catch { return { host: url, path: '' }; }
}
