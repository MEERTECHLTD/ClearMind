import { describe, it, expect } from 'vitest';
import {
  uniqueName, namesInFolder, validateSize, formatBytes, planEviction, attachmentFolderFor, uploadName, linkTargetFor, embedText,
  parseEmbedSize, guessMime, sanitizeFileName, isValidFileName, attachmentMatches, ATTACHMENT_MAX_BYTES,
} from './attachmentUtils';
import { parseSearch } from '../../shared/notes';

describe('attachment naming', () => {
  it('makes names unique per folder, Obsidian style', () => {
    expect(uniqueName('pic.png', [])).toBe('pic.png');
    expect(uniqueName('pic.png', ['PIC.png'])).toBe('pic 1.png');
    expect(uniqueName('pic.png', ['pic.png', 'pic 1.png'])).toBe('pic 2.png');
    expect(uniqueName('pic 1.png', ['pic 1.png'])).toBe('pic 2.png');
    expect(uniqueName('README', ['README'])).toBe('README 1');
    const all = [{ name: 'a.png', folder: 'X' }, { name: 'b.png', folder: null }, { name: 'c.png', folder: 'X', deleted: true }];
    expect(namesInFolder(all, 'X')).toEqual(['a.png']);
    expect(namesInFolder(all, '')).toEqual(['b.png']);
  });
  it('names pasted files and sanitises', () => {
    const now = new Date(2026, 9, 7, 14, 30, 5);
    expect(uploadName({ name: 'image.png', type: 'image/png' }, now, true)).toBe('Pasted image 20261007143005.png');
    expect(uploadName({ name: 'image.png', type: 'image/png' }, now, false)).toBe('image.png');
    expect(uploadName({ name: '', type: 'application/pdf' }, now)).toBe('Pasted file 20261007143005.pdf');
    expect(uploadName({ name: 'a/b:c#d.pdf' }, now)).toBe('a-b-c-d.pdf');
    expect(sanitizeFileName('   ')).toBe('file');
    expect(isValidFileName('ok.png')).toBe(true);
    expect(isValidFileName('no/slash.png')).toBe(false);
    expect(guessMime('x.PDF')).toBe('application/pdf');
    expect(guessMime('x.bin', '')).toBe('application/octet-stream');
    expect(guessMime('x.png', 'image/png')).toBe('image/png');
  });
  it('link targets, embed text, sizes', () => {
    const all = [{ id: '1', name: 'a.png', folder: 'X' }, { id: '2', name: 'a.png', folder: 'Y' }, { id: '3', name: 'b.png', folder: 'X' }];
    expect(linkTargetFor(all[0], all)).toBe('X/a.png');
    expect(linkTargetFor(all[2], all)).toBe('b.png');
    expect(embedText(['a.png', 'b.pdf'])).toBe('![[a.png]]\n![[b.pdf]]');
    expect(parseEmbedSize('300')).toEqual({ width: 300, height: undefined });
    expect(parseEmbedSize('300x200')).toEqual({ width: 300, height: 200 });
    expect(parseEmbedSize('caption')).toEqual({});
  });
});

describe('size & cache', () => {
  it('validates size', () => {
    expect(validateSize(ATTACHMENT_MAX_BYTES)).toBeNull();
    expect(validateSize(ATTACHMENT_MAX_BYTES + 1)).toMatch(/10 MB/);
    expect(formatBytes(512)).toBe('512 B');
    expect(formatBytes(1536)).toBe('1.5 KB');
    expect(formatBytes(10 * 1024 * 1024)).toBe('10 MB');
  });
  it('evicts least recently used, never pinned', () => {
    const e = [
      { id: 'old', size: 60, lastAccess: 1 },
      { id: 'pinned', size: 500, lastAccess: 0, pinned: true },
      { id: 'mid', size: 30, lastAccess: 5 },
      { id: 'new', size: 30, lastAccess: 9 },
    ];
    expect(planEviction(e, 200)).toEqual([]);
    expect(planEviction(e, 100)).toEqual(['old']);
    expect(planEviction(e, 100, 50)).toEqual(['old', 'mid']);
    expect(planEviction(e, 0)).toEqual(['old', 'mid', 'new']);
  });
});

describe('locations & search', () => {
  it('resolves the attachment folder', () => {
    expect(attachmentFolderFor({}, 'Work')).toBe('Attachments');
    expect(attachmentFolderFor({ attachmentLocation: 'root' }, 'Work')).toBeNull();
    expect(attachmentFolderFor({ attachmentLocation: 'current' }, 'Work/')).toBe('Work');
    expect(attachmentFolderFor({ attachmentLocation: 'current' }, null)).toBeNull();
    expect(attachmentFolderFor({ attachmentLocation: 'folder', attachmentFolder: '/Media/' }, null)).toBe('Media');
  });
  it('matches attachment paths', () => {
    const m = (q: string, p: string) => attachmentMatches(p, parseSearch(q));
    expect(m('diagram', 'Attachments/diagram.png')).toBe(true);
    expect(m('file:diag', 'Attachments/diagram.png')).toBe(true);
    expect(m('file:attach', 'Attachments/diagram.png')).toBe(false);
    expect(m('path:attach', 'Attachments/diagram.png')).toBe(true);
    expect(m('diagram -png', 'Attachments/diagram.png')).toBe(false);
    expect(m('tag:#x', 'x.png')).toBe(false);
    expect(m('nope OR png', 'x.png')).toBe(true);
  });
});

describe('renderMarkdown renderFile hook', () => {
  it('lets files render their own embed/link html, falling back otherwise', async () => {
    const { renderMarkdown } = await import('../../shared/notes/markdownRender');
    const resolve = (t: string) => (t === 'Note' ? { id: 'n', title: 'Note', content: 'body' } : null);
    const renderFile = (l: { target: string; alias?: string }, embed: boolean) => (l.target.endsWith('.pdf') ? `<x-file data-embed="${embed}" data-alias="${l.alias ?? ''}">${l.target}</x-file>` : null);
    const html = renderMarkdown('![[a.pdf|300]]\n\nSee [[a.pdf]] and [[Note]] ![[pic.png]]', { resolve, renderFile });
    expect(html).toContain('<x-file data-embed="true" data-alias="300">a.pdf</x-file>');
    expect(html).toContain('<x-file data-embed="false" data-alias="">a.pdf</x-file>');
    expect(html).toContain('data-href="Note"');
    expect(html).toContain('<img class="md-embed-image" src="pic.png"');
  });
});
