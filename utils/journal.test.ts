import { describe, it, expect } from 'vitest';
import { entryToTask } from './journal';

describe('entryToTask', () => {
  it('uses a one-line entry as the task name', () => {
    expect(entryToTask('  Call the bank ')).toEqual({ title: 'Call the bank' });
  });
  it('puts the full entry in the description when it has more lines', () => {
    expect(entryToTask('\nFix the build\nIt broke after the merge')).toEqual({ title: 'Fix the build', description: 'Fix the build\nIt broke after the merge' });
  });
  it('shortens very long first lines', () => {
    const r = entryToTask('x'.repeat(200));
    expect(r.title.length).toBe(118);
    expect(r.title.endsWith('…')).toBe(true);
    expect(r.description).toBe('x'.repeat(200));
  });
});
