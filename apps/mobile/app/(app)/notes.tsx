import { useMemo, useState } from 'react';
import {
  View,
  Text,
  Pressable,
  FlatList,
  Modal,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { FileText, Pencil, Trash2, X, Search, Save, NotebookPen } from 'lucide-react-native';
import type { Note } from '@clearmind/shared';
import { STORES } from '../../services/db';
import { newId } from '../../lib/id';
import { useCollection } from '../../hooks/useCollection';
import {
  Screen,
  AppHeader,
  Card,
  Input,
  TextArea,
  Badge,
  Fab,
  EmptyState,
  Spinner,
  confirmDialog,
  useToast,
} from '../../components/ui';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** Render a stored lastEdited stamp (ISO or legacy locale string) into a short label. */
function formatStamp(raw: string): string {
  if (!raw) return '';
  const d = new Date(raw);
  if (isNaN(d.getTime())) return raw; // legacy toLocaleString values pass through verbatim
  const now = new Date();
  const hours12 = ((d.getHours() + 11) % 12) + 1;
  const time = `${hours12}:${String(d.getMinutes()).padStart(2, '0')} ${d.getHours() < 12 ? 'AM' : 'PM'}`;
  if (d.toDateString() === now.toDateString()) return `Today, ${time}`;
  const sameYear = d.getFullYear() === now.getFullYear();
  const base = `${MONTHS[d.getMonth()]} ${d.getDate()}`;
  return sameYear ? `${base}, ${time}` : `${base}, ${d.getFullYear()}`;
}

/** Build a single-line content preview. */
function preview(content: string): string {
  return (content || '').replace(/\s+/g, ' ').trim();
}

/** Parse a comma-separated tag string into a deduped, trimmed list. */
function parseTags(input: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const part of input.split(',')) {
    const tag = part.trim().replace(/^#/, '');
    if (tag && !seen.has(tag.toLowerCase())) {
      seen.add(tag.toLowerCase());
      out.push(tag);
    }
  }
  return out;
}

export default function NotesScreen() {
  const { items: notes, loading, create, update, remove } = useCollection<Note>(STORES.NOTES);
  const toast = useToast();
  const [query, setQuery] = useState('');
  const [editorOpen, setEditorOpen] = useState(false);
  const [editing, setEditing] = useState<Note | null>(null);

  // Sort by lastEdited (newest first), mirroring the web view.
  const sorted = useMemo(() => {
    return [...notes].sort(
      (a, b) => new Date(b.lastEdited).getTime() - new Date(a.lastEdited).getTime()
    );
  }, [notes]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return sorted;
    return sorted.filter((n) => {
      const hay = `${n.title} ${n.content} ${(n.tags || []).join(' ')}`.toLowerCase();
      return hay.includes(q);
    });
  }, [sorted, query]);

  const openAdd = () => {
    setEditing(null);
    setEditorOpen(true);
  };
  const openEdit = (note: Note) => {
    setEditing(note);
    setEditorOpen(true);
  };

  const onDelete = async (note: Note) => {
    if (
      await confirmDialog({
        title: 'Delete note',
        message: `Delete “${note.title || 'Untitled'}”? This can't be undone.`,
        confirmText: 'Delete',
        destructive: true,
      })
    ) {
      remove(note.id);
      toast.show('Note deleted', 'info');
    }
  };

  const handleSave = (data: { title: string; content: string; tags: string[] }) => {
    const stamp = new Date().toISOString();
    if (editing) {
      update({
        ...editing,
        title: data.title,
        content: data.content,
        tags: data.tags.length ? data.tags : editing.tags?.length ? editing.tags : ['Draft'],
        lastEdited: stamp,
      });
      toast.show('Note saved', 'success');
    } else {
      create({
        id: newId(),
        title: data.title,
        content: data.content,
        tags: data.tags.length ? data.tags : ['Draft'],
        lastEdited: stamp,
      });
      toast.show('Note created', 'success');
    }
    setEditorOpen(false);
  };

  if (loading) return <Spinner label="Loading notes…" />;

  return (
    <Screen padded={false}>
      <AppHeader title="Notes" subtitle="Capture your thoughts and technical specs." />

      {notes.length === 0 ? (
        <EmptyState
          icon={<NotebookPen size={40} color="#3B82F6" />}
          title="No notes created yet"
          subtitle="Jot down ideas, specs, or anything worth remembering."
          ctaTitle="New note"
          onCta={openAdd}
        />
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(n) => n.id}
          contentContainerStyle={{ padding: 16, paddingBottom: 96 }}
          ItemSeparatorComponent={() => <View className="h-3" />}
          keyboardShouldPersistTaps="handled"
          ListHeaderComponent={
            <View className="mb-3 flex-row items-center bg-midnight-light rounded-2xl px-3 border border-hairline">
              <Search size={18} color="#6b7280" />
              <Input
                placeholder="Search notes, tags…"
                value={query}
                onChangeText={setQuery}
                className="flex-1"
                // strip the Input's own box styling so it blends into the search bar
                style={{
                  backgroundColor: 'transparent',
                  borderWidth: 0,
                  paddingHorizontal: 8,
                }}
              />
              {query.length > 0 ? (
                <Pressable onPress={() => setQuery('')} hitSlop={8} className="p-1 active:opacity-60">
                  <X size={16} color="#9ca3af" />
                </Pressable>
              ) : null}
            </View>
          }
          ListEmptyComponent={
            <View className="items-center py-16 px-8">
              <FileText size={36} color="#475569" />
              <Text className="text-ink-muted text-sm text-center mt-3">
                No notes match “{query.trim()}”.
              </Text>
            </View>
          }
          renderItem={({ item }) => (
            <NoteRow note={item} onOpen={() => openEdit(item)} onDelete={() => onDelete(item)} />
          )}
        />
      )}

      <Fab onPress={openAdd} />

      <NoteEditorModal
        visible={editorOpen}
        initial={editing}
        onCancel={() => setEditorOpen(false)}
        onSave={handleSave}
        onDelete={
          editing
            ? () => {
                const note = editing;
                setEditorOpen(false);
                if (note) onDelete(note);
              }
            : undefined
        }
      />
    </Screen>
  );
}

function NoteRow({
  note,
  onOpen,
  onDelete,
}: {
  note: Note;
  onOpen: () => void;
  onDelete: () => void;
}) {
  const tags = note.tags || [];
  const body = preview(note.content);
  return (
    <Pressable onPress={onOpen} className="active:opacity-80">
      <Card>
        <View className="flex-row items-start">
          <View className="mr-3 mt-0.5">
            <FileText size={20} color="#3B82F6" />
          </View>

          <View className="flex-1">
            <Text className="text-ink text-base font-semibold" numberOfLines={1}>
              {note.title || 'Untitled note'}
            </Text>
            <Text className="text-ink-muted text-[11px] mt-0.5">{formatStamp(note.lastEdited)}</Text>

            {body ? (
              <Text className="text-ink-muted text-sm mt-1.5 leading-relaxed" numberOfLines={2}>
                {body}
              </Text>
            ) : null}

            {tags.length > 0 ? (
              <View className="flex-row flex-wrap mt-2 -mb-1">
                {tags.slice(0, 4).map((tag) => (
                  <View key={tag} className="mr-2 mb-1">
                    <Badge label={`#${tag}`} tone="accent" />
                  </View>
                ))}
                {tags.length > 4 ? (
                  <View className="mb-1">
                    <Badge label={`+${tags.length - 4}`} tone="muted" />
                  </View>
                ) : null}
              </View>
            ) : null}
          </View>

          <View className="flex-row items-center ml-2">
            <Pressable onPress={onOpen} hitSlop={8} className="p-1.5 active:opacity-60">
              <Pencil size={18} color="#9ca3af" />
            </Pressable>
            <Pressable onPress={onDelete} hitSlop={8} className="p-1.5 active:opacity-60">
              <Trash2 size={18} color="#9ca3af" />
            </Pressable>
          </View>
        </View>
      </Card>
    </Pressable>
  );
}

function NoteEditorModal({
  visible,
  initial,
  onCancel,
  onSave,
  onDelete,
}: {
  visible: boolean;
  initial: Note | null;
  onCancel: () => void;
  onSave: (d: { title: string; content: string; tags: string[] }) => void;
  onDelete?: () => void;
}) {
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [tagsInput, setTagsInput] = useState('');

  // Reset fields whenever the editor (re)opens — same pattern as Tasks.
  const [lastVisible, setLastVisible] = useState(false);
  if (visible !== lastVisible) {
    setLastVisible(visible);
    if (visible) {
      setTitle(initial?.title ?? '');
      setContent(initial?.content ?? '');
      setTagsInput((initial?.tags ?? []).join(', '));
    }
  }

  const save = () => {
    const t = title.trim();
    if (!t) return; // a note needs a title (mirrors web's required-title guard)
    onSave({ title: t, content, tags: parseTags(tagsInput) });
  };

  const canSave = title.trim().length > 0;

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onCancel} presentationStyle="fullScreen">
      <SafeAreaView edges={['top', 'bottom']} className="flex-1 bg-midnight">
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          {/* Editor header */}
          <View className="flex-row items-center justify-between px-4 py-3 border-b border-hairline">
            <Pressable onPress={onCancel} hitSlop={8} className="flex-row items-center active:opacity-60">
              <X size={22} color="#e2e8f0" />
              <Text className="text-ink ml-1.5 text-base">Cancel</Text>
            </Pressable>

            <View className="flex-row items-center">
              {onDelete ? (
                <Pressable onPress={onDelete} hitSlop={8} className="p-2 mr-1 active:opacity-60">
                  <Trash2 size={20} color="#f87171" />
                </Pressable>
              ) : null}
              <Pressable
                onPress={save}
                disabled={!canSave}
                className={`flex-row items-center px-4 py-2 rounded-full ${
                  canSave ? 'bg-accent active:bg-accent-hover' : 'bg-midnight-lighter'
                }`}
              >
                <Save size={16} color="#fff" />
                <Text className="text-white font-bold ml-1.5">Save</Text>
              </Pressable>
            </View>
          </View>

          <ScrollView
            className="flex-1"
            contentContainerStyle={{ padding: 16, paddingBottom: 48 }}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <Text className="text-ink-muted text-xs mb-1.5 ml-1">Title</Text>
            <Input
              placeholder="Note title"
              value={title}
              onChangeText={setTitle}
              autoFocus={!initial}
              className="mb-4"
            />

            <Text className="text-ink-muted text-xs mb-1.5 ml-1">Tags (comma separated)</Text>
            <Input
              placeholder="e.g. Draft, Ideas, Specs"
              value={tagsInput}
              onChangeText={setTagsInput}
              autoCapitalize="none"
              className="mb-4"
            />

            <Text className="text-ink-muted text-xs mb-1.5 ml-1">Content</Text>
            <TextArea
              placeholder="Start typing…"
              value={content}
              onChangeText={setContent}
              minHeight={320}
            />
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </Modal>
  );
}
