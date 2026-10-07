import { describe, it, expect } from 'vitest';
import type { Note, Attachment } from '../types';
import {
  parseCanvas, serializeCanvas, nodesInGroup, autoSides, canvasLinks, canvasText, canvasColor,
  buildIndex, linkedMentions, rewriteLinksForRename, rewriteLinksForAttachmentRename, buildGraph, searchVault, attachmentKind, isFileTarget,
} from './index';
import { bytesToBase64, base64ToBytes } from '../data/attachments';

const note = (id: string, title: string, content: string, extra: Partial<Note> = {}): Note =>
  ({ id, title, content, tags: [], lastEdited: '2026-10-07T00:00:00Z', createdAt: `2026-01-01T00:00:0${id.length}Z`, ...extra });
const att = (id: string, name: string, extra: Partial<Attachment> = {}): Attachment =>
  ({ id, name, mime: name.endsWith('.png') ? 'image/png' : 'application/pdf', size: 10, chunks: 1, createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z', ...extra });

const CANVAS = JSON.stringify({
  nodes: [
    { id: 'g', type: 'group', x: 0, y: 0, width: 600, height: 400, label: 'Launch' },
    { id: 't', type: 'text', x: 20, y: 20, width: 200, height: 80, text: 'See [[Alpha|the alpha]] #idea', color: '4' },
    { id: 'f', type: 'file', x: 300, y: 20, width: 200, height: 200, file: 'Work/Beta.md', subpath: '#Intro' },
    { id: 'i', type: 'file', x: 700, y: 0, width: 200, height: 200, file: 'diagram.png' },
    { id: 'l', type: 'link', x: 700, y: 300, width: 200, height: 100, url: 'https://example.com' },
    { id: 'bad', type: 'nope', x: 0, y: 0 },
  ],
  edges: [
    { id: 'e1', fromNode: 't', fromSide: 'right', toNode: 'f', toSide: 'left', toEnd: 'arrow', label: 'explains' },
    { id: 'e2', fromNode: 't', toNode: 'missing' },
  ],
});

describe('canvas', () => {
  it('parses tolerantly and round-trips', () => {
    const c = parseCanvas(CANVAS);
    expect(c.nodes.map((n) => n.id)).toEqual(['g', 't', 'f', 'i', 'l']);
    expect(c.edges.map((e) => e.id)).toEqual(['e1']);
    expect(parseCanvas(serializeCanvas(c))).toEqual(c);
    expect(parseCanvas('not json')).toEqual({ nodes: [], edges: [] });
    expect(parseCanvas('')).toEqual({ nodes: [], edges: [] });
  });
  it('groups, sides, colours, links, text', () => {
    const c = parseCanvas(CANVAS);
    expect(nodesInGroup(c, 'g').map((n) => n.id).sort()).toEqual(['f', 't']);
    expect(autoSides({ x: 0, y: 0, width: 10, height: 10 }, { x: 100, y: 0, width: 10, height: 10 })).toEqual(['right', 'left']);
    expect(autoSides({ x: 0, y: 0, width: 10, height: 10 }, { x: 0, y: -100, width: 10, height: 10 })).toEqual(['top', 'bottom']);
    expect(canvasColor('4')).toBe('#08b94e');
    expect(canvasColor('#abc')).toBe('#abc');
    expect(canvasColor('nope')).toBeNull();
    expect(canvasLinks(CANVAS).map((l) => [l.target, l.heading, l.embed])).toEqual([['Alpha', undefined, false], ['Work/Beta', 'Intro', true], ['diagram.png', undefined, true]]);
    expect(canvasText(CANVAS)).toContain('See [[Alpha|the alpha]] #idea');
  });
});

describe('vault with canvases and attachments', () => {
  const alpha = note('a', 'Alpha', 'Pic: ![[diagram.png]] and [[spec.pdf|the spec]]');
  const beta = note('bb', 'Beta', '# Intro', { folder: 'Work' });
  const board = note('ccc', 'Board', CANVAS, { kind: 'canvas' });
  const idx = buildIndex([alpha, beta, board], [att('p1', 'diagram.png'), att('p2', 'spec.pdf', { folder: 'Docs' }), att('gone', 'x.png', { deleted: true })]);

  it('resolves attachments and canvas links into backlinks', () => {
    expect(idx.resolveAttachment('diagram.png')?.id).toBe('p1');
    expect(idx.resolveAttachment('Docs/spec.pdf')?.id).toBe('p2');
    expect(idx.resolveAttachment('x.png')).toBeNull();
    expect((idx.attachmentBacklinks.get('p1') ?? []).map((l) => l.from).sort()).toEqual(['a', 'ccc']);
    expect([...idx.unresolved.keys()]).toEqual([]);
    expect(linkedMentions(idx, 'a').map((g) => [g.note.title, g.mentions[0].text])).toEqual([['Board', 'Canvas card: the alpha']]);
    expect(idx.tagsOf.get('ccc')).toEqual(['idea']);
    expect(idx.folders).toEqual(['Docs', 'Work']);
    expect(attachmentKind({ name: 'a.png', mime: '' })).toBe('image');
    expect(attachmentKind({ name: 'a.mp3', mime: 'audio/mpeg' })).toBe('audio');
    expect(isFileTarget('v1.2')).toBe(true);
    expect(isFileTarget('Note.md')).toBe(false);
  });

  it('graph includes canvases and (optionally) attachments', () => {
    const g = buildGraph(idx, { showAttachments: true });
    expect(g.nodes.map((n) => n.label).sort()).toEqual(['Alpha', 'Beta', 'Board', 'diagram.png', 'spec.pdf']);
    expect(buildGraph(idx).nodes.some((n) => n.type === 'attachment')).toBe(false);
    expect(buildGraph(idx, { showCanvases: false }).nodes.map((n) => n.label).sort()).toEqual(['Alpha', 'Beta']);
  });

  it('search uses canvas card text, not raw JSON', () => {
    expect(searchVault(idx, '"the alpha"').map((h) => h.note.title)).toEqual(['Board']);
    expect(searchVault(idx, 'fromNode').length).toBe(0);
  });

  it('renames rewrite links inside canvases (file nodes + text cards) and to attachments', () => {
    const ch = rewriteLinksForRename(idx, 'bb', { title: 'Bravo', folder: 'Work' });
    expect(parseCanvas(ch.get('ccc')!).nodes.find((n) => n.id === 'f')).toMatchObject({ file: 'Work/Bravo.md', subpath: '#Intro' });
    const ch2 = rewriteLinksForRename(idx, 'a', { title: 'Alef' });
    expect((parseCanvas(ch2.get('ccc')!).nodes.find((n) => n.id === 't') as any).text).toBe('See [[Alef|the alpha]] #idea');
    const ch3 = rewriteLinksForAttachmentRename(idx, 'p1', { name: 'arch.png' });
    expect(ch3.get('a')).toBe('Pic: ![[arch.png]] and [[spec.pdf|the spec]]');
    expect((parseCanvas(ch3.get('ccc')!).nodes.find((n) => n.id === 'i') as any).file).toBe('arch.png');
  });

  it('base64 chunks round-trip binary data', () => {
    const bytes = new Uint8Array(100_000).map((_, i) => (i * 31) & 255);
    expect(base64ToBytes(bytesToBase64(bytes))).toEqual(bytes);
  });
});
