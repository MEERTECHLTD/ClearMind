/**
 * Pure helpers for the mobile notes data layer (no React Native imports, so
 * they're unit-testable under vitest). Re-exported from services/notes.ts.
 */
import type { Note } from '@clearmind/shared';
import { extractTags, parseFrontmatter, setFrontmatter } from '@clearmind/shared/notes';

/**
 * One-time migration for legacy notes whose tags were typed into the old
 * comma-separated field (stored on `note.tags`, absent from the content).
 * Tags are now derived from content, so saving would silently drop them —
 * instead they're written into the frontmatter `tags` property.
 *
 * Only applies when the previously saved content carried no tags at all (a
 * note that already uses #tags/frontmatter is "new style" and removing a tag
 * there is intentional). The old editor's automatic lone `Draft` default is
 * not migrated.
 */
export function migrateLegacyTags(prev: Pick<Note, 'tags' | 'content'>, content: string): string {
  const legacy = (prev.tags ?? []).map((t) => t.trim().replace(/^#/, '').replace(/\s+/g, '-')).filter(Boolean);
  if (!legacy.length || (legacy.length === 1 && legacy[0] === 'Draft')) return content;
  if (extractTags(prev.content ?? '').length) return content;
  const have = new Set(extractTags(content));
  const missing = legacy.filter((t) => !have.has(t.toLowerCase()));
  if (!missing.length) return content;
  const { props } = parseFrontmatter(content);
  const cur = props.tags;
  const existing = Array.isArray(cur) ? cur : typeof cur === 'string' && cur.trim() ? cur.split(/[ ,]+/).filter(Boolean) : [];
  return setFrontmatter(content, { ...props, tags: [...existing, ...missing] });
}
