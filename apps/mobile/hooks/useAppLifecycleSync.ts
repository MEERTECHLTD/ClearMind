/**
 * Connectivity + lifecycle: tells the SyncEngine when the device goes on/offline
 * (queued changes flush the moment it reconnects) and, when the app returns to
 * the foreground, flushes pending work and runs the daily full reconcile if due.
 * No polling loop — realtime listeners do the rest while the app is open.
 */
import { useEffect } from 'react';
import { AppState } from 'react-native';
import NetInfo from '@react-native-community/netinfo';
import { getFlag } from '../lib/flags';
import { resumeSync, setOnline } from '../services/sync';

export function useAppLifecycleSync(): void {
  useEffect(() => {
    const appSub = AppState.addEventListener('change', (s) => {
      if (s === 'active' && getFlag('autoSyncOnForeground')) void resumeSync();
    });
    const netUnsub = NetInfo.addEventListener((state) => setOnline(state.isConnected !== false));
    return () => {
      appSub.remove();
      netUnsub();
    };
  }, []);
}
