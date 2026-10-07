/**
 * Headless widget task handler (Android). Renders widgets from the stored
 * snapshot; "complete" taps update the widget instantly, then complete the
 * task through the shared domain op (sqlite + outbox) and push it to the cloud
 * if the session can be restored — no need to open the app.
 */
import type { WidgetTaskHandlerProps } from 'react-native-android-widget';
import type { Task, Project, Completion, Preferences, Label, Section } from '@clearmind/shared';
import * as D from '@clearmind/shared/domain';
import { readSnapshot, writeSnapshot, refreshWidgets, WIDGET_NAMES } from '../services/widgetData';
import { renderWidgetByName } from './render';

async function completeFromWidget(taskId: string) {
  const { dbService, STORES } = await import('../services/db');
  const { engine, startSync, stopSync } = await import('../services/sync');
  const all = async <T,>(s: string) => (await dbService.getAll<T>(s)) as T[];
  const prefs = (await all<Preferences>(STORES.PREFERENCES))[0] ?? null;
  const state: D.DomainState = {
    tasks: await all<Task>(STORES.TASKS), projects: await all<Project>(STORES.PROJECTS), labels: await all<Label>(STORES.LABELS),
    sections: await all<Section>(STORES.SECTIONS), completions: await all<Completion>(STORES.COMPLETIONS), preferences: prefs,
  };
  if (!state.tasks.some((t) => t.id === taskId && !t.completed)) return;
  const r = D.completeTask(state, taskId, { source: 'widget', timezone: prefs?.timezone ?? null });
  await engine.apply(r.edits);
  const after = D.applyEdits(state, r.edits);
  await refreshWidgets({ tasks: after.tasks, projects: after.projects, completions: after.completions ?? [], preferences: prefs, signedIn: true });
  // Try to push now (restores the Firebase session from storage; bounded).
  try {
    const { auth } = await import('../lib/firebase');
    const user = await new Promise<unknown>((res) => {
      if (auth.currentUser) return res(auth.currentUser);
      const t = setTimeout(() => res(null), 4000);
      const un = auth.onAuthStateChanged((u) => { if (u) { clearTimeout(t); un(); res(u); } });
    });
    if (user) {
      await startSync();
      await engine.flush();
      stopSync();
    }
  } catch { /* stays queued in the outbox; sent on next app open */ }
}

export async function widgetTaskHandler(props: WidgetTaskHandlerProps) {
  const { widgetInfo, widgetAction, clickAction, clickActionData, renderWidget } = props;
  if (widgetAction === 'WIDGET_DELETED') return;
  const snap = await readSnapshot();
  if (widgetAction === 'WIDGET_CLICK' && clickAction === 'COMPLETE' && typeof clickActionData?.taskId === 'string' && snap) {
    const id = clickActionData.taskId;
    const next = {
      ...snap,
      today: { ...snap.today, tasks: snap.today.tasks.filter((t) => t.id !== id), total: Math.max(0, snap.today.total - (snap.today.tasks.some((t) => t.id === id) ? 1 : 0)) },
      inbox: { ...snap.inbox, tasks: snap.inbox.tasks.filter((t) => t.id !== id) },
      upcoming: { days: snap.upcoming.days.map((d) => ({ ...d, tasks: d.tasks.filter((t) => t.id !== id) })) },
      productivity: { ...snap.productivity, completedToday: snap.productivity.completedToday + 1 },
    };
    await writeSnapshot(next);
    renderWidget(renderWidgetByName(widgetInfo.widgetName, next, widgetInfo));
    await completeFromWidget(id);
    return;
  }
  renderWidget(renderWidgetByName(widgetInfo.widgetName, snap, widgetInfo));
}

export { WIDGET_NAMES };
