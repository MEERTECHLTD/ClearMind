/**
 * Hermes-friendly drop-ins for d3's forceManyBody / forceCollide.
 *
 * d3's versions rebuild a d3-quadtree every tick; on Hermes (no JIT) that
 * costs ~10 ms per force per tick for only ~150 nodes, which makes the layout
 * crawl on phones. These use flat typed arrays instead:
 *  - manyBody: exact pairwise repulsion with d3's formula and distanceMax
 *    cut-off (O(n²) but tight; n is capped at ~600; above 300 nodes it runs
 *    on alternate ticks at double strength),
 *  - collide: uniform spatial grid, one pass, d3's overlap resolution.
 * Both implement d3's Force interface, so they plug into forceSimulation.
 */
import type { Force, SimulationNodeDatum } from 'd3-force';

type N = SimulationNodeDatum & { r: number };

export interface ManyBodyForce<T extends N> extends Force<T, never> {
  strength(s: number): ManyBodyForce<T>;
  distanceMax(d: number): ManyBodyForce<T>;
}

export function fastManyBody<T extends N>(): ManyBodyForce<T> {
  let nodes: T[] = [];
  let strength = -30;
  let dMax2 = Infinity;
  const dMin2 = 1;
  let random: () => number = Math.random;
  let xs = new Float64Array(0), ys = new Float64Array(0), vxs = new Float64Array(0), vys = new Float64Array(0);

  let flip = false;
  const force = ((alpha: number) => {
    const n = nodes.length;
    // Big graphs: apply on alternate ticks at double strength (same average impulse, half the cost).
    if (n > 300) { flip = !flip; if (flip) return; alpha *= 2; }
    if (xs.length < n) { xs = new Float64Array(n); ys = new Float64Array(n); vxs = new Float64Array(n); vys = new Float64Array(n); }
    for (let i = 0; i < n; i++) { xs[i] = nodes[i].x ?? 0; ys[i] = nodes[i].y ?? 0; vxs[i] = 0; vys[i] = 0; }
    const s = strength * alpha;
    for (let i = 0; i < n; i++) {
      const xi = xs[i], yi = ys[i];
      let ax = 0, ay = 0;
      for (let j = i + 1; j < n; j++) {
        let dx = xs[j] - xi, dy = ys[j] - yi;
        let l = dx * dx + dy * dy;
        if (l >= dMax2) continue;
        if (dx === 0) { dx = (random() - 0.5) * 1e-6; l += dx * dx; }
        if (dy === 0) { dy = (random() - 0.5) * 1e-6; l += dy * dy; }
        if (l < dMin2) l = Math.sqrt(dMin2 * l);
        const w = s / l;
        // Node i is pushed away from j (s < 0) and vice versa.
        ax += dx * w; ay += dy * w;
        vxs[j] -= dx * w; vys[j] -= dy * w;
      }
      vxs[i] += ax; vys[i] += ay;
    }
    for (let i = 0; i < n; i++) {
      const nd = nodes[i];
      nd.vx = (nd.vx ?? 0) + vxs[i];
      nd.vy = (nd.vy ?? 0) + vys[i];
    }
  }) as ManyBodyForce<T>;

  force.initialize = (ns: T[], rnd: () => number) => { nodes = ns; random = rnd; };
  force.strength = (v: number) => { strength = v; return force; };
  force.distanceMax = (v: number) => { dMax2 = v * v; return force; };
  return force;
}

/** One-pass grid collision (same response as d3.forceCollide with iterations=1). */
export function fastCollide<T extends N>(pad = 2, strength = 0.6): Force<T, never> {
  let nodes: T[] = [];
  let random: () => number = Math.random;
  const force = ((_alpha: number) => {
    const n = nodes.length;
    if (n < 2) return;
    let maxR = 0;
    for (let i = 0; i < n; i++) if (nodes[i].r + pad > maxR) maxR = nodes[i].r + pad;
    const cell = maxR * 2;
    const grid = new Map<number, number[]>();
    const px = new Float64Array(n), py = new Float64Array(n), cx = new Int32Array(n), cy = new Int32Array(n);
    for (let i = 0; i < n; i++) {
      const nd = nodes[i];
      // Predicted positions, like d3.
      px[i] = (nd.x ?? 0) + (nd.vx ?? 0);
      py[i] = (nd.y ?? 0) + (nd.vy ?? 0);
      cx[i] = Math.floor(px[i] / cell);
      cy[i] = Math.floor(py[i] / cell);
      const key = (cx[i] + 32768) * 65536 + (cy[i] + 32768);
      const b = grid.get(key);
      if (b) b.push(i); else grid.set(key, [i]);
    }
    for (let i = 0; i < n; i++) {
      const a = nodes[i];
      const ri = a.r + pad;
      for (let gx = cx[i] - 1; gx <= cx[i] + 1; gx++) {
        for (let gy = cy[i] - 1; gy <= cy[i] + 1; gy++) {
          const b = grid.get((gx + 32768) * 65536 + (gy + 32768));
          if (!b) continue;
          for (let k = 0; k < b.length; k++) {
            const j = b[k];
            if (j <= i) continue;
            const o = nodes[j];
            const rj = o.r + pad;
            const r = ri + rj;
            let x = px[i] - px[j], y = py[i] - py[j];
            let l = x * x + y * y;
            if (l >= r * r) continue;
            if (x === 0) { x = (random() - 0.5) * 1e-6; l += x * x; }
            if (y === 0) { y = (random() - 0.5) * 1e-6; l += y * y; }
            l = Math.sqrt(l);
            l = ((r - l) / l) * strength;
            const ri2 = ri * ri, rj2 = rj * rj;
            const w = rj2 / (ri2 + rj2);
            x *= l; y *= l;
            a.vx = (a.vx ?? 0) + x * w; a.vy = (a.vy ?? 0) + y * w;
            o.vx = (o.vx ?? 0) - x * (1 - w); o.vy = (o.vy ?? 0) - y * (1 - w);
          }
        }
      }
    }
  }) as Force<T, never>;
  force.initialize = (ns: T[], rnd: () => number) => { nodes = ns; random = rnd; };
  return force;
}
