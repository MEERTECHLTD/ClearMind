/**
 * Mobile binding for shared collaborative Applications workspaces. Binds the
 * mobile Firestore `db` + `auth` to the platform-agnostic ops in
 * @clearmind/shared/data/workspaces (the same module the web binding uses).
 */
import { auth, db, isFirebaseConfigured } from '../lib/firebase';
import { newId } from '../lib/id';
import {
  createWorkspace as fsCreate,
  subscribeWorkspaces as fsSubscribe,
  setWorkspaceMembers as fsSetMembers,
  deleteWorkspace as fsDelete,
  subscribeWorkspaceApplications as fsSubscribeApps,
  putWorkspaceApplication as fsPutApp,
  deleteWorkspaceApplication as fsDeleteApp,
} from '@clearmind/shared/data/workspaces';
import type { Application, Workspace } from '@clearmind/shared';

const nowIso = () => new Date().toISOString();

export const workspaceService = {
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
