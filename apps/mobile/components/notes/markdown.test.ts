import { describe, it, expect } from 'vitest';
import { parseNote, parseInline, previewLines, wikiDisplay } from './markdown';
import { detectTrigger, applyLinkCompletion, applyTagCompletion, insertSnippet } from './autocomplete';

describe('parseInline', () => {
  it('tokenises emphasis, code, links, tags and wikilinks', () => {
    const n = parseInline('a **b _c_** `x [[y]]` [[Note#Head|al]] ==hi== ~~s~~ #tag/sub [w](https://e.com) https://x.io');
    const kinds = n.map((x) => x.t);
    expect(kinds).toEqual(['text', 'bold', 'text', 'code', 'text', 'wikilink', 'text', 'highlight', 'text', 'strike', 'text', 'tag', 'text', 'link', 'text', 'link']);
    const bold = n[1] as any;
    expect(bold.children.map((c: any) => c.t)).toEqual(['text', 'italic']);
    expect((n[3] as any).text).toBe('x [[y]]');
    expect(n[5]).toMatchObject({ t: 'wikilink', target: 'Note', heading: 'Head', alias: 'al', text: 'al' });
    expect(n[11]).toMatchObject({ t: 'tag', tag: 'tag/sub', text: '#tag/sub' });
    expect(n[13]).toMatchObject({ t: 'link', href: 'https://e.com' });
  });
  it('hides block ids and keeps newlines', () => {
    const n = parseInline('one\ntwo ^abc');
    expect(n).toEqual([{ t: 'text', text: 'one\ntwo ' }]);
  });
  it('displays links like Obsidian', () => {
    expect(wikiDisplay({ target: 'A', heading: 'H' })).toBe('A > H');
    expect(wikiDisplay({ target: '', heading: 'H' })).toBe('H');
    expect(wikiDisplay({ target: 'A', block: 'b1' })).toBe('A > ^b1');
  });
});

describe('parseNote', () => {
  const src = [
    '---', 'tags: [a, b]', 'status: draft', '---',
    '# Title', '', 'para line 1', 'para line 2', '',
    '- [ ] todo', '- [x] done', '  - nested', '1. first',
    '> [!warning] Careful', '> - [ ] inside', '',
    '> plain quote', '', '```js', 'const a = 1;', '```', '---', '![[Other#Sec]]',
    '| h1 | h2 |', '| --- | --- |', '| a | b |', '%% hidden %%',
  ].join('\n');
  const { props, blocks } = parseNote(src);
  it('reads frontmatter', () => expect(props).toEqual({ tags: ['a', 'b'], status: 'draft' }));
  it('produces blocks with source lines', () => {
    expect(blocks.map((b) => b.t)).toEqual(['heading', 'paragraph', 'item', 'item', 'item', 'item', 'callout', 'quote', 'code', 'hr', 'embed', 'table']);
    expect(blocks[0]).toMatchObject({ level: 1, text: 'Title', slug: 'title', line: 4 });
    expect(blocks[1]).toMatchObject({ text: 'para line 1\npara line 2', line: 6 });
    expect(blocks[2]).toMatchObject({ task: { checked: false }, text: 'todo', line: 9 });
    expect(blocks[3]).toMatchObject({ task: { checked: true }, line: 10 });
    expect(blocks[4]).toMatchObject({ depth: 1, text: 'nested' });
    expect(blocks[5]).toMatchObject({ ordered: true, marker: '1.' });
    const c = blocks[6] as any;
    expect(c.callout.type.key).toBe('warning');
    expect(c.callout.title).toBe('Careful');
    expect(c.children[0]).toMatchObject({ t: 'item', task: { checked: false }, line: 14 });
    expect(blocks[8]).toMatchObject({ lang: 'js', text: 'const a = 1;' });
    expect(blocks[10]).toMatchObject({ target: 'Other', heading: 'Sec' });
    expect(blocks[11]).toMatchObject({ header: ['h1', 'h2'], rows: [['a', 'b']] });
  });
  it('works without frontmatter', () => {
    expect(parseNote('hello').blocks).toEqual([{ t: 'paragraph', text: 'hello', line: 0 }]);
  });
  it('previews lines without markdown noise', () => {
    expect(previewLines('## H\n- [ ] t **b**\n[[A|alias]] ^x1', 5)).toEqual(['H', '☐ t b', 'alias']);
  });
});

describe('autocomplete', () => {
  it('detects an open [[link', () => {
    const t = detectTrigger('hi\nsee [[Pro', 12);
    expect(t).toMatchObject({ kind: 'link', ctx: { part: 'target', query: 'Pro' } });
    expect(detectTrigger('see [[Pro]] x', 13)).toBeNull();
  });
  it('detects heading part and tag', () => {
    expect(detectTrigger('[[Note#Int', 10)).toMatchObject({ kind: 'link', ctx: { part: 'heading', target: 'Note', query: 'Int' } });
    expect(detectTrigger('text #ide', 9)).toEqual({ kind: 'tag', from: 5, query: 'ide' });
    expect(detectTrigger('a#b', 3)).toBeNull();
  });
  it('applies a link completion, reusing a trailing ]]', () => {
    const text = 'x [[Pr';
    const t = detectTrigger(text, text.length) as any;
    expect(applyLinkCompletion(text, text.length, t, 'Project')).toEqual({ text: 'x [[Project]]', cursor: 13 });
    const t2 = detectTrigger('[[Pr]] y', 4) as any;
    expect(applyLinkCompletion('[[Pr]] y', 4, t2, 'Project')).toEqual({ text: '[[Project]] y', cursor: 11 });
  });
  it('applies a tag completion', () => {
    const t = detectTrigger('a #id', 5) as any;
    expect(applyTagCompletion('a #id', 5, t, 'idea')).toEqual({ text: 'a #idea ', cursor: 8 });
  });
  it('inserts snippets', () => {
    expect(insertSnippet('ab', { start: 1, end: 1 }, '[[')).toEqual({ text: 'a[[b', cursor: 3 });
    expect(insertSnippet('abc', { start: 1, end: 2 }, '**', { wrap: true })).toEqual({ text: 'a**b**c', cursor: 6 });
    expect(insertSnippet('x\nyz', { start: 3, end: 3 }, '- [ ] ', { lineStart: true })).toEqual({ text: 'x\n- [ ] yz', cursor: 9 });
  });
});
