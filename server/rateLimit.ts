/**
 * Fixed-window rate limiting for serverless functions.
 *
 * Vercel functions share no memory, so a purely in-process limiter is only a
 * soft, per-instance limit. For auth-sensitive endpoints (OAuth register /
 * token / approve, failed authentication, AI proxy) we use two tiers:
 *
 *   1. MemoryLimitStore  — per instance, free; absorbs floods without touching
 *                          Firestore (no cost amplification).
 *   2. FirestoreLimitStore — global across instances; one transactional
 *                          increment on rateLimits/{sha256(key)}.
 *
 * Keys are hashed before storage (no raw IPs / uids in Firestore). The
 * rateLimits collection is admin-only (no rule matches it, so clients are
 * denied). Docs carry `expireAt` for a Firestore TTL policy (console setup).
 *
 * Failure policy: if Firestore is unavailable the limiter FAILS OPEN (the
 * request proceeds, a warning is logged) — the limiter is defence in depth,
 * not the authentication itself.
 */
import { createHash } from 'node:crypto';
import type { Firestore } from 'firebase-admin/firestore';

export interface LimitStore {
  /** Count this hit and return the number of hits in the current window (including this one). */
  hit(key: string, windowMs: number, now: number): Promise<number>;
  /** Current count without incrementing. */
  peek?(key: string, windowMs: number, now: number): Promise<number>;
}

export interface LimitRule { name: string; limit: number; windowMs: number }
export interface LimitResult { ok: boolean; count: number; limit: number; retryAfterSec: number }

const windowStart = (now: number, windowMs: number) => Math.floor(now / windowMs) * windowMs;
export const hashKey = (s: string) => createHash('sha256').update(s).digest('hex').slice(0, 40);

export class MemoryLimitStore implements LimitStore {
  private m = new Map<string, { start: number; count: number }>();
  constructor(private maxKeys = 10_000) {}
  async hit(key: string, windowMs: number, now: number) {
    const start = windowStart(now, windowMs);
    const cur = this.m.get(key);
    const next = cur && cur.start === start ? { start, count: cur.count + 1 } : { start, count: 1 };
    if (!cur && this.m.size >= this.maxKeys) this.m.delete(this.m.keys().next().value as string); // bounded memory
    this.m.set(key, next);
    return next.count;
  }
  async peek(key: string, windowMs: number, now: number) {
    const cur = this.m.get(key);
    return cur && cur.start === windowStart(now, windowMs) ? cur.count : 0;
  }
  /** Remember a count learned from the global store (so this instance short-circuits too). */
  raise(key: string, windowMs: number, now: number, count: number) {
    const start = windowStart(now, windowMs);
    const cur = this.m.get(key);
    if (!cur || cur.start !== start || cur.count < count) this.m.set(key, { start, count });
  }
}

export class FirestoreLimitStore implements LimitStore {
  constructor(private db: () => Firestore, private collection = 'rateLimits') {}
  async hit(key: string, windowMs: number, now: number) {
    const start = windowStart(now, windowMs);
    const ref = this.db().doc(`${this.collection}/${hashKey(key)}`);
    return this.db().runTransaction(async (tx) => {
      const s = await tx.get(ref);
      const d = s.exists ? (s.data() as { start?: number; count?: number }) : null;
      const count = d && d.start === start ? (d.count ?? 0) + 1 : 1;
      tx.set(ref, { start, count, expireAt: new Date(start + windowMs * 2) });
      return count;
    });
  }
  async peek(key: string, windowMs: number, now: number) {
    const s = await this.db().doc(`${this.collection}/${hashKey(key)}`).get();
    const d = s.exists ? (s.data() as { start?: number; count?: number }) : null;
    return d && d.start === windowStart(now, windowMs) ? d.count ?? 0 : 0;
  }
}

export interface Limiter {
  /** Count a hit for `subject` under `rule`; ok=false once the limit is exceeded. */
  check(rule: LimitRule, subject: string, now?: number): Promise<LimitResult>;
  /** Is `subject` already over `rule` (no increment)? Used to short-circuit after repeated auth failures. */
  blocked(rule: LimitRule, subject: string, now?: number): Promise<LimitResult>;
}

export function createLimiter(opts: { memory?: MemoryLimitStore; global?: LimitStore | null; onError?: (e: unknown) => void } = {}): Limiter {
  const memory = opts.memory ?? new MemoryLimitStore();
  const global = opts.global ?? null;
  const result = (rule: LimitRule, count: number, now: number): LimitResult => ({
    ok: count <= rule.limit, count, limit: rule.limit,
    retryAfterSec: Math.max(1, Math.ceil((windowStart(now, rule.windowMs) + rule.windowMs - now) / 1000)),
  });
  return {
    async check(rule, subject, now = Date.now()) {
      const key = `${rule.name}:${subject}`;
      const local = await memory.hit(key, rule.windowMs, now);
      if (local > rule.limit) return result(rule, local, now); // this instance alone is over: no Firestore write
      if (!global) return result(rule, local, now);
      try {
        const count = await global.hit(key, rule.windowMs, now);
        memory.raise(key, rule.windowMs, now, count);
        return result(rule, count, now);
      }
      catch (e) { opts.onError?.(e); return result(rule, local, now); } // fail open
    },
    async blocked(rule, subject, now = Date.now()) {
      const key = `${rule.name}:${subject}`;
      const local = await memory.peek(key, rule.windowMs, now);
      return { ...result(rule, local, now), ok: local < rule.limit };
    },
  };
}

/** Limits used by the hosted functions (tuned for a small app; shared egress IPs of claude.ai/ChatGPT considered). */
export const LIMITS = {
  oauthRegister: { name: 'oauth-register', limit: 30, windowMs: 60 * 60 * 1000 } as LimitRule,
  oauthToken: { name: 'oauth-token', limit: 300, windowMs: 10 * 60 * 1000 } as LimitRule,
  oauthApprove: { name: 'oauth-approve', limit: 30, windowMs: 10 * 60 * 1000 } as LimitRule,
  authFailures: { name: 'auth-fail', limit: 30, windowMs: 10 * 60 * 1000 } as LimitRule,
  aiPerMinute: { name: 'ai-min', limit: 15, windowMs: 60 * 1000 } as LimitRule,
  aiPerDay: { name: 'ai-day', limit: 300, windowMs: 24 * 60 * 60 * 1000 } as LimitRule,
};
