/**
 * Android lifecycle / offline resilience: re-run a full sync when the app returns
 * to the foreground or regains connectivity (throttled). The app already works
 * fully offline (sqlite is the source of truth); this just reconciles with the
 * cloud at the moments it matters. Gated by the autoSyncOnForeground flag.
 */
import { useEffect } from 'react';
import { AppState } from 'react-native';
import NetInfo from '@react-native-community/netinfo';
import { getFlag } from '../lib/flags';
import { syncAllStores } from '../services/syncService';
import { isFirebaseConfigured } from '../services/firebaseService';
import { logInfo, logWarn } from '../lib/logger';

let lastSync = 0;
const MIN_GAP = 15_000;

async function maybeSync(reason: string): Promise<void> {
  if (!isFirebaseConfigured() || !getFlag('autoSyncOnForeground')) return;
  const now = Date.now();
  if (now - lastSync < MIN_GAP) return;
  lastSync = now;
  try {
    const r = await syncAllStores();
    if (getFlag('verboseLogging')) logInfo(`autosync(${reason}): ${r.totalItemsSynced} items, ${r.failedStores.length} failed`);
  } catch (e) {
    logWarn(`autosync(${reason}) failed: ${String(e)}`);
  }
}

export function useAppLifecycleSync(): void {
  useEffect(() => {
    const appSub = AppState.addEventListener('change', (s) => {
      if (s === 'active') maybeSync('foreground');
    });
    const netUnsub = NetInfo.addEventListener((state) => {
      if (state.isConnected) maybeSync('online');
    });
    maybeSync('mount');
    return () => {
      appSub.remove();
      netUnsub();
    };
  }, []);
}
