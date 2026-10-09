import { useEffect } from 'react';
import { Redirect, Tabs } from 'expo-router';
import { Inbox, CalendarCheck, CalendarRange, Search, LayoutGrid, Flame, NotebookPen } from 'lucide-react-native';
import { useAuth } from '../../hooks/useAuth';
import { useRealtimeSync } from '../../hooks/useRealtimeSync';
import { useAppLifecycleSync } from '../../hooks/useAppLifecycleSync';
import { usePreferences, usePreferenceEffects } from '../../hooks/usePreferences';
import { Spinner } from '../../components/ui';
import { TaskUIProvider } from '../../components/tasks/TaskUIProvider';
import { startRuntime } from '../../services/runtime';
import { T } from '../../lib/theme';
import { DEFAULT_PREFERENCES } from '@clearmind/shared/domain';

const TAB_DEFS: Record<string, { title: string; Icon: typeof Inbox }> = {
  inbox: { title: 'Inbox', Icon: Inbox },
  today: { title: 'Today', Icon: CalendarCheck },
  upcoming: { title: 'Upcoming', Icon: CalendarRange },
  notes: { title: 'Notes', Icon: NotebookPen },
  search: { title: 'Search', Icon: Search },
  productivity: { title: 'Insights', Icon: Flame },
  browse: { title: 'Browse', Icon: LayoutGrid },
};

// Routes reachable from Browse / task views / deep links — never tabs.
const ALWAYS_HIDDEN = [
  'project/[id]', 'label/[id]', 'filter/[id]', 'completed', 'tasks', 'task/[id]', 'quickadd', 'activity', 'templates',
  'settings/index', 'settings/account', 'settings/general', 'settings/appearance', 'settings/productivity',
  'settings/notifications', 'settings/integrations', 'settings/security', 'settings/data', 'settings/navigation', 'settings/quickadd',
  'dashboard', 'calendar', 'iris', 'note/[id]', 'journal', 'dailylog', 'goals', 'habits', 'milestones',
  'applications', 'rant', 'dailymapper', 'learningvault', 'analytics', 'projects', 'mindmap', 'diagnostics', 'notes-graph',
];

function AppTabs() {
  const { user } = useAuth();
  const { prefs } = usePreferences();
  usePreferenceEffects();
  useEffect(() => startRuntime({ signedIn: !!user }), [user]);

  // Settings → Navigation: which destinations are tabs (Browse is always there).
  const chosen = [...new Set([...(prefs.navTabs ?? DEFAULT_PREFERENCES.navTabs).filter((t) => t in TAB_DEFS), 'browse'])].slice(0, 6);
  const hiddenTabs = Object.keys(TAB_DEFS).filter((t) => !chosen.includes(t));

  return (
    <Tabs
      backBehavior="history"
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: T.accent,
        tabBarInactiveTintColor: T.muted,
        tabBarStyle: { backgroundColor: T.card, borderTopColor: T.line },
        tabBarLabelStyle: { fontSize: 11, fontWeight: '600' },
        sceneStyle: { backgroundColor: T.bg },
        tabBarHideOnKeyboard: true,
      }}
    >
      {chosen.map((name) => {
        const d = TAB_DEFS[name];
        return <Tabs.Screen key={name} name={name} options={{ title: d.title, tabBarIcon: ({ color, size }) => <d.Icon color={color} size={size} /> }} />;
      })}
      {[...hiddenTabs, ...ALWAYS_HIDDEN].map((name) => (
        <Tabs.Screen key={name} name={name} options={{ href: null }} />
      ))}
    </Tabs>
  );
}

export default function AppLayout() {
  const { user, checking } = useAuth();
  // Realtime delta sync + connectivity/foreground handling for the session.
  useRealtimeSync();
  useAppLifecycleSync();

  if (checking) return <Spinner label="Starting…" />;
  if (!user) return <Redirect href="/(auth)/welcome" />;

  return (
    <TaskUIProvider>
      <AppTabs />
    </TaskUIProvider>
  );
}
