/**
 * Notification subsystem (expo-notifications).
 *
 *  - Permission: never prompted at launch. The app explains the value first
 *    (components/notifications/PermissionPrompt) and only then asks; a denial is
 *    respected and Settings links to the OS settings.
 *  - Schedule: the device's OS schedule is RECONCILED against the shared,
 *    deterministic plan (shared/domain/reminders) whenever tasks or preferences
 *    change — locally, on another device, or by an AI agent. Identifiers are the
 *    plan keys, so nothing is ever duplicated and stale reminders are cancelled.
 *  - Actions: Complete · Snooze 15 min · Tomorrow, handled in the background
 *    where the OS allows (and replayed on next launch otherwise). Tapping opens
 *    the exact task (deep link clearmind://task/<id>).
 *
 * Nothing here touches permission/handler state at module load.
 */
import * as Notifications from 'expo-notifications';
import { Platform, Linking } from 'react-native';
import { planNotifications, diffSchedule } from '@clearmind/shared/domain';
import type { Task, Preferences, Completion } from '@clearmind/shared';
import { logWarn } from '../lib/logger';

export const TASK_CATEGORY = 'cm-task';
const OWN = 'cm';

let configured = false;
export function configureNotifications() {
  if (configured) return;
  configured = true;
  try {
    Notifications.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowAlert: true, shouldPlaySound: true, shouldSetBadge: false, shouldShowBanner: true, shouldShowList: true,
      }),
    });
    void Notifications.setNotificationCategoryAsync(TASK_CATEGORY, [
      { identifier: 'complete', buttonTitle: 'Complete', options: { opensAppToForeground: false } },
      { identifier: 'snooze', buttonTitle: 'Snooze 15 min', options: { opensAppToForeground: false } },
      { identifier: 'tomorrow', buttonTitle: 'Tomorrow', options: { opensAppToForeground: false } },
    ]);
    if (Platform.OS === 'android') {
      void Notifications.setNotificationChannelAsync('reminders', { name: 'Task reminders', importance: Notifications.AndroidImportance.HIGH, vibrationPattern: [0, 200, 120, 200] });
      void Notifications.setNotificationChannelAsync('digest', { name: 'Daily plan & summaries', importance: Notifications.AndroidImportance.DEFAULT });
    }
  } catch (e) {
    logWarn('notif configure: ' + String(e));
  }
}

export type PermissionState = 'granted' | 'denied' | 'undetermined';

export async function getPermissionStatus(): Promise<PermissionState> {
  try {
    const s = await Notifications.getPermissionsAsync();
    if (s.granted || s.ios?.status === Notifications.IosAuthorizationStatus.PROVISIONAL) return 'granted';
    return s.canAskAgain ? 'undetermined' : 'denied';
  } catch {
    return 'undetermined';
  }
}

/** Ask the OS (call only after explaining why). */
export async function requestPermission(): Promise<PermissionState> {
  try {
    configureNotifications();
    const r = await Notifications.requestPermissionsAsync({ ios: { allowAlert: true, allowSound: true, allowBadge: false } });
    return r.granted ? 'granted' : r.canAskAgain ? 'undetermined' : 'denied';
  } catch (e) {
    logWarn('notif permission: ' + String(e));
    return 'undetermined';
  }
}

export const openSystemSettings = () => Linking.openSettings().catch(() => {});

/** Kept for older call sites: ensure permission (prompts if still undetermined). */
export async function ensurePermission(): Promise<boolean> {
  return (await getPermissionStatus()) === 'granted' || (await requestPermission()) === 'granted';
}

/** Combine 'YYYY-MM-DD' (+ optional 'HH:MM') into a local Date, or null. */
export function toDateTime(dueDate?: string, dueTime?: string): Date | null {
  if (!dueDate) return null;
  const [y, m, d] = dueDate.split('-').map(Number);
  if (!y || !m || !d) return null;
  const [hh, mm] = dueTime ? dueTime.split(':').map(Number) : [9, 0];
  const dt = new Date(y, m - 1, d, hh || 0, mm || 0, 0, 0);
  return Number.isNaN(dt.getTime()) ? null : dt;
}

let reconciling: Promise<number> | null = null;
let again = false;

/**
 * Bring the OS schedule in line with the plan for the current data. Returns the
 * number of pending ClearMind notifications. Coalesces concurrent calls.
 */
export function reconcileNotifications(data: { tasks: Task[]; preferences: Preferences | null; completions: Completion[] }): Promise<number> {
  if (reconciling) { again = true; return reconciling; }
  reconciling = (async () => {
    try {
      if ((await getPermissionStatus()) !== 'granted') return 0;
      configureNotifications();
      const plan = planNotifications({ tasks: data.tasks, preferences: data.preferences, completions: data.completions, max: Platform.OS === 'ios' ? 60 : 100 });
      const scheduled = await Notifications.getAllScheduledNotificationsAsync();
      const ours = scheduled.filter((n) => (n.content.data as any)?.[OWN]).map((n) => n.identifier);
      const { toCancel, toSchedule } = diffSchedule(plan, ours);
      for (const id of toCancel) await Notifications.cancelScheduledNotificationAsync(id).catch(() => {});
      for (const p of toSchedule) {
        await Notifications.scheduleNotificationAsync({
          identifier: p.key,
          content: {
            title: p.title,
            body: p.body,
            data: { [OWN]: true, kind: p.kind, taskId: p.taskId ?? null, url: p.url },
            categoryIdentifier: p.kind === 'task' ? TASK_CATEGORY : undefined,
            sound: true,
          },
          trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: new Date(p.at), channelId: p.kind === 'task' ? 'reminders' : 'digest' },
        }).catch((e) => logWarn('notif schedule: ' + String(e)));
      }
      return ours.length - toCancel.length + toSchedule.length;
    } catch (e) {
      logWarn('notif reconcile: ' + String(e));
      return 0;
    } finally {
      reconciling = null;
      if (again) { again = false; void reconcileNotifications(data); }
    }
  })();
  return reconciling;
}

export async function cancelAllOwn() {
  const scheduled = await Notifications.getAllScheduledNotificationsAsync().catch(() => []);
  for (const n of scheduled) if ((n.content.data as any)?.[OWN]) await Notifications.cancelScheduledNotificationAsync(n.identifier).catch(() => {});
}

export async function sendTestNotification(): Promise<boolean> {
  try {
    configureNotifications();
    if ((await getPermissionStatus()) !== 'granted') return false;
    await Notifications.scheduleNotificationAsync({
      content: { title: 'ClearMind', body: 'Notifications are working. 🎉', data: { url: 'clearmind://today' } },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL, seconds: 2 },
    });
    return true;
  } catch (e) {
    logWarn('notif test: ' + String(e));
    return false;
  }
}

/**
 * One-off reminders for non-task features (Applications deadlines). Tasks use
 * the reconciled plan above; these are tracked by their own ids.
 */
export async function scheduleReminder(title: string, body: string, when: Date): Promise<string | null> {
  try {
    if (when.getTime() <= Date.now() + 10_000) return null;
    configureNotifications();
    if ((await getPermissionStatus()) !== 'granted' && (await requestPermission()) !== 'granted') return null;
    return await Notifications.scheduleNotificationAsync({
      content: { title, body, data: { url: 'clearmind://applications' } },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: when, channelId: 'digest' },
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
