/**
 * Filter query language — shared by mobile, web, saved filters, MCP and the API
 * so a query means the same thing everywhere.
 *
 *   Terms     today · tomorrow · overdue · "no date" · "this week" · "next 7 days"
 *             · recurring · "no labels" · p1…p4 · #Project (includes sub-projects)
 *             · ##Project (exact) · /Section · @label · search: words · completed
 *             · subtask · "has description" · "due before: YYYY-MM-DD"
 *             · "due after: YYYY-MM-DD" · assigned · created by: mcp|web|android…
 *   Operators &  (and)   |  (or)   !  (not)   ( … )  grouping
 *
 *   "p1 & #RanaWallet & !@waiting"   "(today | overdue) & #Work"
 */
import type { Task, Project, Label, Section } from '../types';
import { isOverdue, priorityOf, toISODate, addDays, startOfWeek, compareTasks } from '../tasks';

export interface FilterContext {
  projects: Project[];
  labels: Label[];
  sections: Section[];
  now?: Date;
  weekStart?: number;
}

type Pred = (t: Task) => boolean;

export class FilterSyntaxError extends Error {}

function tokenize(q: string): string[] {
  const out: string[] = [];
  let i = 0;
  while (i < q.length) {
    const c = q[i];
    if (/\s/.test(c)) { i++; continue; }
    if ('&|!()'.includes(c)) { out.push(c); i++; continue; }
    let j = i;
    while (j < q.length && !'&|()'.includes(q[j]) && !(q[j] === '!' && j === i)) j++;
    out.push(q.slice(i, j).trim());
    i = j;
  }
  return out.filter(Boolean);
}

function termPredicate(term: string, ctx: FilterContext): Pred {
  const now = ctx.now ?? new Date();
  const today = toISODate(now);
  const t = term.trim();
  const lower = t.toLowerCase();
  const byName = <T extends { title?: string; name?: string; deleted?: boolean | null }>(list: T[], name: string) =>
    list.filter((x) => !x.deleted && ((x.title ?? x.name ?? '').toLowerCase() === name.toLowerCase()));

  if (/^p[1-4]$/.test(lower)) {
    const p = (['High', 'Medium', 'Low', 'None'] as const)[Number(lower[1]) - 1];
    return (x) => priorityOf(x) === p;
  }
  if (lower === 'today') return (x) => x.dueDate === today;
  if (lower === 'tomorrow') return (x) => x.dueDate === toISODate(addDays(now, 1));
  if (lower === 'yesterday') return (x) => x.dueDate === toISODate(addDays(now, -1));
  if (lower === 'overdue' || lower === 'od') return (x) => isOverdue(x, now);
  if (lower === 'no date' || lower === 'no due date') return (x) => !x.dueDate;
  if (lower === 'recurring') return (x) => !!x.recurrence;
  if (lower === 'no labels') return (x) => !(x.labelIds ?? []).length;
  if (lower === 'completed' || lower === 'done') return (x) => !!x.completed;
  if (lower === 'subtask') return (x) => !!x.parentId;
  if (lower === 'has description') return (x) => !!x.description;
  if (lower === 'assigned') return (x) => !!x.assigneeId;
  if (lower === 'inbox') return (x) => !x.projectId;
  if (lower === 'this week') {
    const s = startOfWeek(now);
    const ws = ctx.weekStart ?? 1;
    const start = addDays(s, ws === 1 ? 0 : ws === 0 ? -1 : -2);
    const a = toISODate(start), b = toISODate(addDays(start, 6));
    return (x) => !!x.dueDate && x.dueDate >= a && x.dueDate <= b;
  }
  let m = /^next (\d+) days?$/.exec(lower) || /^(\d+) days?$/.exec(lower);
  if (m) {
    const b = toISODate(addDays(now, Number(m[1]) - 1));
    return (x) => !!x.dueDate && x.dueDate >= today && x.dueDate <= b;
  }
  m = /^due (before|after):\s*(\d{4}-\d{2}-\d{2})$/.exec(lower);
  if (m) { const d = m[2]; return m[1] === 'before' ? (x) => !!x.dueDate && x.dueDate < d : (x) => !!x.dueDate && x.dueDate > d; }
  m = /^created by:\s*(\w+)$/.exec(lower);
  if (m) { const src = m[1]; return (x) => (x.source ?? '') === src || (x.agent ?? '').toLowerCase() === src; }
  if (lower.startsWith('search:')) {
    const words = lower.slice(7).trim().split(/\s+/).filter(Boolean);
    return (x) => words.every((w) => `${x.title} ${x.description ?? ''}`.toLowerCase().includes(w));
  }
  if (t.startsWith('##') || t.startsWith('#')) {
    const exact = t.startsWith('##');
    const name = t.replace(/^##?/, '');
    const roots = byName(ctx.projects, name);
    if (!roots.length) return () => false;
    const ids = new Set<string>();
    for (const r of roots) {
      ids.add(r.id);
      if (!exact) for (let k = 0, q = [r.id]; k < q.length; k++) for (const p of ctx.projects) if (p.parentId === q[k] && !ids.has(p.id)) { ids.add(p.id); q.push(p.id); }
    }
    return (x) => !!x.projectId && ids.has(x.projectId);
  }
  if (t.startsWith('/')) {
    const secs = new Set(ctx.sections.filter((s) => !s.deleted && s.name.toLowerCase() === t.slice(1).toLowerCase()).map((s) => s.id));
    return (x) => !!x.sectionId && secs.has(x.sectionId);
  }
  if (t.startsWith('@') || t.startsWith('%')) {
    const name = t.slice(1).toLowerCase();
    const wildcard = name.endsWith('*');
    const ids = new Set(ctx.labels.filter((l) => !l.deleted && (wildcard ? l.name.toLowerCase().startsWith(name.slice(0, -1)) : l.name.toLowerCase() === name)).map((l) => l.id));
    return (x) => (x.labelIds ?? []).some((id) => ids.has(id));
  }
  // Bare words: text search.
  return (x) => `${x.title} ${x.description ?? ''}`.toLowerCase().includes(lower);
}

/** Compile a query into a predicate. Throws FilterSyntaxError on malformed input. */
export function compileFilter(query: string, ctx: FilterContext): Pred {
  const toks = tokenize(query);
  let i = 0;
  const peek = () => toks[i];
  const parseOr = (): Pred => {
    let left = parseAnd();
    while (peek() === '|') { i++; const r = parseAnd(); const l = left; left = (x) => l(x) || r(x); }
    return left;
  };
  const parseAnd = (): Pred => {
    let left = parseNot();
    while (peek() === '&') { i++; const r = parseNot(); const l = left; left = (x) => l(x) && r(x); }
    return left;
  };
  const parseNot = (): Pred => {
    if (peek() === '!') { i++; const p = parseNot(); return (x) => !p(x); }
    if (peek() === '(') {
      i++;
      const p = parseOr();
      if (peek() !== ')') throw new FilterSyntaxError('missing )');
      i++;
      return p;
    }
    const term = toks[i++];
    if (!term || '&|)'.includes(term)) throw new FilterSyntaxError(`unexpected ${term ?? 'end of query'}`);
    return termPredicate(term, ctx);
  };
  if (!toks.length) return () => true;
  const pred = parseOr();
  if (i < toks.length) throw new FilterSyntaxError(`unexpected ${toks[i]}`);
  return pred;
}

/** Run a filter query over tasks (open tasks only unless the query mentions `completed`). */
export function runFilter(tasks: Task[], query: string, ctx: FilterContext): Task[] {
  const pred = compileFilter(query, ctx);
  const wantsDone = /\bcompleted|\bdone\b/i.test(query);
  return tasks.filter((t) => !t.deleted && (wantsDone || !t.completed) && pred(t)).sort(compareTasks);
}
