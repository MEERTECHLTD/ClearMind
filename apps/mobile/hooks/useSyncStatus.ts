import { useEffect, useState } from 'react';
import { onSyncStatus, type SyncStatus } from '../services/sync';

/** Live sync status (state, pending changes, last sync, error). */
export function useSyncStatus(): SyncStatus {
  const [s, setS] = useState<SyncStatus>({ state: 'idle', pending: 0, lastSyncedAt: null, error: null });
  useEffect(() => onSyncStatus(setS), []);
  return s;
}
