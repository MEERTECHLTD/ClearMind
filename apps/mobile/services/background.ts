/**
 * Background synchronization (expo-background-task). The OS decides when to run
 * it (≥15 min, respecting battery/Doze/iOS budgets). Each run: restore the
 * session, receive changes made elsewhere (web, other devices, AI agents),
 * flush queued local changes, re-plan reminders and refresh widgets — then stop.
 */
import * as TaskManager from 'expo-task-manager';
import * as BackgroundTask from 'expo-background-task';
import { logWarn } from '../lib/logger';

export const BACKGROUND_SYNC = 'clearmind-background-sync';

TaskManager.defineTask(BACKGROUND_SYNC, async () => {
  try {
    const { auth } = await import('../lib/firebase');
    const user = await new Promise<unknown>((res) => {
      if (auth.currentUser) return res(auth.currentUser);
      const t = setTimeout(() => res(null), 5000);
      const un = auth.onAuthStateChanged((u) => { if (u) { clearTimeout(t); un(); res(u); } });
    });
    if (!user) return BackgroundTask.BackgroundTaskResult.Success;
    const { startSync, stopSync, engine } = await import('./sync');
    await startSync();
    await new Promise((r) => setTimeout(r, 12_000)); // let delta listeners deliver
    await engine.flush();
    stopSync();
    const { dbService, STORES } = await import('./db');
    const tasks = await dbService.getAll<any>(STORES.TASKS);
    const projects = await dbService.getAll<any>(STORES.PROJECTS);
    const completions = await dbService.getAll<any>(STORES.COMPLETIONS);
    const preferences = (await dbService.getAll<any>(STORES.PREFERENCES))[0] ?? null;
    const { reconcileNotifications } = await import('./notifications');
    const { refreshWidgets } = await import('./widgetData');
    await reconcileNotifications({ tasks, preferences, completions });
    await refreshWidgets({ tasks, projects, completions, preferences, signedIn: true });
    return BackgroundTask.BackgroundTaskResult.Success;
  } catch (e) {
    logWarn('background sync: ' + String(e));
    return BackgroundTask.BackgroundTaskResult.Failed;
  }
});

export function registerBackgroundSync() {
  BackgroundTask.registerTaskAsync(BACKGROUND_SYNC, { minimumInterval: 30 }).catch((e) => logWarn('bg register: ' + String(e)));
}
