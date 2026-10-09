import { describe, it, expect } from 'vitest';
import { createLimiter, MemoryLimitStore, FirestoreLimitStore, type LimitStore } from './rateLimit';
import { FakeFirestore } from './testing/fakeFirestore';

const rule = { name: 't', limit: 3, windowMs: 60_000 };
const T0 = 1_700_000_000_000 - (1_700_000_000_000 % 60_000);

describe('rate limiter', () => {
  it('allows up to the limit per window, then reports retry-after', async () => {
    const l = createLimiter();
    const r = [];
    for (let i = 0; i < 4; i++) r.push(await l.check(rule, 'ip1', T0 + 1000));
    expect(r.map((x) => x.ok)).toEqual([true, true, true, false]);
    expect(r[3].retryAfterSec).toBe(59);
    expect((await l.check(rule, 'ip2', T0 + 1000)).ok).toBe(true); // per subject
    expect((await l.check(rule, 'ip1', T0 + 60_000)).ok).toBe(true); // next window
  });

  it('counts globally across instances via Firestore and teaches each instance the block', async () => {
    const db = new FakeFirestore();
    const global = new FirestoreLimitStore(() => db as any);
    const a = createLimiter({ global });
    const b = createLimiter({ global });
    await a.check(rule, 'ip', T0); await b.check(rule, 'ip', T0); await a.check(rule, 'ip', T0);
    const fourth = await b.check(rule, 'ip', T0);
    expect(fourth.ok).toBe(false);
    expect((await b.blocked(rule, 'ip', T0)).ok).toBe(false);
    // keys are hashed: no raw subject in storage
    expect([...db.docs.keys()].join()).not.toContain('ip');
  });

  it('fails open when the global store errors', async () => {
    const broken: LimitStore = { hit: async () => { throw new Error('down'); } };
    const errors: unknown[] = [];
    const l = createLimiter({ global: broken, onError: (e) => errors.push(e) });
    expect((await l.check(rule, 'x', T0)).ok).toBe(true);
    expect(errors).toHaveLength(1);
  });

  it('memory store stays bounded', async () => {
    const m = new MemoryLimitStore(2);
    await m.hit('a', 1000, 0); await m.hit('b', 1000, 0); await m.hit('c', 1000, 0);
    expect(await m.peek('a', 1000, 0)).toBe(0);
    expect(await m.peek('c', 1000, 0)).toBe(1);
  });
});
