import { useMemo, useState } from 'react';
import { View, Text, Pressable, FlatList, Modal } from 'react-native';
import { CircleCheck, Zap, Meh, Frown, Pencil, Trash2, NotebookPen } from 'lucide-react-native';
import type { LogEntry } from '@clearmind/shared';
import { STORES } from '../../services/db';
import { newId } from '../../lib/id';
import { useCollection } from '../../hooks/useCollection';
import {
  Screen, AppHeader, Card, TextArea, DateField, SegmentedControl, Badge, Fab,
  EmptyState, Spinner, confirmDialog, useToast,
} from '../../components/ui';

type Mood = LogEntry['mood'];

const MOOD_META: Record<Mood, { icon: typeof Meh; color: string; tone: 'green' | 'amber' | 'muted' | 'red' }> = {
  Productive: { icon: CircleCheck, color: '#10b981', tone: 'green' },
  'Flow State': { icon: Zap, color: '#f59e0b', tone: 'amber' },
  Neutral: { icon: Meh, color: '#9ca3af', tone: 'muted' },
  Frustrated: { icon: Frown, color: '#f87171', tone: 'red' },
};

// SegmentedControl shows short labels but keeps the canonical mood values.
const MOOD_SEGMENTS: { label: string; value: Mood }[] = [
  { label: 'Productive', value: 'Productive' },
  { label: 'Neutral', value: 'Neutral' },
  { label: 'Frustrated', value: 'Frustrated' },
  { label: 'Flow', value: 'Flow State' },
];

const pad = (n: number) => String(n).padStart(2, '0');
const todayISO = () => {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

function formatDateHeader(date: string): string {
  const today = todayISO();
  if (date === today) return 'Today';
  const yd = new Date(today + 'T00:00:00');
  yd.setDate(yd.getDate() - 1);
  if (date === `${yd.getFullYear()}-${pad(yd.getMonth() + 1)}-${pad(yd.getDate())}`) return 'Yesterday';
  const d = new Date(date + 'T00:00:00');
  if (Number.isNaN(d.getTime())) return date;
  return d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
}

type Row =
  | { kind: 'header'; key: string; date: string; count: number }
  | { kind: 'entry'; key: string; entry: LogEntry };

export default function DailyLogScreen() {
  const { items: entries, loading, create, update, remove } = useCollection<LogEntry>(STORES.LOGS);
  const toast = useToast();
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<LogEntry | null>(null);

  // Group + sort by date descending; build a flat list of date headers + entries.
  const rows = useMemo<Row[]>(() => {
    const sorted = [...entries].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
    const counts: Record<string, number> = {};
    sorted.forEach((e) => { counts[e.date] = (counts[e.date] || 0) + 1; });
    const out: Row[] = [];
    let last = '';
    sorted.forEach((e) => {
      if (e.date !== last) {
        last = e.date;
        out.push({ kind: 'header', key: `h-${e.date}`, date: e.date, count: counts[e.date] });
      }
      out.push({ kind: 'entry', key: e.id, entry: e });
    });
    return out;
  }, [entries]);

  const openAdd = () => { setEditing(null); setFormOpen(true); };
  const openEdit = (entry: LogEntry) => { setEditing(entry); setFormOpen(true); };

  const onDelete = async (entry: LogEntry) => {
    if (await confirmDialog({ title: 'Delete entry', message: 'Delete this log entry?', confirmText: 'Delete', destructive: true })) {
      remove(entry.id);
      toast.show('Entry deleted', 'info');
    }
  };

  const handleSave = (data: { date: string; content: string; mood: Mood }) => {
    if (editing) {
      update({ ...editing, date: data.date, content: data.content, mood: data.mood });
      toast.show('Entry updated', 'success');
    } else {
      create({ id: newId(), date: data.date, content: data.content, mood: data.mood });
      toast.show('Entry saved', 'success');
    }
    setFormOpen(false);
  };

  if (loading) return <Spinner label="Loading log…" />;

  return (
    <Screen padded={false}>
      <AppHeader
        title="Daily Log"
        subtitle={entries.length === 1 ? '1 entry' : `${entries.length} entries`}
      />

      {entries.length === 0 ? (
        <EmptyState
          icon={<NotebookPen size={40} color="#3B82F6" />}
          title="No logs yet"
          subtitle="Document your failures and small wins."
          ctaTitle="Write your first entry"
          onCta={openAdd}
        />
      ) : (
        <FlatList
          data={rows}
          keyExtractor={(r) => r.key}
          contentContainerStyle={{ padding: 16, paddingBottom: 96 }}
          renderItem={({ item }) =>
            item.kind === 'header' ? (
              <View className="flex-row items-center justify-between mt-5 mb-2">
                <Text className="text-ink font-bold text-base">{formatDateHeader(item.date)}</Text>
                <Text className="text-ink-muted text-xs font-mono">{item.date}</Text>
              </View>
            ) : (
              <View className="mb-3">
                <LogRow entry={item.entry} onEdit={() => openEdit(item.entry)} onDelete={() => onDelete(item.entry)} />
              </View>
            )
          }
        />
      )}

      <Fab onPress={openAdd} />

      <LogFormModal
        visible={formOpen}
        initial={editing}
        onCancel={() => setFormOpen(false)}
        onSave={handleSave}
      />
    </Screen>
  );
}

function LogRow({ entry, onEdit, onDelete }: { entry: LogEntry; onEdit: () => void; onDelete: () => void }) {
  const meta = MOOD_META[entry.mood] ?? MOOD_META.Neutral;
  const Icon = meta.icon;
  return (
    <Card>
      <View className="flex-row items-center justify-between mb-2">
        <View className="flex-row items-center">
          <Icon size={18} color={meta.color} />
          <View className="ml-2">
            <Badge label={entry.mood} tone={meta.tone} />
          </View>
        </View>
        <View className="flex-row items-center">
          <Pressable onPress={onEdit} hitSlop={8} className="p-1.5 active:opacity-60">
            <Pencil size={18} color="#9ca3af" />
          </Pressable>
          <Pressable onPress={onDelete} hitSlop={8} className="p-1.5 active:opacity-60">
            <Trash2 size={18} color="#9ca3af" />
          </Pressable>
        </View>
      </View>
      <Text className="text-ink text-[15px] leading-relaxed">{entry.content}</Text>
    </Card>
  );
}

function LogFormModal({
  visible, initial, onCancel, onSave,
}: {
  visible: boolean;
  initial: LogEntry | null;
  onCancel: () => void;
  onSave: (d: { date: string; content: string; mood: Mood }) => void;
}) {
  const [date, setDate] = useState(todayISO());
  const [content, setContent] = useState('');
  const [mood, setMood] = useState<Mood>('Neutral');

  // Reset fields whenever the modal (re)opens.
  const [lastVisible, setLastVisible] = useState(false);
  if (visible !== lastVisible) {
    setLastVisible(visible);
    if (visible) {
      setDate(initial?.date ?? todayISO());
      setContent(initial?.content ?? '');
      setMood(initial?.mood ?? 'Neutral');
    }
  }

  const save = () => {
    const trimmed = content.trim();
    if (!trimmed) return;
    onSave({ date: date || todayISO(), content: trimmed, mood });
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onCancel}>
      <Pressable className="flex-1 bg-black/60 justify-end" onPress={onCancel}>
        <Pressable className="bg-midnight rounded-t-3xl border-t border-hairline px-5 pt-5 pb-8">
          <Text className="text-ink text-lg font-bold mb-4">{initial ? 'Edit entry' : 'New log entry'}</Text>

          <Text className="text-ink-muted text-xs mb-1.5 ml-1">Date</Text>
          <View className="mb-4">
            <DateField value={date} onChange={(v) => setDate(v ?? todayISO())} clearable={false} />
          </View>

          <TextArea
            label="Entry"
            placeholder="How was your coding session today? What did you learn?"
            value={content}
            onChangeText={setContent}
            autoFocus
            minHeight={120}
            className="mb-4"
          />

          <Text className="text-ink-muted text-xs mb-1.5 ml-1">Mood</Text>
          <SegmentedControl<Mood>
            value={mood}
            onChange={setMood}
            segments={MOOD_SEGMENTS}
            className="mb-5"
          />

          <View className="flex-row gap-3">
            <Pressable onPress={onCancel} className="flex-1 items-center py-3.5 rounded-full bg-midnight-lighter active:opacity-80">
              <Text className="text-ink font-semibold">Cancel</Text>
            </Pressable>
            <Pressable onPress={save} className="flex-1 items-center py-3.5 rounded-full bg-accent active:bg-accent-hover">
              <Text className="text-white font-bold">{initial ? 'Save' : 'Add entry'}</Text>
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
