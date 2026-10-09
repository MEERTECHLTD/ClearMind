import { describe, it, expect } from 'vitest';
import { parseQuickAdd } from './quickAdd';

const now = new Date(2026, 9, 9, 10, 0); // Fri 9 Oct 2026, 10:00 local
const p = (s: string) => parseQuickAdd(s, { now });

describe('spoken Quick Add (voice input)', () => {
  it('"remind me to … tomorrow at 5pm" → task due then, reminder at the due time', () => {
    const r = p('Remind me to call the installer tomorrow at 5pm');
    expect(r.title).toBe('call the installer');
    expect(r.dueDate).toBe('2026-10-10');
    expect(r.dueTime).toBe('17:00');
    expect(r.reminders).toEqual([{ minutesBefore: 0 }]);
  });

  it('"remind me 30 minutes before" / "an hour before"', () => {
    expect(p('Dentist tomorrow at 3pm remind me 30 minutes before').reminders).toEqual([{ minutesBefore: 30 }]);
    const r = p('Standup Monday 9am and remind me an hour before');
    expect(r.reminders).toEqual([{ minutesBefore: 60 }]);
    expect(r.title).toBe('Standup');
  });

  it('"remind me at 8 a.m." sets a clock-time reminder', () => {
    const r = p('Submit grant report Friday remind me at 8 a.m.');
    expect(r.reminders).toEqual([{ time: '08:00' }]);
    expect(r.title).toBe('Submit grant report');
  });

  it('plain speech without reminder words is unchanged', () => {
    const r = p('Buy milk tomorrow');
    expect(r.title).toBe('Buy milk');
    expect(r.reminders).toEqual([]);
  });
});
