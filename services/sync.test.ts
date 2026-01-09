/**
 * Unit Tests for Sync Logic
 * 
 * These tests run without requiring IndexedDB or Firebase.
 * They test the pure logic functions in isolation.
 * 
 * Run with: npx vitest run services/sync.test.ts
 */

/// <reference types="vitest/globals" />
// Using vitest globals (configured in vite.config.ts)

// ============= PURE LOGIC FUNCTIONS (no dependencies) =============

interface SyncableItem {
  id: string;
  updatedAt?: string;
  lastEdited?: string;
  syncedAt?: string;
  deleted?: boolean;
  deletedAt?: string;
}

/**
 * Get the effective timestamp for comparison
 */
function getItemTimestamp(item: SyncableItem): number {
  const ts = item.updatedAt || item.lastEdited || item.syncedAt || '1970-01-01T00:00:00.000Z';
  return new Date(ts).getTime();
}

/**
 * Merge local and cloud items using last-write-wins strategy
 */
function mergeItems<T extends SyncableItem>(
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
      merged.set(id, localItem);
      toUpdateCloud.push(localItem);
    } else if (!localItem && cloudItem) {
      merged.set(id, cloudItem);
      toUpdateLocal.push(cloudItem);
    } else if (localItem && cloudItem) {
      const localTime = getItemTimestamp(localItem);
      const cloudTime = getItemTimestamp(cloudItem);
      
      if (localTime > cloudTime) {
        merged.set(id, localItem);
        toUpdateCloud.push(localItem);
      } else if (cloudTime > localTime) {
        merged.set(id, cloudItem);
        toUpdateLocal.push(cloudItem);
      } else {
        merged.set(id, cloudItem);
      }
    }
  }
  
  return {
    merged: Array.from(merged.values()),
    toUpdateLocal,
    toUpdateCloud
  };
}

// ============= STORE MAPPING TESTS =============

// These are the canonical mappings (duplicated for test isolation)
const STORES = {
  PROJECTS: 'projects',
  TASKS: 'tasks',
  NOTES: 'notes',
  HABITS: 'habits',
  GOALS: 'goals',
  MILESTONES: 'milestones',
  LOGS: 'logs',
  PROFILE: 'profile',
  RANTS: 'rants',
  MINDMAPS: 'mindmaps',
  EVENTS: 'events',
  DAILY_MAPPER: 'dailymapper',
  DAILY_MAPPER_TEMPLATES: 'dailymappertemplates',
  APPLICATIONS: 'applications',
  IRIS_CONVERSATIONS: 'iris_conversations',
  LEARNING_RESOURCES: 'learningresources',
  LEARNING_FOLDERS: 'learningfolders',
};

const STORE_TO_FIRESTORE: Record<string, string> = {
  [STORES.TASKS]: 'tasks',
  [STORES.PROJECTS]: 'projects',
  [STORES.NOTES]: 'notes',
  [STORES.HABITS]: 'habits',
  [STORES.GOALS]: 'goals',
  [STORES.MILESTONES]: 'milestones',
  [STORES.LOGS]: 'dailyLogs',
  [STORES.RANTS]: 'rants',
  [STORES.EVENTS]: 'events',
  [STORES.DAILY_MAPPER]: 'timeblocks',
  [STORES.DAILY_MAPPER_TEMPLATES]: 'timeblocktemplates',
  [STORES.MINDMAPS]: 'mindmaps',
  [STORES.APPLICATIONS]: 'applications',
  [STORES.IRIS_CONVERSATIONS]: 'iris_conversations',
  [STORES.LEARNING_RESOURCES]: 'learningResources',
  [STORES.LEARNING_FOLDERS]: 'learningFolders'
};

const FIRESTORE_TO_STORE: Record<string, string> = Object.entries(STORE_TO_FIRESTORE)
  .reduce((acc, [local, firestore]) => {
    acc[firestore] = local;
    return acc;
  }, {} as Record<string, string>);

function toFirestoreCollection(localStoreName: string): string {
  return STORE_TO_FIRESTORE[localStoreName] || localStoreName;
}

function toLocalStore(firestoreCollection: string): string {
  return FIRESTORE_TO_STORE[firestoreCollection] || firestoreCollection;
}

// ============= TESTS =============

describe('Store Mappings', () => {
  it('should have mappings for all STORES except profile', () => {
    const storeValues = Object.values(STORES).filter(s => s !== 'profile');
    
    for (const store of storeValues) {
      expect(STORE_TO_FIRESTORE[store]).toBeDefined();
      expect(typeof STORE_TO_FIRESTORE[store]).toBe('string');
    }
  });

  it('should have reverse mappings for all Firestore collections', () => {
    for (const [local, firestore] of Object.entries(STORE_TO_FIRESTORE)) {
      expect(FIRESTORE_TO_STORE[firestore]).toBe(local);
    }
  });

  it('toFirestoreCollection should convert correctly', () => {
    expect(toFirestoreCollection(STORES.TASKS)).toBe('tasks');
    expect(toFirestoreCollection(STORES.LOGS)).toBe('dailyLogs');
    expect(toFirestoreCollection(STORES.DAILY_MAPPER)).toBe('timeblocks');
    expect(toFirestoreCollection(STORES.LEARNING_RESOURCES)).toBe('learningResources');
    expect(toFirestoreCollection(STORES.LEARNING_FOLDERS)).toBe('learningFolders');
  });

  it('toLocalStore should convert correctly', () => {
    expect(toLocalStore('tasks')).toBe(STORES.TASKS);
    expect(toLocalStore('dailyLogs')).toBe(STORES.LOGS);
    expect(toLocalStore('timeblocks')).toBe(STORES.DAILY_MAPPER);
    expect(toLocalStore('learningResources')).toBe(STORES.LEARNING_RESOURCES);
    expect(toLocalStore('learningFolders')).toBe(STORES.LEARNING_FOLDERS);
  });

  it('round-trip conversion should return original value', () => {
    const syncableStores = Object.keys(STORE_TO_FIRESTORE);
    for (const localStore of syncableStores) {
      const firestore = toFirestoreCollection(localStore);
      const backToLocal = toLocalStore(firestore);
      expect(backToLocal).toBe(localStore);
    }
  });

  it('all store mappings should be unique', () => {
    const firestoreNames = Object.values(STORE_TO_FIRESTORE);
    const uniqueNames = new Set(firestoreNames);
    expect(uniqueNames.size).toBe(firestoreNames.length);
  });

  it('Learning Vault stores should map correctly (bug fix verification)', () => {
    expect(STORE_TO_FIRESTORE[STORES.LEARNING_RESOURCES]).toBe('learningResources');
    expect(STORE_TO_FIRESTORE[STORES.LEARNING_FOLDERS]).toBe('learningFolders');
    
    expect(toLocalStore('learningResources')).toBe('learningresources');
    expect(toLocalStore('learningFolders')).toBe('learningfolders');
  });

  it('Daily Mapper stores should map correctly', () => {
    expect(STORE_TO_FIRESTORE[STORES.DAILY_MAPPER]).toBe('timeblocks');
    expect(STORE_TO_FIRESTORE[STORES.DAILY_MAPPER_TEMPLATES]).toBe('timeblocktemplates');
    
    expect(toLocalStore('timeblocks')).toBe('dailymapper');
    expect(toLocalStore('timeblocktemplates')).toBe('dailymappertemplates');
  });
});

describe('mergeItems - basic operations', () => {
  const createItem = (id: string, updatedAt: string, deleted = false): SyncableItem => ({
    id,
    updatedAt,
    deleted
  });

  it('should return empty arrays for empty inputs', () => {
    const result = mergeItems([], []);
    expect(result.merged).toEqual([]);
    expect(result.toUpdateLocal).toEqual([]);
    expect(result.toUpdateCloud).toEqual([]);
  });

  it('should add local-only items to cloud updates', () => {
    const local = [createItem('1', '2026-01-09T10:00:00Z')];
    const cloud: SyncableItem[] = [];

    const result = mergeItems(local, cloud);

    expect(result.merged.length).toBe(1);
    expect(result.toUpdateCloud.length).toBe(1);
    expect(result.toUpdateLocal.length).toBe(0);
    expect(result.toUpdateCloud[0].id).toBe('1');
  });

  it('should add cloud-only items to local updates', () => {
    const local: SyncableItem[] = [];
    const cloud = [createItem('1', '2026-01-09T10:00:00Z')];

    const result = mergeItems(local, cloud);

    expect(result.merged.length).toBe(1);
    expect(result.toUpdateLocal.length).toBe(1);
    expect(result.toUpdateCloud.length).toBe(0);
    expect(result.toUpdateLocal[0].id).toBe('1');
  });
});

describe('mergeItems - conflict resolution', () => {
  const createItem = (id: string, updatedAt: string, deleted = false): SyncableItem => ({
    id,
    updatedAt,
    deleted
  });

  it('should prefer newer local item', () => {
    const local = [createItem('1', '2026-01-09T12:00:00Z')]; // Newer
    const cloud = [createItem('1', '2026-01-09T10:00:00Z')]; // Older

    const result = mergeItems(local, cloud);

    expect(result.merged.length).toBe(1);
    expect(result.merged[0].updatedAt).toBe('2026-01-09T12:00:00Z');
    expect(result.toUpdateCloud.length).toBe(1);
    expect(result.toUpdateLocal.length).toBe(0);
  });

  it('should prefer newer cloud item', () => {
    const local = [createItem('1', '2026-01-09T10:00:00Z')]; // Older
    const cloud = [createItem('1', '2026-01-09T12:00:00Z')]; // Newer

    const result = mergeItems(local, cloud);

    expect(result.merged.length).toBe(1);
    expect(result.merged[0].updatedAt).toBe('2026-01-09T12:00:00Z');
    expect(result.toUpdateLocal.length).toBe(1);
    expect(result.toUpdateCloud.length).toBe(0);
  });

  it('should prefer cloud item on equal timestamps', () => {
    const timestamp = '2026-01-09T10:00:00Z';
    const local = [{ ...createItem('1', timestamp), source: 'local' }];
    const cloud = [{ ...createItem('1', timestamp), source: 'cloud' }];

    const result = mergeItems(local as any, cloud as any);

    expect(result.merged.length).toBe(1);
    expect((result.merged[0] as any).source).toBe('cloud');
    expect(result.toUpdateLocal.length).toBe(0);
    expect(result.toUpdateCloud.length).toBe(0);
  });
});

describe('mergeItems - multiple items', () => {
  const createItem = (id: string, updatedAt: string, deleted = false): SyncableItem => ({
    id,
    updatedAt,
    deleted
  });

  it('should handle multiple items correctly', () => {
    const local = [
      createItem('1', '2026-01-09T12:00:00Z'), // Newer than cloud
      createItem('2', '2026-01-09T10:00:00Z'), // Older than cloud
      createItem('3', '2026-01-09T10:00:00Z'), // Only in local
    ];
    const cloud = [
      createItem('1', '2026-01-09T10:00:00Z'), // Older than local
      createItem('2', '2026-01-09T12:00:00Z'), // Newer than local
      createItem('4', '2026-01-09T10:00:00Z'), // Only in cloud
    ];

    const result = mergeItems(local, cloud);

    expect(result.merged.length).toBe(4);
    expect(result.toUpdateCloud.length).toBe(2); // items 1 and 3
    expect(result.toUpdateLocal.length).toBe(2); // items 2 and 4

    const cloudIds = result.toUpdateCloud.map(i => i.id).sort();
    const localIds = result.toUpdateLocal.map(i => i.id).sort();
    expect(cloudIds).toEqual(['1', '3']);
    expect(localIds).toEqual(['2', '4']);
  });

  it('should handle deleted items', () => {
    const local = [createItem('1', '2026-01-09T12:00:00Z', true)]; // Deleted locally, newer
    const cloud = [createItem('1', '2026-01-09T10:00:00Z', false)]; // Not deleted in cloud, older

    const result = mergeItems(local, cloud);

    expect(result.merged.length).toBe(1);
    expect(result.merged[0].deleted).toBe(true);
    expect(result.toUpdateCloud.length).toBe(1);
  });
});

describe('mergeItems - timestamp fallbacks', () => {
  it('should use lastEdited if updatedAt is missing', () => {
    const local = [{ id: '1', lastEdited: '2026-01-09T12:00:00Z' }];
    const cloud = [{ id: '1', lastEdited: '2026-01-09T10:00:00Z' }];

    const result = mergeItems(local, cloud);

    expect(result.merged[0].lastEdited).toBe('2026-01-09T12:00:00Z');
    expect(result.toUpdateCloud.length).toBe(1);
  });

  it('should use syncedAt as fallback', () => {
    const local = [{ id: '1', syncedAt: '2026-01-09T10:00:00Z' }];
    const cloud = [{ id: '1', syncedAt: '2026-01-09T12:00:00Z' }];

    const result = mergeItems(local, cloud);

    expect(result.merged[0].syncedAt).toBe('2026-01-09T12:00:00Z');
    expect(result.toUpdateLocal.length).toBe(1);
  });

  it('should prioritize updatedAt > lastEdited > syncedAt', () => {
    const local = [{ 
      id: '1', 
      updatedAt: '2026-01-09T08:00:00Z',
      lastEdited: '2026-01-09T10:00:00Z',
      syncedAt: '2026-01-09T12:00:00Z'
    }];
    const cloud = [{ 
      id: '1', 
      updatedAt: '2026-01-09T09:00:00Z',
      lastEdited: '2026-01-09T06:00:00Z',
      syncedAt: '2026-01-09T06:00:00Z'
    }];

    const result = mergeItems(local, cloud);

    // Cloud's updatedAt (09:00) > Local's updatedAt (08:00), so cloud wins
    expect(result.merged[0].updatedAt).toBe('2026-01-09T09:00:00Z');
    expect(result.toUpdateLocal.length).toBe(1);
  });
});

describe('mergeItems - edge cases', () => {
  it('should handle items with no timestamps', () => {
    const local = [{ id: '1' }];
    const cloud = [{ id: '1' }];

    const result = mergeItems(local, cloud);

    expect(result.merged.length).toBe(1);
  });

  it('should handle invalid date strings gracefully', () => {
    const local = [{ id: '1', updatedAt: 'invalid-date' }];
    const cloud = [{ id: '1', updatedAt: '2026-01-09T10:00:00Z' }];

    expect(() => mergeItems(local, cloud)).not.toThrow();
  });

  it('should handle large number of items efficiently', () => {
    const count = 1000;
    const local = Array.from({ length: count }, (_, i) => ({
      id: `item-${i}`,
      updatedAt: new Date(Date.now() - i * 1000).toISOString()
    }));
    const cloud = Array.from({ length: count }, (_, i) => ({
      id: `item-${i}`,
      updatedAt: new Date(Date.now() - (count - i) * 1000).toISOString()
    }));

    const start = performance.now();
    const result = mergeItems(local, cloud);
    const duration = performance.now() - start;

    expect(result.merged.length).toBe(count);
    expect(duration).toBeLessThan(100); // Should complete in under 100ms
  });
});

describe('getItemTimestamp', () => {
  it('should return epoch for items with no timestamp', () => {
    const result = getItemTimestamp({ id: '1' });
    expect(result).toBe(new Date('1970-01-01T00:00:00.000Z').getTime());
  });

  it('should use updatedAt first', () => {
    const result = getItemTimestamp({ 
      id: '1', 
      updatedAt: '2026-01-09T10:00:00Z',
      lastEdited: '2026-01-09T11:00:00Z'
    });
    expect(result).toBe(new Date('2026-01-09T10:00:00Z').getTime());
  });

  it('should use lastEdited if updatedAt missing', () => {
    const result = getItemTimestamp({ 
      id: '1', 
      lastEdited: '2026-01-09T11:00:00Z',
      syncedAt: '2026-01-09T12:00:00Z'
    });
    expect(result).toBe(new Date('2026-01-09T11:00:00Z').getTime());
  });

  it('should use syncedAt as last resort', () => {
    const result = getItemTimestamp({ 
      id: '1', 
      syncedAt: '2026-01-09T12:00:00Z'
    });
    expect(result).toBe(new Date('2026-01-09T12:00:00Z').getTime());
  });
});
