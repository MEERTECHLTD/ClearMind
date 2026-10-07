/**
 * Preference defaults + resolution — shared so every client (and agents) read
 * settings the same way. Stored in the synced `preferences` record; missing
 * fields fall back to these defaults.
 */
import type { Preferences } from '../types';

export const DEFAULT_PREFERENCES: Required<Omit<Preferences, keyof import('../types').SyncMeta | 'id' | 'appIcon' | 'timezone' | 'quickAddProjectId' | 'quietStart' | 'quietEnd' | 'dailyPlanAt' | 'defaultReminder'>> & Pick<Preferences, 'appIcon' | 'timezone' | 'quickAddProjectId' | 'quietStart' | 'quietEnd' | 'dailyPlanAt' | 'defaultReminder'> = {
  theme: 'system',
  appIcon: null,
  homeView: 'today',
  syncHomeView: true,
  smartDates: true,
  weekStart: 1,
  nextWeek: 'monday',
  weekend: 'saturday',
  timezone: null,
  completeSound: true,
  swipeRight: 'complete',
  swipeLeft: 'schedule',
  navTabs: ['inbox', 'today', 'upcoming', 'search', 'browse'],
  quickAddProjectId: null,
  quickAddPriority: 'None',
  quickAddParse: true,
  density: 'comfortable',
  dailyGoal: 5,
  weeklyGoal: 25,
  daysOff: [0, 6],
  vacation: false,
  defaultReminder: 0,
  autoReminders: true,
  notifyReminders: true,
  notifyOverdue: true,
  dailyPlanAt: '08:00',
  weeklySummary: false,
  quietStart: null,
  quietEnd: null,
};

export type ResolvedPreferences = typeof DEFAULT_PREFERENCES & { id: 'preferences' };

/** Stored preferences merged over defaults (null/undefined fields → default). */
export function resolvePreferences(p?: Preferences | null): ResolvedPreferences {
  const out: any = { id: 'preferences', ...DEFAULT_PREFERENCES };
  if (p) for (const [k, v] of Object.entries(p)) if (v !== undefined && !(v === null && (DEFAULT_PREFERENCES as any)[k] !== null)) out[k] = v;
  return out;
}

export const NAV_DESTINATIONS = [
  { id: 'inbox', label: 'Inbox' },
  { id: 'today', label: 'Today' },
  { id: 'upcoming', label: 'Upcoming' },
  { id: 'search', label: 'Search' },
  { id: 'productivity', label: 'Productivity' },
  { id: 'browse', label: 'Browse' },
] as const;
