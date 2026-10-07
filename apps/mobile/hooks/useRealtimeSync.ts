/**
 * useRealtimeSync — mounted ONCE in (app)/_layout.tsx. Starts the SyncEngine's
 * realtime delta listeners for the signed-in account and stops them on sign-out
 * (keyed on uid so a pre-auth mount still subscribes once auth resolves).
 */
import { useEffect } from 'react';
import { isFirebaseConfigured } from '../services/firebaseService';
import { startSync, stopSync } from '../services/sync';
import { useAuth } from './useAuth';
import { logWarn } from '../lib/logger';

export function useRealtimeSync(): void {
  const { user } = useAuth();
  const uid = user?.uid ?? null;
  useEffect(() => {
    if (!uid || !isFirebaseConfigured()) return;
    startSync().catch((e) => logWarn('startSync failed: ' + String(e)));
    return () => stopSync();
  }, [uid]);
}
