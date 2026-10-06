/**
 * Quick Add natural-language parser.
 *
 *   "Submit report tomorrow at 5pm p1 #Work @email"
 *   → title "Submit report", due tomorrow 17:00, priority High, project Work, label email
 *
 * Supported: today/tomorrow/weekday/next week/weekend/"in 3 days"/"Oct 12"/ISO
 * dates, times ("5pm", "17:30", "at 9", "noon"), recurrence ("every day",
 * "every weekday", "every mon, wed", "every 2 weeks", "daily", "monthly"),
 * priorities p1–p4, #project (multi-word existing names match greedily) and
 * @label / %label (multiple).
 *
 * Every match is reported as a token with its [start,end) range in the ORIGINAL
 * input so the UI can highlight it. A token whose lower-cased text is in
 * `ignore` is left as plain title text (lets the user "un-parse" a word like
 * "Monday" in "Monday report").
 */
import type { TaskPriority, TaskRecurrence } from '../types';
import { addDays, addMonths, startOfDay, startOfWeek, toISODate } from './dates';
import { firstOccurrence } from './recurrence';

export type QuickAddTokenType = 'date' | 'time' | 'recurrence' | 'priority' | 'project' | 'label';

export interface QuickAddToken {
  type: QuickAddTokenType;
  start: number;
  end: number;
  text: string;
}

export interface QuickAddResult {
  title: string;
  dueDate?: string;
  dueTime?: string;
  recurrence?: TaskRecurrence;
  priority?: TaskPriority;
  /** Matched existing project id, or undefined when `projectName` is new. */
  projectId?: string;
  projectName?: string;
  /** Labels: id set when it matched an existing label, otherwise a new name. */
  labels: { id?: string; name: string }[];
  tokens: QuickAddToken[];
}

export interface QuickAddContext {
  now?: Date;
  projects?: { id: string; title: string }[];
  labels?: { id: string; name: string }[];
  ignore?: Iterable<string>;
}

const WD = 'mon(?:day)?|tue(?:s|sday)?|wed(?:s|nesday)?|thu(?:r|rs|rsday)?|fri(?:day)?|sat(?:urday)?|sun(?:day)?';
const MONTH = 'jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?';
const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
const WDS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
const NUM_WORDS: Record<string, number> = { a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10 };

const wdIndex = (s: string) => WDS.indexOf(s.toLowerCase().slice(0, 3));
const monthIndex = (s: string) => MONTHS.indexOf(s.toLowerCase().slice(0, 3));
const pad = (n: number) => String(n).padStart(2, '0');
const toNum = (s: string) => (/^\d+$/.test(s) ? Number(s) : NUM_WORDS[s.toLowerCase()] ?? NaN);

// Leading boundary is a captured group (no lookbehind — keeps Hermes-safe).
const B = '(^|\\s)';
const E = '(?=$|\\s|[,.;!?])';

type Handler = (m: RegExpExecArray) => boolean;

export function parseQuickAdd(input: string, ctx: QuickAddContext = {}): QuickAddResult {
  const now = ctx.now ?? new Date();
  const today = startOfDay(now);
  const ignore = new Set([...(ctx.ignore ?? [])].map((s) => s.toLowerCase()));
  const tokens: QuickAddToken[] = [];
  let work = input; // same length as input; consumed ranges are blanked out
  const result: QuickAddResult = { title: '', labels: [], tokens };

  const consume = (type: QuickAddTokenType, start: number, end: number) => {
    tokens.push({ type, start, end, text: input.slice(start, end) });
    work = work.slice(0, start) + ' '.repeat(end - start) + work.slice(end);
  };

  /** Run `pattern` (with leading B group) once; handler decides acceptance. */
  const take = (type: QuickAddTokenType, pattern: string, handler: Handler): boolean => {
    const re = new RegExp(B + '(' + pattern + ')' + E, 'gi');
    let m: RegExpExecArray | null;
    while ((m = re.exec(work))) {
      const start = m.index + m[1].length;
      const end = start + m[2].length;
      if (ignore.has(input.slice(start, end).toLowerCase())) continue;
      // Re-index so handler groups start at 1 for the pattern's inner captures.
      const inner = m.slice(2) as unknown as RegExpExecArray;
      if (handler(inner)) {
        consume(type, start, end);
        return true;
      }
    }
    return false;
  };

  // ---- Recurrence (before dates: it contains weekday words) ----
  const setRec = (rule: TaskRecurrence) => { result.recurrence = rule; return true; };
  take('recurrence', `every\\s+(other|\\d+)\\s+(day|week|month|year)s?`, (m) =>
    setRec({ freq: unitFreq(m[2]), interval: m[1].toLowerCase() === 'other' ? 2 : Math.max(1, Number(m[1])) })) ||
  take('recurrence', `every\\s*day|daily|everyday`, () => setRec({ freq: 'daily', interval: 1 })) ||
  take('recurrence', `every\\s+(?:weekday|workday)s?`, () => setRec({ freq: 'weekly', interval: 1, weekdays: [1, 2, 3, 4, 5] })) ||
  take('recurrence', `every\\s+weekends?`, () => setRec({ freq: 'weekly', interval: 1, weekdays: [0, 6] })) ||
  take('recurrence', `every\\s+(other\\s+)?((?:${WD})(?:\\s*(?:,|and|&)?\\s*(?:${WD}))*)`, (m) => {
    const days = [...new Set(m[2].split(/[\s,&]+|and/i).filter(Boolean).map(wdIndex).filter((d) => d >= 0))];
    if (!days.length) return false;
    return setRec({ freq: 'weekly', interval: m[1] ? 2 : 1, weekdays: days.sort((a, b) => a - b) });
  }) ||
  take('recurrence', `every\\s+(week|month|year)|weekly|monthly|yearly|annually`, (m) => {
    const w = (m[1] ?? m[0]).toLowerCase();
    return setRec({ freq: w.startsWith('week') ? 'weekly' : w.startsWith('month') ? 'monthly' : 'yearly', interval: 1 });
  });

  // ---- Priority ----
  take('priority', `p([1-4])`, (m) => {
    result.priority = (['High', 'Medium', 'Low', 'None'] as TaskPriority[])[Number(m[1]) - 1];
    return true;
  });

  // ---- Project (#) and labels (@ / %) — prefer the longest existing name ----
  const matchNamed = (sigil: RegExp, names: { id: string; name: string }[], onHit: (id: string | undefined, name: string) => void, multi: boolean) => {
    const sorted = [...names].sort((a, b) => b.name.length - a.name.length);
    for (let i = 0; i < work.length; i++) {
      if (!sigil.test(work[i]) || (i > 0 && !/\s/.test(work[i - 1]))) continue;
      const rest = work.slice(i + 1);
      let hit: { id?: string; name: string; len: number } | null = null;
      for (const n of sorted) {
        const cand = rest.slice(0, n.name.length);
        const after = rest[n.name.length];
        if (cand.toLowerCase() === n.name.toLowerCase() && (after === undefined || /\s/.test(after))) {
          hit = { id: n.id, name: n.name, len: n.name.length };
          break;
        }
      }
      if (!hit) {
        const w = /^[^\s#@%]+/.exec(rest);
        if (!w) continue;
        hit = { name: w[0], len: w[0].length };
      }
      const text = input.slice(i, i + 1 + hit.len);
      if (ignore.has(text.toLowerCase())) continue;
      onHit(hit.id, hit.name);
      consume(sigil.source.includes('#') ? 'project' : 'label', i, i + 1 + hit.len);
      if (!multi) return;
    }
  };
  matchNamed(/#/, (ctx.projects ?? []).map((p) => ({ id: p.id, name: p.title })), (id, name) => {
    result.projectId = id;
    result.projectName = name;
  }, false);
  matchNamed(/[@%]/, ctx.labels ?? [], (id, name) => {
    if (!result.labels.some((l) => l.name.toLowerCase() === name.toLowerCase())) result.labels.push({ id, name });
  }, true);

  // ---- Dates ----
  const setDate = (d: Date) => { result.dueDate = toISODate(d); return true; };
  const PRE = '(?:(?:on|by|due)\\s+)?';
  take('date', `${PRE}(?:today|tod|tonight)`, () => setDate(today)) ||
  take('date', `${PRE}(?:tomorrow|tmrw?|tmr)`, () => setDate(addDays(today, 1))) ||
  take('date', `${PRE}next\\s+week`, () => setDate(addDays(startOfWeek(today), 7))) ||
  take('date', `${PRE}next\\s+month`, () => setDate(addMonths(today, 1))) ||
  take('date', `${PRE}(?:this\\s+)?weekend`, () => setDate(addDays(today, (6 - today.getDay() + 7) % 7))) ||
  take('date', `${PRE}next\\s+(${WD})`, (m) => setDate(addDays(addDays(startOfWeek(today), 7), (wdIndex(m[1]) + 6) % 7))) ||
  take('date', `in\\s+(\\d+|an?|one|two|three|four|five|six|seven|eight|nine|ten)\\s+(day|week|month)s?`, (m) => {
    const n = toNum(m[1]);
    if (!Number.isFinite(n)) return false;
    const u = m[2].toLowerCase();
    return setDate(u === 'day' ? addDays(today, n) : u === 'week' ? addDays(today, 7 * n) : addMonths(today, n));
  }) ||
  take('date', `(\\d{4})-(\\d{2})-(\\d{2})`, (m) => validDate(Number(m[1]), Number(m[2]) - 1, Number(m[3]), setDate)) ||
  take('date', `${PRE}(${MONTH})\\s+(\\d{1,2})(?:st|nd|rd|th)?(?:,?\\s+(\\d{4}))?`, (m) =>
    monthDay(monthIndex(m[1]), Number(m[2]), m[3], today, setDate)) ||
  take('date', `${PRE}(\\d{1,2})(?:st|nd|rd|th)?\\s+(?:of\\s+)?(${MONTH})(?:,?\\s+(\\d{4}))?`, (m) =>
    monthDay(monthIndex(m[2]), Number(m[1]), m[3], today, setDate)) ||
  take('date', `${PRE}(?:this\\s+)?(${WD})`, (m) => setDate(addDays(today, (wdIndex(m[1]) - today.getDay() + 7) % 7)));

  // ---- Time ----
  const setTime = (h: number, min: number) => {
    if (h < 0 || h > 23 || min < 0 || min > 59) return false;
    result.dueTime = `${pad(h)}:${pad(min)}`;
    return true;
  };
  const AT = '(?:at\\s+)?';
  take('time', `${AT}(\\d{1,2})(?::(\\d{2}))?\\s*(am|pm|a\\.m\\.|p\\.m\\.)`, (m) => {
    let h = Number(m[1]);
    if (h < 1 || h > 12) return false;
    const pm = m[3].toLowerCase().startsWith('p');
    if (h === 12) h = pm ? 12 : 0; else if (pm) h += 12;
    return setTime(h, Number(m[2] ?? 0));
  }) ||
  take('time', `${AT}([01]?\\d|2[0-3]):([0-5]\\d)`, (m) => setTime(Number(m[1]), Number(m[2]))) ||
  take('time', `${AT}(noon|midday|midnight)`, (m) => setTime(m[1].toLowerCase() === 'midnight' ? 0 : 12, 0)) ||
  take('time', `at\\s+(\\d{1,2})`, (m) => {
    const h = Number(m[1]);
    if (h > 23) return false;
    return setTime(h >= 1 && h <= 7 ? h + 12 : h, 0); // "at 5" → 5 PM
  });

  // A repeat rule or a time with no explicit date anchors to the first occurrence / today.
  if (result.recurrence && !result.dueDate) result.dueDate = firstOccurrence(result.recurrence, today);
  if (result.dueTime && !result.dueDate) result.dueDate = toISODate(today);

  // Title = input minus all consumed ranges, whitespace collapsed.
  tokens.sort((a, b) => a.start - b.start);
  let title = '';
  let cursor = 0;
  for (const t of tokens) {
    title += input.slice(cursor, t.start) + ' ';
    cursor = t.end;
  }
  title += input.slice(cursor);
  result.title = title.replace(/\s+/g, ' ').trim();
  return result;
}

function unitFreq(u: string): TaskRecurrence['freq'] {
  const s = u.toLowerCase();
  return s.startsWith('day') ? 'daily' : s.startsWith('week') ? 'weekly' : s.startsWith('month') ? 'monthly' : 'yearly';
}

function validDate(y: number, m: number, d: number, set: (d: Date) => boolean): boolean {
  const dt = new Date(y, m, d);
  if (dt.getFullYear() !== y || dt.getMonth() !== m || dt.getDate() !== d) return false;
  return set(dt);
}

/** 'Oct 12' without a year → this year, or next year if already past. */
function monthDay(month: number, day: number, year: string | undefined, today: Date, set: (d: Date) => boolean): boolean {
  if (month < 0) return false;
  if (year) return validDate(Number(year), month, day, set);
  const y = today.getFullYear();
  const cand = new Date(y, month, day);
  if (cand.getMonth() !== month) return false;
  return validDate(cand < today ? y + 1 : y, month, day, set);
}
