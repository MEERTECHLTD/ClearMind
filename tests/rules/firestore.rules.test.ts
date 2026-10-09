/**
 * Firestore security rules tests (run against the local emulator):
 *   npm run test:rules
 * which is `firebase emulators:exec --only firestore --project demo-clearmind "vitest run --config vitest.rules.config.ts"`.
 * Needs Java 11+ (the emulator is a JAR). Uses a demo- project id, so nothing
 * ever touches the production project.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, it, beforeAll, afterAll, beforeEach } from 'vitest';
import { initializeTestEnvironment, assertFails, assertSucceeds, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc, updateDoc, deleteDoc, collection, getDocs, query, where, arrayUnion } from 'firebase/firestore';

let env: RulesTestEnvironment;

const ALICE = { uid: 'alice', email: 'alice@example.com' };
const BOB = { uid: 'bob', email: 'bob@example.com' };
const MALLORY = { uid: 'mallory', email: 'mallory@example.com' };

const as = (u: { uid: string; email: string }) => env.authenticatedContext(u.uid, { email: u.email, email_verified: true }).firestore();
const anon = () => env.unauthenticatedContext().firestore();

const WS = {
  id: 'ws1', name: 'Team', ownerUid: ALICE.uid, ownerEmail: ALICE.email,
  memberEmails: [ALICE.email, BOB.email], createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z',
};

beforeAll(async () => {
  const [host, port] = (process.env.FIRESTORE_EMULATOR_HOST ?? '127.0.0.1:8080').split(':');
  env = await initializeTestEnvironment({
    projectId: 'demo-clearmind',
    firestore: { rules: readFileSync(resolve(__dirname, '../../firestore.rules'), 'utf8'), host, port: Number(port) },
  });
});
afterAll(async () => { await env?.cleanup(); });

beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, 'users/alice/tasks/t1'), { id: 't1', title: 'secret' });
    await setDoc(doc(db, 'users/alice/agentTokens/h1'), { id: 'h1', name: 'Claude', scopes: ['tasks:read'] });
    await setDoc(doc(db, 'workspaces/ws1'), WS);
    await setDoc(doc(db, 'workspaces/ws1/applications/a1'), { id: 'a1', company: 'Acme' });
    await setDoc(doc(db, 'workspaces/ws1/projects/p1'), { id: 'p1', title: 'Shared' });
    await setDoc(doc(db, 'oauthClients/cmc_x'), { client_name: 'Claude', redirect_uris: ['https://claude.ai/cb'] });
    await setDoc(doc(db, 'oauthRefresh/abc'), { uid: 'alice', accessHash: 'h1' });
    await setDoc(doc(db, 'rateLimits/k'), { count: 1 });
  });
});

describe('personal data (users/{uid}/…)', () => {
  it('owner can read and write their own documents', async () => {
    await assertSucceeds(getDoc(doc(as(ALICE), 'users/alice/tasks/t1')));
    await assertSucceeds(setDoc(doc(as(ALICE), 'users/alice/tasks/t2'), { id: 't2' }));
  });
  it('other users and anonymous callers are denied (no cross-user access)', async () => {
    await assertFails(getDoc(doc(as(BOB), 'users/alice/tasks/t1')));
    await assertFails(setDoc(doc(as(BOB), 'users/alice/tasks/t9'), { id: 't9' }));
    await assertFails(getDocs(collection(as(BOB), 'users/alice/tasks')));
    await assertFails(getDoc(doc(anon(), 'users/alice/tasks/t1')));
    await assertFails(getDoc(doc(as(BOB), 'users/alice/agentTokens/h1')));
  });
});

describe('server-only collections', () => {
  for (const path of ['oauthClients/cmc_x', 'oauthRefresh/abc', 'oauthCodes/x', 'rateLimits/k', '_health/ready']) {
    it(`${path} is not readable or writable by clients`, async () => {
      await assertFails(getDoc(doc(as(ALICE), path)));
      await assertFails(setDoc(doc(as(ALICE), path), { x: 1 }));
    });
  }
  it('unknown top-level collections are denied', async () => {
    await assertFails(setDoc(doc(as(ALICE), 'anything/x'), { x: 1 }));
  });
});

describe('shared workspaces', () => {
  it('members can read the workspace and its applications/projects; outsiders cannot', async () => {
    await assertSucceeds(getDoc(doc(as(BOB), 'workspaces/ws1')));
    await assertSucceeds(getDoc(doc(as(BOB), 'workspaces/ws1/applications/a1')));
    await assertSucceeds(setDoc(doc(as(BOB), 'workspaces/ws1/projects/p2'), { id: 'p2' }));
    await assertFails(getDoc(doc(as(MALLORY), 'workspaces/ws1/applications/a1')));
    await assertFails(setDoc(doc(as(MALLORY), 'workspaces/ws1/applications/a2'), { id: 'a2' }));
    await assertFails(getDoc(doc(anon(), 'workspaces/ws1')));
  });
  it('membership list query only returns workspaces the caller belongs to', async () => {
    await assertSucceeds(getDocs(query(collection(as(BOB), 'workspaces'), where('memberEmails', 'array-contains', BOB.email))));
    await assertFails(getDocs(collection(as(MALLORY), 'workspaces')));
  });
  it('only the owner can create (as themselves), rename, change members or delete', async () => {
    await assertFails(setDoc(doc(as(MALLORY), 'workspaces/ws2'), { ...WS, id: 'ws2' })); // ownerUid is alice
    await assertSucceeds(setDoc(doc(as(MALLORY), 'workspaces/ws3'), { ...WS, id: 'ws3', ownerUid: MALLORY.uid, ownerEmail: MALLORY.email, memberEmails: [MALLORY.email] }));
    await assertSucceeds(updateDoc(doc(as(ALICE), 'workspaces/ws1'), { name: 'Renamed' }));
    await assertFails(updateDoc(doc(as(BOB), 'workspaces/ws1'), { name: 'Hijacked' }));
    await assertFails(updateDoc(doc(as(ALICE), 'workspaces/ws1'), { ownerUid: BOB.uid }));
    await assertFails(deleteDoc(doc(as(BOB), 'workspaces/ws1')));
    await assertSucceeds(deleteDoc(doc(as(ALICE), 'workspaces/ws1')));
  });
  it('join-via-link: a signed-in user may add only their own email (+ updatedAt)', async () => {
    await assertSucceeds(setDoc(doc(as(MALLORY), 'workspaces/ws1'), { memberEmails: arrayUnion(MALLORY.email), updatedAt: '2026-02-01T00:00:00Z' }, { merge: true }));
  });
  it('join-via-link cannot add someone else, remove members, or change other fields', async () => {
    await assertFails(setDoc(doc(as(MALLORY), 'workspaces/ws1'), { memberEmails: arrayUnion('victim@example.com') }, { merge: true }));
    await assertFails(updateDoc(doc(as(MALLORY), 'workspaces/ws1'), { memberEmails: [MALLORY.email] }));
    await assertFails(updateDoc(doc(as(MALLORY), 'workspaces/ws1'), { memberEmails: [...WS.memberEmails, MALLORY.email], name: 'Pwned' }));
    // fields not explicitly compared in the old rule (e.g. new settings) are now protected too
    await assertFails(updateDoc(doc(as(MALLORY), 'workspaces/ws1'), { memberEmails: [...WS.memberEmails, MALLORY.email], createdAt: 'x' }));
    await assertFails(updateDoc(doc(as(MALLORY), 'workspaces/ws1'), { memberEmails: [...WS.memberEmails, MALLORY.email], settings: { public: true } }));
  });
  it('joining a workspace id that does not exist is denied (cannot create someone else\'s)', async () => {
    await assertFails(setDoc(doc(as(MALLORY), 'workspaces/nope'), { memberEmails: arrayUnion(MALLORY.email) }, { merge: true }));
  });
});
