import { describe, it, expect } from 'vitest';
import type { Note } from '../types';
import {
  parseFrontmatter, setFrontmatter, extractLinks, extractTags, extractHeadings, extractBlocks, sectionUnder, blockText, extractTasks,
  buildIndex, linkedMentions, unlinkedMentions, linkMention, rewriteLinksForRename, buildGraph, localGraph, searchVault, quickSwitch,
  applyTemplateVars, insertTemplate, formatDate, findDailyNote, prepareNote, uniqueTitle, orphans,
} from './index';

let seq = 0;
const note = (title: string, content: string, extra: Partial<Note> = {}): Note =>
  ({ id: `n${++seq}`, title, content, tags: [], lastEdited: `2026-10-0${(seq % 9) + 1}T00:00:00Z`, createdAt: `2026-01-01T00:00:${String(seq).padStart(2, '0')}Z`, ...extra });

describe('parse', () => {
  it('reads and writes frontmatter properties', () => {
    const c = '---\ntitle: Hello\ncount: 3\ndone: false\ntags:\n  - a\n  - b/c\naliases: [One, "Two"]\nempty:\n---\n# Body';
    const fm = parseFrontmatter(c);
    expect(fm.props).toEqual({ title: 'Hello', count: 3, done: false, tags: ['a', 'b/c'], aliases: ['One', 'Two'], empty: null });
    expect(fm.body).toBe('# Body');
    const round = parseFrontmatter(setFrontmatter(c, { ...fm.props, count: 4 }));
    expect(round.props.count).toBe(4);
    expect(round.props.tags).toEqual(['a', 'b/c']);
    expect(setFrontmatter(c, {})).toBe('# Body');
  });

  it('extracts wikilinks with heading, block, alias and embeds, ignoring code', () => {
    const c = 'See [[Alpha]], [[Beta#Setup|setup]], [[Gamma#^b1]] and ![[Img]].\n`[[NotALink]]`\n```\n[[AlsoNot]]\n```\n[md](Delta%20Note.md#Part)';
    const ls = extractLinks(c);
    expect(ls.map((l) => [l.target, l.heading, l.block, l.alias, l.embed])).toEqual([
      ['Alpha', undefined, undefined, undefined, false],
      ['Beta', 'Setup', undefined, 'setup', false],
      ['Gamma', undefined, 'b1', undefined, false],
      ['Img', undefined, undefined, undefined, true],
      ['Delta Note', 'Part', undefined, 'md', false],
    ]);
    expect(c.slice(ls[1].start, ls[1].end)).toBe('[[Beta#Setup|setup]]');
  });

  it('extracts tags (nested, frontmatter) but not headings, numbers, urls or code', () => {
    const c = '---\ntags: [project, Work]\n---\n# Heading\nText #idea and #area/health, #2024 not, a#b not, `#code` not, https://x.y/#frag not.';
    expect(extractTags(c).sort()).toEqual(['area/health', 'idea', 'project', 'work']);
  });

  it('finds headings, blocks, sections, tasks', () => {
    const c = '# A\nintro\n## B\nline one ^blk\n## C\n- [ ] todo\n- [x] done';
    expect(extractHeadings(c).map((h) => [h.level, h.text])).toEqual([[1, 'A'], [2, 'B'], [2, 'C']]);
    expect(extractBlocks(c)).toEqual({ blk: 3 });
    expect(sectionUnder(c, 'B')).toBe('## B\nline one ^blk');
    expect(blockText(c, 'blk')).toBe('line one');
    expect(extractTasks(c)).toEqual([{ line: 5, text: 'todo', done: false }, { line: 6, text: 'done', done: true }]);
  });
});

describe('vault', () => {
  const a = note('Alpha', 'Links to [[Beta]] and [[Missing]]. #topic/one', { folder: 'Work' });
  const b = note('Beta', '---\naliases: [B2]\n---\nBack to [[Alpha|the alpha]] and [[B2]]. Mentions Alpha in text.');
  const c = note('Gamma', 'Orphan note about alpha and Beta.');
  const d = note('Delta', 'Embeds ![[Beta#Intro]] #topic');
  const idx = buildIndex([a, b, c, d, note('Gone', '[[Alpha]]', { deleted: true })]);

  it('resolves by title, path and alias; tracks backlinks, unresolved and tags', () => {
    expect(idx.resolve('alpha')?.id).toBe(a.id);
    expect(idx.resolve('Work/Alpha')?.id).toBe(a.id);
    expect(idx.resolve('B2')?.id).toBe(b.id);
    expect(idx.resolve('Nope')).toBeNull();
    expect((idx.backlinks.get(a.id) ?? []).map((l) => l.from)).toEqual([b.id]);
    expect([...idx.unresolved.values()].map((u) => u.target)).toEqual(['Missing']);
    expect([...(idx.tags.get('topic') ?? [])].sort()).toEqual([a.id, d.id].sort());
    expect(idx.tags.has('topic/one')).toBe(true);
    expect(idx.folders).toEqual(['Work']);
  });

  it('linked and unlinked mentions', () => {
    expect(linkedMentions(idx, b.id).map((g) => g.note.title)).toEqual(['Alpha', 'Delta']);
    const un = unlinkedMentions(idx, a.id);
    expect(un.map((g) => g.note.title).sort()).toEqual(['Beta', 'Gamma']);
    const g = un.find((x) => x.note.id === c.id)!;
    expect(linkMention(c.content, g.mentions[0], 'Alpha')).toBe('Orphan note about [[Alpha|alpha]] and Beta.');
  });

  it('rename rewrites links (keeping heading, alias, embed)', () => {
    const ch = rewriteLinksForRename(idx, b.id, { title: 'Bravo' });
    expect(ch.get(a.id)).toBe('Links to [[Bravo]] and [[Missing]]. #topic/one');
    expect(ch.get(d.id)).toBe('Embeds ![[Bravo#Intro]] #topic');
    // alias link [[B2]] resolves to Beta and is rewritten to the new title
    expect(ch.get(b.id)).toBe('---\naliases: [B2]\n---\nBack to [[Alpha|the alpha]] and [[Bravo]]. Mentions Alpha in text.');
    expect(ch.has(c.id)).toBe(false);
  });

  it('graph: links, tags, unresolved, orphans, local depth', () => {
    const g = buildGraph(idx);
    expect(g.nodes.map((n) => n.label).sort()).toEqual(['Alpha', 'Beta', 'Delta', 'Gamma']);
    expect(g.links.length).toBe(2); // Alpha–Beta (deduped both directions), Delta–Beta
    expect(g.nodes.find((n) => n.label === 'Beta')!.degree).toBe(2);
    const full = buildGraph(idx, { showTags: true, showUnresolved: true, showOrphans: false });
    expect(full.nodes.map((n) => n.label).sort()).toEqual(['#topic', '#topic/one', 'Alpha', 'Beta', 'Delta', 'Missing']);
    expect(localGraph(g, a.id, 1).nodes.map((n) => n.label).sort()).toEqual(['Alpha', 'Beta']);
    expect(localGraph(g, a.id, 2).nodes.map((n) => n.label).sort()).toEqual(['Alpha', 'Beta', 'Delta']);
    expect(buildGraph(idx, { query: 'tag:topic' }).nodes.map((n) => n.label).sort()).toEqual(['Alpha', 'Delta']);
    expect(orphans(idx).map((n) => n.title)).toEqual(['Gamma']);
  });

  it('search operators', () => {
    const t = (q: string) => searchVault(idx, q).map((h) => h.note.title).sort();
    expect(t('alpha')).toEqual(['Alpha', 'Beta', 'Gamma']);
    expect(t('alpha -orphan')).toEqual(['Alpha', 'Beta']);
    expect(t('"in text"')).toEqual(['Beta']);
    expect(t('tag:#topic')).toEqual(['Alpha', 'Delta']);
    expect(t('path:work')).toEqual(['Alpha']);
    expect(t('file:gam OR file:del')).toEqual(['Delta', 'Gamma']);
    expect(t('[aliases:b2]')).toEqual(['Beta']);
    expect(searchVault(idx, 'alpha')[0].note.title).toBe('Alpha');
    expect(quickSwitch(idx, 'b2')[0]).toMatchObject({ label: 'Beta', via: 'B2' });
    expect(quickSwitch(idx, 'dlt')[0].label).toBe('Delta');
  });

  it('task search', () => {
    const i2 = buildIndex([note('T', '- [ ] buy milk\n- [x] pay rent')]);
    expect(searchVault(i2, 'task-todo:milk').length).toBe(1);
    expect(searchVault(i2, 'task-done:milk').length).toBe(0);
    expect(searchVault(i2, 'task-done:rent').length).toBe(1);
  });
});

describe('templates & daily notes', () => {
  const now = new Date(2026, 9, 7, 9, 5);
  it('formats dates and expands variables', () => {
    expect(formatDate(now, 'dddd, MMMM D YYYY [at] HH:mm')).toBe('Wednesday, October 7 2026 at 09:05');
    expect(applyTemplateVars('# {{title}}\n{{date}} {{time}} {{date:ddd}}', { title: 'X', now })).toBe('# X\n2026-10-07 09:05 Wed');
  });
  it('inserts a template merging frontmatter', () => {
    const out = insertTemplate('---\nstatus: draft\n---\nHello', '---\ntype: meeting\nstatus: new\n---\n## {{title}}', { title: 'Sync', now }, undefined);
    expect(parseFrontmatter(out).props).toEqual({ type: 'meeting', status: 'draft' });
    expect(parseFrontmatter(out).body).toBe('Hello## Sync');
  });
  it('finds daily notes and makes unique titles', () => {
    const dn = note('2026-10-07', '', { kind: 'daily', dailyDate: '2026-10-07', folder: 'Daily' });
    const idx = buildIndex([dn, note('Untitled', '')]);
    expect(findDailyNote(idx, now)?.id).toBe(dn.id);
    expect(findDailyNote(idx, new Date(2026, 9, 8))).toBeNull();
    expect(uniqueTitle(idx)).toBe('Untitled 1');
    const p = prepareNote({ id: 'x', title: '  T ', content: 'hi #tag', folder: '/A/B/' }, now);
    expect(p).toMatchObject({ title: 'T', tags: ['tag'], folder: 'A/B' });
  });
});
