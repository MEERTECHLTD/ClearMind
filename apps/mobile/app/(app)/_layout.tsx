import { Redirect, Tabs } from 'expo-router';
import { LayoutDashboard, SquareCheckBig, Menu } from 'lucide-react-native';
import { useAuth } from '../../hooks/useAuth';
import { useRealtimeSync } from '../../hooks/useRealtimeSync';
import { Spinner } from '../../components/ui';

export default function AppLayout() {
  const { user, checking } = useAuth();
  // Single realtime-sync subscription for the whole signed-in session.
  useRealtimeSync();

  if (checking) return <Spinner label="Starting…" />;
  if (!user) return <Redirect href="/(auth)/welcome" />;

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: '#3B82F6',
        tabBarInactiveTintColor: '#9ca3af',
        tabBarStyle: { backgroundColor: '#0F1219', borderTopColor: '#1f2937' },
        sceneStyle: { backgroundColor: '#05050A' },
      }}
    >
      <Tabs.Screen
        name="dashboard"
        options={{ title: 'Home', tabBarIcon: ({ color, size }) => <LayoutDashboard color={color} size={size} /> }}
      />
      <Tabs.Screen
        name="tasks"
        options={{ title: 'Tasks', tabBarIcon: ({ color, size }) => <SquareCheckBig color={color} size={size} /> }}
      />
      <Tabs.Screen
        name="more"
        options={{ title: 'More', tabBarIcon: ({ color, size }) => <Menu color={color} size={size} /> }}
      />
      {/* Reachable from More, hidden from the tab bar. */}
      <Tabs.Screen name="settings" options={{ href: null }} />
    </Tabs>
  );
}
