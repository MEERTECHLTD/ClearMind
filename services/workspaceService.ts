/**
 * Web binding for shared collaborative Applications workspaces. Binds the web
 * Firestore `db` + `auth` to the platform-agnostic ops in
 * @clearmind/shared/data/workspaces. (Mobile has its own thin binding.)
 */
import { auth, db } from './firebase';
import { isFirebaseConfigured } from './firebase';
import {
  createWorkspace as fsCreate,
  subscribeWorkspaces as fsSubscribe,
  setWorkspaceMembers as fsSetMembers,
  renameWorkspace as fsRename,
  deleteWorkspace as fsDelete,
  subscribeWorkspaceApplications as fsSubscribeApps,
  putWorkspaceApplication as fsPutApp,
  deleteWorkspaceApplication as fsDeleteApp,
} from '@clearmind/shared/data/workspaces';
import type { Application, Workspace } from '../types';

const newId = (): string =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

const nowIso = () => new Date().toISOString();

export const workspaceService = {
  /** Workspaces need Firebase configured AND an email-bearing (non-anonymous) account. */
  supported(): boolean {
    return isFirebaseConfigured() && !!auth?.currentUser?.email;
  },

  currentEmail(): string | null {
    return auth?.currentUser?.email ?? null;
  },

  isOwner(ws: Workspace): boolean {
    return !!auth?.currentUser && auth.currentUser.uid === ws.ownerUid;
  },

  subscribe(onUpdate: (ws: Workspace[]) => void): () => void {
    const email = auth?.currentUser?.email;
    if (!db || !email) {
      onUpdate([]);
      return () => {};
    }
    return fsSubscribe(db, email, onUpdate);
  },

  async create(name: string, invitees: string[], seedApps: Application[]): Promise<Workspace> {
    const user = auth?.currentUser;
    if (!db || !user?.email) throw new Error('Sign in with an email or Google account to create a shared workspace.');
    return fsCreate(
      db,
      { id: newId(), name, ownerUid: user.uid, ownerEmail: user.email, memberEmails: invitees, nowIso: nowIso() },
      seedApps
    );
  },

  async setMembers(ws: Workspace, invitees: string[]): Promise<void> {
    if (!db) throw new Error('Firebase not configured');
    await fsSetMembers(db, ws, invitees, nowIso());
  },

  async rename(wsId: string, name: string): Promise<void> {
    if (!db) throw new Error('Firebase not configured');
    await fsRename(db, wsId, name, nowIso());
  },

  async remove(wsId: string): Promise<void> {
    if (!db) throw new Error('Firebase not configured');
    await fsDelete(db, wsId);
  },

  subscribeApplications(wsId: string, onUpdate: (apps: Application[]) => void): () => void {
    if (!db) {
      onUpdate([]);
      return () => {};
    }
    return fsSubscribeApps(db, wsId, onUpdate);
  },

  async putApplication(wsId: string, app: Application): Promise<void> {
    const email = auth?.currentUser?.email;
    if (!db || !email) throw new Error('Not authenticated');
    await fsPutApp(db, wsId, app, email);
  },

  async deleteApplication(wsId: string, appId: string): Promise<void> {
    if (!db) throw new Error('Firebase not configured');
    await fsDeleteApp(db, wsId, appId);
  },
};
