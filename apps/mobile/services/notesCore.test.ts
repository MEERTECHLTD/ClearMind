import { describe, it, expect } from 'vitest';
import { extractTags } from '@clearmind/shared/notes';
import { migrateLegacyTags } from './notesCore';

describe('migrateLegacyTags', () => {
  it('moves legacy manual tags into frontmatter', () => {
    const out = migrateLegacyTags({ tags: ['Ideas', 'two words'], content: 'body' }, 'body edited');
    expect(out).toBe('---\ntags:\n  - Ideas\n  - two-words\n---\nbody edited');
    expect(extractTags(out)).toEqual(['ideas', 'two-words']);
  });
  it('merges with existing frontmatter and skips tags already present', () => {
    const out = migrateLegacyTags({ tags: ['a', 'b'], content: 'x' }, '---\nstatus: ok\n---\nx #a');
    expect(extractTags(out).sort()).toEqual(['a', 'b']);
    expect(out).toContain('status: ok');
  });
  it('leaves new-style notes and the old Draft default alone', () => {
    expect(migrateLegacyTags({ tags: ['a'], content: 'had #a' }, 'removed it')).toBe('removed it');
    expect(migrateLegacyTags({ tags: ['Draft'], content: 'x' }, 'y')).toBe('y');
    expect(migrateLegacyTags({ tags: [], content: 'x' }, 'y')).toBe('y');
  });
});
