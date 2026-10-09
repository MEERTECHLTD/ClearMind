/**
 * Notes — the mobile vault. Obsidian-style search (tag:, path:, file:,
 * "phrase", -exclude, OR), All / Bookmarked / Daily filter, sort, top-tags
 * strip, backlink counts. Opens notes in note/[id]; graph in notes-graph.
 * Accepts a `q` route param (e.g. `tag:#idea` from a tapped tag).
 */
import { useEffect, useMemo, useState } from 'react';
import { View, Text, Pressable, FlatList, TextInput, ScrollView } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { FileText, Search, X, NotebookPen, Network, Workflow, CalendarDays, Star, ArrowUpDown, Link as LinkIcon, Trash2, Folder } from 'lucide-react-native';
import type { Note } from '@clearmind/shared';
import { searchVault, excerpt } from '@clearmind/shared/notes';
import { Screen, AppHeader, Fab, EmptyState, Spinner, SegmentedControl, ActionMenu, useToast, type MenuAction } from '../../components/ui';
import { useVault, openDailyNote, toggleBookmark, deleteNotes } from '../../services/notes';
import { T } from '../../lib/theme';

type Filter = 'all' | 'bookmarked' | 'daily';
type Sort = 'modified' | 'title';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** Short label for a lastEdited stamp (ISO, or a legacy locale string passed through). */
function formatStamp(raw: string): string {
  if (!raw) return '';
  const d = new Date(raw);
  if (isNaN(d.getTime())) return raw;
  const now = new Date();
  if (d.toDateString() === now.toDateString()) return `${((d.getHours() + 11) % 12) + 1}:${String(d.getMinutes()).padStart(2, '0')} ${d.getHours() < 12 ? 'AM' : 'PM'}`;
  return d.getFullYear() === now.getFullYear() ? `${MONTHS[d.getMonth()]} ${d.getDate()}` : `${MONTHS[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
}

const stamp = (n: Note) => { const t = new Date(n.lastEdited).getTime(); return isNaN(t) ? 0 : t; };

export default function NotesScreen() {
  const router = useRouter();
  const toast = useToast();
  const params = useLocalSearchParams<{ q?: string }>();
  const { notes, index, loaded } = useVault();
  const [query, setQuery] = useState(params.q ?? '');
  const [filter, setFilter] = useState<Filter>('all');
  const [sort, setSort] = useState<Sort>('modified');
  const [menuFor, setMenuFor] = useState<Note | null>(null);

  // A new `q` (tag tapped in a note / the graph) replaces the search.
  useEffect(() => { if (params.q !== undefined) setQuery(params.q); }, [params.q]);

  const q = query.trim();
  const hits = useMemo(() => (q ? searchVault(index, q, 500) : null), [index, q]);

  const rows = useMemo(() => {
    let list: { note: Note; match?: string }[] = hits
      ? hits.map((h) => ({ note: h.note, match: h.matches[0]?.text }))
      : notes.map((note) => ({ note }));
    if (filter === 'bookmarked') list = list.filter((r) => r.note.bookmarked);
    if (filter === 'daily') list = list.filter((r) => r.note.kind === 'daily');
    if (sort === 'title') list = [...list].sort((a, b) => a.note.title.localeCompare(b.note.title));
    else if (!hits) list = [...list].sort((a, b) => stamp(b.note) - stamp(a.note));
    return list;
  }, [hits, notes, filter, sort]);

  const topTags = useMemo(
    () => [...index.tags.entries()].filter(([t]) => !t.includes('/')).sort((a, b) => b[1].size - a[1].size || a[0].localeCompare(b[0])).slice(0, 15),
    [index],
  );

  const backlinkCount = (id: string) => new Set((index.backlinks.get(id) ?? []).filter((l) => l.from !== id).map((l) => l.from)).size;

  const openNote = (id: string) => router.push(`/(app)/note/${id}`);
  const newNote = () => router.push('/(app)/note/new');
  const today = () => { openDailyNote().then((n) => openNote(n.id)).catch((e) => toast.show(String(e?.message ?? e), 'error')); };

  if (!loaded) return <Spinner label="Loading notes…" />;

  const menuActions: MenuAction[] = menuFor ? [
    { label: menuFor.bookmarked ? 'Remove bookmark' : 'Bookmark', icon: <Star size={18} color={T.muted} />, onPress: () => { toggleBookmark(menuFor).catch(() => {}); } },
    {
      label: 'Delete note', icon: <Trash2 size={18} color={T.danger} />, destructive: true,
      onPress: () => {
        const n = menuFor;
        deleteNotes([n.id])
          .then((undo) => toast.show(`Deleted “${n.title}”`, 'info', { label: 'Undo', onPress: () => { undo().catch(() => {}); } }))
          .catch((e) => toast.show(String(e?.message ?? e), 'error'));
      },
    },
  ] : [];

  const header = (
    <View>
      <View className="flex-row items-center bg-midnight-light rounded-2xl px-3 border border-line">
        <Search size={18} color={T.faint} />
        <TextInput
          placeholder="Search notes, tag:#idea…"
          placeholderTextColor={T.faint}
          value={query}
          onChangeText={setQuery}
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="search"
          className="flex-1 text-ink text-base px-2 py-3"
          style={{ color: T.ink }}
          accessibilityLabel="Search notes"
        />
        {query ? (
          <Pressable onPress={() => setQuery('')} hitSlop={8} className="p-1 active:opacity-60" accessibilityRole="button" accessibilityLabel="Clear search">
            <X size={16} color={T.muted} />
          </Pressable>
        ) : null}
      </View>

      {topTags.length ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled" className="mt-3 -mx-4" contentContainerStyle={{ paddingHorizontal: 16 }}>
          {topTags.map(([t, ids]) => {
            const active = q.toLowerCase() === `tag:#${t}`;
            return (
              <Pressable
                key={t}
                onPress={() => setQuery(active ? '' : `tag:#${t}`)}
                className={`flex-row items-center rounded-full px-3 py-1.5 mr-2 ${active ? 'bg-accent' : 'bg-accent/10'} active:opacity-70`}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
                accessibilityLabel={`Filter by tag ${t}`}
              >
                <Text className={`text-xs font-semibold ${active ? 'text-white' : 'text-accent'}`}>#{t}</Text>
                <Text className={`text-[10px] ml-1 ${active ? 'text-white' : 'text-ink-muted'}`}>{ids.size}</Text>
              </Pressable>
            );
          })}
        </ScrollView>
      ) : null}

      <View className="flex-row items-center mt-3 mb-3">
        <SegmentedControl<Filter>
          className="flex-1"
          value={filter}
          onChange={setFilter}
          segments={[{ label: 'All', value: 'all' }, { label: 'Starred', value: 'bookmarked' }, { label: 'Daily', value: 'daily' }]}
        />
        <Pressable
          onPress={() => setSort((s) => (s === 'modified' ? 'title' : 'modified'))}
          className="flex-row items-center ml-2 px-3 py-2.5 rounded-full border border-line active:opacity-60"
          accessibilityRole="button"
          accessibilityLabel={`Sort by ${sort === 'modified' ? 'last modified' : 'title'}; tap to change`}
        >
          <ArrowUpDown size={14} color={T.muted} />
          <Text className="text-ink-muted text-xs font-semibold ml-1">{sort === 'modified' ? (hits ? 'Best' : 'Recent') : 'A–Z'}</Text>
        </Pressable>
      </View>
    </View>
  );

  return (
    <Screen padded={false}>
      <AppHeader
        title="Notes"
        onBack={null}
        subtitle={`${notes.length} note${notes.length === 1 ? '' : 's'} · linked thinking`}
        right={
          <>
            <Pressable onPress={today} hitSlop={8} className="p-2 active:opacity-60" accessibilityRole="button" accessibilityLabel="Open today's daily note">
              <CalendarDays size={22} color={T.ink} />
            </Pressable>
            <Pressable onPress={() => router.push('/(app)/mindmap')} hitSlop={8} className="p-2 active:opacity-60" accessibilityRole="button" accessibilityLabel="Mind maps">
              <Workflow size={22} color={T.ink} />
            </Pressable>
            <Pressable onPress={() => router.push('/(app)/notes-graph')} hitSlop={8} className="p-2 -mr-2 active:opacity-60" accessibilityRole="button" accessibilityLabel="Graph view">
              <Network size={22} color={T.ink} />
            </Pressable>
          </>
        }
      />

      {notes.length === 0 ? (
        <EmptyState
          icon={<NotebookPen size={34} color={T.accent} />}
          title="Your vault is empty"
          subtitle="Write a note, link ideas with [[double brackets]] and tag them with #tags — they’ll grow into a graph."
          ctaTitle="New note"
          onCta={newNote}
        />
      ) : (
        <FlatList
          data={rows}
          keyExtractor={(r) => r.note.id}
          contentContainerStyle={{ padding: 16, paddingBottom: 96 }}
          keyboardShouldPersistTaps="handled"
          ListHeaderComponent={header}
          ItemSeparatorComponent={() => <View className="h-2" />}
          ListEmptyComponent={
            <View className="items-center py-14 px-8">
              <FileText size={32} color={T.faint} />
              <Text className="text-ink-muted text-sm text-center mt-3">
                {q ? `No notes match “${q}”.` : filter === 'bookmarked' ? 'No bookmarked notes yet — tap the star on a note.' : 'No daily notes yet — tap the calendar to start today’s.'}
              </Text>
            </View>
          }
          renderItem={({ item }) => (
            <NoteRow
              note={item.note}
              match={item.match}
              tags={index.tagsOf.get(item.note.id)?.length ? index.tagsOf.get(item.note.id)! : item.note.tags ?? []}
              backlinks={backlinkCount(item.note.id)}
              onPress={() => openNote(item.note.id)}
              onLongPress={() => setMenuFor(item.note)}
            />
          )}
        />
      )}

      <Fab onPress={newNote} />
      <ActionMenu visible={!!menuFor} onClose={() => setMenuFor(null)} title={menuFor?.title} actions={menuActions} />
    </Screen>
  );
}

function NoteRow({ note, match, tags, backlinks, onPress, onLongPress }: {
  note: Note; match?: string; tags: string[]; backlinks: number; onPress: () => void; onLongPress: () => void;
}) {
  const body = match ?? excerpt(note, 140);
  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      className="bg-midnight-light rounded-2xl border border-line px-4 py-3 active:opacity-80"
      accessibilityRole="button"
      accessibilityLabel={`${note.title}${note.folder ? `, in ${note.folder}` : ''}${backlinks ? `, ${backlinks} backlinks` : ''}`}
      accessibilityHint="Long-press for more actions"
    >
      <View className="flex-row items-center">
        {note.kind === 'daily' ? <CalendarDays size={16} color={T.accent} /> : <FileText size={16} color={T.accent} />}
        <Text className="text-ink text-base font-semibold ml-2 flex-1" numberOfLines={1}>{note.title || 'Untitled'}</Text>
        {note.bookmarked ? <Star size={14} color="#F59E0B" fill="#F59E0B" /> : null}
        <Text className="text-ink-muted text-[11px] ml-2">{formatStamp(note.lastEdited)}</Text>
      </View>
      {note.folder ? (
        <View className="flex-row items-center mt-1">
          <Folder size={11} color={T.faint} />
          <Text className="text-ink-muted text-[11px] ml-1" numberOfLines={1}>{note.folder}</Text>
        </View>
      ) : null}
      {body ? <Text className="text-ink-muted text-sm mt-1.5 leading-5" numberOfLines={2}>{body}</Text> : null}
      {tags.length || backlinks ? (
        <View className="flex-row flex-wrap items-center mt-2">
          {tags.slice(0, 4).map((t) => (
            <View key={t} className="bg-accent/10 rounded-full px-2 py-0.5 mr-1.5 mb-1">
              <Text className="text-accent text-[11px] font-semibold">#{t}</Text>
            </View>
          ))}
          {tags.length > 4 ? <Text className="text-ink-muted text-[11px] mr-1.5 mb-1">+{tags.length - 4}</Text> : null}
          {backlinks ? (
            <View className="flex-row items-center mb-1 ml-auto">
              <LinkIcon size={11} color={T.muted} />
              <Text className="text-ink-muted text-[11px] ml-1">{backlinks}</Text>
            </View>
          ) : null}
        </View>
      ) : null}
    </Pressable>
  );
}
