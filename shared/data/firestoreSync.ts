/**
 * Firestore implementation of the SyncEngine RemoteAdapter, shared by web and
 * mobile (same firebase JS SDK).
 *
 *  - push: merge-writes of field patches (deep-merges the `_fc` clock map) plus a
 *    server timestamp `_serverAt`, batched under Firestore's 500-op limit.
 *  - subscribe: realtime listener on `_serverAt >= cursor` → only changed docs
 *    are downloaded (delta sync); `docChanges()` so each snapshot carries just
 *    the new/modified docs. Our own unacknowledged writes are skipped (they
 *    come back once the server stamped them).
 */
import {
  collection, doc, getDocs, onSnapshot, query, where, writeBatch, serverTimestamp, Timestamp,
  type Firestore,
} from 'firebase/firestore';
import { sanitizeForFirestore } from './sanitize';
import type { RemoteAdapter } from '../sync/engine';
import type { Rec } from '../sync/fields';

const path = (uid: string, coll: string) => `users/${uid}/${coll}`;

const toMs = (v: unknown): number | undefined => {
  if (!v) return undefined;
  if (v instanceof Timestamp) return v.toMillis();
  if (typeof (v as any).toMillis === 'function') return (v as any).toMillis();
  if (typeof (v as any).seconds === 'number') return (v as any).seconds * 1000 + Math.floor(((v as any).nanoseconds ?? 0) / 1e6);
  return undefined;
};

function decode(data: Record<string, any>): Rec {
  const { _serverAt, ...rest } = data;
  const ms = toMs(_serverAt);
  return (ms ? { ...rest, _serverMs: ms } : rest) as unknown as Rec;
}

export function firestoreRemote(db: Firestore, getUid: () => string | null, opts: { isOnline?: () => boolean; firestoreName?: (coll: string) => string } = {}): RemoteAdapter {
  const name = opts.firestoreName ?? ((c: string) => c);
  const uid = () => {
    const u = getUid();
    if (!u) throw new Error('not signed in');
    return u;
  };
  return {
    isOnline: opts.isOnline,
    async push(coll, patches) {
      const u = uid();
      for (let i = 0; i < patches.length; i += 400) {
        const batch = writeBatch(db);
        for (const p of patches.slice(i, i + 400)) {
          const { _serverMs, _dirty, reminderId, ...clean } = p as any;
          batch.set(doc(db, path(u, name(coll)), p.id), { ...sanitizeForFirestore(clean), _serverAt: serverTimestamp() }, { merge: true });
        }
        await batch.commit();
      }
    },
    subscribe(coll, sinceMs, onDocs, onError) {
      const ref = collection(db, path(uid(), name(coll)));
      const q = sinceMs ? query(ref, where('_serverAt', '>=', Timestamp.fromMillis(sinceMs))) : query(ref);
      return onSnapshot(q, (snap) => {
        const docs: Rec[] = [];
        for (const ch of snap.docChanges()) {
          if (ch.type === 'removed' && sinceMs) continue; // left the delta window, not deleted
          if (ch.doc.metadata.hasPendingWrites) continue;
          docs.push(decode(ch.doc.data()));
        }
        if (docs.length) onDocs(docs);
      }, onError);
    },
    async fetchAll(coll) {
      const snap = await getDocs(collection(db, path(uid(), name(coll))));
      return snap.docs.map((d) => decode(d.data()));
    },
  };
}
