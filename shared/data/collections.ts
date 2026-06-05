/**
 * Canonical store / collection naming — the SINGLE SOURCE OF TRUTH for sync.
 *
 * Both the web (IndexedDB) and mobile (expo-sqlite) apps use the same local
 * store names, and both map them to the same Firestore collection names. If this
 * map ever diverges between platforms, a user's records stop lining up across
 * web and mobile, so it lives here and is imported by both. (See DECISIONS.md.)
 */

// Local store names (IndexedDB object stores on web, sqlite tables on mobile).
export const STORES = {
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
} as const;

// Canonical mapping: local store name -> Firestore collection name.
// NOTE the deliberate renames: logs->dailyLogs, dailymapper->timeblocks, etc.
// `profile` is intentionally absent (it is never synced to a generic collection;
// it lives at the top-level Firestore doc users/{uid}).
export const STORE_TO_FIRESTORE: Record<string, string> = {
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
  [STORES.LEARNING_FOLDERS]: 'learningFolders',
};

// Reverse mapping: Firestore collection name -> local store name.
export const FIRESTORE_TO_STORE: Record<string, string> = Object.entries(STORE_TO_FIRESTORE)
  .reduce((acc, [local, firestore]) => {
    acc[firestore] = local;
    return acc;
  }, {} as Record<string, string>);

export const getFirestoreCollectionName = (localStoreName: string): string => {
  return STORE_TO_FIRESTORE[localStoreName] || localStoreName;
};

export const getLocalStoreName = (firestoreCollection: string): string => {
  return FIRESTORE_TO_STORE[firestoreCollection] || firestoreCollection;
};

// All Firestore collection names (for real-time sync subscriptions).
export const getAllFirestoreCollections = (): string[] => {
  return Object.values(STORE_TO_FIRESTORE);
};

// All syncable local stores (excludes profile, which is handled separately).
export const getSyncableStores = (): string[] => {
  return Object.keys(STORE_TO_FIRESTORE);
};
