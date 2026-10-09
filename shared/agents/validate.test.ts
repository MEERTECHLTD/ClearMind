import { describe, it, expect } from 'vitest';
import { validateArgs, ArgError, ARG_LIMITS } from './validate';

const schema = {
  properties: {
    title: { type: 'string' },
    limit: { type: 'number' },
    done: { type: 'boolean' },
    priority: { type: 'string', enum: ['p1', 'p2', 'p3', 'p4'] },
    ids: { type: 'array', items: { type: 'string' } },
    recurrence: { type: 'object', properties: { freq: { type: 'string', enum: ['daily', 'weekly'] }, interval: { type: 'number' } } },
  },
};

describe('validateArgs', () => {
  it('passes valid args through and keeps undeclared properties', () => {
    expect(validateArgs(schema, { title: 'a', limit: 3, extra: { x: 1 } })).toEqual({ title: 'a', limit: 3, extra: { x: 1 } });
  });

  it('coerces common LLM drift instead of failing', () => {
    expect(validateArgs(schema, { limit: '10', done: 'true', title: 42, priority: 'P2', ids: [1, 'b'] })).toEqual({ limit: 10, done: true, title: '42', priority: 'p2', ids: ['1', 'b'] });
    expect(validateArgs(schema, { priority: 1 })).toEqual({ priority: 'p1' });
    expect(validateArgs(schema, { recurrence: { freq: 'Weekly', interval: '2' } })).toEqual({ recurrence: { freq: 'weekly', interval: 2 } });
  });

  it('allows null to clear optional fields', () => {
    expect(validateArgs(schema, { priority: null, title: null })).toEqual({ priority: null, title: null });
  });

  it('rejects wrong types, bad enums and oversize input', () => {
    expect(() => validateArgs(schema, { limit: 'many' })).toThrow(ArgError);
    expect(() => validateArgs(schema, { ids: { a: 1 } })).toThrow(/ids must be array/);
    expect(validateArgs(schema, { ids: 'one' })).toEqual({ ids: ['one'] });
    expect(() => validateArgs(schema, { priority: 'urgent' })).toThrow(/one of/);
    expect(() => validateArgs(schema, { title: 'x'.repeat(ARG_LIMITS.maxString + 1) })).toThrow(/longer/);
    expect(() => validateArgs(schema, { ids: Array(ARG_LIMITS.maxArray + 1).fill('a') })).toThrow(/more than/);
    let deep: any = {}; const root = deep;
    for (let i = 0; i < 12; i++) { deep.a = {}; deep = deep.a; }
    expect(() => validateArgs(schema, root)).toThrow(/deeply/);
  });

  it('rejects prototype-pollution keys at any depth', () => {
    expect(() => validateArgs(schema, JSON.parse('{"__proto__": {"polluted": true}}'))).toThrow(/not allowed/);
    expect(() => validateArgs(schema, JSON.parse('{"recurrence": {"constructor": {"prototype": {}}}}'))).toThrow(/not allowed/);
    expect(({} as any).polluted).toBeUndefined();
  });
});
