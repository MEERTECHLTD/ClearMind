import { Redirect } from 'expo-router';

// The old flat task list was replaced by Inbox / Today / Upcoming. Kept as a
// redirect so existing links into /tasks still land somewhere sensible.
export default function TasksRedirect() {
  return <Redirect href="/(app)/today" />;
}
