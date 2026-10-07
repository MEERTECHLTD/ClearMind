import { describe, it, expect } from 'vitest';
import type { CanvasData } from '../../../shared/notes/canvas';
import {
  zoomAt, screenToWorld, worldToScreen, fitRect, nodeAt, nodesInRect, normRect, snapDelta, dragSet, moveNodes, moveFrom, resizeRect,
  historyReducer, initHistory, reconnectEdge, addEdge, flipEdge, setArrowMode, arrowMode, parsePaste, clipboardFor, insertClip, duplicate,
  deleteItems, isBrokenCanvas, alignNodes, distributeNodes, nearestSide, sideFacing, rectForDrop, edgeGeometry, arrowHead, freeSpot, drawOrder, fileNodePath, urlParts,
} from './model';

const data = (): CanvasData => ({
  nodes: [
    { id: 'g', type: 'group', x: 0, y: 0, width: 500, height: 400, label: 'G' },
    { id: 'a', type: 'text', x: 20, y: 20, width: 100, height: 50, text: 'A' },
    { id: 'b', type: 'text', x: 300, y: 20, width: 100, height: 50, text: 'B' },
    { id: 'c', type: 'text', x: 800, y: 20, width: 100, height: 50, text: 'C' },
  ],
  edges: [{ id: 'e1', fromNode: 'a', toNode: 'b' }, { id: 'e2', fromNode: 'b', toNode: 'c', label: 'x' }],
});
let n = 0;
const ids = () => `n${++n}`;

describe('viewport', () => {
  it('zooms around a fixed screen point and round-trips coordinates', () => {
    const v = { x: 10, y: 20, zoom: 1 };
    const at = { x: 200, y: 150 };
    const before = screenToWorld(v, at);
    const z = zoomAt(v, 2, at);
    expect(z.zoom).toBe(2);
    expect(screenToWorld(z, at)).toEqual(before);
    expect(worldToScreen(z, screenToWorld(z, { x: 5, y: 7 }))).toEqual({ x: 5, y: 7 });
  });
  it('clamps zoom and fits a rect into the board', () => {
    expect(zoomAt({ x: 0, y: 0, zoom: 1 }, 100, { x: 0, y: 0 }).zoom).toBe(3);
    const v = fitRect({ x: 0, y: 0, width: 1000, height: 500 }, 600, 400, 50);
    expect(v.zoom).toBeCloseTo(0.5);
    expect(worldToScreen(v, { x: 500, y: 250 })).toEqual({ x: 300, y: 200 });
  });
});

describe('hit testing & selection', () => {
  it('prefers cards over groups, smallest group otherwise', () => {
    const d = data();
    expect(nodeAt(d.nodes, { x: 30, y: 30 })?.id).toBe('a');
    expect(nodeAt(d.nodes, { x: 200, y: 200 })?.id).toBe('g');
    expect(nodeAt(d.nodes, { x: 30, y: 30 }, new Set(['a']))?.id).toBe('g');
    expect(nodeAt(d.nodes, { x: 700, y: 700 })).toBeNull();
  });
  it('rubber band selects intersecting cards and contained groups', () => {
    const d = data();
    expect(nodesInRect(d.nodes, normRect({ x: 350, y: 100 }, { x: 50, y: 30 })).sort()).toEqual(['a', 'b']);
    expect(nodesInRect(d.nodes, { x: -10, y: -10, width: 600, height: 500 }).sort()).toEqual(['a', 'b', 'g']);
  });
  it('draws groups (largest first) before cards', () => {
    const { groups, cards } = drawOrder(data().nodes);
    expect(groups.map((g) => g.id)).toEqual(['g']);
    expect(cards.map((c) => c.id)).toEqual(['a', 'b', 'c']);
  });
});

describe('moving, snapping, resizing', () => {
  it('drags a group with its contents', () => {
    const d = data();
    const set = dragSet(d, ['g']);
    expect([...set].sort()).toEqual(['a', 'b', 'g']);
    const m = moveNodes(d, set, 10, 5);
    expect(m.nodes.find((x) => x.id === 'a')).toMatchObject({ x: 30, y: 25 });
    expect(m.nodes.find((x) => x.id === 'c')).toMatchObject({ x: 800, y: 20 });
    expect(moveFrom(d, m, new Set(['a']), 1, 1).nodes.find((x) => x.id === 'a')).toMatchObject({ x: 21, y: 21 });
  });
  it('snaps the delta so the primary lands on the grid', () => {
    expect(snapDelta({ x: 13, y: 7 }, 10, 10, 20)).toEqual({ x: 7, y: 13 });
  });
  it('resizes from any handle with a minimum size', () => {
    const r = { x: 0, y: 0, width: 100, height: 100 };
    expect(resizeRect(r, 'se', 20, 30)).toEqual({ x: 0, y: 0, width: 120, height: 130 });
    expect(resizeRect(r, 'nw', 20, 30)).toEqual({ x: 20, y: 30, width: 80, height: 70 });
    expect(resizeRect(r, 'w', 90, 0, { min: { width: 60, height: 40 } })).toEqual({ x: 40, y: 0, width: 60, height: 100 });
    expect(resizeRect(r, 'e', 13, 0, { grid: 20 })).toEqual({ x: 0, y: 0, width: 120, height: 100 });
  });
  it('finds a free spot when the centre is taken', () => {
    const d = data();
    const r = freeSpot(d.nodes, { x: 70, y: 45 }, 100, 50);
    expect(r.x === 20 && r.y === 20).toBe(false);
  });
});

describe('history', () => {
  it('records, undoes and redoes; transient steps commit once', () => {
    const d0 = data();
    let h = initHistory(d0);
    const d1 = moveNodes(d0, new Set(['a']), 5, 0);
    h = historyReducer(h, { type: 'apply', data: d1 });
    expect(h.past.length).toBe(1);
    h = historyReducer(h, { type: 'undo' });
    expect(h.present).toBe(d0);
    h = historyReducer(h, { type: 'redo' });
    expect(h.present).toBe(d1);
    // a drag: two transient frames + commit = one step
    const f1 = moveNodes(d1, new Set(['b']), 1, 0);
    const f2 = moveNodes(f1, new Set(['b']), 1, 0);
    h = historyReducer(h, { type: 'apply', data: f1, record: false });
    h = historyReducer(h, { type: 'apply', data: f2, record: false });
    h = historyReducer(h, { type: 'commit', before: d1 });
    expect(h.past.length).toBe(2);
    h = historyReducer(h, { type: 'undo' });
    expect(h.present).toBe(d1);
    // a no-op gesture doesn't add a step
    expect(historyReducer(h, { type: 'commit', before: { ...h.present } }).past.length).toBe(h.past.length);
    expect(historyReducer(h, { type: 'reset', data: d0 })).toEqual({ past: [], present: d0, future: [] });
  });
});

describe('edges', () => {
  it('adds edges without self-loops or duplicates', () => {
    const d = data();
    expect(addEdge(d, 'a', 'right', 'a', 'left').id).toBeNull();
    const r = addEdge(d, 'a', 'right', 'c', 'left', 'e3');
    expect(r.data.edges.at(-1)).toEqual({ id: 'e3', fromNode: 'a', toNode: 'c', fromSide: 'right', toSide: 'left' });
    expect(addEdge(r.data, 'a', 'right', 'c', 'left').id).toBeNull();
  });
  it('reconnects an end, refusing self-loops', () => {
    const d = data();
    const r = reconnectEdge(d, 'e1', 'to', 'c', 'top');
    expect(r.edges[0]).toMatchObject({ fromNode: 'a', toNode: 'c', toSide: 'top' });
    expect(reconnectEdge(d, 'e1', 'to', 'a')).toBe(d);
    expect(reconnectEdge(d, 'e1', 'from', 'c').edges[0]).toMatchObject({ fromNode: 'c', toNode: 'b' });
  });
  it('flips and toggles arrows', () => {
    const e = { id: 'e', fromNode: 'a', toNode: 'b', fromSide: 'right' as const, toSide: 'left' as const };
    expect(flipEdge(e)).toEqual({ id: 'e', fromNode: 'b', toNode: 'a', fromSide: 'left', toSide: 'right' });
    expect(arrowMode(e)).toBe('forward');
    expect(arrowMode(setArrowMode(e, 'both'))).toBe('both');
    expect(setArrowMode(e, 'none')).toMatchObject({ toEnd: 'none' });
  });
  it('computes sides, drop placement and geometry', () => {
    const r = { x: 0, y: 0, width: 100, height: 50 };
    expect(nearestSide(r, { x: 110, y: 20 })).toBe('right');
    expect(sideFacing({ x: 0, y: 0 }, { x: 100, y: 10 })).toBe('left');
    expect(rectForDrop({ x: 300, y: 100 }, 'left', { width: 200, height: 60 })).toEqual({ x: 300, y: 70, width: 200, height: 60 });
    const g = edgeGeometry(r, { x: 300, y: 0, width: 100, height: 50 }, {});
    expect(g.fromSide).toBe('right');
    expect(g.toSide).toBe('left');
    expect(g.mid).toEqual({ x: 200, y: 25 });
    expect(arrowHead({ x: 0, y: 0 }, 'left', 10)).toBe('0,0 -10,-5 -10,5');
  });
});

describe('clipboard & duplicate', () => {
  it('round-trips the clipboard and pastes with fresh ids', () => {
    const d = data();
    const clip = clipboardFor(d, ['a', 'b'])!;
    const p = parsePaste(clip);
    expect(p?.kind).toBe('canvas');
    if (p?.kind !== 'canvas') return;
    expect(p.data.edges.map((e) => e.id)).toEqual(['e1']);
    const out = insertClip(d, p.data, { at: { x: 1000, y: 1000 } }, ids);
    expect(out.ids.length).toBe(2);
    const pasted = out.data.nodes.filter((x) => out.ids.includes(x.id));
    expect(pasted[0]).toMatchObject({ x: 1000, y: 1000, text: 'A' });
    expect(out.data.edges.at(-1)).toMatchObject({ fromNode: out.ids[0], toNode: out.ids[1] });
  });
  it('classifies pasted text', () => {
    expect(parsePaste('https://example.com/a?b=1')).toEqual({ kind: 'url', url: 'https://example.com/a?b=1' });
    expect(parsePaste('www.example.org')).toEqual({ kind: 'url', url: 'https://www.example.org' });
    expect(parsePaste('hello world')).toEqual({ kind: 'text', text: 'hello world' });
    expect(parsePaste('{not json')).toEqual({ kind: 'text', text: '{not json' });
    expect(parsePaste('   ')).toBeNull();
  });
  it('duplicates a group with its contents and inner edges', () => {
    const d = data();
    const out = duplicate(d, ['g'], ids);
    expect(out.ids.length).toBe(3);
    expect(out.data.edges.length).toBe(3);
  });
  it('deletes nodes with their edges', () => {
    const out = deleteItems(data(), ['b']);
    expect(out.nodes.map((x) => x.id)).toEqual(['g', 'a', 'c']);
    expect(out.edges).toEqual([]);
    expect(deleteItems(data(), [], ['e2']).edges.map((e) => e.id)).toEqual(['e1']);
  });
});

describe('align & distribute', () => {
  it('aligns and distributes', () => {
    const d = data();
    const al = alignNodes(d, ['a', 'c'], 'right');
    expect(al.nodes.find((x) => x.id === 'a')!.x).toBe(800);
    const ds = distributeNodes({ ...d, nodes: d.nodes.map((x) => (x.id === 'b' ? { ...x, x: 150 } : x)) }, ['a', 'b', 'c'], 'h');
    expect(ds.nodes.find((x) => x.id === 'b')!.x).toBe(410);
  });
});

describe('misc', () => {
  it('detects unreadable canvas content', () => {
    expect(isBrokenCanvas('')).toBe(false);
    expect(isBrokenCanvas('{"nodes":[]}')).toBe(false);
    expect(isBrokenCanvas('# just markdown')).toBe(true);
    expect(isBrokenCanvas('[1,2]')).toBe(true);
  });
  it('builds file paths and url parts', () => {
    expect(fileNodePath({ title: 'Beta', folder: 'Work' })).toBe('Work/Beta.md');
    expect(fileNodePath({ title: 'Beta' })).toBe('Beta.md');
    expect(urlParts('https://www.example.com/docs/')).toEqual({ host: 'example.com', path: '/docs' });
  });
});
