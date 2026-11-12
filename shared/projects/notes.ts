/**
 * Project notes: vault notes that belong to a project. They live under
 * `Projects/<project title>` (sub-folders included) or carry `project: <title or id>`
 * in their frontmatter. One rule for the web app, mobile and AI agents.
 */
import type { Note, Project } from '../types';
import { normPath, parseFrontmatter } from '../notes';

export const projectNotesFolder = (p: Pick<Project, 'title'>) => `Projects/${p.title.replace(/[\\/#^|[\]]/g, '-').trim()}`;

export function isProjectNote(n: Note, p: Pick<Project, 'id' | 'title'>): boolean {
  if (n.deleted) return false;
  const f = normPath(projectNotesFolder(p));
  const nf = normPath(n.folder ?? '');
  if (nf === f || nf.startsWith(f + '/')) return true;
  const proj = (parseFrontmatter(n.content ?? '').props as Record<string, unknown>)?.project;
  return typeof proj === 'string' && (proj.toLowerCase() === p.title.toLowerCase() || proj === p.id);
}
