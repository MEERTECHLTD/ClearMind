/**
 * Shared, collaborative Applications workspaces — platform-agnostic Firestore
 * operations (web + mobile inject their own `db`). Distinct from the local-first
 * personal sync engine (`shared/data/firestore.ts`, which is per-user under
 * `users/{uid}/…`): workspaces are a LIVE, online, multi-user collection. The
 * Applications view subscribes to one at a time and reads/writes it directly —
 * no local mirror, no tombstones (deletes are real deletes; onSnapshot reflects
 * them instantly for every member).
 *
 * Membership is by EMAIL. The Firebase auth token carries `email`, so the
 * security rules can grant access by checking `request.auth.token.email in
 * memberEmails` — the owner invites someone simply by adding their email, with
 * no uid resolution and no Cloud Function. (See firestore.rules.)
 *
 * Firestore layout:
 *   workspaces/{wsId}                      -> Workspace
 *   workspaces/{wsId}/applications/{appId} -> Application (+ updatedByEmail)
 */
import {
  arrayUnion,
  collection,
  deleteDoc,
  doc,
  getDocs,
  onSnapshot,
  query,
  setDoc,
  where,
  writeBatch,
  type Firestore,
  type Unsubscribe,
} from 'firebase/firestore';
import { sanitizeForFirestore } from './firestore';
import type { Application, Project, Workspace } from '../types';

// Items inside a workspace carry who last touched them (collaboration attribution);
// the field rides the JSON doc and is ignored elsewhere.
export type WorkspaceApplication = Application & { updatedByEmail?: string };
export type WorkspaceProject = Project & { updatedByEmail?: string };

const WS = 'workspaces';
const APPS = 'applications';
const PROJECTS = 'projects';

export const normalizeEmail = (e: string): string => e.trim().toLowerCase();

const appsCol = (db: Firestore, wsId: string) => collection(db, WS, wsId, APPS);
const appDoc = (db: Firestore, wsId: string, appId: string) => doc(db, WS, wsId, APPS, appId);
const projectsCol = (db: Firestore, wsId: string) => collection(db, WS, wsId, PROJECTS);
const projectDoc = (db: Firestore, wsId: string, projectId: string) => doc(db, WS, wsId, PROJECTS, projectId);

/** Owner + invitees, de-duped and lowercased; the owner is always a member. */
const memberSet = (ownerEmail: string, invitees: string[]): string[] =>
  Array.from(new Set([normalizeEmail(ownerEmail), ...invitees.map(normalizeEmail).filter(Boolean)]));

/**
 * Create a workspace owned by `ownerUid`/`ownerEmail`, optionally seeding it with
 * a copy of the user's current applications. `id` is supplied by the caller (web
 * crypto.randomUUID / mobile newId) to keep this module free of platform RNG.
 */
export async function createWorkspace(
  db: Firestore,
  params: { id: string; name: string; ownerUid: string; ownerEmail: string; memberEmails?: string[]; nowIso: string },
  seedApps: Application[] = []
): Promise<Workspace> {
  const ws: Workspace = {
    id: params.id,
    name: params.name.trim() || 'Shared workspace',
    ownerUid: params.ownerUid,
    ownerEmail: normalizeEmail(params.ownerEmail),
    memberEmails: memberSet(params.ownerEmail, params.memberEmails ?? []),
    createdAt: params.nowIso,
    updatedAt: params.nowIso,
  };
  await setDoc(doc(db, WS, ws.id), sanitizeForFirestore(ws));

  if (seedApps.length) {
    const editor = ws.ownerEmail;
    // Firestore batches cap at 500 ops; chunk to stay safely under.
    for (let i = 0; i < seedApps.length; i += 400) {
      const batch = writeBatch(db);
      for (const app of seedApps.slice(i, i + 400)) {
        const wsApp: WorkspaceApplication = { ...app, updatedByEmail: editor };
        batch.set(appDoc(db, ws.id, app.id), sanitizeForFirestore(wsApp));
      }
      await batch.commit();
    }
  }
  return ws;
}

/** Live list of every workspace the signed-in email belongs to (owned + shared). */
export function subscribeWorkspaces(
  db: Firestore,
  email: string,
  onUpdate: (workspaces: Workspace[]) => void
): Unsubscribe {
  const q = query(collection(db, WS), where('memberEmails', 'array-contains', normalizeEmail(email)));
  return onSnapshot(
    q,
    (snap) => onUpdate(snap.docs.map((d) => d.data() as Workspace)),
    (err) => console.error('Workspace list sync error:', err)
  );
}

/** Replace the member list (owner always retained). Owner-only per the rules. */
export async function setWorkspaceMembers(
  db: Firestore,
  ws: Pick<Workspace, 'id' | 'ownerEmail'>,
  invitees: string[],
  nowIso: string
): Promise<void> {
  await setDoc(
    doc(db, WS, ws.id),
    { memberEmails: memberSet(ws.ownerEmail, invitees), updatedAt: nowIso },
    { merge: true }
  );
}

/**
 * Join a workspace via its invite link — adds ONLY the caller's own (normalized)
 * email to the member list. Permitted by the self-join security rule even though
 * the caller can't yet read the workspace doc. No-op-ish if already a member
 * (the rule rejects a same-size update; callers treat that as "already in").
 */
export async function joinWorkspace(db: Firestore, wsId: string, email: string, nowIso: string): Promise<void> {
  await setDoc(
    doc(db, WS, wsId),
    { memberEmails: arrayUnion(normalizeEmail(email)), updatedAt: nowIso },
    { merge: true }
  );
}

export async function renameWorkspace(db: Firestore, wsId: string, name: string, nowIso: string): Promise<void> {
  await setDoc(doc(db, WS, wsId), { name: name.trim() || 'Shared workspace', updatedAt: nowIso }, { merge: true });
}

/** Delete the workspace and all its applications + projects (owner-only per rules). */
export async function deleteWorkspace(db: Firestore, wsId: string): Promise<void> {
  for (const col of [appsCol(db, wsId), projectsCol(db, wsId)]) {
    const snap = await getDocs(col);
    for (let i = 0; i < snap.docs.length; i += 400) {
      const batch = writeBatch(db);
      for (const d of snap.docs.slice(i, i + 400)) batch.delete(d.ref);
      await batch.commit();
    }
  }
  await deleteDoc(doc(db, WS, wsId));
}

/** Live applications inside a workspace. */
export function subscribeWorkspaceApplications(
  db: Firestore,
  wsId: string,
  onUpdate: (apps: WorkspaceApplication[]) => void,
  onError?: (err: unknown) => void
): Unsubscribe {
  return onSnapshot(
    appsCol(db, wsId),
    (snap) => onUpdate(snap.docs.map((d) => d.data() as WorkspaceApplication)),
    (err) => {
      console.error('Workspace applications sync error:', err);
      onError?.(err);
    }
  );
}

export async function putWorkspaceApplication(
  db: Firestore,
  wsId: string,
  app: Application,
  editorEmail: string
): Promise<void> {
  const wsApp: WorkspaceApplication = { ...app, updatedByEmail: normalizeEmail(editorEmail) };
  await setDoc(appDoc(db, wsId, app.id), sanitizeForFirestore(wsApp));
}

export async function deleteWorkspaceApplication(db: Firestore, wsId: string, appId: string): Promise<void> {
  await deleteDoc(appDoc(db, wsId, appId));
}

// ---- Shared projects (workspaces/{wsId}/projects) — mirrors the application ops ----

/** Seed a workspace with copies of the user's projects (fresh ids supplied by caller). */
export async function seedWorkspaceProjects(
  db: Firestore,
  wsId: string,
  projects: Project[],
  editorEmail: string
): Promise<void> {
  if (!projects.length) return;
  const editor = normalizeEmail(editorEmail);
  for (let i = 0; i < projects.length; i += 400) {
    const batch = writeBatch(db);
    for (const p of projects.slice(i, i + 400)) {
      batch.set(projectDoc(db, wsId, p.id), sanitizeForFirestore({ ...p, updatedByEmail: editor } as WorkspaceProject));
    }
    await batch.commit();
  }
}

export function subscribeWorkspaceProjects(
  db: Firestore,
  wsId: string,
  onUpdate: (projects: WorkspaceProject[]) => void,
  onError?: (err: unknown) => void
): Unsubscribe {
  return onSnapshot(
    projectsCol(db, wsId),
    (snap) => onUpdate(snap.docs.map((d) => d.data() as WorkspaceProject)),
    (err) => {
      console.error('Workspace projects sync error:', err);
      onError?.(err);
    }
  );
}

export async function putWorkspaceProject(db: Firestore, wsId: string, project: Project, editorEmail: string): Promise<void> {
  await setDoc(projectDoc(db, wsId, project.id), sanitizeForFirestore({ ...project, updatedByEmail: normalizeEmail(editorEmail) } as WorkspaceProject));
}

export async function deleteWorkspaceProject(db: Firestore, wsId: string, projectId: string): Promise<void> {
  await deleteDoc(projectDoc(db, wsId, projectId));
}
