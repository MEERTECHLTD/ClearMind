/**
 * Canvas documents in the open JSON Canvas 1.0 format (jsoncanvas.org) — the
 * format Obsidian uses for .canvas files. A canvas is stored as a Note with
 * kind 'canvas' whose `content` is the JSON. Pure helpers shared by clients.
 */
import { extractLinks, type WikiLink } from './parse';

export type CanvasColor = '1' | '2' | '3' | '4' | '5' | '6' | string; // preset 1–6 or #hex
export type CanvasSide = 'top' | 'right' | 'bottom' | 'left';
export type CanvasEnd = 'none' | 'arrow';

interface NodeBase { id: string; x: number; y: number; width: number; height: number; color?: CanvasColor }
export interface TextNode extends NodeBase { type: 'text'; text: string }
/** A vault note or attachment; `subpath` like "#Heading" or "#^block". */
export interface FileNode extends NodeBase { type: 'file'; file: string; subpath?: string }
export interface LinkNode extends NodeBase { type: 'link'; url: string }
export interface GroupNode extends NodeBase { type: 'group'; label?: string; background?: string; backgroundStyle?: 'cover' | 'ratio' | 'repeat' }
export type CanvasNode = TextNode | FileNode | LinkNode | GroupNode;

export interface CanvasEdge {
  id: string;
  fromNode: string;
  fromSide?: CanvasSide;
  fromEnd?: CanvasEnd;
  toNode: string;
  toSide?: CanvasSide;
  toEnd?: CanvasEnd;
  color?: CanvasColor;
  label?: string;
}

export interface CanvasData { nodes: CanvasNode[]; edges: CanvasEdge[] }

export const EMPTY_CANVAS: CanvasData = { nodes: [], edges: [] };

/** Obsidian's preset colours (light/dark agnostic mid tones). */
export const CANVAS_COLORS: Record<'1' | '2' | '3' | '4' | '5' | '6', string> = {
  '1': '#e93147', // red
  '2': '#ec7500', // orange
  '3': '#e0ac00', // yellow
  '4': '#08b94e', // green
  '5': '#00bfbc', // cyan
  '6': '#7852ee', // purple
};
export const canvasColor = (c?: CanvasColor | null): string | null => (!c ? null : (CANVAS_COLORS as Record<string, string>)[c] ?? (/^#[0-9a-f]{3,8}$/i.test(c) ? c : null));

const num = (v: unknown, d = 0) => (typeof v === 'number' && Number.isFinite(v) ? v : d);
const str = (v: unknown) => (typeof v === 'string' ? v : undefined);
const SIDES = new Set(['top', 'right', 'bottom', 'left']);

/** Parse tolerantly: bad JSON → empty canvas; unknown node types dropped; edges to missing nodes dropped. */
export function parseCanvas(content: string | null | undefined): CanvasData {
  let raw: any;
  try { raw = content?.trim() ? JSON.parse(content) : {}; } catch { return { nodes: [], edges: [] }; }
  const nodes: CanvasNode[] = [];
  const seen = new Set<string>();
  for (const n of Array.isArray(raw?.nodes) ? raw.nodes : []) {
    const id = str(n?.id);
    if (!id || seen.has(id)) continue;
    const base = { id, x: num(n.x), y: num(n.y), width: Math.max(20, num(n.width, 250)), height: Math.max(20, num(n.height, 60)), ...(str(n.color) ? { color: n.color } : {}) };
    if (n.type === 'text') nodes.push({ ...base, type: 'text', text: str(n.text) ?? '' });
    else if (n.type === 'file' && str(n.file)) nodes.push({ ...base, type: 'file', file: n.file, ...(str(n.subpath) ? { subpath: n.subpath } : {}) });
    else if (n.type === 'link' && str(n.url)) nodes.push({ ...base, type: 'link', url: n.url });
    else if (n.type === 'group') nodes.push({ ...base, type: 'group', ...(str(n.label) ? { label: n.label } : {}), ...(str(n.background) ? { background: n.background } : {}), ...(str(n.backgroundStyle) ? { backgroundStyle: n.backgroundStyle } : {}) });
    else continue;
    seen.add(id);
  }
  const edges: CanvasEdge[] = [];
  const eSeen = new Set<string>();
  for (const e of Array.isArray(raw?.edges) ? raw.edges : []) {
    const id = str(e?.id);
    if (!id || eSeen.has(id) || !seen.has(e.fromNode) || !seen.has(e.toNode)) continue;
    eSeen.add(id);
    edges.push({
      id, fromNode: e.fromNode, toNode: e.toNode,
      ...(SIDES.has(e.fromSide) ? { fromSide: e.fromSide } : {}), ...(SIDES.has(e.toSide) ? { toSide: e.toSide } : {}),
      ...(e.fromEnd === 'arrow' || e.fromEnd === 'none' ? { fromEnd: e.fromEnd } : {}),
      ...(e.toEnd === 'arrow' || e.toEnd === 'none' ? { toEnd: e.toEnd } : {}),
      ...(str(e.color) ? { color: e.color } : {}), ...(str(e.label) ? { label: e.label } : {}),
    });
  }
  return { nodes, edges };
}

/** Stable, readable JSON (Obsidian writes tab-indented JSON). Integer coordinates. */
export function serializeCanvas(c: CanvasData): string {
  const round = <T extends { x: number; y: number; width: number; height: number }>(n: T): T => ({ ...n, x: Math.round(n.x), y: Math.round(n.y), width: Math.round(n.width), height: Math.round(n.height) });
  return JSON.stringify({ nodes: c.nodes.map(round), edges: c.edges }, null, '\t');
}

export const canvasId = () => Math.random().toString(16).slice(2, 10) + Math.random().toString(16).slice(2, 10);

/** Bounding box of nodes (or null when empty). */
export function canvasBounds(nodes: Pick<CanvasNode, 'x' | 'y' | 'width' | 'height'>[]) {
  if (!nodes.length) return null;
  let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity;
  for (const n of nodes) { x1 = Math.min(x1, n.x); y1 = Math.min(y1, n.y); x2 = Math.max(x2, n.x + n.width); y2 = Math.max(y2, n.y + n.height); }
  return { x: x1, y: y1, width: x2 - x1, height: y2 - y1 };
}

/** Nodes fully inside a group's rectangle (Obsidian: they move with the group). */
export function nodesInGroup(c: CanvasData, groupId: string): CanvasNode[] {
  const g = c.nodes.find((n) => n.id === groupId);
  if (!g) return [];
  return c.nodes.filter((n) => n.id !== g.id && n.x >= g.x && n.y >= g.y && n.x + n.width <= g.x + g.width && n.y + n.height <= g.y + g.height);
}

/** Anchor point on a node side. */
export function sidePoint(n: Pick<CanvasNode, 'x' | 'y' | 'width' | 'height'>, side: CanvasSide): { x: number; y: number } {
  switch (side) {
    case 'top': return { x: n.x + n.width / 2, y: n.y };
    case 'bottom': return { x: n.x + n.width / 2, y: n.y + n.height };
    case 'left': return { x: n.x, y: n.y + n.height / 2 };
    default: return { x: n.x + n.width, y: n.y + n.height / 2 };
  }
}

/** Pick the facing sides for an edge without explicit sides. */
export function autoSides(a: Pick<CanvasNode, 'x' | 'y' | 'width' | 'height'>, b: Pick<CanvasNode, 'x' | 'y' | 'width' | 'height'>): [CanvasSide, CanvasSide] {
  const dx = (b.x + b.width / 2) - (a.x + a.width / 2);
  const dy = (b.y + b.height / 2) - (a.y + a.height / 2);
  if (Math.abs(dx) * (a.height + b.height) >= Math.abs(dy) * (a.width + b.width)) return dx >= 0 ? ['right', 'left'] : ['left', 'right'];
  return dy >= 0 ? ['bottom', 'top'] : ['top', 'bottom'];
}

/** Cubic bezier path for an edge, like Obsidian's curved connectors. */
export function edgePath(from: { x: number; y: number }, fromSide: CanvasSide, to: { x: number; y: number }, toSide: CanvasSide): string {
  const d = Math.max(40, Math.min(200, Math.hypot(to.x - from.x, to.y - from.y) / 2));
  const off = (s: CanvasSide) => (s === 'top' ? [0, -d] : s === 'bottom' ? [0, d] : s === 'left' ? [-d, 0] : [d, 0]);
  const [ax, ay] = off(fromSide);
  const [bx, by] = off(toSide);
  return `M ${from.x} ${from.y} C ${from.x + ax} ${from.y + ay}, ${to.x + bx} ${to.y + by}, ${to.x} ${to.y}`;
}

/**
 * Links a canvas contributes to the vault graph/backlinks: every file node
 * (as an embed) and every [[wikilink]] inside text cards.
 */
export function canvasLinks(content: string): Omit<WikiLink, 'start' | 'end' | 'line'>[] {
  const c = parseCanvas(content);
  const out: Omit<WikiLink, 'start' | 'end' | 'line'>[] = [];
  for (const n of c.nodes) {
    if (n.type === 'file') {
      const sub = n.subpath?.replace(/^#/, '');
      out.push({ target: n.file.replace(/\.md$/i, ''), heading: sub && !sub.startsWith('^') ? sub : undefined, block: sub?.startsWith('^') ? sub.slice(1) : undefined, embed: true });
    } else if (n.type === 'text') {
      for (const l of extractLinks(n.text)) out.push({ target: l.target, heading: l.heading, block: l.block, alias: l.alias, embed: l.embed });
    }
  }
  return out;
}

/** Plain text of a canvas (text cards + group labels) for search & previews. */
export const canvasText = (content: string) => parseCanvas(content).nodes.map((n) => (n.type === 'text' ? n.text : n.type === 'group' ? n.label ?? '' : n.type === 'file' ? n.file : n.url)).filter(Boolean).join('\n');
