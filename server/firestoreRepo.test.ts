import { describe, it, expect, vi } from 'vitest';
import { Timestamp } from 'firebase-admin/firestore';

vi.mock('firebase-admin/app', () => ({ initializeApp: vi.fn(), cert: vi.fn(), getApps: () => [{}], applicationDefault: vi.fn() }));

import { FirestoreAgentRepo } from './firestoreRepo';

/** Tiny fake of the collection().get() / where('_serverAt','>',ts).get() surface, counting billed reads. */
function fakeDb() {
  const colls = new Map<string, Map<string, any>>();
  let clock = 1_000_000;
  const state = { reads: 0 };
  const coll = (path: string) => colls.get(path) ?? colls.set(path, new Map()).get(path)!;
  const snap = (rows: [string, any][]) => {
    state.reads += Math.max(1, rows.length); // Firestore bills ≥1 read per query
    return { docs: rows.map(([id, d]) => ({ id, data: () => ({ ...d }) })) };
  };
  const db: any = {
    collection: (path: string) => ({
      get: async () => snap([...coll(path)]),
      where: (_f: string, _op: string, ts: Timestamp) => ({
        get: async () => snap([...coll(path)].filter(([, d]) => d._serverAt.toMillis() > ts.toMillis())),
      }),
    }),
  };
  const write = (path: string, id: string, data: any) => {
    clock += 10_000;
    coll(path).set(id, { id, ...data, _serverAt: Timestamp.fromMillis(clock) });
  };
  return { db, state, write };
}

describe('FirestoreAgentRepo read cache', () => {
  it('reads everything once, then only deltas', async () => {
    const f = fakeDb();
    for (let i = 0; i < 100; i++) f.write('users/u1/tasks', `t${i}`, { title: `task ${i}` });
    const repo = new FirestoreAgentRepo(f.db);

    const s1 = await repo.loadState('u1');
    expect(s1.tasks).toHaveLength(100);
    const afterFirst = f.state.reads;

    const s2 = await repo.loadState('u1');
    expect(s2.tasks).toHaveLength(100);
    // second call: one (empty) delta query per collection, not 100+ docs
    expect(f.state.reads - afterFirst).toBeLessThan(20);

    f.write('users/u1/tasks', 't5', { title: 'edited' });
    f.write('users/u1/tasks', 'new', { title: 'brand new' });
    const s3 = await repo.loadState('u1');
    expect(s3.tasks).toHaveLength(101);
    expect(s3.tasks.find((t: any) => t.id === 't5').title).toBe('edited');
  });

  it('hands out copies so callers cannot corrupt the cache', async () => {
    const f = fakeDb();
    f.write('users/u1/tasks', 'a', { title: 'orig' });
    const repo = new FirestoreAgentRepo(f.db);
    (await repo.loadState('u1')).tasks[0].title = 'mutated';
    expect((await repo.loadState('u1')).tasks[0].title).toBe('orig');
  });

  it('loadCollections uses the same cache and keeps doc ids', async () => {
    const f = fakeDb();
    f.write('users/u1/notes', 'n1', { title: 'x' });
    const repo = new FirestoreAgentRepo(f.db);
    await repo.loadState('u1');
    const before = f.state.reads;
    const out = await repo.loadCollections('u1', ['notes']);
    expect(out.notes[0].id).toBe('n1');
    expect(f.state.reads - before).toBe(1);
  });
});
