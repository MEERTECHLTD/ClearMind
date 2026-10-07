import { useEffect } from 'react';
import { Redirect, useLocalSearchParams } from 'expo-router';
import { todayISO } from '@clearmind/shared/tasks';
import { requestOpen } from '../../lib/openRequests';

// Deep link clearmind://quickadd[?due=today|project=inbox] (widgets, shortcuts).
export default function QuickAddLink() {
  const { due, project } = useLocalSearchParams<{ due?: string; project?: string }>();
  useEffect(() => {
    requestOpen({ type: 'quickadd', dueDate: due === 'today' ? todayISO() : null, projectId: project === 'inbox' ? null : project ?? undefined });
  }, [due, project]);
  return <Redirect href={project === 'inbox' ? '/(app)/inbox' : '/(app)/today'} />;
}
