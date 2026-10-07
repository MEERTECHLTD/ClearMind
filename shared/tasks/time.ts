/**
 * Time-zone aware helpers. Due dates/times are stored as LOCAL wall-clock values
 * ('YYYY-MM-DD' + 'HH:MM') plus an optional IANA `timezone` on the task, so
 * "9:00 Africa/Lagos" never silently becomes 9:00 UTC. Instants (createdAt,
 * completedAt, updatedAt) are UTC ISO strings. Productivity "days" are the
 * user's local calendar days in their configured time zone.
 */

/** The device's IANA zone (falls back to UTC where Intl is unavailable). */
export function deviceTimeZone(): string {
  try { return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'; } catch { return 'UTC'; }
}

const partsIn = (instant: Date, tz: string) => {
  const f = new Intl.DateTimeFormat('en-US', {
    timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
  });
  const p: Record<string, string> = {};
  for (const x of f.formatToParts(instant)) p[x.type] = x.value;
  return { y: Number(p.year), m: Number(p.month), d: Number(p.day), h: Number(p.hour) % 24, mi: Number(p.minute), s: Number(p.second) };
};

/** Local calendar day ('YYYY-MM-DD') of an instant in a time zone. */
export function dayInZone(instant: Date | string, tz?: string | null): string {
  const d = typeof instant === 'string' ? new Date(instant) : instant;
  if (!tz) {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }
  try {
    const p = partsIn(d, tz);
    return `${p.y}-${String(p.m).padStart(2, '0')}-${String(p.d).padStart(2, '0')}`;
  } catch {
    return dayInZone(d, null);
  }
}

/** Offset (ms) of `tz` from UTC at a given instant. */
function zoneOffset(instant: Date, tz: string): number {
  const p = partsIn(instant, tz);
  const asUTC = Date.UTC(p.y, p.m - 1, p.d, p.h, p.mi, p.s);
  return asUTC - Math.floor(instant.getTime() / 1000) * 1000;
}

/**
 * UTC instant for a local wall-clock time in a zone. With no zone, the value is
 * interpreted in the device's zone (floating time).
 */
export function zonedToUtc(date: string, time: string | null | undefined, tz?: string | null): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!m) return null;
  const [h, mi] = (time && /^\d{1,2}:\d{2}$/.test(time) ? time : '00:00').split(':').map(Number);
  if (!tz) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), h, mi);
  try {
    const guess = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), h, mi);
    // Two passes handle DST transitions.
    let t = guess - zoneOffset(new Date(guess), tz);
    t = guess - zoneOffset(new Date(t), tz);
    return new Date(t);
  } catch {
    return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), h, mi);
  }
}

/** A Date whose LOCAL fields equal the wall-clock 'now' in `tz` (for date math in that zone). */
export function nowInZone(tz?: string | null, now: Date = new Date()): Date {
  if (!tz) return now;
  try {
    const p = partsIn(now, tz);
    return new Date(p.y, p.m - 1, p.d, p.h, p.mi, p.s);
  } catch {
    return now;
  }
}

/** Validate an IANA zone name. */
export function isValidTimeZone(tz: string): boolean {
  try { new Intl.DateTimeFormat('en-US', { timeZone: tz }); return true; } catch { return false; }
}
