/**
 * App runtime glue (mounted once by the signed-in layout):
 *  - keeps every task-domain store loaded (so domain ops see complete state),
 *  - after ANY data change (local, other device, AI agent) re-plans
 *    notifications and refreshes widget data (debounced),
 *  - handles notification actions/taps (Complete · Snooze · Tomorrow · open task),
 *    including the action that launched a cold app.
 */
import * as Notifications from 'expo-notifications';
import type { Task, Preferences, Completion, Project } from '@clearmind/shared';
import { addDays, toISODate } from '@clearmind/shared/tasks';
import { getStore } from '../lib/collectionStore';
import { requestOpen } from '../lib/openRequests';
import { logWarn } from '../lib/logger';
import { STORES } from './db';
import { onDataChange } from './sync';
import { reconcileNotifications, configureNotifications } from './notifications';
import { refreshWidgets } from './widgetData';
import { toggleTask, updateTask, domainState } from './taskActions';

const KEEP_LOADED = [STORES.TASKS, STORES.PROJECTS, STORES.LABELS, STORES.SECTIONS, STORES.COMMENTS, STORES.COMPLETIONS, STORES.PREFERENCES, STORES.FILTERS];
const REPLAN_ON = new Set<string>([STORES.TASKS, STORES.PREFERENCES, STORES.COMPLETIONS, STORES.PROJECTS]);

let timer: ReturnType<typeof setTimeout> | null = null;
let signedIn = false;

function data() {
  const s = domainState();
  return { tasks: s.tasks as Task[], preferences: (s.preferences ?? null) as Preferences | null, completions: (s.completions ?? []) as Completion[], projects: s.projects as Project[] };
}

export function scheduleReplan(delay = 1200) {
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => {
    timer = null;
    const d = data();
    void reconcileNotifications(d);
    void refreshWidgets({ ...d, signedIn });
  }, delay);
}

async function waitLoaded() {
  for (let i = 0; i < 50; i++) {
    if (KEEP_LOADED.every((c) => getStore(c).getSnapshot().loaded)) return;
    await new Promise((r) => setTimeout(r, 100));
  }
}

async function handleResponse(resp: Notifications.NotificationResponse) {
  const data = (resp.notification.request.content.data ?? {}) as { taskId?: string | null; url?: string };
  const action = resp.actionIdentifier;
  const taskId = data.taskId ?? undefined;
  try {
    if (taskId && action !== Notifications.DEFAULT_ACTION_IDENTIFIER) {
      await waitLoaded();
      const task = getStore<Task>(STORES.TASKS).getSnapshot().items.find((t) => t.id === taskId);
      if (!task) return;
      if (action === 'complete' && !task.completed) await toggleTask(task, { source: 'notification' });
      if (action === 'snooze') {
        const at = new Date(Date.now() + 15 * 60_000);
        const local = `${toISODate(at)}T${String(at.getHours()).padStart(2, '0')}:${String(at.getMinutes()).padStart(2, '0')}`;
        await updateTask(task, { reminders: [...(task.reminders ?? []).filter((r) => r.id !== 'snooze'), { id: 'snooze', type: 'absolute', at: local }] });
      }
      if (action === 'tomorrow') await updateTask(task, { dueDate: toISODate(addDays(new Date(), 1)) });
      return;
    }
    if (taskId) requestOpen({ type: 'task', id: taskId });
  } catch (e) {
    logWarn('notification action: ' + String(e));
  } finally {
    void Notifications.dismissNotificationAsync(resp.notification.request.identifier).catch(() => {});
  }
}

/** Start the runtime; returns a stop function. */
export function startRuntime(opts: { signedIn: boolean }): () => void {
  signedIn = opts.signedIn;
  configureNotifications();
  const unsubs = KEEP_LOADED.map((c) => getStore(c).subscribe(() => {}));
  const offData = onDataChange((coll) => { if (REPLAN_ON.has(coll)) scheduleReplan(); });
  const sub = Notifications.addNotificationResponseReceivedListener((r) => void handleResponse(r));
  // The action/tap that launched the app from a killed state.
  Notifications.getLastNotificationResponseAsync().then((r) => { if (r) void handleResponse(r); }).catch(() => {});
  void waitLoaded().then(() => scheduleReplan(0));
  return () => {
    unsubs.forEach((u) => u());
    offData();
    sub.remove();
    if (timer) clearTimeout(timer);
  };
}
