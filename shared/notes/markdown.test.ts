import { describe, it, expect } from 'vitest';
import {
  scanInline, lineInfo, toggleTaskLine, cycleTaskLine, taskLines, parseCalloutHeader, calloutType, stripComments,
  resolveEmbed, isImageTarget, linkDisplay, linkCompletionContext, tagCompletionContext, minimalChange, type EmbedSource,
} from './markdown';
import { renderMarkdown, stripBlockIds } from './markdownRender';

const kinds = (l: string) => scanInline(l).map((s) => `${s.kind}:${l.slice(s.from, s.to)}`);

describe('scanInline', () => {
  it('finds emphasis, code, links and tags', () => {
    expect(kinds('a **b** *c* ~~d~~ ==e== `f*g*` #tag')).toEqual([
      'bold:**b**', 'italic:*c*', 'strike:~~d~~', 'highlight:==e==', 'code:`f*g*`', 'tag:#tag',
    ]);
  });
  it('parses wikilinks with alias/heading and embeds', () => {
    const s = scanInline('see [[Note#Head|alias]] and ![[pic.png]]');
    expect(s[0]).toMatchObject({ kind: 'wikilink', target: 'Note', heading: 'Head', alias: 'alias' });
    expect('see [[Note#Head|alias]]'.slice(s[0].contentFrom, s[0].contentTo)).toBe('alias');
    expect(s[1]).toMatchObject({ kind: 'embed', target: 'pic.png' });
  });
  it('markdown links, urls, nested bold link', () => {
    const l = '**[x](https://a.com)** https://b.org/x.';
    const s = scanInline(l);
    expect(s.map((x) => x.kind)).toEqual(['bold', 'link', 'url']);
    expect(s[1].href).toBe('https://a.com');
    expect(s[2].href).toBe('https://b.org/x');
  });
  it('does not treat list bullets, headings, numbers or snake_case as markup', () => {
    expect(kinds('* item')).toEqual([]);
    expect(kinds('# Heading')).toEqual([]);
    expect(kinds('issue #123 and snake_case_name')).toEqual([]);
    expect(kinds('a#b')).toEqual([]);
  });
  it('ignores markup inside code and comments', () => {
    expect(kinds('`**x** [[y]]` %%#hidden%%')).toEqual(['code:`**x** [[y]]`', 'comment:%%#hidden%%']);
  });
  it('bold-italic and block ids', () => {
    expect(kinds('***both*** text ^abc-1')).toEqual(['bolditalic:***both***', 'blockid:^abc-1']);
  });
});

describe('lineInfo / tasks', () => {
  it('classifies lines', () => {
    expect(lineInfo('## Title')).toMatchObject({ kind: 'heading', level: 2, markerTo: 3 });
    expect(lineInfo('  - [x] done')).toMatchObject({ kind: 'task', checked: true, markerFrom: 2, markerTo: 8, checkAt: 5 });
    expect(lineInfo('> - [ ] q')).toMatchObject({ kind: 'task', checked: false, quoteDepth: 1 });
    expect(lineInfo('1. one')).toMatchObject({ kind: 'ordered' });
    expect(lineInfo('---')).toMatchObject({ kind: 'hr' });
    expect(lineInfo('> [!tip]- Folded')).toMatchObject({ kind: 'quote', callout: { fold: '-', title: 'Folded' } });
    expect(lineInfo('#tag')).toMatchObject({ kind: 'text' });
  });
  it('toggles and cycles task lines', () => {
    expect(toggleTaskLine('a\n- [ ] x\nb', 1)).toBe('a\n- [x] x\nb');
    expect(toggleTaskLine('> 1. [X] y', 0)).toBe('> 1. [ ] y');
    expect(toggleTaskLine('plain', 0)).toBe('plain');
    expect(cycleTaskLine('hello')).toBe('- [ ] hello');
    expect(cycleTaskLine('  - hello')).toBe('  - [ ] hello');
    expect(cycleTaskLine('- [ ] hello')).toBe('- [x] hello');
  });
  it('taskLines skips code and frontmatter', () => {
    const c = '---\na: - [ ] no\n---\n- [ ] one\n```\n- [ ] code\n```\n> - [x] two';
    expect(taskLines(c)).toEqual([3, 7]);
  });
});

describe('callouts', () => {
  it('parses headers and aliases', () => {
    expect(parseCalloutHeader('[!warning]+ Watch out')).toMatchObject({ fold: '+', title: 'Watch out', type: { key: 'warning' } });
    expect(parseCalloutHeader('[!faq]')).toMatchObject({ fold: null, title: 'Question', type: { key: 'question' } });
    expect(calloutType('tldr').key).toBe('abstract');
    expect(calloutType('custom').label).toBe('Custom');
    expect(parseCalloutHeader('just text')).toBeNull();
  });
});

describe('comments, embeds, completion', () => {
  it('strips comments outside code', () => {
    expect(stripComments('a %%x%% b\n`%%keep%%`\n%%\nmulti\n%%c')).toBe('a  b\n`%%keep%%`\nc');
    expect(stripComments('a %%x\ny%% b', true)).toBe('a    \n    b');
  });
  const notes: EmbedSource[] = [
    { id: '1', title: 'A', content: '---\nx: 1\n---\n# H1\nbody\n## Sub\nsub text\n# H2\nmore\npara ^blk' },
    { id: '2', title: 'B', content: '![[A]]' },
  ];
  const resolve = (t: string, from?: string) => (t ? notes.find((n) => n.title.toLowerCase() === t.toLowerCase()) ?? null : notes.find((n) => n.id === from) ?? null);
  it('resolves embeds', () => {
    const ctx = { depth: 0, visited: new Set<string>() };
    expect(resolveEmbed({ target: 'A' }, resolve, ctx).markdown).toBe('# H1\nbody\n## Sub\nsub text\n# H2\nmore\npara ^blk');
    expect(resolveEmbed({ target: 'A', heading: 'H1' }, resolve, ctx).markdown).toBe('# H1\nbody\n## Sub\nsub text');
    expect(resolveEmbed({ target: 'A', block: 'blk' }, resolve, ctx).markdown).toBe('more\npara');
    expect(resolveEmbed({ target: 'Nope' }, resolve, ctx).kind).toBe('missing');
    expect(resolveEmbed({ target: 'A' }, resolve, { depth: 0, visited: new Set(['1']) }).kind).toBe('cycle');
    expect(resolveEmbed({ target: 'A' }, resolve, { depth: 3, visited: new Set() }).kind).toBe('depth');
    expect(resolveEmbed({ target: 'img.PNG', alias: '200' }, resolve, ctx)).toMatchObject({ kind: 'image', width: 200 });
    expect(isImageTarget('https://x.com/a.jpg?w=1')).toBe(true);
  });
  it('link display', () => {
    expect(linkDisplay({ target: 'A', heading: 'H' })).toBe('A > H');
    expect(linkDisplay({ target: '', heading: 'H' })).toBe('H');
    expect(linkDisplay({ target: 'A', alias: 'x' })).toBe('x');
  });
  it('link completion context', () => {
    expect(linkCompletionContext('see [[No')).toMatchObject({ part: 'target', query: 'No', queryFrom: 6, start: 4 });
    expect(linkCompletionContext('![[Note#He')).toMatchObject({ part: 'heading', target: 'Note', query: 'He', embed: true });
    expect(linkCompletionContext('[[Note#^b')).toMatchObject({ part: 'block', target: 'Note', query: 'b' });
    expect(linkCompletionContext('[[Note|Al')).toMatchObject({ part: 'alias', target: 'Note', query: 'Al' });
    expect(linkCompletionContext('[[done]] x')).toBeNull();
    expect(tagCompletionContext('hello #pro')).toEqual({ from: 6, query: 'pro' });
    expect(tagCompletionContext('a#b')).toBeNull();
  });
  it('minimal change', () => {
    expect(minimalChange('hello world', 'hello brave world')).toEqual({ from: 6, to: 6, insert: 'brave ' });
    expect(minimalChange('abc', 'abc')).toBeNull();
    expect(minimalChange('aXc', 'aYc')).toEqual({ from: 1, to: 2, insert: 'Y' });
  });
});

describe('renderMarkdown', () => {
  const notes: EmbedSource[] = [
    { id: '1', title: 'A', content: '# Top\nHello from A\n## Part\npart text' },
    { id: '2', title: 'Loop', content: 'x ![[Loop]]' },
    { id: '3', title: 'Self', content: '![[B2]]' },
    { id: '4', title: 'B2', content: '![[Self]]' },
  ];
  const resolve = (t: string, from?: string) => (t ? notes.find((n) => n.title.toLowerCase() === t.toLowerCase()) ?? null : notes.find((n) => n.id === from) ?? null);
  it('renders wikilinks, tags, highlight and hides frontmatter/comments', () => {
    const html = renderMarkdown('---\ntags: [a]\n---\nSee [[A|the a]] and [[Missing]] #proj ==hi== %%secret%%', { resolve });
    expect(html).not.toContain('tags:');
    expect(html).toContain('class="internal-link" role="link" tabindex="0" data-href="A"');
    expect(html).toContain('>the a</a>');
    expect(html).toContain('internal-link is-unresolved');
    expect(html).toContain('data-tag="proj"');
    expect(html).toContain('<mark>hi</mark>');
    expect(html).not.toContain('secret');
  });
  it('embeds notes and sections with cycle guard', () => {
    expect(renderMarkdown('![[A#Part]]', { resolve })).toContain('part text');
    expect(renderMarkdown('![[A#Part]]', { resolve })).not.toContain('Hello from A');
    const loop = renderMarkdown(notes[1].content, { resolve, fromId: '2' });
    expect(loop).toContain('Embed cycle');
    const mutual = renderMarkdown(notes[2].content, { resolve, fromId: '3' });
    expect(mutual).toContain('md-embed');
    expect(mutual).toContain('Embed cycle');
  });
  it('callouts with fold state', () => {
    const html = renderMarkdown('> [!warning]- Careful\n> body **x**\n\nafter', { resolve });
    expect(html).toContain('<details class="callout callout-warning is-foldable"');
    expect(html).not.toContain(' open');
    expect(html).toContain('<strong>x</strong>');
    expect(html).toContain('Careful');
    expect(renderMarkdown('> [!tip]+\n> y', { resolve })).toContain(' open');
    expect(renderMarkdown('> [!note]\n> y', { resolve })).toContain('<div class="callout callout-note"');
  });
  it('task checkboxes carry source lines', () => {
    const c = '---\na: 1\n---\n- [ ] one\n- [x] two\n\n> [!todo]\n> - [ ] three';
    const html = renderMarkdown(c, { resolve, interactiveTasks: true });
    expect([...html.matchAll(/data-line="(\d+)"/g)].map((m) => Number(m[1]))).toEqual([3, 4, 7]);
  });
  it('headings get slugs, code gets copy button, footnotes collected', () => {
    const html = renderMarkdown('## Hello World\n```js\nlet a = 1 < 2;\n```\nText[^1]\n\n[^1]: The note.', { resolve });
    expect(html).toContain('data-slug="hello-world"');
    expect(html).toContain('md-copy');
    expect(html).toContain('let a = 1 &lt; 2;');
    expect(html).toContain('class="footnotes"');
    expect(html).toContain('The note.');
  });
  it('external links open in a new tab; block ids hidden', () => {
    const html = renderMarkdown('[x](https://a.com) para ^abc', { resolve });
    expect(html).toContain('target="_blank"');
    expect(html).not.toContain('^abc');
    expect(stripBlockIds('a ^x\n`b ^y`')).toBe('a\n`b ^y`');
  });
  it('truncates for previews', () => {
    const html = renderMarkdown('word '.repeat(1000), { resolve, maxChars: 100 });
    expect(html.length).toBeLessThan(400);
  });
});

import { inferPropType, convertPropValue, renameProp } from './markdown';
describe('properties helpers', () => {
  it('infers types', () => {
    expect(inferPropType('tags', 'a')).toBe('list');
    expect(inferPropType('x', ['a'])).toBe('list');
    expect(inferPropType('x', true)).toBe('checkbox');
    expect(inferPropType('x', 3)).toBe('number');
    expect(inferPropType('due', '2026-01-02')).toBe('date');
    expect(inferPropType('at', '2026-01-02T10:30')).toBe('datetime');
    expect(inferPropType('x', 'hello')).toBe('text');
  });
  it('converts and renames', () => {
    expect(convertPropValue('a, b', 'list')).toEqual(['a', 'b']);
    expect(convertPropValue(['a', 'b'], 'text')).toBe('a, b');
    expect(convertPropValue('12', 'number')).toBe(12);
    expect(Object.keys(renameProp({ a: 1, b: 2, c: 3 }, 'b', 'z'))).toEqual(['a', 'z', 'c']);
  });
});
