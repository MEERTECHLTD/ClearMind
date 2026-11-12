/**
 * Agent tools for every ClearMind area beyond tasks/projects/notes:
 * habits, goals, milestones, calendar, daily map (time blocks + permanent
 * templates), journal (daily log + rants), applications, learning vault,
 * mind maps and AI chat history.
 *
 * The same catalog serves MCP clients (Claude, ChatGPT…), the REST API, the
 * CLI and the in-app ClearMind AI, so anything one can do the others can too.
 *
 * Each area follows one shape so it stays easy to learn:
 *   <area>_list    read (filters, `id` for one full record)
 *   <area>_save    create (no id) or update (id or exact title); only passed fields change
 *   <area>_delete  soft delete (syncs as a tombstone); more than one needs confirm_token
 * plus a few verbs where the app has them (habits_check).
 *
 * Writes are field-level edits through the same sync engine as the apps, so
 * they land on every device within seconds.
 */
import type { AgentScope } from '../types';
import type { Edit, Coll } from '../domain';
import { newId } from '../domain';
import { dayInZone } from '../tasks/time';
import { AgentError } from './errors';

// ------------------------------------------------------------------ shared shapes

type Args = Record<string, any>;
type Rec = Record<string, any> & { id: string };

export type LifeColl = 'habits' | 'goals' | 'milestones' | 'logs' | 'rants' | 'events' | 'dailymapper' | 'dailymappertemplates'
  | 'applications' | 'learningresources' | 'learningfolders' | 'mindmaps' | 'iris_conversations';
export const LIFE_COLLS: LifeColl[] = ['habits', 'goals', 'milestones', 'logs', 'rants', 'events', 'dailymapper', 'dailymappertemplates', 'applications', 'learningresources', 'learningfolders', 'mindmaps', 'iris_conversations'];

export interface LifeRunCtx {
  life: Partial<Record<LifeColl, Rec[]>>;
  args: Args;
  now: Date;
  timezone: string | null;
  /** Throws confirm_required (with a token) unless args.confirm_token matches this exact id set. */
  confirm: (tool: string, ids: string[], message: string, preview: unknown) => Promise<void>;
}
export interface LifeToolDef {
  name: string; title: string; description: string; scopes: AgentScope[];
  needs: LifeColl[];
  input: { type: 'object'; properties: Record<string, any>; required?: string[] };
  run: (x: LifeRunCtx) => Promise<{ result: unknown; edits?: Edit[]; summary?: string }>;
}

const S = { type: 'string' } as const;
const N = { type: 'number' } as const;
const B = { type: 'boolean' } as const;
const DATE = { type: 'string', description: 'YYYY-MM-DD' };
const TIME = { type: 'string', description: 'HH:MM (24h)' };
const IDS = { type: 'array', items: S, description: 'Record ids (or exact titles)' };
const STRS = { type: 'array', items: S };

const live = (xs: Rec[] | undefined) => (xs ?? []).filter((x) => !x.deleted);
const iso = (now: Date) => now.toISOString();
const today = (x: { now: Date; timezone: string | null }) => dayInZone(x.now, x.timezone);
const isDate = (s: unknown) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s);
const isTime = (s: unknown) => typeof s === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(s);
const lc = (s: unknown) => String(s ?? '').toLowerCase();
const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));
const pick = (a: Args, keys: string[]) => Object.fromEntries(keys.filter((k) => a[k] !== undefined).map((k) => [k, a[k]]));

function need(cond: unknown, msg: string): asserts cond { if (!cond) throw new AgentError('invalid', msg); }

/** Find a record by id, then by exact (case-insensitive) title field. */
function find(list: Rec[] | undefined, ref: string, titleKey: string, noun: string): Rec {
  const xs = live(list);
  const hit = xs.find((x) => x.id === ref) ?? xs.find((x) => lc(x[titleKey]) === lc(ref).trim());
  if (!hit) throw new AgentError('not_found', `No ${noun} "${ref}". Use the matching _list tool to see ids.`);
  return hit;
}
function matches(r: Rec, q: string | undefined, keys: string[]) {
  if (!q) return true;
  const terms = lc(q).split(/\s+/).filter(Boolean);
  const hay = keys.map((k) => (Array.isArray(r[k]) ? r[k].join(' ') : typeof r[k] === 'object' && r[k] ? JSON.stringify(r[k]) : r[k] ?? '')).join(' ').toLowerCase();
  return terms.every((t) => hay.includes(t));
}
function inRange(d: string | undefined, from?: string, to?: string) {
  if (!d) return !from && !to;
  const day = d.slice(0, 10);
  return (!from || day >= from) && (!to || day <= to);
}
const limitOf = (a: Args, dflt = 100) => clamp(Number(a.limit) || dflt, 1, 500);

/** Generic delete: soft-delete by id/title, >1 record → two-step confirmation. */
async function del(x: LifeRunCtx, tool: string, coll: LifeColl, titleKey: string, noun: string) {
  const refs: string[] = (Array.isArray(x.args.ids) ? x.args.ids : [x.args.ids]).filter(Boolean).map(String);
  need(refs.length, 'ids must list at least one record');
  need(refs.length <= 200, 'At most 200 per call.');
  const recs = [...new Map(refs.map((r) => find(x.life[coll], r, titleKey, noun)).map((r) => [r.id, r])).values()];
  if (recs.length > 1) await x.confirm(tool, recs.map((r) => r.id), `This deletes ${recs.length} ${noun}s. Call again with confirm_token to proceed.`, recs.slice(0, 20).map((r) => r[titleKey]));
  const at = iso(x.now);
  return { result: { deleted: recs.map((r) => ({ id: r.id, [titleKey]: r[titleKey] })) }, edits: recs.map((r) => ({ coll: coll as Coll, id: r.id, edit: { deleted: true, deletedAt: at } })), summary: `deleted ${recs.length} ${noun}(s)` };
}

/** Generic save: update by id/title when given, otherwise create. */
function save(x: LifeRunCtx, coll: LifeColl, titleKey: string, noun: string, fields: string[], create: (a: Args) => Rec, validate?: (merged: Rec) => void) {
  const a = x.args;
  const patch = pick(a, fields);
  if (a.id) {
    const cur = find(x.life[coll], String(a.id), titleKey, noun);
    const merged = { ...cur, ...patch };
    validate?.(merged);
    const edit = { ...patch, ...(cur.updatedAt !== undefined || coll === 'applications' || coll === 'mindmaps' || coll === 'learningresources' ? { updatedAt: iso(x.now) } : {}) };
    return { result: { ...merged, ...edit }, edits: [{ coll: coll as Coll, id: cur.id, edit }], summary: `updated ${noun} "${merged[titleKey] ?? cur.id}"` };
  }
  const rec = { ...create(a), ...patch };
  validate?.(rec);
  return { result: rec, edits: [{ coll: coll as Coll, id: rec.id, edit: rec }], summary: `created ${noun} "${rec[titleKey] ?? rec.id}"` };
}

// ------------------------------------------------------------------ habits

const HABIT_COLORS = ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899', '#14B8A6', '#F97316'];

/** Streak, 7-day history and today's flag recomputed from the per-day history. */
export function habitStats(monthly: Record<string, boolean>, day: string) {
  const d = new Date(`${day}T12:00:00Z`);
  const key = (k: number) => new Date(d.getTime() - k * 86_400_000).toISOString().slice(0, 10);
  const history = [6, 5, 4, 3, 2, 1, 0].map((k) => !!monthly[key(k)]);
  let streak = 0;
  for (let k = monthly[day] ? 0 : 1; k < 3660 && monthly[key(k)]; k++) streak++;
  return { completedToday: !!monthly[day], history, streak };
}
function describeHabit(h: Rec, day: string) {
  const s = habitStats(h.monthlyHistory ?? {}, day);
  return { id: h.id, name: h.name, description: h.description ?? null, color: h.color ?? null, done_today: s.completedToday, streak: s.streak, last_7_days: s.history };
}

// ------------------------------------------------------------------ mind map layout

interface OutlineNode { text: string; children?: OutlineNode[] }
const MAP_COLORS = ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899', '#14B8A6'];
/** Radial layout of a nested outline → nodes/edges in the app's MindMap shape. */
export function layoutOutline(root: OutlineNode, now: Date, decision = false) {
  const nodes: Rec[] = [];
  const edges: Rec[] = [];
  const stamp = now.getTime().toString(36);
  let n = 0;
  const id = () => `n${stamp}${(n++).toString(36)}`;
  const cx = 600, cy = 400;
  const rootId = id();
  nodes.push({ id: rootId, x: cx, y: cy, text: String(root.text ?? 'Topic').slice(0, 200), color: '#6366F1', isRoot: true });
  const walk = (kids: OutlineNode[], parent: string, depth: number, a0: number, a1: number, color?: string) => {
    kids.forEach((k, i) => {
      const a = a0 + ((i + 0.5) * (a1 - a0)) / kids.length;
      const r = 230 * depth;
      const c = color ?? MAP_COLORS[i % MAP_COLORS.length];
      const nid = id();
      nodes.push({ id: nid, x: Math.round(cx + r * Math.cos(a)), y: Math.round(cy + r * Math.sin(a)), text: String(k.text ?? '').slice(0, 200), color: c, ...(decision ? { isDecision: !!k.children?.length } : {}) });
      edges.push({ id: `e${nid}`, from: parent, to: nid });
      if (k.children?.length) walk(k.children, nid, depth + 1, a0 + (i * (a1 - a0)) / kids.length, a0 + ((i + 1) * (a1 - a0)) / kids.length, c);
    });
  };
  walk(root.children ?? [], rootId, 1, 0, Math.PI * 2);
  if (nodes.length > 400) throw new AgentError('invalid', 'Outline too large (max 400 nodes).');
  return { nodes, edges };
}

// ------------------------------------------------------------------ catalog

const R: AgentScope[] = ['life:read'];
const W: AgentScope[] = ['life:write'];
const X: AgentScope[] = ['life:delete'];
const DEL_INPUT = { type: 'object' as const, properties: { ids: IDS, confirm_token: S }, required: ['ids'] };

const LEARNING_PLATFORMS: [RegExp, string][] = [[/youtube\.com|youtu\.be/, 'youtube'], [/vimeo\.com/, 'vimeo'], [/spotify\.com/, 'spotify'], [/podcasts\.apple\.com/, 'apple-podcasts'], [/soundcloud\.com/, 'soundcloud'], [/coursera\.org/, 'coursera'], [/udemy\.com/, 'udemy'], [/khanacademy\.org/, 'khan-academy'], [/ocw\.mit\.edu/, 'mit-ocw'], [/ted\.com/, 'ted']];
const platformOf = (url: string) => LEARNING_PLATFORMS.find(([re]) => re.test(url.toLowerCase()))?.[1] ?? 'other';
const isAudio = (url: string) => /podcast|spotify|soundcloud|audio|\.mp3|\.m4a|\.wav/.test(url.toLowerCase());

export const LIFE_TOOLS: LifeToolDef[] = [
  // ---------------------------------------------------------------- habits
  {
    name: 'habits_list', title: 'List habits', scopes: R, needs: ['habits'],
    description: 'Habits with today\'s status, current streak and the last 7 days. Pass id for one habit with its full per-day history (optionally from/to).',
    input: { type: 'object', properties: { id: S, query: S, from: DATE, to: DATE } },
    run: async (x) => {
      const day = today(x);
      if (x.args.id) {
        const h = find(x.life.habits, x.args.id, 'name', 'habit');
        const days = Object.entries(h.monthlyHistory ?? {}).filter(([d, v]) => v && inRange(d, x.args.from, x.args.to)).map(([d]) => d).sort();
        return { result: { ...describeHabit(h, day), done_on: days } };
      }
      const hs = live(x.life.habits).filter((h) => matches(h, x.args.query, ['name', 'description']));
      return { result: { date: day, done: hs.filter((h) => habitStats(h.monthlyHistory ?? {}, day).completedToday).length, habits: hs.map((h) => describeHabit(h, day)) } };
    },
  },
  {
    name: 'habits_save', title: 'Create or edit habit', scopes: W, needs: ['habits'],
    description: 'Create a habit (name required) or edit one (pass id or its exact name in id). Colors: hex like #10B981.',
    input: { type: 'object', properties: { id: S, name: S, description: S, color: S } },
    run: async (x) => {
      const r = save(x, 'habits', 'name', 'habit', ['name', 'description', 'color'], (a) => {
        need(a.name, 'name is required to create a habit');
        const n = live(x.life.habits).length;
        return { id: newId({ now: x.now, source: 'api' }), name: String(a.name), streak: 0, completedToday: false, history: [false, false, false, false, false, false, false], monthlyHistory: {}, color: HABIT_COLORS[n % HABIT_COLORS.length], createdAt: iso(x.now) };
      });
      return { ...r, result: describeHabit(r.result as Rec, today(x)) };
    },
  },
  {
    name: 'habits_check', title: 'Check in a habit', scopes: W, needs: ['habits'],
    description: 'Mark a habit done (or not done with done=false) for a day (default today). Streak and history update automatically.',
    input: { type: 'object', properties: { habit: { type: 'string', description: 'Habit id or name' }, date: DATE, done: B }, required: ['habit'] },
    run: async (x) => {
      const h = find(x.life.habits, x.args.habit, 'name', 'habit');
      const day = x.args.date ?? today(x);
      need(isDate(day), 'date must be YYYY-MM-DD');
      const monthlyHistory = { ...(h.monthlyHistory ?? {}), [day]: x.args.done !== false };
      const s = habitStats(monthlyHistory, today(x));
      const edit = { monthlyHistory, completedToday: s.completedToday, streak: s.streak, history: s.history };
      return { result: describeHabit({ ...h, ...edit }, today(x)), edits: [{ coll: 'habits', id: h.id, edit }], summary: `${x.args.done === false ? 'unchecked' : 'checked'} "${h.name}" for ${day}` };
    },
  },
  { name: 'habits_delete', title: 'Delete habits', scopes: X, needs: ['habits'], description: 'Delete habits by id or name. More than one needs confirm_token.', input: DEL_INPUT, run: (x) => del(x, 'habits_delete', 'habits', 'name', 'habit') },

  // ---------------------------------------------------------------- goals
  {
    name: 'goals_list', title: 'List goals', scopes: R, needs: ['goals'],
    description: 'Goals with category (Career, Personal, Health, Skill), target date and progress %. Filter by category, query or due before a date.',
    input: { type: 'object', properties: { id: S, category: { type: 'string', enum: ['Career', 'Personal', 'Health', 'Skill'] }, query: S, due_before: DATE } },
    run: async (x) => {
      if (x.args.id) return { result: find(x.life.goals, x.args.id, 'title', 'goal') };
      const gs = live(x.life.goals).filter((g) => (!x.args.category || g.category === x.args.category) && matches(g, x.args.query, ['title']) && (!x.args.due_before || (g.targetDate ?? '') <= x.args.due_before))
        .sort((a, b) => (a.targetDate ?? '').localeCompare(b.targetDate ?? ''));
      return { result: { count: gs.length, goals: gs } };
    },
  },
  {
    name: 'goals_save', title: 'Create or edit goal', scopes: W, needs: ['goals'],
    description: 'Create a goal (title required; category defaults to Personal, target date to +30 days) or update one by id/title — e.g. set progress 0–100.',
    input: { type: 'object', properties: { id: S, title: S, category: { type: 'string', enum: ['Career', 'Personal', 'Health', 'Skill'] }, targetDate: DATE, progress: N } },
    run: async (x) => {
      if (x.args.progress !== undefined) x.args.progress = clamp(Math.round(Number(x.args.progress)), 0, 100);
      return save(x, 'goals', 'title', 'goal', ['title', 'category', 'targetDate', 'progress'], (a) => {
        need(a.title, 'title is required');
        return { id: newId({ now: x.now, source: 'api' }), title: String(a.title), category: 'Personal', targetDate: new Date(x.now.getTime() + 30 * 86_400_000).toISOString().slice(0, 10), progress: 0 };
      }, (g) => need(!g.targetDate || isDate(g.targetDate), 'targetDate must be YYYY-MM-DD'));
    },
  },
  { name: 'goals_delete', title: 'Delete goals', scopes: X, needs: ['goals'], description: 'Delete goals by id or title. More than one needs confirm_token.', input: DEL_INPUT, run: (x) => del(x, 'goals_delete', 'goals', 'title', 'goal') },

  // ---------------------------------------------------------------- milestones
  {
    name: 'milestones_list', title: 'List milestones', scopes: R, needs: ['milestones'],
    description: 'Milestones (achievements and key dates), newest first. Filter by completed, date range or query.',
    input: { type: 'object', properties: { id: S, completed: B, from: DATE, to: DATE, query: S } },
    run: async (x) => {
      if (x.args.id) return { result: find(x.life.milestones, x.args.id, 'title', 'milestone') };
      const ms = live(x.life.milestones).filter((m) => (x.args.completed === undefined || !!m.completed === x.args.completed) && (!x.args.from && !x.args.to ? true : inRange(m.date, x.args.from, x.args.to)) && matches(m, x.args.query, ['title', 'description']))
        .sort((a, b) => (b.date ?? '').localeCompare(a.date ?? ''));
      return { result: { count: ms.length, milestones: ms } };
    },
  },
  {
    name: 'milestones_save', title: 'Create or edit milestone', scopes: W, needs: ['milestones'],
    description: 'Create a milestone (title required; date defaults to today) or update one by id/title (e.g. completed=true).',
    input: { type: 'object', properties: { id: S, title: S, date: DATE, description: S, completed: B } },
    run: async (x) => save(x, 'milestones', 'title', 'milestone', ['title', 'date', 'description', 'completed'], (a) => {
      need(a.title, 'title is required');
      return { id: newId({ now: x.now, source: 'api' }), title: String(a.title), date: today(x), description: '', completed: false };
    }, (m) => need(isDate(m.date), 'date must be YYYY-MM-DD')),
  },
  { name: 'milestones_delete', title: 'Delete milestones', scopes: X, needs: ['milestones'], description: 'Delete milestones by id or title. More than one needs confirm_token.', input: DEL_INPUT, run: (x) => del(x, 'milestones_delete', 'milestones', 'title', 'milestone') },

  // ---------------------------------------------------------------- calendar
  {
    name: 'calendar_list', title: 'List calendar events', scopes: R, needs: ['events'],
    description: 'Calendar events between from and to (default: today through the next 14 days), sorted by date and time. Pass id for one event.',
    input: { type: 'object', properties: { id: S, from: DATE, to: DATE, query: S, limit: N } },
    run: async (x) => {
      if (x.args.id) return { result: find(x.life.events, x.args.id, 'title', 'event') };
      const from = x.args.from ?? today(x);
      const to = x.args.to ?? new Date(new Date(`${from}T12:00:00Z`).getTime() + 14 * 86_400_000).toISOString().slice(0, 10);
      const es = live(x.life.events).filter((e) => inRange(e.date, from, to) && matches(e, x.args.query, ['title', 'description', 'location']))
        .sort((a, b) => `${a.date} ${a.startTime ?? ''}`.localeCompare(`${b.date} ${b.startTime ?? ''}`));
      return { result: { from, to, count: es.length, events: es.slice(0, limitOf(x.args, 200)) } };
    },
  },
  {
    name: 'calendar_save', title: 'Create or edit event', scopes: W, needs: ['events'],
    description: 'Create a calendar event (title and date required) or update one by id/title. Times are HH:MM; reminder defaults to true.',
    input: { type: 'object', properties: { id: S, title: S, date: DATE, startTime: TIME, endTime: TIME, description: S, location: S, color: S, reminder: B } },
    run: async (x) => save(x, 'events', 'title', 'event', ['title', 'date', 'startTime', 'endTime', 'description', 'location', 'color', 'reminder'], (a) => {
      need(a.title && a.date, 'title and date are required');
      return { id: newId({ now: x.now, source: 'api' }), title: String(a.title), date: a.date, color: '#3b82f6', reminder: true };
    }, (e) => {
      need(isDate(e.date), 'date must be YYYY-MM-DD');
      need(!e.startTime || isTime(e.startTime), 'startTime must be HH:MM');
      need(!e.endTime || isTime(e.endTime), 'endTime must be HH:MM');
    }),
  },
  { name: 'calendar_delete', title: 'Delete events', scopes: X, needs: ['events'], description: 'Delete calendar events by id or title. More than one needs confirm_token.', input: DEL_INPUT, run: (x) => del(x, 'calendar_delete', 'events', 'title', 'event') },

  // ---------------------------------------------------------------- daily map
  {
    name: 'daily_map_list', title: 'Daily map (time blocks)', scopes: R, needs: ['dailymapper', 'dailymappertemplates'],
    description: 'Time-blocked plan for a day (default today) with each block\'s status (yes/no/partial), comment and adjustment, plus the permanent blocks that repeat daily, on workdays or on weekends. Use from/to for several days.',
    input: { type: 'object', properties: { date: DATE, from: DATE, to: DATE } },
    run: async (x) => {
      const from = x.args.from ?? x.args.date ?? today(x);
      const to = x.args.to ?? x.args.date ?? from;
      const blocks = live(x.life.dailymapper).filter((e) => inRange(e.date, from, to)).sort((a, b) => `${a.date} ${a.startTime}`.localeCompare(`${b.date} ${b.startTime}`));
      const done = blocks.filter((b) => b.completed === 'yes').length;
      return { result: { from, to, blocks, completion: blocks.length ? `${done}/${blocks.length}` : null, permanent: live(x.life.dailymappertemplates).sort((a, b) => a.startTime.localeCompare(b.startTime)) } };
    },
  },
  {
    name: 'daily_map_save', title: 'Plan or update a time block', scopes: W, needs: ['dailymapper', 'dailymappertemplates'],
    description: 'Create a time block (task, startTime, endTime; date defaults to today) or update one by id — e.g. completed="yes"|"no"|"partial", comment, adjustment. Set permanent="daily"|"workday"|"weekend" to also make it a repeating block the app adds every matching day.',
    input: { type: 'object', properties: { id: S, date: DATE, task: S, startTime: TIME, endTime: TIME, completed: { type: 'string', enum: ['yes', 'no', 'partial'] }, comment: S, adjustment: S, color: S, location: { type: 'string', enum: ['home', 'work', 'other'] }, permanent: { type: 'string', enum: ['daily', 'workday', 'weekend'] } } },
    run: async (x) => {
      const a = x.args;
      const fields = ['date', 'task', 'startTime', 'endTime', 'completed', 'comment', 'adjustment', 'color', 'location'];
      const r = a.id
        ? (() => {
            const cur = live(x.life.dailymapper).find((e) => e.id === a.id);
            if (!cur) throw new AgentError('not_found', `No time block ${a.id}.`);
            const edit = pick(a, fields);
            return { result: { ...cur, ...edit }, edits: [{ coll: 'dailymapper' as Coll, id: cur.id, edit }], summary: `updated block "${cur.task}"` };
          })()
        : (() => {
            need(a.task && a.startTime && a.endTime, 'task, startTime and endTime are required');
            const rec: Rec = { id: newId({ now: x.now, source: 'api' }), date: a.date ?? today(x), completed: 'no', color: '#3B82F6', location: 'home', ...pick(a, fields) };
            return { result: rec, edits: [{ coll: 'dailymapper' as Coll, id: rec.id, edit: rec }] as Edit[], summary: `planned "${rec.task}" ${rec.startTime}–${rec.endTime} on ${rec.date}` };
          })();
      const b = r.result as Rec;
      need(isDate(b.date) && isTime(b.startTime) && isTime(b.endTime), 'date must be YYYY-MM-DD and times HH:MM');
      need(b.startTime < b.endTime, 'startTime must be before endTime');
      if (a.permanent) {
        const t = { id: `tpl-${newId({ now: x.now, source: 'api' })}`, startTime: b.startTime, endTime: b.endTime, task: b.task, color: b.color, location: b.location, permanentType: a.permanent, createdAt: iso(x.now) };
        r.edits.push({ coll: 'dailymappertemplates', id: t.id, edit: t });
        r.edits[0].edit = { ...r.edits[0].edit, isPermanent: true, permanentType: a.permanent, templateId: t.id };
        r.summary += ` (repeats ${a.permanent})`;
      }
      return r;
    },
  },
  {
    name: 'daily_map_delete', title: 'Delete time blocks', scopes: X, needs: ['dailymapper', 'dailymappertemplates'],
    description: 'Delete time blocks or permanent (repeating) blocks by id. More than one needs confirm_token.',
    input: DEL_INPUT,
    run: async (x) => {
      const ids: string[] = (Array.isArray(x.args.ids) ? x.args.ids : [x.args.ids]).map(String);
      const hits = ids.map((id) => {
        const e = live(x.life.dailymapper).find((r) => r.id === id);
        if (e) return { coll: 'dailymapper' as const, r: e };
        const t = live(x.life.dailymappertemplates).find((r) => r.id === id);
        if (t) return { coll: 'dailymappertemplates' as const, r: t };
        throw new AgentError('not_found', `No time block ${id}.`);
      });
      if (hits.length > 1) await x.confirm('daily_map_delete', hits.map((h) => h.r.id), `This deletes ${hits.length} time blocks. Call again with confirm_token to proceed.`, hits.map((h) => `${h.r.date ?? h.r.permanentType} ${h.r.startTime} ${h.r.task}`));
      return { result: { deleted: hits.map((h) => h.r.id) }, edits: hits.map((h) => ({ coll: h.coll as Coll, id: h.r.id, edit: { deleted: true, deletedAt: iso(x.now) } })), summary: `deleted ${hits.length} time block(s)` };
    },
  },

  // ---------------------------------------------------------------- journal
  {
    name: 'journal_list', title: 'Read journal', scopes: R, needs: ['logs', 'rants'],
    description: 'Journal entries, newest first: daily log entries (mood: Productive, Neutral, Frustrated, Flow State) and rants (venting; mood frustrated/angry/overwhelmed/confused/venting). Filter by kind, date range, mood or query.',
    input: { type: 'object', properties: { kind: { type: 'string', enum: ['log', 'rant', 'all'] }, from: DATE, to: DATE, mood: S, query: S, limit: N } },
    run: async (x) => {
      const k = x.args.kind ?? 'all';
      const logs = k === 'rant' ? [] : live(x.life.logs).map((l) => ({ kind: 'log', id: l.id, date: l.date, mood: l.mood, content: l.content }));
      const rants = k === 'log' ? [] : live(x.life.rants).map((r) => ({ kind: 'rant', id: r.id, date: r.createdAt ?? r.timestamp, mood: r.mood ?? null, content: r.content }));
      const all = [...logs, ...rants].filter((e) => (!x.args.from && !x.args.to ? true : inRange(e.date, x.args.from, x.args.to)) && (!x.args.mood || lc(e.mood) === lc(x.args.mood)) && matches(e as Rec, x.args.query, ['content']))
        .sort((a, b) => String(b.date ?? '').localeCompare(String(a.date ?? '')));
      return { result: { count: all.length, entries: all.slice(0, limitOf(x.args, 50)) } };
    },
  },
  {
    name: 'journal_save', title: 'Write journal entry', scopes: W, needs: ['logs', 'rants'],
    description: 'Add a daily log entry (kind="log", default; mood defaults to Neutral, date to today) or a rant (kind="rant"), or edit one by id.',
    input: { type: 'object', properties: { id: S, kind: { type: 'string', enum: ['log', 'rant'] }, content: S, mood: S, date: DATE } },
    run: async (x) => {
      const a = x.args;
      const isRant = a.kind === 'rant' || (!!a.id && live(x.life.rants).some((r) => r.id === a.id));
      if (isRant) {
        if (a.mood !== undefined) need(['frustrated', 'angry', 'overwhelmed', 'confused', 'venting'].includes(a.mood), 'rant mood must be frustrated, angry, overwhelmed, confused or venting');
        return save(x, 'rants', 'content', 'rant', ['content', 'mood'], () => {
          need(a.content, 'content is required');
          const at = iso(x.now);
          return { id: newId({ now: x.now, source: 'api' }), content: String(a.content), createdAt: at, timestamp: at };
        });
      }
      if (a.mood !== undefined) need(['Productive', 'Neutral', 'Frustrated', 'Flow State'].includes(a.mood), 'log mood must be Productive, Neutral, Frustrated or Flow State');
      return save(x, 'logs', 'content', 'log entry', ['content', 'mood', 'date'], () => {
        need(a.content, 'content is required');
        return { id: newId({ now: x.now, source: 'api' }), content: String(a.content), mood: 'Neutral', date: today(x) };
      }, (l) => need(isDate(String(l.date).slice(0, 10)), 'date must be YYYY-MM-DD'));
    },
  },
  {
    name: 'journal_delete', title: 'Delete journal entries', scopes: X, needs: ['logs', 'rants'],
    description: 'Delete daily log entries or rants by id. More than one needs confirm_token.', input: DEL_INPUT,
    run: async (x) => {
      const ids: string[] = (Array.isArray(x.args.ids) ? x.args.ids : [x.args.ids]).map(String);
      const hits = ids.map((id) => {
        const l = live(x.life.logs).find((r) => r.id === id); if (l) return { coll: 'logs' as Coll, r: l };
        const r = live(x.life.rants).find((q) => q.id === id); if (r) return { coll: 'rants' as Coll, r };
        throw new AgentError('not_found', `No journal entry ${id}.`);
      });
      if (hits.length > 1) await x.confirm('journal_delete', hits.map((h) => h.r.id), `This deletes ${hits.length} journal entries. Call again with confirm_token to proceed.`, hits.map((h) => String(h.r.content).slice(0, 80)));
      return { result: { deleted: hits.map((h) => h.r.id) }, edits: hits.map((h) => ({ coll: h.coll, id: h.r.id, edit: { deleted: true, deletedAt: iso(x.now) } })), summary: `deleted ${hits.length} journal entr${hits.length === 1 ? 'y' : 'ies'}` };
    },
  },

  // ---------------------------------------------------------------- applications
  {
    name: 'applications_list', title: 'List applications', scopes: R, needs: ['applications'],
    description: 'Job, grant and scholarship applications with status, priority and deadlines. Filter by type, status, priority, query, or deadline_within_days. Pass id for one with contacts, requirements and notes.',
    input: { type: 'object', properties: { id: S, type: { type: 'string', enum: ['job', 'grant', 'scholarship', 'other'] }, status: { type: 'string', enum: ['draft', 'open', 'submitted', 'closed', 'accepted', 'rejected'] }, priority: { type: 'string', enum: ['High', 'Medium', 'Low'] }, query: S, deadline_within_days: N, limit: N } },
    run: async (x) => {
      if (x.args.id) return { result: find(x.life.applications, x.args.id, 'name', 'application') };
      const deadline = (a: Rec) => a.submissionDeadline || a.closingDate || '';
      const horizon = x.args.deadline_within_days !== undefined ? new Date(x.now.getTime() + Number(x.args.deadline_within_days) * 86_400_000).toISOString().slice(0, 10) : null;
      const xs = live(x.life.applications).filter((a) => (!x.args.type || a.type === x.args.type) && (!x.args.status || a.status === x.args.status) && (!x.args.priority || a.priority === x.args.priority)
        && matches(a, x.args.query, ['name', 'organization', 'funder', 'notes', 'tags']) && (!horizon || (deadline(a) && deadline(a) >= today(x) && deadline(a) <= horizon)))
        .sort((a, b) => (deadline(a) || '9999').localeCompare(deadline(b) || '9999'));
      return { result: { count: xs.length, applications: xs.slice(0, limitOf(x.args)).map((a) => ({ id: a.id, name: a.name, organization: a.organization ?? null, type: a.type, status: a.status, priority: a.priority, deadline: deadline(a) || null, link: a.link ?? null, requirements_done: a.requirements ? `${a.requirements.filter((r: Rec) => r.done).length}/${a.requirements.length}` : null })) } };
    },
  },
  {
    name: 'applications_save', title: 'Create or edit application', scopes: W, needs: ['applications'],
    description: 'Track a job/grant/scholarship application (name required) or update one by id/name: status, priority, dates, notes, tags, contacts [{name,email,role}], requirements [{label,done}] (arrays replace the existing list). Use add_requirement / check_requirement for single checklist changes.',
    input: { type: 'object', properties: {
      id: S, name: S, type: { type: 'string', enum: ['job', 'grant', 'scholarship', 'other'] }, status: { type: 'string', enum: ['draft', 'open', 'submitted', 'closed', 'accepted', 'rejected'] }, priority: { type: 'string', enum: ['High', 'Medium', 'Low'] },
      link: S, organization: S, funder: S, awardAmount: S, referenceNumber: S, openingDate: DATE, closingDate: DATE, submissionDeadline: DATE, submittedDate: DATE, notes: S, tags: STRS,
      contacts: { type: 'array', items: { type: 'object', properties: { name: S, email: S, role: S } } },
      requirements: { type: 'array', items: { type: 'object', properties: { label: S, done: B } } },
      add_requirement: S, check_requirement: { type: 'string', description: 'Requirement label to mark done' }, reminderLeadDays: { type: 'array', items: N },
    } },
    run: async (x) => {
      const a = x.args;
      const sid = () => newId({ now: x.now, source: 'api' });
      if (a.contacts) a.contacts = a.contacts.map((c: Rec) => ({ id: c.id ?? sid(), ...c }));
      if (a.requirements) a.requirements = a.requirements.map((r: Rec) => ({ id: r.id ?? sid(), label: String(r.label), done: !!r.done }));
      if (a.add_requirement || a.check_requirement) {
        const cur = a.id ? find(x.life.applications, a.id, 'name', 'application') : null;
        let reqs: Rec[] = a.requirements ?? cur?.requirements ?? [];
        if (a.add_requirement) reqs = [...reqs, { id: sid(), label: String(a.add_requirement), done: false }];
        if (a.check_requirement) {
          const i = reqs.findIndex((r) => lc(r.label) === lc(a.check_requirement));
          if (i < 0) throw new AgentError('not_found', `No requirement "${a.check_requirement}".`);
          reqs = reqs.map((r, j) => (j === i ? { ...r, done: true } : r));
        }
        a.requirements = reqs;
      }
      if (a.status === 'submitted' && !a.submittedDate) a.submittedDate = today(x);
      return save(x, 'applications', 'name', 'application', ['name', 'type', 'status', 'priority', 'link', 'organization', 'funder', 'awardAmount', 'referenceNumber', 'openingDate', 'closingDate', 'submissionDeadline', 'submittedDate', 'notes', 'tags', 'contacts', 'requirements', 'reminderLeadDays'], () => {
        need(a.name, 'name is required');
        return { id: newId({ now: x.now, source: 'api' }), name: String(a.name), type: 'other', status: 'draft', priority: 'Medium', createdAt: iso(x.now), updatedAt: iso(x.now) };
      });
    },
  },
  { name: 'applications_delete', title: 'Delete applications', scopes: X, needs: ['applications'], description: 'Delete applications by id or name. More than one needs confirm_token.', input: DEL_INPUT, run: (x) => del(x, 'applications_delete', 'applications', 'name', 'application') },

  // ---------------------------------------------------------------- learning vault
  {
    name: 'learning_list', title: 'Learning vault', scopes: R, needs: ['learningresources', 'learningfolders'],
    description: 'Saved videos, podcasts and courses with status (unwatched, in-progress, completed), folder, tags and timestamped notes, plus the folders. Pass id for one resource with all notes.',
    input: { type: 'object', properties: { id: S, status: { type: 'string', enum: ['unwatched', 'in-progress', 'completed'] }, folder: S, tag: S, query: S, limit: N } },
    run: async (x) => {
      if (x.args.id) return { result: find(x.life.learningresources, x.args.id, 'title', 'resource') };
      const xs = live(x.life.learningresources).filter((r) => (!x.args.status || r.status === x.args.status) && (!x.args.folder || lc(r.folder) === lc(x.args.folder)) && (!x.args.tag || (r.tags ?? []).some((t: string) => lc(t) === lc(x.args.tag))) && matches(r, x.args.query, ['title', 'description', 'author', 'tags', 'notes']))
        .sort((a, b) => String(b.savedAt ?? '').localeCompare(String(a.savedAt ?? '')));
      const all = live(x.life.learningresources);
      return { result: { total: all.length, completed: all.filter((r) => r.status === 'completed').length, folders: live(x.life.learningfolders).map((f) => ({ id: f.id, name: f.name, items: all.filter((r) => r.folder === f.name).length })), resources: xs.slice(0, limitOf(x.args)).map((r) => ({ id: r.id, title: r.title, url: r.url, platform: r.sourcePlatform, author: r.author ?? null, status: r.status, folder: r.folder ?? null, tags: r.tags ?? [], notes: (r.notes ?? []).length })) } };
    },
  },
  {
    name: 'learning_save', title: 'Save or update learning resource', scopes: W, needs: ['learningresources', 'learningfolders'],
    description: 'Save a video/podcast/course to the learning vault (url and title required; platform detected) or update one by id/title: status, folder (created if missing), tags, description. add_note appends a note (note_timestamp = seconds into the media).',
    input: { type: 'object', properties: { id: S, url: S, title: S, description: S, author: S, status: { type: 'string', enum: ['unwatched', 'in-progress', 'completed'] }, folder: S, tags: STRS, add_note: S, note_timestamp: N } },
    run: async (x) => {
      const a = x.args;
      const extra: Edit[] = [];
      if (a.folder && !live(x.life.learningfolders).some((f) => lc(f.name) === lc(a.folder))) {
        const f = { id: newId({ now: x.now, source: 'api' }), name: String(a.folder), createdAt: iso(x.now) };
        extra.push({ coll: 'learningfolders', id: f.id, edit: f });
      }
      if (a.status === 'completed') a.completedAt = iso(x.now);
      if (a.add_note) {
        const cur = a.id ? find(x.life.learningresources, a.id, 'title', 'resource') : null;
        a.notes = [...(cur?.notes ?? []), { id: newId({ now: x.now, source: 'api' }), content: String(a.add_note), ...(a.note_timestamp !== undefined ? { timestamp: Number(a.note_timestamp) } : {}), createdAt: iso(x.now) }];
      }
      const r = save(x, 'learningresources', 'title', 'resource', ['url', 'title', 'description', 'author', 'status', 'folder', 'tags', 'notes', 'completedAt'], () => {
        need(a.url && a.title, 'url and title are required');
        const url = String(a.url);
        return { id: newId({ now: x.now, source: 'api' }), url, title: String(a.title), contentType: isAudio(url) ? 'audio' : 'video', sourcePlatform: platformOf(url), status: 'unwatched', tags: [], notes: [], isSourceAvailable: true, savedAt: iso(x.now), updatedAt: iso(x.now) };
      });
      return { ...r, edits: [...extra, ...r.edits] };
    },
  },
  {
    name: 'learning_delete', title: 'Delete learning items', scopes: X, needs: ['learningresources', 'learningfolders'],
    description: 'Delete learning resources (or folders, by id) from the vault. More than one needs confirm_token.', input: DEL_INPUT,
    run: async (x) => {
      const ids: string[] = (Array.isArray(x.args.ids) ? x.args.ids : [x.args.ids]).map(String);
      const hits = ids.map((id) => {
        const f = live(x.life.learningfolders).find((r) => r.id === id);
        return f ? { coll: 'learningfolders' as Coll, r: f, label: `folder ${f.name}` } : (() => { const r = find(x.life.learningresources, id, 'title', 'resource'); return { coll: 'learningresources' as Coll, r, label: r.title }; })();
      });
      if (hits.length > 1) await x.confirm('learning_delete', hits.map((h) => h.r.id), `This deletes ${hits.length} learning items. Call again with confirm_token to proceed.`, hits.map((h) => h.label));
      return { result: { deleted: hits.map((h) => h.r.id) }, edits: hits.map((h) => ({ coll: h.coll, id: h.r.id, edit: { deleted: true, deletedAt: iso(x.now) } })), summary: `deleted ${hits.length} learning item(s)` };
    },
  },

  // ---------------------------------------------------------------- mind maps
  {
    name: 'mindmaps_list', title: 'List mind maps', scopes: R, needs: ['mindmaps'],
    description: 'Mind maps and decision trees. Pass id for one map with its nodes and edges, plus an indented text outline of it.',
    input: { type: 'object', properties: { id: S, query: S } },
    run: async (x) => {
      if (x.args.id) {
        const m = find(x.life.mindmaps, x.args.id, 'title', 'mind map');
        const kids = new Map<string, string[]>();
        for (const e of m.edges ?? []) kids.set(e.from, [...(kids.get(e.from) ?? []), e.to]);
        const byId = new Map((m.nodes ?? []).map((n: Rec) => [n.id, n]));
        const root = (m.nodes ?? []).find((n: Rec) => n.isRoot) ?? m.nodes?.[0];
        const lines: string[] = [];
        const seen = new Set<string>();
        const walk = (id: string, d: number) => { if (seen.has(id)) return; seen.add(id); const n = byId.get(id) as Rec | undefined; if (!n) return; lines.push(`${'  '.repeat(d)}- ${n.text}`); for (const k of kids.get(id) ?? []) walk(k, d + 1); };
        if (root) walk(root.id, 0);
        return { result: { ...m, outline: lines.join('\n') } };
      }
      return { result: live(x.life.mindmaps).filter((m) => matches(m, x.args.query, ['title'])).map((m) => ({ id: m.id, title: m.title, type: m.type, nodes: (m.nodes ?? []).length, updatedAt: m.updatedAt })) };
    },
  },
  {
    name: 'mindmaps_save', title: 'Create or edit mind map', scopes: W, needs: ['mindmaps'],
    description: 'Create a mind map or decision tree from an outline — {text, children:[{text, children:[…]}]} — and it is laid out automatically; or update one by id (title, a new outline replaces the nodes, or raw nodes/edges in the app format).',
    input: { type: 'object', properties: { id: S, title: S, type: { type: 'string', enum: ['mindmap', 'decision-tree'] }, outline: { type: 'object', description: 'Root node {text, children:[…]} (nested)' }, nodes: { type: 'array', items: { type: 'object' } }, edges: { type: 'array', items: { type: 'object' } } } },
    run: async (x) => {
      const a = x.args;
      if (a.outline) Object.assign(a, layoutOutline(a.outline as OutlineNode, x.now, a.type === 'decision-tree'));
      return save(x, 'mindmaps', 'title', 'mind map', ['title', 'type', 'nodes', 'edges'], () => {
        need(a.title, 'title is required');
        need(a.nodes, 'Pass an outline (or nodes and edges) to create a map');
        return { id: newId({ now: x.now, source: 'api' }), title: String(a.title), type: 'mindmap', nodes: [], edges: [], createdAt: iso(x.now), updatedAt: iso(x.now) };
      });
    },
  },
  { name: 'mindmaps_delete', title: 'Delete mind maps', scopes: X, needs: ['mindmaps'], description: 'Delete mind maps by id or title. More than one needs confirm_token.', input: DEL_INPUT, run: (x) => del(x, 'mindmaps_delete', 'mindmaps', 'title', 'mind map') },

  // ---------------------------------------------------------------- AI chat history
  {
    name: 'ai_chats_list', title: 'AI chat history', scopes: R, needs: ['iris_conversations'],
    description: 'Conversations with the in-app ClearMind AI (titles and dates). Pass id for the full transcript.',
    input: { type: 'object', properties: { id: S, query: S, limit: N } },
    run: async (x) => {
      if (x.args.id) {
        const c = find(x.life.iris_conversations, x.args.id, 'title', 'conversation');
        return { result: { id: c.id, title: c.title ?? null, createdAt: c.createdAt, messages: (c.messages ?? []).map((m: Rec) => ({ role: m.role, text: m.text, at: m.timestamp })) } };
      }
      const xs = live(x.life.iris_conversations).filter((c) => matches(c, x.args.query, ['title', 'messages'])).sort((a, b) => String(b.updatedAt ?? '').localeCompare(String(a.updatedAt ?? '')));
      return { result: xs.slice(0, limitOf(x.args, 30)).map((c) => ({ id: c.id, title: c.title ?? (c.messages?.[0]?.text ?? '').slice(0, 60), messages: (c.messages ?? []).length, updatedAt: c.updatedAt })) };
    },
  },
  { name: 'ai_chats_delete', title: 'Delete AI chats', scopes: X, needs: ['iris_conversations'], description: 'Delete AI conversations by id. More than one needs confirm_token.', input: DEL_INPUT, run: (x) => del(x, 'ai_chats_delete', 'iris_conversations', 'title', 'conversation') },
];

/** Compact one-line text for search hits across life areas. */
export function lifeSearch(life: Partial<Record<LifeColl, Rec[]>>, q: string, limit = 20) {
  const spec: [LifeColl, string, string, string[]][] = [
    ['habits', 'habit', 'name', ['name', 'description']], ['goals', 'goal', 'title', ['title', 'category']], ['milestones', 'milestone', 'title', ['title', 'description']],
    ['events', 'event', 'title', ['title', 'description', 'location']], ['applications', 'application', 'name', ['name', 'organization', 'funder', 'notes', 'tags']],
    ['learningresources', 'learning', 'title', ['title', 'description', 'author', 'tags', 'notes']], ['logs', 'log', 'content', ['content']], ['rants', 'rant', 'content', ['content']],
    ['mindmaps', 'mindmap', 'title', ['title', 'nodes']], ['dailymapper', 'block', 'task', ['task', 'comment']],
  ];
  const out: { id: string; title: string; kind: string; text: string }[] = [];
  for (const [coll, kind, tk, keys] of spec) {
    for (const r of live(life[coll]).filter((r) => matches(r, q, keys)).slice(0, 5)) out.push({ id: `${kind}:${r.id}`, kind, title: String(r[tk] ?? '').slice(0, 120), text: [r.date, r.status, r.category, r.targetDate, r.mood].filter(Boolean).join(' · ') });
  }
  return out.slice(0, limit);
}
export const LIFE_KIND_COLL: Record<string, LifeColl> = { habit: 'habits', goal: 'goals', milestone: 'milestones', event: 'events', application: 'applications', learning: 'learningresources', log: 'logs', rant: 'rants', mindmap: 'mindmaps', block: 'dailymapper' };
