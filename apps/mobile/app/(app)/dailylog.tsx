import { Redirect } from 'expo-router';

// Now a mode of Journal; kept as a redirect for old links.
export default function Redirect_dailylog() {
  return <Redirect href="/(app)/journal?tab=log" />;
}
