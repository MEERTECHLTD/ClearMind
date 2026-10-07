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
import { getFirestore, FieldValue, type Firestore } from 'firebase-admin/firestore';
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
    const json = raw.trim().startsWith('{') ? raw : Buffer.from(raw, 'base64').toString('utf8');
    return initializeApp({ credential: cert(JSON.parse(json)) });
  }
  const path = process.env.CLEARMIND_SERVICE_ACCOUNT || (existsSync(DEFAULT_KEY_PATH) ? DEFAULT_KEY_PATH : null);
  if (path) return initializeApp({ credential: cert(JSON.parse(readFileSync(path, 'utf8'))) });
  return initializeApp({ credential: applicationDefault(), projectId: process.env.FIREBASE_PROJECT_ID });
}

const COLLS = ['tasks', 'projects', 'labels', 'sections', 'comments', 'completions', 'filters', 'preferences'] as const;

const strip = (d: Record<string, any>) => {
  const { _serverAt, syncedAt, ...rest } = d;
  return rest;
};

export class FirestoreAgentRepo implements AgentRepo {
  constructor(private db: Firestore = getFirestore(adminApp())) {}

  private col(uid: string, local: string) {
    return this.db.collection(`users/${uid}/${getFirestoreCollectionName(local)}`);
  }

  async loadState(uid: string): Promise<FullState> {
    const snaps = await Promise.all(COLLS.map((c) => this.col(uid, c).get()));
    const data = Object.fromEntries(COLLS.map((c, i) => [c, snaps[i].docs.map((d) => strip(d.data()))])) as Record<string, any[]>;
    const prefs = data.preferences.find((p) => p.id === 'preferences' && !p.deleted) ?? null;
    return {
      tasks: data.tasks, projects: data.projects, labels: data.labels, sections: data.sections,
      comments: data.comments, completions: data.completions, filters: data.filters, preferences: prefs,
    };
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
