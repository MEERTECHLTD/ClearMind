/**
 * Platform-agnostic Firestore read/write/subscribe operations.
 *
 * Both web and mobile use the SAME `firebase` JS SDK, so this module is shared
 * verbatim. The caller injects the Firestore instance and the authenticated uid
 * — shared code cannot reach a web `auth.currentUser` singleton (web passes
 * `auth.currentUser.uid`, mobile passes its own). Every document path is
 * `users/{uid}/{collection}`. `sanitizeForFirestore` and the batch-chunking
 * constants are kept here so web and mobile writes are byte-identical for the
 * same record. (See DECISIONS.md, D4.)
 */
import {
  collection,
  doc,
  setDoc,
  getDocs,
  deleteDoc,
  writeBatch,
  onSnapshot,
  query,
  type Firestore,
  type Unsubscribe,
} from 'firebase/firestore';

// Firestore rejects `undefined`; convert it to `null` recursively. Mirrors the
// original web implementation exactly (objects recurse, arrays map, Dates pass).
export const sanitizeForFirestore = <T extends object>(obj: T): T => {
  const sanitized: any = {};
  for (const [key, value] of Object.entries(obj)) {
    if (value === undefined) {
      sanitized[key] = null;
    } else if (value !== null && typeof value === 'object' && !Array.isArray(value) && !(value instanceof Date)) {
      sanitized[key] = sanitizeForFirestore(value);
    } else if (Array.isArray(value)) {
      sanitized[key] = value.map(item =>
        item !== null && typeof item === 'object' ? sanitizeForFirestore(item) : (item === undefined ? null : item)
      );
    } else {
      sanitized[key] = value;
    }
  }
  return sanitized as T;
};

const collectionPath = (uid: string, collectionName: string) => `users/${uid}/${collectionName}`;

// Push a single item (instant sync). Stamps `syncedAt` and sanitizes.
export async function pushItemToCloud<T extends { id: string }>(
  db: Firestore, uid: string, collectionName: string, item: T
): Promise<void> {
  const docRef = doc(db, collectionPath(uid, collectionName), item.id);
  const sanitizedItem = sanitizeForFirestore({ ...item, syncedAt: new Date().toISOString() });
  await setDoc(docRef, sanitizedItem);
}

// Hard-delete a single item from the cloud.
export async function deleteItemFromCloud(
  db: Firestore, uid: string, collectionName: string, itemId: string
): Promise<void> {
  const docRef = doc(db, collectionPath(uid, collectionName), itemId);
  await deleteDoc(docRef);
}

// Fetch every doc in a collection (raw — includes soft-deleted tombstones).
export async function fetchFromCloud<T>(
  db: Firestore, uid: string, collectionName: string
): Promise<T[]> {
  const collectionRef = collection(db, collectionPath(uid, collectionName));
  const snapshot = await getDocs(collectionRef);
  return snapshot.docs.map(d => d.data() as T);
}

// Batch-write items. Firestore caps a batch at 500 ops; chunk at 450 with up to
// 3 concurrent batches. Each item is stamped `syncedAt` and sanitized.
export async function syncToCloud<T extends { id: string }>(
  db: Firestore, uid: string, collectionName: string, items: T[]
): Promise<void> {
  if (items.length === 0) return;

  const collectionRef = collection(db, collectionPath(uid, collectionName));

  const BATCH_LIMIT = 450; // leave margin under the 500 hard limit
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += BATCH_LIMIT) {
    chunks.push(items.slice(i, i + BATCH_LIMIT));
  }

  const CONCURRENT_BATCHES = 3;
  for (let i = 0; i < chunks.length; i += CONCURRENT_BATCHES) {
    const batchChunks = chunks.slice(i, i + CONCURRENT_BATCHES);
    await Promise.all(batchChunks.map(async (chunk) => {
      const batch = writeBatch(db);
      chunk.forEach(item => {
        const docRef = doc(collectionRef, item.id);
        const sanitizedItem = sanitizeForFirestore({ ...item, syncedAt: new Date().toISOString() });
        batch.set(docRef, sanitizedItem);
      });
      await batch.commit();
    }));
  }
}

/**
 * Subscribe to real-time updates for a collection.
 * `includeDeleted: true` yields raw docs (tombstones included, for sync logic);
 * the default filters out soft-deleted items (for direct UI consumption).
 */
export function subscribeToCollection<T>(
  db: Firestore,
  uid: string,
  collectionName: string,
  onUpdate: (items: T[]) => void,
  options: { includeDeleted?: boolean } = {}
): Unsubscribe {
  const collectionRef = collection(db, collectionPath(uid, collectionName));
  const q = query(collectionRef);

  return onSnapshot(q, (snapshot) => {
    const items: T[] = [];
    snapshot.forEach((d) => {
      const data = d.data() as any;
      if (options.includeDeleted || !data.deleted) {
        items.push(data as T);
      }
    });
    onUpdate(items);
  }, (error) => {
    console.error(`Real-time sync error for ${collectionName}:`, error);
  });
}
