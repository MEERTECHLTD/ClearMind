/**
 * In-app sync event bus (mobile).
 *
 * Replaces the web's window CustomEvent('clearmind-sync'). The cloud realtime
 * listener (useRealtimeSync) emits per-store after reconciling Firestore changes
 * into sqlite; useCollection subscribes and reloads that store. Local writes
 * update their hook OPTIMISTICALLY and do NOT emit here (see useCollection).
 */
import { DeviceEventEmitter } from 'react-native';

const EVENT = 'clearmind-sync';

export const syncBus = {
  emit(store: string): void {
    DeviceEventEmitter.emit(EVENT, { store });
  },
  subscribe(cb: (store: string) => void): () => void {
    const sub = DeviceEventEmitter.addListener(EVENT, (payload: { store: string }) => {
      cb(payload?.store);
    });
    return () => sub.remove();
  },
};
