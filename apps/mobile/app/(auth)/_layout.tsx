import { Redirect, Stack } from 'expo-router';
import { useAuth } from '../../hooks/useAuth';
import { Spinner } from '../../components/ui';
import { T } from '../../lib/theme';

export default function AuthLayout() {
  const { user, checking } = useAuth();
  if (checking) return <Spinner label="Starting…" />;
  if (user) return <Redirect href="/" />;
  return <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: T.bg } }} />;
}
