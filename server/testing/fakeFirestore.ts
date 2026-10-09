/**
 * Minimal in-memory stand-in for the firebase-admin Firestore surface the API
 * handlers use (doc get/set/update/delete, runTransaction). Test-only.
 */
type Data = Record<string, any>;

export class FakeFirestore {
  docs = new Map<string, Data>();
  failNext = 0;

  private maybeFail() { if (this.failNext > 0) { this.failNext--; throw new Error('firestore unavailable'); } }

  doc(path: string) {
    const segs = path.split('/');
    if (segs.length % 2 !== 0 || segs.some((s) => !s)) throw new Error(`invalid document path ${path}`);
    const db = this;
    const ref: any = {
      path,
      id: segs[segs.length - 1],
      async get() { db.maybeFail(); return db.snap(ref); },
      async set(data: Data, opts?: { merge?: boolean }) { db.maybeFail(); db.docs.set(path, opts?.merge ? { ...(db.docs.get(path) ?? {}), ...data } : { ...data }); },
      async update(data: Data) { db.maybeFail(); if (!db.docs.has(path)) throw new Error('not found'); db.docs.set(path, { ...db.docs.get(path), ...data }); },
      async delete() { db.maybeFail(); db.docs.delete(path); },
    };
    return ref;
  }

  snap(ref: any) {
    const d = this.docs.get(ref.path);
    return { exists: d !== undefined, id: ref.id, ref, data: () => (d === undefined ? undefined : { ...d }) };
  }

  private lock: Promise<unknown> = Promise.resolve();

  /** Transactions are serialised (Firestore's optimistic retries give the same observable result). */
  runTransaction<T>(fn: (tx: any) => Promise<T>): Promise<T> {
    const run = this.lock.then(() => this.runOne(fn));
    this.lock = run.catch(() => undefined);
    return run;
  }

  private async runOne<T>(fn: (tx: any) => Promise<T>): Promise<T> {
    this.maybeFail();
    const writes: (() => void)[] = [];
    const tx = {
      get: async (ref: any) => this.snap(ref),
      set: (ref: any, data: Data, opts?: { merge?: boolean }) => writes.push(() => this.docs.set(ref.path, opts?.merge ? { ...(this.docs.get(ref.path) ?? {}), ...data } : { ...data })),
      update: (ref: any, data: Data) => writes.push(() => this.docs.set(ref.path, { ...this.docs.get(ref.path), ...data })),
      delete: (ref: any) => writes.push(() => this.docs.delete(ref.path)),
    };
    const out = await fn(tx);
    writes.forEach((w) => w());
    return out;
  }
}

/** Fake req/res pair for invoking a Vercel-style (req, res) handler. */
export function fakeHttp(opts: { method?: string; url: string; headers?: Record<string, string>; body?: unknown }) {
  const headers: Record<string, string> = {};
  for (const [k, v] of Object.entries(opts.headers ?? {})) headers[k.toLowerCase()] = v;
  const req: any = { method: opts.method ?? 'GET', url: opts.url, headers, body: opts.body, socket: { remoteAddress: '10.0.0.1' } };
  const out: Record<string, string> = {};
  const res: any = {
    statusCode: 200, headersSent: false, body: '',
    setHeader(k: string, v: string) { out[k.toLowerCase()] = String(v); },
    getHeader(k: string) { return out[k.toLowerCase()]; },
    end(b?: string) { res.body = b ?? ''; res.headersSent = true; },
    on() { return res; },
  };
  return { req, res, headers: out, json: () => (res.body ? JSON.parse(res.body) : null) };
}
