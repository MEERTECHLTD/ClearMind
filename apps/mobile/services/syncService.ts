/**
 * Compatibility shim over the SyncEngine (services/sync.ts). The old
 * last-write-wins whole-document sync was replaced by field-level, delta,
 * outbox-based sync; these helpers keep older call sites working.
 */
import { syncNow, engine } from './sync';
import { syncBus } from './events';

/** Full field-level reconcile of every collection ("Sync now"). */
export async function syncAllStores(): Promise<{ success: boolean; totalItemsSynced: number; failedStores: string[]; errors: Record<string, string> }> {
  const r = await syncNow();
  return { success: r.failed.length === 0, totalItemsSynced: r.pulled + r.pushed, failedStores: r.failed, errors: {} };
}

/** Push anything still queued (e.g. before sign-out). */
export const flushPending = () => engine.flush();

/** Notify views a store changed. */
export function dispatchSyncEvent(localStoreName: string): void {
  syncBus.emit(localStoreName);
}
