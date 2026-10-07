/**
 * Imperative canvas graph renderer + d3-force simulation (Obsidian-style graph
 * view). Lives outside React: the component pushes data/settings in, the
 * engine owns positions, the transform and the animation loop. Frames are only
 * scheduled while something moves (hot simulation, drag, zoom/fade animation).
 */
import {
  forceSimulation, forceLink, forceManyBody, forceCenter, forceCollide, forceX, forceY,
  type Simulation, type SimulationNodeDatum, type SimulationLinkDatum, type ForceLink, type ForceManyBody,
  type ForceCollide, type ForceX, type ForceY,
} from 'd3-force';
import { quadtree, type Quadtree } from 'd3-quadtree';
import type { Graph, GraphLink, GraphNode } from '../../../shared/notes';
import {
  nodeRadius, labelAlpha, fitTransform, zoomAt, seedPosition, growthOrder, GRAPH_THEMES,
  type GraphDisplaySettings, type GraphForceSettings, type GraphTheme, type Transform, type Bounds,
} from '../../../shared/notes/graphStyle';

export interface SimNode extends SimulationNodeDatum {
  id: string;
  data: GraphNode;
  r: number;
  color: string | null;
  /** Links touching this node (for d3's default link-strength normalisation). */
  linkCount: number;
}
export interface SimLink extends SimulationLinkDatum<SimNode> {
  source: SimNode;
  target: SimNode;
  kind: GraphLink['kind'];
}

export interface EngineOptions {
  onOpen: (node: GraphNode, opts: { newTab: boolean }) => void;
  /** Re-fit the view whenever the graph's structure changes (local graph). */
  fitOnChange?: boolean;
  /** Max zoom used when fitting (small graphs shouldn't be blown up). */
  fitMaxZoom?: number;
  padding?: number;
  /** Extra space kept clear at the top when fitting (e.g. under an overlay toolbar). */
  insetTop?: number;
}

interface QNode { data?: SimNode; next?: QNode; length?: number }
interface DownState { x: number; y: number; lastX: number; lastY: number; node: SimNode | null; moved: boolean; newTab: boolean; offX: number; offY: number }
interface ZoomAnim { from: Transform; to: Transform; start: number; dur: number }
interface Growth { order: SimNode[]; revealed: Set<string>; count: number; per: number }

const FONT = 'Inter, ui-sans-serif, system-ui, -apple-system, sans-serif';
const K_MIN = 0.03;
const K_MAX = 8;
const ease = (p: number) => 1 - Math.pow(1 - p, 3);
const finite = (n: SimNode) => Number.isFinite(n.x) && Number.isFinite(n.y);
const linkKey = (a: string, b: string) => (a < b ? `${a}\u0000${b}` : `${b}\u0000${a}`);
const truncate = (s: string) => (s.length > 48 ? `${s.slice(0, 46)}…` : s);

export class GraphEngine {
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private readonly opts: EngineOptions;
  private readonly sim: Simulation<SimNode, SimLink>;
  private readonly fLink: ForceLink<SimNode, SimLink>;
  private readonly fCharge: ForceManyBody<SimNode>;
  private readonly fCollide: ForceCollide<SimNode>;
  private readonly fX: ForceX<SimNode>;
  private readonly fY: ForceY<SimNode>;

  private w = 0;
  private h = 0;
  private dpr = 1;
  private t: Transform = { k: 1, x: 0, y: 0 };

  private nodes: SimNode[] = [];
  private links: SimLink[] = [];
  private visNodes: SimNode[] = [];
  private visLinks: SimLink[] = [];
  private byId = new Map<string, SimNode>();
  private adj = new Map<string, Set<string>>();
  private linkKeys = new Set<string>();
  private colors = new Map<string, string>();

  private theme: GraphTheme = GRAPH_THEMES.light;
  private display: GraphDisplaySettings = { arrows: false, textFade: 0, nodeSize: 1, linkThickness: 1 };
  private forces: GraphForceSettings = { center: 0.5, repel: 10, link: 1, linkDistance: 80 };
  private activeId: string | null = null;

  private hoverId: string | null = null;
  private fadeId: string | null = null;
  private fade = 0;
  private autoFit = true;
  private zoomAnim: ZoomAnim | null = null;
  private growth: Growth | null = null;
  private qt: Quadtree<SimNode> | null = null;
  private maxR = 0;

  private raf = 0;
  private down: DownState | null = null;
  private pointers = new Map<number, { x: number; y: number }>();
  private pinch: { dist: number; midX: number; midY: number } | null = null;
  private destroyed = false;
  private insetRight = 0;

  constructor(canvas: HTMLCanvasElement, opts: EngineOptions) {
    this.canvas = canvas;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D unavailable');
    this.ctx = ctx;
    this.opts = opts;
    this.fLink = forceLink<SimNode, SimLink>([]);
    this.fCharge = forceManyBody<SimNode>().theta(0.9).distanceMax(900);
    this.fCollide = forceCollide<SimNode>((d) => d.r + 2).strength(0.6);
    this.fX = forceX<SimNode>(0);
    this.fY = forceY<SimNode>(0);
    this.sim = forceSimulation<SimNode, SimLink>([])
      .stop()
      .alphaDecay(0.02)
      .velocityDecay(0.42)
      .force('link', this.fLink)
      .force('charge', this.fCharge)
      .force('center', forceCenter<SimNode>(0, 0).strength(0.6))
      .force('x', this.fX)
      .force('y', this.fY)
      .force('collide', this.fCollide);
    this.applyForces();

    canvas.addEventListener('pointerdown', this.onPointerDown);
    canvas.addEventListener('pointermove', this.onPointerMove);
    canvas.addEventListener('pointerup', this.onPointerUp);
    canvas.addEventListener('pointercancel', this.onPointerUp);
    canvas.addEventListener('pointerleave', this.onPointerLeave);
    canvas.addEventListener('wheel', this.onWheel, { passive: false });
    canvas.addEventListener('dblclick', this.onDblClick);
  }

  destroy() {
    this.destroyed = true;
    if (this.raf) cancelAnimationFrame(this.raf);
    this.raf = 0;
    this.sim.stop();
    this.sim.nodes([]);
    this.fLink.links([]);
    const c = this.canvas;
    c.removeEventListener('pointerdown', this.onPointerDown);
    c.removeEventListener('pointermove', this.onPointerMove);
    c.removeEventListener('pointerup', this.onPointerUp);
    c.removeEventListener('pointercancel', this.onPointerUp);
    c.removeEventListener('pointerleave', this.onPointerLeave);
    c.removeEventListener('wheel', this.onWheel);
    c.removeEventListener('dblclick', this.onDblClick);
  }

  // ---------------------------------------------------------------- inputs from React

  resize(w: number, h: number) {
    const dpr = Math.max(1, Math.min(3, window.devicePixelRatio || 1));
    if (w === this.w && h === this.h && dpr === this.dpr) return;
    // Keep the world point at the centre of the view where it is.
    if (this.w && this.h) { this.t = { ...this.t, x: this.t.x + (w - this.w) / 2, y: this.t.y + (h - this.h) / 2 }; }
    else this.t = { ...this.t, x: w / 2, y: h / 2 };
    this.w = w; this.h = h; this.dpr = dpr;
    this.canvas.width = Math.max(1, Math.round(w * dpr));
    this.canvas.height = Math.max(1, Math.round(h * dpr));
    if (this.autoFit) this.t = this.fitTarget();
    this.draw();
    this.request();
  }

  setTheme(dark: boolean) {
    this.theme = dark ? GRAPH_THEMES.dark : GRAPH_THEMES.light;
    this.request();
  }

  setDisplay(d: GraphDisplaySettings) {
    const sizeChanged = d.nodeSize !== this.display.nodeSize;
    this.display = d;
    if (sizeChanged) {
      this.maxR = 0;
      for (const n of this.nodes) { n.r = nodeRadius(n.data.degree, d.nodeSize); this.maxR = Math.max(this.maxR, n.r); }
      this.fCollide.radius((n) => n.r + 2);
      this.reheat(0.15);
    }
    this.request();
  }

  setForces(f: GraphForceSettings) {
    this.forces = f;
    this.applyForces();
    this.reheat(0.4);
  }

  setColors(colors: Map<string, string>) {
    this.colors = colors;
    for (const n of this.nodes) n.color = colors.get(n.id) ?? null;
    this.request();
  }

  setActive(id: string | null) {
    this.activeId = id;
    this.request();
  }

  /** Merge new graph data, keeping positions of nodes that already exist. */
  setData(graph: Graph) {
    const prev = this.byId;
    const first = prev.size === 0;
    const size = this.display.nodeSize;
    // Centroid of the current layout, for seeding brand-new disconnected nodes.
    let cx = 0, cy = 0, placedCount = 0;
    for (const n of this.nodes) if (finite(n)) { cx += n.x!; cy += n.y!; placedCount++; }
    const centroid = placedCount ? [{ x: cx / placedCount, y: cy / placedCount }] : [];

    let structural = graph.nodes.length !== prev.size;
    const byId = new Map<string, SimNode>();
    this.maxR = 0;
    const nodes = graph.nodes.map((g) => {
      let n = prev.get(g.id);
      if (n) n.data = g;
      else { structural = true; n = { id: g.id, data: g, r: 0, color: null, linkCount: 0 }; }
      n.r = nodeRadius(g.degree, size);
      n.color = this.colors.get(g.id) ?? null;
      n.linkCount = 0;
      this.maxR = Math.max(this.maxR, n.r);
      byId.set(g.id, n);
      return n;
    });
    const links: SimLink[] = [];
    const adj = new Map<string, Set<string>>();
    const keys = new Set<string>();
    for (const l of graph.links) {
      const s = byId.get(l.source), t = byId.get(l.target);
      if (!s || !t) continue;
      links.push({ source: s, target: t, kind: l.kind });
      s.linkCount++; t.linkCount++;
      (adj.get(s.id) ?? adj.set(s.id, new Set()).get(s.id)!).add(t.id);
      (adj.get(t.id) ?? adj.set(t.id, new Set()).get(t.id)!).add(s.id);
      const k = linkKey(s.id, t.id);
      keys.add(k);
      if (!structural && !this.linkKeys.has(k)) structural = true;
    }
    if (keys.size !== this.linkKeys.size) structural = true;

    // Seed new nodes next to their already-placed neighbours so the layout doesn't explode.
    let added = 0;
    if (!first) for (const n of nodes) {
      if (finite(n)) continue;
      added++;
      const nbs: SimNode[] = [];
      for (const id of adj.get(n.id) ?? []) { const m = byId.get(id); if (m && finite(m)) nbs.push(m); }
      const p = seedPosition(nbs, centroid);
      if (p) { n.x = p.x; n.y = p.y; n.vx = 0; n.vy = 0; }
    }

    this.nodes = nodes;
    this.links = links;
    this.byId = byId;
    this.adj = adj;
    this.linkKeys = keys;
    this.growth = null;
    if (this.hoverId && !byId.has(this.hoverId)) this.hoverId = null;
    if (this.fadeId && !byId.has(this.fadeId)) { this.fadeId = null; this.fade = 0; }
    if (this.down?.node && !byId.has(this.down.node.id)) this.down = null;
    this.setSim(nodes, links);

    if (first) { this.sim.alpha(1); this.autoFit = true; }
    else if (structural) {
      this.reheat(added ? 0.5 : 0.3);
      if (this.opts.fitOnChange) this.autoFit = true;
    }
    this.qt = null;
    this.request();
  }

  /** Smoothly zoom so every node fits. */
  zoomToFit() {
    this.autoFit = false;
    this.animateTo(this.fitTarget());
  }

  /** Space covered by an overlay on the right (settings drawer), excluded when fitting. */
  setInsetRight(px: number) {
    this.insetRight = px;
  }

  /** Keep re-fitting while the layout settles (e.g. after the local graph's centre changes). */
  refit() {
    this.autoFit = true;
    this.request();
  }

  zoomBy(factor: number) {
    this.autoFit = false;
    this.animateTo(zoomAt(this.t, this.w / 2, this.h / 2, factor, K_MIN, K_MAX));
  }

  /** Obsidian's "Animate": rebuild the layout from scratch as a time-lapse growing out from the hubs. */
  animate() {
    if (!this.nodes.length) return;
    const ids = growthOrder({ nodes: this.nodes.map((n) => n.data), links: this.links.map((l) => ({ source: l.source.id, target: l.target.id, kind: l.kind })) });
    const order = ids.map((id) => this.byId.get(id)!).filter(Boolean);
    for (const n of order) { n.x = undefined; n.y = undefined; n.vx = 0; n.vy = 0; n.fx = null; n.fy = null; }
    this.growth = { order, revealed: new Set(), count: 0, per: Math.max(1, Math.ceil(order.length / 150)) };
    this.setSim([], []);
    this.t = { k: 2, x: this.w / 2, y: this.h / 2 };
    this.autoFit = true;
    this.zoomAnim = null;
    this.sim.alpha(1);
    this.request();
  }

  /** Keyboard/screen-reader focus: highlight a node and bring it into view. */
  focusNode(id: string | null) {
    this.hoverId = id && this.byId.has(id) ? id : null;
    const n = this.hoverId ? this.byId.get(this.hoverId) : null;
    if (n && finite(n)) {
      const sx = n.x! * this.t.k + this.t.x, sy = n.y! * this.t.k + this.t.y;
      if (sx < 40 || sy < 40 || sx > this.w - 40 || sy > this.h - 40) {
        this.autoFit = false;
        const k = Math.max(this.t.k, 1);
        this.animateTo({ k, x: this.w / 2 - n.x! * k, y: this.h / 2 - n.y! * k });
      }
    }
    this.request();
  }

  // ---------------------------------------------------------------- simulation

  private setSim(nodes: SimNode[], links: SimLink[]) {
    this.visNodes = nodes;
    this.visLinks = links;
    this.sim.nodes(nodes);
    this.fLink.links(links);
  }

  private applyForces() {
    const f = this.forces;
    this.fLink.distance(f.linkDistance).strength((l) => f.link / Math.max(1, Math.min(l.source.linkCount, l.target.linkCount)));
    this.fCharge.strength(-(f.repel * 14 + 4));
    this.fX.strength(f.center * 0.08);
    this.fY.strength(f.center * 0.08);
  }

  private reheat(alpha: number) {
    if (this.sim.alpha() < alpha) this.sim.alpha(alpha);
    this.request();
  }

  private hot() { return this.sim.alpha() > this.sim.alphaMin() && this.visNodes.length > 0; }

  // ---------------------------------------------------------------- frame loop

  private request() {
    if (!this.raf && !this.destroyed) this.raf = requestAnimationFrame(this.frame);
  }

  private frame = () => {
    this.raf = 0;
    if (this.destroyed) return;
    let busy = false;

    const g = this.growth;
    if (g) {
      const next = g.order.slice(g.count, g.count + g.per);
      for (const n of next) {
        const nbs: SimNode[] = [];
        for (const id of this.adj.get(n.id) ?? []) if (g.revealed.has(id)) nbs.push(this.byId.get(id)!);
        const p = seedPosition(nbs, g.count ? [{ x: 0, y: 0 }] : [], Math.random, 8) ?? { x: 0, y: 0 };
        n.x = p.x; n.y = p.y; n.vx = 0; n.vy = 0;
        g.revealed.add(n.id);
      }
      g.count += next.length;
      const done = g.count >= g.order.length;
      if (done) { this.growth = null; this.setSim(this.nodes, this.links); }
      else this.setSim(g.order.slice(0, g.count), this.links.filter((l) => g.revealed.has(l.source.id) && g.revealed.has(l.target.id)));
      this.sim.alpha(Math.max(this.sim.alpha(), done ? 0.6 : 0.9));
      busy = true;
    }

    if (this.hot()) { this.sim.tick(); this.qt = null; busy = true; }

    const target = this.hoverId ? 1 : 0;
    // Moving straight from one hovered node to another swaps the highlight without a fade-out.
    if (this.hoverId && this.hoverId !== this.fadeId) this.fadeId = this.hoverId;
    if (this.fade !== target) {
      this.fade += (target - this.fade) * 0.22;
      if (Math.abs(target - this.fade) < 0.01) this.fade = target;
      busy = true;
    }
    if (this.fade === 0 && !this.hoverId) this.fadeId = null;

    if (this.zoomAnim) {
      const a = this.zoomAnim;
      const p = Math.min(1, (performance.now() - a.start) / a.dur);
      const e = ease(p);
      this.t = { k: a.from.k + (a.to.k - a.from.k) * e, x: a.from.x + (a.to.x - a.from.x) * e, y: a.from.y + (a.to.y - a.from.y) * e };
      if (p >= 1) this.zoomAnim = null; else busy = true;
    } else if (this.autoFit && this.w > 0) {
      const to = this.fitTarget();
      const d = Math.abs(to.k - this.t.k) / to.k + (Math.abs(to.x - this.t.x) + Math.abs(to.y - this.t.y)) / Math.max(this.w, 1);
      if (d > 0.002) {
        const s = this.growth ? 0.25 : 0.12;
        this.t = { k: this.t.k + (to.k - this.t.k) * s, x: this.t.x + (to.x - this.t.x) * s, y: this.t.y + (to.y - this.t.y) * s };
        busy = true;
      } else if (!busy) this.autoFit = false; // layout settled and view converged
    }

    this.draw();
    if (busy) this.request();
  };

  private animateTo(to: Transform) {
    this.zoomAnim = { from: { ...this.t }, to, start: performance.now(), dur: 380 };
    this.request();
  }

  private bounds(): Bounds | null {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const n of this.visNodes) {
      if (!finite(n)) continue;
      minX = Math.min(minX, n.x! - n.r); maxX = Math.max(maxX, n.x! + n.r);
      minY = Math.min(minY, n.y! - n.r); maxY = Math.max(maxY, n.y! + n.r + 14);
    }
    return Number.isFinite(minX) ? { minX, minY, maxX, maxY } : null;
  }

  private fitTarget(): Transform {
    const top = this.opts.insetTop ?? 0;
    const right = this.w - this.insetRight > 240 ? this.insetRight : 0;
    const t = fitTransform(this.bounds(), this.w - right, this.h - top, this.opts.padding ?? 40, K_MIN, this.opts.fitMaxZoom ?? 2);
    return { ...t, y: t.y + top };
  }

  // ---------------------------------------------------------------- drawing

  private draw() {
    const { ctx, dpr, t, theme, display } = this;
    const { w, h } = this;
    if (!w || !h) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    ctx.setTransform(dpr * t.k, 0, 0, dpr * t.k, dpr * t.x, dpr * t.y);
    const k = t.k;
    const pad = this.maxR + 4;
    const vx0 = -t.x / k - pad, vy0 = -t.y / k - pad, vx1 = (w - t.x) / k + pad, vy1 = (h - t.y) / k + pad;
    const inView = (x: number, y: number) => x >= vx0 && x <= vx1 && y >= vy0 && y <= vy1;

    const fadeId = this.fadeId;
    const f = fadeId ? this.fade : 0;
    const hl = fadeId && f > 0 ? this.adj.get(fadeId) ?? new Set<string>() : null;
    const isHl = (id: string) => id === fadeId || !!hl?.has(id);
    const dim = 1 - 0.82 * f;

    // ---- links
    const lw = display.linkThickness * Math.max(1, 0.6 / k);
    const arrows = display.arrows && k > 0.2;
    const base = new Path2D();
    const hot = new Path2D();
    const baseHeads = arrows ? new Path2D() : null;
    const hotHeads = arrows ? new Path2D() : null;
    const head = Math.max(lw * 3.2, 5 / k);
    for (const l of this.visLinks) {
      const s = l.source, tg = l.target;
      if (!finite(s) || !finite(tg)) continue;
      const sx = s.x!, sy = s.y!, tx = tg.x!, ty = tg.y!;
      if (Math.max(sx, tx) < vx0 || Math.min(sx, tx) > vx1 || Math.max(sy, ty) < vy0 || Math.min(sy, ty) > vy1) continue;
      const lit = fadeId !== null && f > 0 && (s.id === fadeId || tg.id === fadeId);
      const p = lit ? hot : base;
      p.moveTo(sx, sy);
      p.lineTo(tx, ty);
      if (arrows && l.kind !== 'tag') {
        const dx = tx - sx, dy = ty - sy;
        const len = Math.hypot(dx, dy);
        if (len > tg.r + head * 1.5) {
          const ux = dx / len, uy = dy / len;
          const ax = tx - ux * (tg.r + 1), ay = ty - uy * (tg.r + 1);
          const bx = ax - ux * head, by = ay - uy * head;
          const hp = (lit ? hotHeads : baseHeads)!;
          hp.moveTo(ax, ay);
          hp.lineTo(bx - uy * head * 0.5, by + ux * head * 0.5);
          hp.lineTo(bx + uy * head * 0.5, by - ux * head * 0.5);
          hp.closePath();
        }
      }
    }
    ctx.lineWidth = lw;
    ctx.strokeStyle = theme.link;
    ctx.fillStyle = theme.link;
    ctx.globalAlpha = hl ? dim : 1;
    ctx.stroke(base);
    if (baseHeads) ctx.fill(baseHeads);
    if (hl) {
      ctx.globalAlpha = 1;
      ctx.stroke(hot);
      if (hotHeads) ctx.fill(hotHeads);
      ctx.globalAlpha = f;
      ctx.strokeStyle = theme.linkHighlight;
      ctx.fillStyle = theme.linkHighlight;
      ctx.lineWidth = lw * 1.4;
      ctx.stroke(hot);
      if (hotHeads) ctx.fill(hotHeads);
    }

    // ---- nodes
    const ring = 2 / k;
    for (const n of this.visNodes) {
      if (!finite(n) || !inView(n.x!, n.y!)) continue;
      const x = n.x!, y = n.y!;
      const a = hl && !isHl(n.id) ? dim : 1;
      const type = n.data.type;
      const color = n.color ?? (type === 'tag' ? theme.tag : type === 'unresolved' ? theme.unresolved : type === 'attachment' ? theme.attachment : theme.note);
      if (type === 'unresolved') {
        ctx.globalAlpha = a * 0.75;
        ctx.lineWidth = Math.max(1.2, n.r * 0.3);
        ctx.strokeStyle = color;
        ctx.beginPath();
        ctx.arc(x, y, n.r - ctx.lineWidth / 2, 0, Math.PI * 2);
        ctx.stroke();
      } else {
        ctx.globalAlpha = a;
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(x, y, n.r, 0, Math.PI * 2);
        ctx.fill();
      }
      if (n.id === fadeId && f > 0) {
        ctx.globalAlpha = f;
        ctx.fillStyle = theme.accent;
        ctx.beginPath();
        ctx.arc(x, y, n.r, 0, Math.PI * 2);
        ctx.fill();
      }
      if (n.id === this.activeId) {
        ctx.globalAlpha = 1;
        ctx.strokeStyle = theme.accent;
        ctx.lineWidth = ring;
        ctx.beginPath();
        ctx.arc(x, y, n.r + 3 / k + ring / 2, 0, Math.PI * 2);
        ctx.stroke();
      }
    }

    // ---- labels
    const la = labelAlpha(k, display.textFade);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    if (la > 0.02) {
      // Labels grow with zoom up to ~12px on screen, then stay put (no giant text when zoomed in).
      ctx.font = `${Math.min(11, 12 / k)}px ${FONT}`;
      ctx.fillStyle = theme.text;
      for (const n of this.visNodes) {
        if (!finite(n) || !inView(n.x!, n.y!)) continue;
        if ((hl && isHl(n.id)) || n.id === this.activeId) continue; // drawn emphasised below
        const a = la * (hl ? dim : 1);
        if (a < 0.03) continue;
        ctx.globalAlpha = a;
        ctx.fillText(truncate(n.data.label), n.x!, n.y! + n.r + 3);
      }
    }
    // Hovered node + neighbours (and the active note) always get a readable label.
    const emph: SimNode[] = [];
    if (hl && fadeId) { const c = this.byId.get(fadeId); if (c) emph.push(c); for (const id of hl) { const m = this.byId.get(id); if (m) emph.push(m); } }
    const active = this.activeId ? this.byId.get(this.activeId) : undefined;
    if (active && !emph.includes(active)) emph.push(active);
    if (emph.length) {
      const fs = 12.5 / k;
      ctx.lineJoin = 'round';
      ctx.lineWidth = 3 / k;
      ctx.strokeStyle = theme.labelHalo;
      const revealed = this.growth?.revealed;
      for (const n of emph) {
        if (!finite(n) || !inView(n.x!, n.y!) || (revealed && !revealed.has(n.id))) continue;
        const isCenter = n.id === fadeId;
        const a = n === active && !isHl(n.id) ? Math.max(la, 0.9) : Math.max(la * dim, f);
        if (a < 0.03) continue;
        ctx.globalAlpha = a;
        ctx.font = `${isCenter ? 600 : 400} ${fs}px ${FONT}`;
        const label = truncate(n.data.label);
        const ly = n.y! + n.r + 3 / k;
        ctx.strokeText(label, n.x!, ly);
        ctx.fillStyle = theme.text;
        ctx.fillText(label, n.x!, ly);
      }
    }
    ctx.globalAlpha = 1;
  }

  // ---------------------------------------------------------------- hit testing

  private toWorld(sx: number, sy: number) { return { x: (sx - this.t.x) / this.t.k, y: (sy - this.t.y) / this.t.k }; }

  private hit(sx: number, sy: number): SimNode | null {
    if (!this.visNodes.length) return null;
    if (!this.qt) this.qt = quadtree<SimNode>(this.visNodes.filter(finite), (d) => d.x!, (d) => d.y!);
    const { x, y } = this.toWorld(sx, sy);
    const tol = 4 / this.t.k;
    const reach = this.maxR + tol;
    let best: SimNode | null = null;
    let bestD = Infinity;
    this.qt.visit((node, x0, y0, x1, y1) => {
      if (x0 > x + reach || x1 < x - reach || y0 > y + reach || y1 < y - reach) return true;
      const q = node as QNode;
      if (!q.length) {
        for (let leaf: QNode | undefined = q; leaf; leaf = leaf.next) {
          const d = leaf.data!;
          const dist = Math.hypot(d.x! - x, d.y! - y) - d.r;
          if (dist <= tol && dist < bestD) { best = d; bestD = dist; }
        }
      }
      return false;
    });
    return best;
  }

  private setHover(id: string | null) {
    if (id === this.hoverId) return;
    this.hoverId = id;
    this.request();
  }

  private updateCursor() {
    this.canvas.style.cursor = this.down && !this.down.node && this.down.moved ? 'grabbing' : this.down?.node ? 'grabbing' : this.hoverId ? 'pointer' : 'default';
  }

  // ---------------------------------------------------------------- pointer & wheel

  private local(e: { clientX: number; clientY: number }) {
    const r = this.canvas.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  private onPointerDown = (e: PointerEvent) => {
    if (e.button === 2) return;
    if (e.button === 1) e.preventDefault(); // no autoscroll on middle-click
    const p = this.local(e);
    try { this.canvas.setPointerCapture(e.pointerId); } catch { /* synthetic pointer */ }
    this.pointers.set(e.pointerId, p);
    this.zoomAnim = null;
    if (this.pointers.size === 2) {
      // Second finger: switch to pinch-zoom, abandon any drag.
      this.releaseDrag();
      const [a, b] = [...this.pointers.values()];
      this.pinch = { dist: Math.hypot(a.x - b.x, a.y - b.y), midX: (a.x + b.x) / 2, midY: (a.y + b.y) / 2 };
      return;
    }
    const node = this.hit(p.x, p.y);
    const w = this.toWorld(p.x, p.y);
    this.down = {
      x: p.x, y: p.y, lastX: p.x, lastY: p.y, node, moved: false, newTab: e.metaKey || e.ctrlKey || e.button === 1,
      offX: node ? node.x! - w.x : 0, offY: node ? node.y! - w.y : 0,
    };
    this.updateCursor();
  };

  private onPointerMove = (e: PointerEvent) => {
    const p = this.local(e);
    if (this.pointers.has(e.pointerId)) this.pointers.set(e.pointerId, p);
    if (this.pinch && this.pointers.size === 2) {
      const [a, b] = [...this.pointers.values()];
      const dist = Math.hypot(a.x - b.x, a.y - b.y);
      const midX = (a.x + b.x) / 2, midY = (a.y + b.y) / 2;
      this.autoFit = false;
      const z = zoomAt(this.t, midX, midY, dist / Math.max(1, this.pinch.dist), K_MIN, K_MAX);
      this.t = { k: z.k, x: z.x + midX - this.pinch.midX, y: z.y + midY - this.pinch.midY };
      this.pinch = { dist, midX, midY };
      this.request();
      return;
    }
    const d = this.down;
    if (d) {
      if (!d.moved && Math.hypot(p.x - d.x, p.y - d.y) > 3) {
        d.moved = true;
        this.autoFit = false;
        if (d.node) { d.node.fx = d.node.x; d.node.fy = d.node.y; this.sim.alphaTarget(0.25); this.reheat(0.3); }
        this.updateCursor();
      }
      if (d.moved) {
        if (d.node) {
          const w = this.toWorld(p.x, p.y);
          d.node.fx = w.x + d.offX;
          d.node.fy = w.y + d.offY;
          this.qt = null;
        } else {
          this.t = { ...this.t, x: this.t.x + p.x - d.lastX, y: this.t.y + p.y - d.lastY };
        }
        d.lastX = p.x; d.lastY = p.y;
        this.request();
      }
      return;
    }
    if (e.pointerType === 'touch') return;
    this.setHover(this.hit(p.x, p.y)?.id ?? null);
    this.updateCursor();
  };

  private onPointerUp = (e: PointerEvent) => {
    this.pointers.delete(e.pointerId);
    try { this.canvas.releasePointerCapture(e.pointerId); } catch { /* not captured */ }
    if (this.pinch) { if (this.pointers.size < 2) this.pinch = null; this.down = null; return; }
    const d = this.down;
    this.down = null;
    if (d?.node) {
      if (!d.moved && e.type === 'pointerup') this.opts.onOpen(d.node.data, { newTab: d.newTab || e.metaKey || e.ctrlKey });
      this.releaseNode(d.node);
    }
    this.updateCursor();
  };

  private onPointerLeave = (e: PointerEvent) => {
    if (!this.down && e.pointerType !== 'touch') this.setHover(null);
    this.updateCursor();
  };

  private releaseNode(n: SimNode) {
    n.fx = null;
    n.fy = null;
    this.sim.alphaTarget(0);
    this.request();
  }

  private releaseDrag() {
    if (this.down?.node) this.releaseNode(this.down.node);
    this.down = null;
  }

  private onWheel = (e: WheelEvent) => {
    e.preventDefault();
    const p = this.local(e);
    const dy = e.deltaY * (e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? this.h : 1);
    // Trackpad pinch arrives as ctrl+wheel with small deltas.
    const factor = Math.exp(-dy * (e.ctrlKey ? 0.012 : 0.0018));
    this.autoFit = false;
    this.zoomAnim = null;
    this.t = zoomAt(this.t, p.x, p.y, factor, K_MIN, K_MAX);
    this.request();
  };

  private onDblClick = (e: MouseEvent) => {
    const p = this.local(e);
    if (!this.hit(p.x, p.y)) this.zoomToFit();
  };
}
