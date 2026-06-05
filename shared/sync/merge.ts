/**
 * Last-write-wins merge engine — platform-agnostic, no DOM/SDK dependencies.
 *
 * This is the heart of bidirectional sync and is shared verbatim by web and
 * mobile so conflict resolution is identical on both. Timestamp priority is
 * `updatedAt > lastEdited > syncedAt`, falling back to epoch; on an exact tie the
 * cloud item wins. (See DECISIONS.md — sync contract invariants.)
 */

export interface SyncableItem {
  id: string;
  updatedAt?: string;
  lastEdited?: string;
  syncedAt?: string;
  deleted?: boolean;
  deletedAt?: string;
}

/**
 * Get the effective timestamp (ms since epoch) used for conflict comparison.
 */
export function getItemTimestamp(item: SyncableItem): number {
  const ts = item.updatedAt || item.lastEdited || item.syncedAt || '1970-01-01T00:00:00.000Z';
  return new Date(ts).getTime();
}

/**
 * Merge local and cloud items using last-write-wins.
 * Returns the merged set plus the deltas that must be written to each side.
 */
export function mergeItems<T extends SyncableItem>(
  localItems: T[],
  cloudItems: T[]
): { merged: T[]; toUpdateLocal: T[]; toUpdateCloud: T[] } {
  const merged = new Map<string, T>();
  const toUpdateLocal: T[] = [];
  const toUpdateCloud: T[] = [];

  const localMap = new Map(localItems.map(item => [item.id, item]));
  const cloudMap = new Map(cloudItems.map(item => [item.id, item]));

  const allIds = new Set([...localMap.keys(), ...cloudMap.keys()]);

  for (const id of allIds) {
    const localItem = localMap.get(id);
    const cloudItem = cloudMap.get(id);

    if (localItem && !cloudItem) {
      // Only exists locally - push to cloud
      merged.set(id, localItem);
      toUpdateCloud.push(localItem);
    } else if (!localItem && cloudItem) {
      // Only exists in cloud - pull to local
      merged.set(id, cloudItem);
      toUpdateLocal.push(cloudItem);
    } else if (localItem && cloudItem) {
      // Exists in both - newest wins
      const localTime = getItemTimestamp(localItem);
      const cloudTime = getItemTimestamp(cloudItem);

      if (localTime > cloudTime) {
        merged.set(id, localItem);
        toUpdateCloud.push(localItem);
      } else if (cloudTime > localTime) {
        merged.set(id, cloudItem);
        toUpdateLocal.push(cloudItem);
      } else {
        // Same timestamp - prefer cloud (consistent tie-break)
        merged.set(id, cloudItem);
      }
    }
  }

  return {
    merged: Array.from(merged.values()),
    toUpdateLocal,
    toUpdateCloud,
  };
}
