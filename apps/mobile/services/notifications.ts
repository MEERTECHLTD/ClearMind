/**
 * Local reminder scheduling (expo-notifications). Schedule-on-write: callers
 * schedule when a dated item is created/edited and cancel when it's completed or
 * deleted. Everything is permission-gated and failure-tolerant — a denied
 * permission or a missing module never throws into the caller.
 *
 * IMPORTANT: nothing here reads permission/handler state at module load (that was
 * the web TasksView launch-crash trap). Configuration happens lazily on first use.
 */
import * as Notifications from 'expo-notifications';
import { logWarn } from '../lib/logger';

let configured = false;
function configureOnce() {
  if (configured) return;
  configured = true;
  try {
    Notifications.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowAlert: true,
        shouldPlaySound: true,
        shouldSetBadge: false,
        shouldShowBanner: true,
        shouldShowList: true,
      }),
    });
  } catch (e) {
    logWarn('notif configure: ' + String(e));
  }
}

export async function getPermissionStatus(): Promise<'granted' | 'denied' | 'undetermined'> {
  try {
    const s = await Notifications.getPermissionsAsync();
    if (s.granted) return 'granted';
    return s.canAskAgain ? 'undetermined' : 'denied';
  } catch {
    return 'undetermined';
  }
}

export async function ensurePermission(): Promise<boolean> {
  try {
    const s = await Notifications.getPermissionsAsync();
    if (s.granted) return true;
    const r = await Notifications.requestPermissionsAsync();
    return !!r.granted;
  } catch (e) {
    logWarn('notif permission: ' + String(e));
    return false;
  }
}

/** Combine 'YYYY-MM-DD' (+ optional 'HH:MM') into a Date, or null if unparseable. */
export function toDateTime(dueDate?: string, dueTime?: string): Date | null {
  if (!dueDate) return null;
  const [y, m, d] = dueDate.split('-').map(Number);
  if (!y || !m || !d) return null;
  let hh = 9, mm = 0; // default 9am if no time
  if (dueTime) {
    const [h, mi] = dueTime.split(':').map(Number);
    if (!Number.isNaN(h)) hh = h;
    if (!Number.isNaN(mi)) mm = mi;
  }
  const dt = new Date(y, m - 1, d, hh, mm, 0, 0);
  return Number.isNaN(dt.getTime()) ? null : dt;
}

/** Schedule a one-off reminder; returns the notification id, or null if not scheduled. */
export async function scheduleReminder(title: string, body: string, when: Date): Promise<string | null> {
  try {
    if (when.getTime() <= Date.now() + 10_000) return null; // past / too-soon
    configureOnce();
    if (!(await ensurePermission())) return null;
    return await Notifications.scheduleNotificationAsync({
      content: { title, body },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: when },
    });
  } catch (e) {
    logWarn('notif schedule: ' + String(e));
    return null;
  }
}

export async function cancelReminder(notifId?: string | null): Promise<void> {
  if (!notifId) return;
  try { await Notifications.cancelScheduledNotificationAsync(notifId); } catch { /* noop */ }
}

export async function sendTestNotification(): Promise<boolean> {
  try {
    configureOnce();
    if (!(await ensurePermission())) return false;
    await Notifications.scheduleNotificationAsync({
      content: { title: 'ClearMind', body: 'Test notification — reminders are working. 🎉' },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL, seconds: 2 },
    });
    return true;
  } catch (e) {
    logWarn('notif test: ' + String(e));
    return false;
  }
}
