import { Redirect, Stack } from 'expo-router';
import { useAuth } from '../../hooks/useAuth';
import { Spinner } from '../../components/ui';

export default function AuthLayout() {
  const { user, checking } = useAuth();
  if (checking) return <Spinner label="Starting…" />;
  if (user) return <Redirect href="/(app)/dashboard" />;
  return <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: '#05050A' } }} />;
}
