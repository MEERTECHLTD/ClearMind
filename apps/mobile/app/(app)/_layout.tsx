import { Redirect, Tabs } from 'expo-router';
import { Inbox, CalendarCheck, CalendarRange, Search, LayoutGrid } from 'lucide-react-native';
import { useAuth } from '../../hooks/useAuth';
import { useRealtimeSync } from '../../hooks/useRealtimeSync';
import { useAppLifecycleSync } from '../../hooks/useAppLifecycleSync';
import { Spinner } from '../../components/ui';
import { TaskUIProvider } from '../../components/tasks/TaskUIProvider';

// Hidden routes: reachable from Browse / task views, not shown on the tab bar.
const HIDDEN = [
  'project/[id]', 'label/[id]', 'filter/[id]', 'completed', 'tasks',
  'dashboard', 'calendar', 'iris', 'settings', 'notes', 'dailylog', 'goals', 'habits', 'milestones',
  'applications', 'rant', 'dailymapper', 'learningvault', 'analytics', 'projects', 'mindmap', 'diagnostics',
];

export default function AppLayout() {
  const { user, checking } = useAuth();
  // Single realtime-sync subscription + foreground/online reconcile for the session.
  useRealtimeSync();
  useAppLifecycleSync();

  if (checking) return <Spinner label="Starting…" />;
  if (!user) return <Redirect href="/(auth)/welcome" />;

  return (
    <TaskUIProvider>
      <Tabs
        initialRouteName="today"
        backBehavior="history"
        screenOptions={{
          headerShown: false,
          tabBarActiveTintColor: '#3B82F6',
          tabBarInactiveTintColor: '#9ca3af',
          tabBarStyle: { backgroundColor: '#0F1219', borderTopColor: '#1f2937' },
          tabBarLabelStyle: { fontSize: 11, fontWeight: '600' },
          sceneStyle: { backgroundColor: '#05050A' },
          tabBarHideOnKeyboard: true,
        }}
      >
        <Tabs.Screen name="inbox" options={{ title: 'Inbox', tabBarIcon: ({ color, size }) => <Inbox color={color} size={size} /> }} />
        <Tabs.Screen name="today" options={{ title: 'Today', tabBarIcon: ({ color, size }) => <CalendarCheck color={color} size={size} /> }} />
        <Tabs.Screen name="upcoming" options={{ title: 'Upcoming', tabBarIcon: ({ color, size }) => <CalendarRange color={color} size={size} /> }} />
        <Tabs.Screen name="search" options={{ title: 'Search', tabBarIcon: ({ color, size }) => <Search color={color} size={size} /> }} />
        <Tabs.Screen name="browse" options={{ title: 'Browse', tabBarIcon: ({ color, size }) => <LayoutGrid color={color} size={size} /> }} />
        {HIDDEN.map((name) => (
          <Tabs.Screen key={name} name={name} options={{ href: null }} />
        ))}
      </Tabs>
    </TaskUIProvider>
  );
}
