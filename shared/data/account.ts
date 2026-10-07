/**
 * Account data lifecycle shared by web and mobile.
 *
 * Deletion policy: immediate and complete. Every document under users/{uid}
 * (all synced collections, agent tokens and agent audit log), the profile
 * document, and shared workspaces the user OWNS (with their contents) are
 * deleted. Workspaces owned by others are left untouched (membership is by
 * email and stops working once the account is gone). Nothing is retained.
 */
import { collection, doc, getDocs, writeBatch, deleteDoc, query, where, setDoc, onSnapshot, type Firestore } from 'firebase/firestore';

async function deleteCollection(db: Firestore, path: string): Promise<number> {
  const snap = await getDocs(collection(db, path));
  let n = 0;
  for (let i = 0; i < snap.docs.length; i += 400) {
    const batch = writeBatch(db);
    for (const d of snap.docs.slice(i, i + 400)) { batch.delete(d.ref); n++; }
    await batch.commit();
  }
  return n;
}

export async function deleteAccountData(db: Firestore, uid: string, collections: string[], onProgress?: (msg: string) => void): Promise<{ documents: number }> {
  let documents = 0;
  for (const c of [...collections, 'agentTokens', 'agentAudit', 'attachments', 'attachmentChunks']) {
    onProgress?.(`Deleting ${c}…`);
    documents += await deleteCollection(db, `users/${uid}/${c}`);
  }
  onProgress?.('Deleting shared workspaces you own…');
  const owned = await getDocs(query(collection(db, 'workspaces'), where('ownerUid', '==', uid))).catch(() => null);
  for (const w of owned?.docs ?? []) {
    for (const sub of ['applications', 'projects']) documents += await deleteCollection(db, `workspaces/${w.id}/${sub}`).catch(() => 0);
    await deleteDoc(w.ref);
    documents++;
  }
  await deleteDoc(doc(db, 'users', uid));
  return { documents: documents + 1 };
}

export interface ProfileDoc { nickname?: string; email?: string; photoURL?: string | null; provider?: string; joinedAt?: string; bio?: string | null }

/** Merge-update the profile document (name, photo, …). */
export const updateProfileDoc = (db: Firestore, uid: string, data: Partial<ProfileDoc>) => setDoc(doc(db, 'users', uid), data, { merge: true });

/** Realtime profile listener — name/photo changes appear on every device. */
export const subscribeProfile = (db: Firestore, uid: string, cb: (p: ProfileDoc | null) => void) =>
  onSnapshot(doc(db, 'users', uid), (s) => cb(s.exists() ? (s.data() as ProfileDoc) : null), () => {});
