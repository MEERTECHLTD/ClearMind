/**
 * Local-calendar date helpers for the task layer. Due dates are stored as plain
 * 'YYYY-MM-DD' strings in the user's local calendar (never UTC ISO), so every
 * helper here works on local Date parts. Pure — no platform APIs.
 */

const pad = (n: number) => String(n).padStart(2, '0');

export const toISODate = (d: Date): string => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

/** Parse 'YYYY-MM-DD' as a LOCAL date (midnight). Returns null when malformed. */
export function parseISODate(s?: string | null): Date | null {
  if (!s) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return Number.isNaN(d.getTime()) ? null : d;
}

export const startOfDay = (d: Date): Date => new Date(d.getFullYear(), d.getMonth(), d.getDate());

export const addDays = (d: Date, n: number): Date => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);

/** Add months, clamping to the last day of the target month (Jan 31 + 1 → Feb 28/29). */
export function addMonths(d: Date, n: number): Date {
  const target = new Date(d.getFullYear(), d.getMonth() + n, 1);
  const lastDay = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate();
  return new Date(target.getFullYear(), target.getMonth(), Math.min(d.getDate(), lastDay));
}

export const todayISO = (now: Date = new Date()): string => toISODate(now);

/** Whole days from `a` to `b` (local calendar; DST-safe). */
export function diffDays(a: Date, b: Date): number {
  const ua = Date.UTC(a.getFullYear(), a.getMonth(), a.getDate());
  const ub = Date.UTC(b.getFullYear(), b.getMonth(), b.getDate());
  return Math.round((ub - ua) / 86_400_000);
}

export const WEEKDAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
export const WEEKDAY_LONG = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
export const MONTH_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export const MONTH_LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

/** 'HH:MM' → '5:30 PM'. */
export function formatTime(t?: string | null): string {
  if (!t) return '';
  const [h, m] = t.split(':').map(Number);
  if (Number.isNaN(h)) return '';
  return `${h % 12 || 12}:${pad(m || 0)} ${h >= 12 ? 'PM' : 'AM'}`;
}

/**
 * Human label for a due date relative to `now`: Today / Tomorrow / Yesterday /
 * weekday name (within the next 6 days) / 'Oct 12' / 'Oct 12 2027'.
 */
export function formatDueDate(iso?: string | null, now: Date = new Date()): string {
  const d = parseISODate(iso);
  if (!d) return '';
  const delta = diffDays(now, d);
  if (delta === 0) return 'Today';
  if (delta === 1) return 'Tomorrow';
  if (delta === -1) return 'Yesterday';
  if (delta > 1 && delta < 7) return WEEKDAY_LONG[d.getDay()];
  const base = `${MONTH_SHORT[d.getMonth()]} ${d.getDate()}`;
  return d.getFullYear() === now.getFullYear() ? base : `${base} ${d.getFullYear()}`;
}

/** Section heading for a day in Upcoming: 'Oct 12 · Today · Monday'. */
export function formatDayHeading(iso: string, now: Date = new Date()): string {
  const d = parseISODate(iso);
  if (!d) return iso;
  const rel = formatDueDate(iso, now);
  const base = `${MONTH_SHORT[d.getMonth()]} ${d.getDate()}`;
  const weekday = WEEKDAY_LONG[d.getDay()];
  if (rel === 'Today' || rel === 'Tomorrow') return `${base} · ${rel} · ${weekday}`;
  return `${base} · ${weekday}`;
}

/** Monday-start week containing `d`. */
export function startOfWeek(d: Date): Date {
  const day = d.getDay(); // 0 Sun
  return addDays(startOfDay(d), day === 0 ? -6 : 1 - day);
}
