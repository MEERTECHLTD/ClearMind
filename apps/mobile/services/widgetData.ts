/**
 * Widget data: after every data change the app stores a compact snapshot
 * (shared/domain/widgets) and asks Android to re-render each widget. Widgets
 * read the snapshot in a headless task, so they stay current without the app
 * being open (and also refresh on Android's own update period).
 */
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { buildWidgetSnapshot, type WidgetSnapshot } from '@clearmind/shared/domain';
import type { Task, Project, Completion, Preferences } from '@clearmind/shared';
import { logWarn } from '../lib/logger';

export const WIDGET_KEY = 'clearmind:widget:snapshot';
export const WIDGET_NAMES = ['Today', 'Inbox', 'Upcoming', 'Productivity', 'QuickAdd'] as const;

export async function readSnapshot(): Promise<WidgetSnapshot | null> {
  try {
    const raw = await AsyncStorage.getItem(WIDGET_KEY);
    return raw ? (JSON.parse(raw) as WidgetSnapshot) : null;
  } catch {
    return null;
  }
}

export async function writeSnapshot(s: WidgetSnapshot) {
  await AsyncStorage.setItem(WIDGET_KEY, JSON.stringify(s));
}

let last = '';
export async function refreshWidgets(input: { tasks: Task[]; projects: Project[]; completions: Completion[]; preferences: Preferences | null; signedIn: boolean }) {
  if (Platform.OS !== 'android') return;
  try {
    const snap = buildWidgetSnapshot(input);
    const sig = JSON.stringify({ ...snap, generatedAt: '' });
    if (sig === last) return; // nothing visible changed
    last = sig;
    await writeSnapshot(snap);
    const { requestWidgetUpdate } = await import('react-native-android-widget');
    const { renderWidgetByName } = await import('../widgets/render');
    for (const name of WIDGET_NAMES) {
      await requestWidgetUpdate({ widgetName: name, renderWidget: (info) => renderWidgetByName(name, snap, info), widgetNotFound: () => {} }).catch(() => {});
    }
  } catch (e) {
    logWarn('widgets: ' + String(e));
  }
}

/** Signed out: widgets show a sign-in prompt instead of stale data. */
export async function clearWidgets() {
  if (Platform.OS !== 'android') return;
  await refreshWidgets({ tasks: [], projects: [], completions: [], preferences: null, signedIn: false });
}
