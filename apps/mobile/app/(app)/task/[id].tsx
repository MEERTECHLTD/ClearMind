import { useEffect } from 'react';
import { Redirect, useLocalSearchParams } from 'expo-router';
import { requestOpen } from '../../../lib/openRequests';

// Deep link clearmind://task/<id> (notifications, widgets, shared links):
// open the task's detail sheet over Today.
export default function TaskLink() {
  const { id } = useLocalSearchParams<{ id: string }>();
  useEffect(() => { if (id) requestOpen({ type: 'task', id }); }, [id]);
  return <Redirect href="/(app)/today" />;
}
