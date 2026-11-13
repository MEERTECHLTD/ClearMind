/**
 * AgentRepo over Firestore (firebase-admin) — used by the local MCP server, the
 * hosted MCP/REST API and the CLI's local mode.
 *
 * Reads are fresh from Firestore (authoritative). Writes go through the same
 * field-level model as the apps: each edit is applied onto the CURRENT server
 * document with field clocks (stampEdit), written as a merge with a server
 * timestamp — so every app's realtime delta listener picks it up within seconds,
 * and concurrent edits to other fields are never lost. Writes of one tool call
 * are committed in a single transaction.
 */
import { getFirestore, FieldValue, Timestamp, type Firestore } from 'firebase-admin/firestore';
import { initializeApp, cert, getApps, applicationDefault, type App } from 'firebase-admin/app';
import { readFileSync, existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { stampEdit } from '../shared/sync/fields';
import { sanitizeForFirestore } from '../shared/data/sanitize';
import { getFirestoreCollectionName } from '../shared/data/collections';
import type { AgentRepo, FullState } from '../shared/agents/tools';
import type { Edit } from '../shared/domain';
import type { AgentToken, AgentAudit, Activity } from '../shared/types';

export const DEFAULT_KEY_PATH = join(homedir(), '.config', 'clearmind', 'service-account.json');

/** Initialise firebase-admin from (in order): FIREBASE_SERVICE_ACCOUNT (JSON or base64), CLEARMIND_SERVICE_ACCOUNT path, ~/.config/clearmind/service-account.json, ADC. */
export function adminApp(): App {
  if (getApps().length) return getApps()[0]!;
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (raw) {
    const json = JSON.parse(raw.trim().startsWith('{') ? raw : Buffer.from(raw, 'base64').toString('utf8'));
    return initializeApp({ credential: cert(json), projectId: json.project_id });
  }
  const path = process.env.CLEARMIND_SERVICE_ACCOUNT || (existsSync(DEFAULT_KEY_PATH) ? DEFAULT_KEY_PATH : null);
  if (path) { const json = JSON.parse(readFileSync(path, 'utf8')); return initializeApp({ credential: cert(json), projectId: json.project_id }); }
  return initializeApp({ credential: applicationDefault(), projectId: process.env.FIREBASE_PROJECT_ID });
}

/** Firebase project id of the admin app (for ID-token audience checks). */
export function adminProjectId(): string {
  const app = adminApp();
  return app.options.projectId ?? (app.options.credential as { projectId?: string } | undefined)?.projectId ?? process.env.FIREBASE_PROJECT_ID ?? process.env.GOOGLE_CLOUD_PROJECT ?? '';
}

const COLLS = ['tasks', 'projects', 'labels', 'sections', 'comments', 'completions', 'filters', 'preferences', 'notes'] as const;

const strip = (d: Record<string, any>) => {
  const { _serverAt, syncedAt, ...rest } = d;
  return rest;
};

/**
 * Read-cost control. Firestore bills one read per document returned, and every
 * tool call needs the user's whole state — re-reading every collection on each
 * call (an Iris/Claude conversation makes dozens) exhausted the free daily
 * quota. Instead each warm server instance keeps a per-user copy and refreshes
 * it with a delta query on `_serverAt` (every app, agent and API write stamps
 * it), so a call costs ~1 read per collection plus only the changed docs.
 * A full re-read still happens on cold start and every FULL_REFRESH_MS, which
 * also picks up any legacy writes that lack `_serverAt`.
 */
const FULL_REFRESH_MS = 30 * 60_000;
/** Re-read a small window behind the cursor so a same-instant commit is never missed. */
const OVERLAP_MS = 2_000;
const MAX_CACHED_USERS = 50;

interface CollCache { docs: Map<string, Record<string, any>>; cursorMs: number; fullAt: number }

const serverMs = (v: any): number => (v && typeof v.toMillis === 'function' ? v.toMillis() : 0);

export class FirestoreAgentRepo implements AgentRepo {
  private cache = new Map<string, CollCache>();
  private inflight = new Map<string, Promise<CollCache>>();

  constructor(private db: Firestore = getFirestore(adminApp())) {}

  private col(uid: string, local: string) {
    return this.db.collection(`users/${uid}/${getFirestoreCollectionName(local)}`);
  }

  /** Fresh contents of one collection: [docId, data] pairs, served from the delta cache. */
  private async docs(uid: string, coll: string): Promise<[string, Record<string, any>][]> {
    const key = `${uid}/${coll}`;
    let p = this.inflight.get(key);
    if (!p) {
      p = this.refresh(uid, coll, key).finally(() => this.inflight.delete(key));
      this.inflight.set(key, p);
    }
    const c = await p;
    // Callers get their own copies so nothing they do can corrupt the cache.
    return [...c.docs].map(([id, d]) => [id, structuredClone(d)]);
  }

  private async refresh(uid: string, coll: string, key: string): Promise<CollCache> {
    const now = Date.now();
    const cur = this.cache.get(key);
    if (!cur || now - cur.fullAt > FULL_REFRESH_MS) {
      const snap = await this.col(uid, coll).get();
      const docs = new Map<string, Record<string, any>>();
      let cursorMs = 0;
      for (const d of snap.docs) {
        const data = d.data();
        cursorMs = Math.max(cursorMs, serverMs(data._serverAt));
        docs.set(d.id, data);
      }
      const fresh = { docs, cursorMs, fullAt: now };
      this.remember(key, fresh);
      return fresh;
    }
    const since = Timestamp.fromMillis(Math.max(0, cur.cursorMs - OVERLAP_MS));
    const snap = await this.col(uid, coll).where('_serverAt', '>', since).get();
    for (const d of snap.docs) {
      const data = d.data();
      cur.cursorMs = Math.max(cur.cursorMs, serverMs(data._serverAt));
      cur.docs.set(d.id, data);
    }
    return cur;
  }

  private remember(key: string, c: CollCache) {
    this.cache.delete(key);
    this.cache.set(key, c);
    const limit = MAX_CACHED_USERS * (COLLS.length + 4);
    while (this.cache.size > limit) this.cache.delete(this.cache.keys().next().value!);
  }

  async loadState(uid: string): Promise<FullState> {
    const lists = await Promise.all(COLLS.map((c) => this.docs(uid, c)));
    const data = Object.fromEntries(COLLS.map((c, i) => [c, lists[i].map(([, d]) => strip(d))])) as Record<string, any[]>;
    const prefs = data.preferences.find((p) => p.id === 'preferences' && !p.deleted) ?? null;
    return {
      tasks: data.tasks, projects: data.projects, labels: data.labels, sections: data.sections,
      comments: data.comments, completions: data.completions, filters: data.filters, preferences: prefs,
      notes: data.notes,
    };
  }

  async loadCollections(uid: string, colls: string[]): Promise<Record<string, any[]>> {
    const uniq = [...new Set(colls)];
    const lists = await Promise.all(uniq.map((c) => this.docs(uid, c)));
    return Object.fromEntries(uniq.map((c, i) => [c, lists[i].map(([id, d]) => ({ id, ...strip(d) }))]));
  }

  async commit(uid: string, edits: Edit[], meta: { clientId: string; mutationId: string }): Promise<void> {
    if (!edits.length) return;
    for (let i = 0; i < edits.length; i += 200) {
      const chunk = edits.slice(i, i + 200);
      await this.db.runTransaction(async (tx) => {
        const refs = chunk.map((e) => this.col(uid, e.coll).doc(e.id));
        const uniq = [...new Map(refs.map((r) => [r.path, r])).values()];
        const current = new Map((await tx.getAll(...uniq)).map((s) => [s.ref.path, s.exists ? strip(s.data()!) : undefined]));
        const now = new Date().toISOString();
        for (let k = 0; k < chunk.length; k++) {
          const e = chunk[k];
          const ref = refs[k];
          const r = stampEdit(current.get(ref.path) as any, { ...e.edit, id: e.id }, { clientId: meta.clientId, mutationId: meta.mutationId, now });
          if (!r.changed.length) continue;
          current.set(ref.path, r.record as any);
          tx.set(ref, { ...sanitizeForFirestore(r.patch as any), _serverAt: FieldValue.serverTimestamp() }, { merge: true });
        }
      });
    }
  }

  async getToken(uid: string, hash: string): Promise<AgentToken | null> {
    const s = await this.db.doc(`users/${uid}/agentTokens/${hash}`).get();
    return s.exists ? ({ id: s.id, ...(s.data() as any) } as AgentToken) : null;
  }

  async touchToken(uid: string, hash: string, at: string) {
    await this.db.doc(`users/${uid}/agentTokens/${hash}`).set({ lastUsedAt: at }, { merge: true });
  }

  async audit(uid: string, entry: AgentAudit) {
    await this.db.doc(`users/${uid}/agentAudit/${entry.id}`).set(sanitizeForFirestore(entry as any));
  }

  async recentActivity(uid: string, limit: number): Promise<Activity[]> {
    const s = await this.col(uid, 'activity').orderBy('at', 'desc').limit(limit).get();
    return s.docs.map((d) => strip(d.data()) as Activity).filter((a) => !a.deleted);
  }
}
