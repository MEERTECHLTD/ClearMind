import { Redirect } from 'expo-router';

// Analytics is now the "Life" tab of Progress (one place for insights).
// Kept as a redirect so existing links into /analytics still land correctly.
export default function AnalyticsRedirect() {
  return <Redirect href="/(app)/productivity?tab=life" />;
}
