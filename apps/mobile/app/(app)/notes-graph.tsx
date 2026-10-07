/**
 * Full-screen global graph of the notes vault.
 * `?focus=<noteId>` highlights that note, selects it and centres on it once
 * the layout settles ("Open in graph" / local graph expand).
 */
import { useCallback, useMemo } from 'react';
import { useLocalSearchParams, useRouter, type Href } from 'expo-router';
import type { Note } from '@clearmind/shared';
import { buildIndex, type GraphNode } from '@clearmind/shared/notes';
import { STORES } from '../../services/db';
import { useCollection } from '../../hooks/useCollection';
import { Screen, Spinner } from '../../components/ui';
import { NoteGraph } from '../../components/notes/NoteGraph';

export default function NotesGraphScreen() {
  const router = useRouter();
  const { focus } = useLocalSearchParams<{ focus?: string }>();
  const { items: notes, loading } = useCollection<Note>(STORES.NOTES);
  const index = useMemo(() => buildIndex(notes), [notes]);

  const onOpen = useCallback((node: GraphNode) => {
    if (node.type === 'note' && node.noteId) {
      router.push({ pathname: '/(app)/note/[id]', params: { id: node.noteId } } as unknown as Href);
    } else if (node.type === 'unresolved') {
      router.push({ pathname: '/(app)/note/[id]', params: { id: 'new', title: node.label } } as unknown as Href);
    } else if (node.type === 'tag') {
      router.push({ pathname: '/(app)/notes', params: { q: `tag:#${node.label.replace(/^#/, '')}` } } as unknown as Href);
    }
  }, [router]);

  return (
    <Screen padded={false}>
      {loading && !notes.length ? <Spinner label="Loading notes…" /> : (
        <NoteGraph index={index} mode="global" activeId={focus ?? null} onOpen={onOpen} />
      )}
    </Screen>
  );
}
