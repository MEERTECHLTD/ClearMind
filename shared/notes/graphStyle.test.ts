import { describe, it, expect } from 'vitest';
import type { Note } from '../types';
import { buildIndex, buildGraph } from './vault';
import {
  DEFAULT_GRAPH_SETTINGS, mergeGraphSettings, groupColors, nodeRadius, labelAlpha, fitTransform, zoomAt,
  seedPosition, hopDistances, withoutNeighborLinks, growthOrder,
} from './graphStyle';

let seq = 0;
const note = (title: string, content: string, extra: Partial<Note> = {}): Note =>
  ({ id: `g${++seq}`, title, content, tags: [], lastEdited: '2026-10-01T00:00:00Z', createdAt: `2026-01-01T00:00:${String(seq).padStart(2, '0')}Z`, ...extra });

describe('mergeGraphSettings', () => {
  it('returns defaults for garbage', () => {
    expect(mergeGraphSettings(null)).toEqual(DEFAULT_GRAPH_SETTINGS);
    expect(mergeGraphSettings('nope')).toEqual(DEFAULT_GRAPH_SETTINGS);
    expect(mergeGraphSettings([1, 2])).toEqual(DEFAULT_GRAPH_SETTINGS);
  });
  it('keeps valid values, drops wrong types, clamps ranges', () => {
    const s = mergeGraphSettings({
      filters: { query: 'tag:#x', showTags: true, showOrphans: 'yes', extra: 1 },
      display: { nodeSize: 99, textFade: -10, arrows: true, linkThickness: Number.NaN },
      forces: { repel: 5, linkDistance: 1 },
      local: { depth: 2.6, neighborLinks: false },
    });
    expect(s.filters).toEqual({ ...DEFAULT_GRAPH_SETTINGS.filters, query: 'tag:#x', showTags: true });
    expect(s.display).toEqual({ arrows: true, textFade: -3, nodeSize: 3, linkThickness: 1 });
    expect(s.forces).toEqual({ ...DEFAULT_GRAPH_SETTINGS.forces, repel: 5, linkDistance: 20 });
    expect(s.local).toEqual({ depth: 3, showTags: false, neighborLinks: false });
    expect(s.open).toEqual(DEFAULT_GRAPH_SETTINGS.open);
  });
  it('does not share references with the defaults', () => {
    const s = mergeGraphSettings({});
    s.filters.showTags = true;
    expect(DEFAULT_GRAPH_SETTINGS.filters.showTags).toBe(false);
  });
});

describe('groupColors', () => {
  const a = note('Alpha', 'Links [[Beta]] #project/web');
  const b = note('Beta', 'about cats #idea', { folder: 'Zoo' });
  const c = note('Gamma', 'see [[Missing Page]] #project');
  const index = buildIndex([a, b, c]);
  const graph = buildGraph(index, { showTags: true, showUnresolved: true });

  it('colours notes via search, first group wins', () => {
    const m = groupColors(index, graph.nodes, [
      { query: 'path:zoo', color: 'red' },
      { query: 'cats', color: 'blue' },
      { query: 'tag:#project', color: 'green' },
    ]);
    expect(m.get(b.id)).toBe('red');
    expect(m.get(a.id)).toBe('green');
    expect(m.get(c.id)).toBe('green');
  });
  it('matches tag nodes with tag: queries (nested) and unresolved nodes by name', () => {
    const m = groupColors(index, graph.nodes, [{ query: 'tag:#project', color: 'green' }, { query: 'missing', color: 'grey' }]);
    expect(m.get('tag:project')).toBe('green');
    expect(m.get('tag:project/web')).toBe('green');
    expect(m.get('tag:idea')).toBeUndefined();
    expect(m.get('unresolved:missing page')).toBe('grey');
  });
  it('ignores empty groups', () => {
    expect(groupColors(index, graph.nodes, [{ query: '  ', color: 'red' }]).size).toBe(0);
  });
});

describe('sizing, fading & view maths', () => {
  it('grows radius with sqrt(degree)', () => {
    expect(nodeRadius(0)).toBeLessThan(nodeRadius(4));
    expect(nodeRadius(16) - nodeRadius(0)).toBeCloseTo(2 * (nodeRadius(4) - nodeRadius(0)));
    expect(nodeRadius(4, 2)).toBeCloseTo(2 * nodeRadius(4));
  });
  it('fades labels in with zoom, threshold shifts it', () => {
    expect(labelAlpha(0.2)).toBe(0);
    expect(labelAlpha(3)).toBe(1);
    expect(labelAlpha(0.8, 2)).toBeGreaterThan(labelAlpha(0.8, 0));
  });
  it('fits bounds into the viewport and zooms about a point', () => {
    const t = fitTransform({ minX: -100, minY: -50, maxX: 100, maxY: 50 }, 440, 440, 20);
    expect(t.k).toBeCloseTo(2);
    expect(t.x).toBeCloseTo(220);
    expect(t.y).toBeCloseTo(220);
    const z = zoomAt({ k: 1, x: 0, y: 0 }, 100, 100, 2);
    expect(z).toEqual({ k: 2, x: -100, y: -100 });
    // The world point under the cursor stays put.
    expect((100 - z.x) / z.k).toBeCloseTo(100);
  });
});

describe('positions & local graph helpers', () => {
  it('seeds new nodes near their neighbours', () => {
    const p = seedPosition([{ x: 100, y: 100 }, { x: 120, y: 100 }], [], () => 0.5, 10);
    expect(p).not.toBeNull();
    expect(Math.hypot(p!.x - 110, p!.y - 100)).toBeLessThanOrEqual(10);
    expect(seedPosition([], [])).toBeNull();
    expect(seedPosition([{}], [{ x: 0, y: 0 }], () => 0)).not.toBeNull();
  });
  const g = {
    nodes: ['c', 'a', 'b', 'x'].map((id) => ({ id, label: id, type: 'note' as const, degree: 0 })),
    links: [{ source: 'c', target: 'a', kind: 'link' as const }, { source: 'c', target: 'b', kind: 'link' as const }, { source: 'a', target: 'b', kind: 'link' as const }],
  };
  it('computes hop distances and drops same-level links', () => {
    expect([...hopDistances(g, 'c')]).toEqual([['c', 0], ['a', 1], ['b', 1]]);
    expect(withoutNeighborLinks(g, 'c').links).toHaveLength(2);
  });
  it('orders growth breadth-first covering every node', () => {
    const order = growthOrder(g);
    expect(order).toHaveLength(4);
    expect(new Set(order).size).toBe(4);
    expect(order[order.length - 1]).toBe('x');
  });
});
