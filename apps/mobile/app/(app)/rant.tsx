import { Redirect } from 'expo-router';

// Now a mode of Journal; kept as a redirect for old links.
export default function Redirect_rant() {
  return <Redirect href="/(app)/journal?tab=rants" />;
}
