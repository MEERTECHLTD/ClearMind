/**
 * d3-force layout driven manually (sim.stop() + sim.tick()) from
 * requestAnimationFrame, so it never runs inside React's render path. Each
 * frame ticks within a small time budget, then notifies the view; once alpha
 * drops below alphaMin the loop stops. Simulation nodes are kept by id across
 * data changes so filters/edits don't make the layout explode.
 */
import {
  forceSimulation, forceLink, forceCenter, forceX, forceY,
  type Simulation, type SimulationNodeDatum, type SimulationLinkDatum,
} from 'd3-force';
import { fastCollide, fastManyBody } from './forces';
import type { Graph, GraphNode } from '@clearmind/shared/notes';
import { nodeRadius, seedPosition, type Bounds } from '@clearmind/shared/notes/graphStyle';

export interface SimNode extends SimulationNodeDatum {
  id: string;
  node: GraphNode;
  r: number;
  linkCount: number;
}
export interface SimLink extends SimulationLinkDatum<SimNode> {
  source: SimNode;
  target: SimNode;
  kind: Graph['links'][number]['kind'];
}

export interface LayoutForces { center: number; repel: number; link: number; linkDistance: number }

/** Max nodes rendered; bigger graphs keep the best-connected ones. */
export const MAX_NODES = 600;

/** Trim a graph to the `max` highest-degree nodes (and links between them). */
export function capGraph(g: Graph, max = MAX_NODES): { graph: Graph; total: number } {
  const total = g.nodes.length;
  if (total <= max) return { graph: g, total };
  const nodes = [...g.nodes].sort((a, b) => b.degree - a.degree || a.id.localeCompare(b.id)).slice(0, max);
  const keep = new Set(nodes.map((n) => n.id));
  return { graph: { nodes, links: g.links.filter((l) => keep.has(l.source) && keep.has(l.target)) }, total };
}

const raf: (cb: () => void) => number = (cb) => requestAnimationFrame(cb);
const caf = (id: number) => cancelAnimationFrame(id);
const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

export class ForceLayout {
  nodes: SimNode[] = [];
  links: SimLink[] = [];
  byId = new Map<string, SimNode>();
  private sim: Simulation<SimNode, SimLink>;
  private fLink = forceLink<SimNode, SimLink>([]);
  private fCharge = fastManyBody<SimNode>().distanceMax(600);
  private fX = forceX<SimNode>(0);
  private fY = forceY<SimNode>(0);
  private frame: number | null = null;
  private disposed = false;
  /** Called after every batch of ticks (and on data changes). */
  onFrame: () => void = () => {};
  /** Called once when the layout settles (alpha < alphaMin). */
  onSettle: () => void = () => {};
  /** Per-frame time budget for ticking (ms) and hard cap on ticks/frame. */
  budgetMs = 14;
  maxTicksPerFrame = 20;

  constructor(forces: LayoutForces = { center: 0.5, repel: 10, link: 1, linkDistance: 80 }) {
    this.sim = forceSimulation<SimNode, SimLink>([])
      .stop()
      .alphaDecay(0.025)
      .velocityDecay(0.42)
      .force('link', this.fLink)
      .force('charge', this.fCharge)
      .force('center', forceCenter<SimNode>(0, 0).strength(0.6))
      .force('x', this.fX)
      .force('y', this.fY)
      .force('collide', fastCollide<SimNode>(2, 0.6));
    this.setForces(forces);
  }

  setForces(f: LayoutForces) {
    this.fLink.distance(f.linkDistance).strength((l) => f.link / Math.max(1, Math.min(l.source.linkCount, l.target.linkCount)));
    this.fCharge.strength(-(f.repel * 14 + 4));
    this.fX.strength(f.center * 0.08);
    this.fY.strength(f.center * 0.08);
  }

  /** Replace the graph, reusing positions of nodes already laid out. */
  setGraph(g: Graph, sizeMul = 1) {
    const prev = this.byId;
    const prevLinks = this.links.length;
    const first = prev.size === 0;
    const linkCount = new Map<string, number>();
    for (const l of g.links) {
      linkCount.set(l.source, (linkCount.get(l.source) ?? 0) + 1);
      linkCount.set(l.target, (linkCount.get(l.target) ?? 0) + 1);
    }
    const next = new Map<string, SimNode>();
    const fresh: SimNode[] = [];
    for (const n of g.nodes) {
      const old = prev.get(n.id);
      const sn: SimNode = old ?? { id: n.id, node: n, r: 0, linkCount: 0 };
      sn.node = n;
      sn.r = nodeRadius(n.degree, sizeMul);
      sn.linkCount = linkCount.get(n.id) ?? 0;
      if (!old) fresh.push(sn);
      next.set(n.id, sn);
    }
    // Seed newcomers next to their already-placed neighbours.
    if (!first && fresh.length) {
      const adj = new Map<string, string[]>();
      for (const l of g.links) {
        (adj.get(l.source) ?? adj.set(l.source, []).get(l.source)!).push(l.target);
        (adj.get(l.target) ?? adj.set(l.target, []).get(l.target)!).push(l.source);
      }
      const placed = [...next.values()].filter((s) => s.x != null);
      for (const s of fresh) {
        const nbs = (adj.get(s.id) ?? []).map((id) => next.get(id)!).filter((p) => p && p.x != null);
        const p = seedPosition(nbs, placed);
        if (p) { s.x = p.x; s.y = p.y; }
      }
    }
    this.byId = next;
    this.nodes = [...next.values()];
    this.links = g.links.map((l) => ({ source: next.get(l.source)!, target: next.get(l.target)!, kind: l.kind }));
    // Fewer ticks to settle on big graphs (each tick is O(n log n) on an interpreter).
    const n = this.nodes.length;
    this.sim.alphaDecay(n > 300 ? 0.04 : n > 120 ? 0.03 : 0.0228);
    this.sim.nodes(this.nodes);
    this.fLink.links(this.links);
    const changed = first || fresh.length > 0 || prev.size !== next.size;
    if (changed) this.reheat(first ? 1 : fresh.length > this.nodes.length / 3 ? 0.8 : 0.4);
    else if (prevLinks !== this.links.length) this.reheat(0.25);
    else this.onFrame();
  }

  reheat(alpha = 0.3) {
    if (this.sim.alpha() < alpha) this.sim.alpha(alpha);
    this.start();
  }

  /** Pin a node (drag). Pass null to release. */
  pin(id: string, x: number | null, y: number | null) {
    const n = this.byId.get(id);
    if (!n) return;
    n.fx = x; n.fy = y;
    if (x != null) { n.x = x; n.y = y ?? n.y; }
    this.sim.alphaTarget(x == null ? 0 : 0.25);
    this.reheat(0.3);
  }

  get running() { return this.frame != null; }

  private start() {
    if (this.frame != null || this.disposed) return;
    this.frame = raf(this.step);
  }

  private step = () => {
    this.frame = null;
    if (this.disposed) return;
    const t0 = now();
    let ticks = 0;
    const done = () => this.sim.alpha() < this.sim.alphaMin() && this.sim.alphaTarget() === 0;
    while (ticks < this.maxTicksPerFrame && !done()) {
      this.sim.tick();
      ticks++;
      if (now() - t0 > this.budgetMs) break;
    }
    this.onFrame();
    if (done()) this.onSettle();
    else this.frame = raf(this.step);
  };

  bounds(): Bounds | null {
    if (!this.nodes.length) return null;
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const n of this.nodes) {
      const x = n.x ?? 0, y = n.y ?? 0;
      if (x - n.r < minX) minX = x - n.r;
      if (y - n.r < minY) minY = y - n.r;
      if (x + n.r > maxX) maxX = x + n.r;
      if (y + n.r > maxY) maxY = y + n.r;
    }
    return { minX, minY, maxX, maxY };
  }

  /** Nearest node to a world point within `maxDist` (world units) of its edge. */
  hitTest(wx: number, wy: number, maxDist: number): SimNode | null {
    let best: SimNode | null = null;
    let bestD = Infinity;
    for (const n of this.nodes) {
      const d = Math.hypot((n.x ?? 0) - wx, (n.y ?? 0) - wy) - n.r;
      if (d < bestD) { bestD = d; best = n; }
    }
    return best && bestD <= maxDist ? best : null;
  }

  dispose() {
    this.disposed = true;
    if (this.frame != null) caf(this.frame);
    this.frame = null;
    this.sim.stop();
    this.sim.nodes([]);
  }
}
