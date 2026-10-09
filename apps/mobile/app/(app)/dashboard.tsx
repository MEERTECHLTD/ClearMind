import { Redirect } from 'expo-router';

// The Overview dashboard was folded into Today ("Across ClearMind": schedule,
// habits and deadlines from every tool). Kept as a redirect for old links.
export default function DashboardRedirect() {
  return <Redirect href="/(app)/today" />;
}
