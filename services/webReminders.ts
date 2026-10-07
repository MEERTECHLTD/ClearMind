/**
 * Browser task reminders — driven by the same deterministic planner as mobile
 * (shared/domain/reminders), so reminders, defaults, daily plan, weekly summary
 * and quiet hours follow the synced Preferences on every device.
 *
 * Read-only over synced data: nothing is written back to tasks (the old
 * `notified: true` flag caused cross-device churn). Fired keys are remembered
 * per browser in localStorage. Timers are armed only for the next 24 hours and
 * re-planned whenever tasks or preferences change.
 */
import type { Task, Preferences, Completion } from '../types';
import { planNotifications, type PlannedNotification } from '../shared/domain/reminders';
import { getStore } from '../components/tasks/store';
import { STORES } from './db';
import { isNotificationPermitted, showNotification } from './notificationService';

const FIRED_KEY = 'cm.firedReminders';
const WINDOW_MS = 24 * 60 * 60 * 1000;
const timers = new Map<string, ReturnType<typeof setTimeout>>();

function fired(): Record<string, number> {
  try { return JSON.parse(localStorage.getItem(FIRED_KEY) ?? '{}'); } catch { return {}; }
}
function markFired(key: string) {
  try {
    const f = fired();
    f[key] = Date.now();
    const cutoff = Date.now() - 7 * 86_400_000;
    for (const k of Object.keys(f)) if (f[k] < cutoff) delete f[k];
    localStorage.setItem(FIRED_KEY, JSON.stringify(f));
  } catch { /* storage unavailable */ }
}

async function fire(n: PlannedNotification) {
  timers.delete(n.key);
  if (!isNotificationPermitted() || fired()[n.key]) return;
  markFired(n.key);
  await showNotification(n.title, { body: n.body, tag: n.key, data: { type: n.kind, id: n.taskId, url: n.taskId ? `/#today?task=${n.taskId}` : '/#today' } });
}

/** Rebuild the plan and (re)arm timers. Safe to call often. */
export function replanWebReminders(now = new Date()) {
  const tasks = getStore<Task>(STORES.TASKS).getSnapshot().items;
  const preferences = getStore<Preferences>(STORES.PREFERENCES).getSnapshot().items[0] ?? null;
  const completions = getStore<Completion>(STORES.COMPLETIONS).getSnapshot().items;
  const plan = planNotifications({ tasks, preferences, completions, now, horizonDays: 2 })
    .filter((n) => new Date(n.at).getTime() - now.getTime() <= WINDOW_MS);
  const keep = new Set(plan.map((n) => n.key));
  for (const [k, t] of timers) if (!keep.has(k)) { clearTimeout(t); timers.delete(k); }
  for (const n of plan) {
    if (timers.has(n.key)) continue;
    timers.set(n.key, setTimeout(() => { void fire(n); }, Math.max(0, new Date(n.at).getTime() - now.getTime())));
  }
}

let unsubs: (() => void)[] = [];
let refresh: ReturnType<typeof setInterval> | null = null;

/** Start following task/preference changes. Returns a stop function. */
export function startWebReminders(): () => void {
  stopWebReminders();
  let pending: ReturnType<typeof setTimeout> | null = null;
  const schedule = () => { if (pending) clearTimeout(pending); pending = setTimeout(() => { pending = null; replanWebReminders(); }, 500); };
  unsubs = [STORES.TASKS, STORES.PREFERENCES, STORES.COMPLETIONS].map((s) => getStore(s).subscribe(schedule));
  // Re-arm hourly so items entering the 24 h window get timers (and after sleep).
  refresh = setInterval(() => replanWebReminders(), 60 * 60 * 1000);
  schedule();
  return stopWebReminders;
}

export function stopWebReminders() {
  unsubs.forEach((u) => u());
  unsubs = [];
  if (refresh) clearInterval(refresh);
  refresh = null;
  timers.forEach((t) => clearTimeout(t));
  timers.clear();
}
