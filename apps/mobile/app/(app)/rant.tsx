import { useMemo, useState } from 'react';
import { View, Text, Pressable, FlatList, Modal, ScrollView, ActivityIndicator } from 'react-native';
import { AlertTriangle, Trash2, Sparkles, Bot, Flame, Send, X } from 'lucide-react-native';
import type { Rant } from '@clearmind/shared';
import { STORES } from '../../services/db';
import { newId } from '../../lib/id';
import { useCollection } from '../../hooks/useCollection';
import { generateResponse, isApiConfigured } from '../../services/gemini';
import {
  Screen, AppHeader, Card, TextArea, SegmentedControl, Badge, Button, Spinner,
  EmptyState, confirmDialog, useToast,
} from '../../components/ui';

type Mood = NonNullable<Rant['mood']>;

const MOODS: { label: string; value: Mood }[] = [
  { label: 'Frustrated', value: 'frustrated' },
  { label: 'Angry', value: 'angry' },
  { label: 'Overwhelmed', value: 'overwhelmed' },
  { label: 'Confused', value: 'confused' },
  { label: 'Venting', value: 'venting' },
];

const MOOD_TONE: Record<Mood, 'amber' | 'red' | 'accent' | 'muted'> = {
  frustrated: 'amber',
  angry: 'red',
  overwhelmed: 'red',
  confused: 'accent',
  venting: 'muted',
};

const MOOD_LABEL: Record<Mood, string> = {
  frustrated: 'Frustrated',
  angry: 'Angry',
  overwhelmed: 'Overwhelmed',
  confused: 'Confused',
  venting: 'Venting',
};

const rantTime = (r: Rant) => new Date(r.createdAt || r.timestamp || 0).getTime();

function formatStamp(iso?: string) {
  const d = new Date(iso || Date.now());
  try {
    return `${d.toLocaleDateString()} · ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
  } catch {
    return d.toISOString().slice(0, 16).replace('T', ' ');
  }
}

function buildAdvicePrompt(content: string, mood: Mood) {
  return `A user is venting in their private "Rant Corner". Their current mood is "${mood}". They are frustrated that their schedules, tasks, or productivity efforts aren't translating into the real-life impact they expected.

Here's their rant:
"""
${content}
"""

Please respond as a warm, grounded productivity coach:
1. Acknowledge their frustration with genuine empathy (one or two sentences).
2. Name a likely pattern behind why their effort may not be translating into results.
3. Give 2-3 concrete, actionable suggestions they can try.
4. End with one encouraging sentence and a single specific next step they can take today.

Keep it personal and practical. Use plain text (no markdown headers).`;
}

export default function RantScreen() {
  const { items: rants, loading, create, remove } = useCollection<Rant>(STORES.RANTS);
  const toast = useToast();

  const [draft, setDraft] = useState('');
  const [mood, setMood] = useState<Mood>('venting');
  const [saving, setSaving] = useState(false);

  const [adviceOpen, setAdviceOpen] = useState(false);
  const [adviceLoading, setAdviceLoading] = useState(false);
  const [adviceText, setAdviceText] = useState('');
  const [adviceConcern, setAdviceConcern] = useState('');

  const sorted = useMemo(
    () => [...rants].sort((a, b) => rantTime(b) - rantTime(a)),
    [rants]
  );

  const handleSave = async () => {
    const content = draft.trim();
    if (!content || saving) return;
    setSaving(true);
    const now = new Date().toISOString();
    try {
      await create({ id: newId(), content, createdAt: now, timestamp: now, mood });
      setDraft('');
      setMood('venting');
      toast.show('Saved to your diary', 'success');
    } catch {
      toast.show('Could not save rant', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleBurn = () => {
    if (!draft.trim()) return;
    setDraft('');
    toast.show('Burned it. Gone.', 'info');
  };

  const handleGetAdvice = async () => {
    const content = draft.trim();
    if (!content) {
      toast.show('Write something to get advice', 'info');
      return;
    }
    if (!isApiConfigured()) {
      toast.show('AI is not configured', 'error');
      return;
    }
    setAdviceConcern(content);
    setAdviceText('');
    setAdviceLoading(true);
    setAdviceOpen(true);
    try {
      const reply = await generateResponse(buildAdvicePrompt(content, mood));
      setAdviceText(reply);
    } catch {
      setAdviceText(
        "I'm having trouble connecting right now. Your frustration is valid — take a breath, and try again in a moment."
      );
    } finally {
      setAdviceLoading(false);
    }
  };

  const onDelete = async (rant: Rant) => {
    if (
      await confirmDialog({
        title: 'Delete rant',
        message: 'Delete this rant from your diary?',
        confirmText: 'Delete',
        destructive: true,
      })
    ) {
      remove(rant.id);
      toast.show('Rant deleted', 'info');
    }
  };

  if (loading) return <Spinner label="Loading your rants…" />;

  const Composer = (
    <View className="px-4 pt-4 pb-2">
      <View className="flex-row items-center mb-3">
        <AlertTriangle size={18} color="#f87171" />
        <Text className="text-ink-muted text-sm ml-2 flex-1">
          Code broke. Plans flopped. Let it out — then ask for advice.
        </Text>
      </View>

      <TextArea
        placeholder="Feeling like your tasks aren't making a difference? Schedules not translating to real results? Let it all out here…"
        value={draft}
        onChangeText={setDraft}
        minHeight={150}
        className="mb-3"
      />

      <Text className="text-ink-muted text-xs mb-1.5 ml-1">How are you feeling?</Text>
      <SegmentedControl<Mood>
        value={mood}
        onChange={setMood}
        segments={MOODS}
        className="mb-4"
      />

      <Button
        title="Get advice"
        onPress={handleGetAdvice}
        icon={<Sparkles size={18} color="#fff" />}
        disabled={!draft.trim()}
        className="mb-3"
      />
      <View className="flex-row gap-3">
        <Button
          title="Burn it"
          variant="danger"
          onPress={handleBurn}
          icon={<Flame size={18} color="#f87171" />}
          disabled={!draft.trim()}
          className="flex-1"
        />
        <Button
          title={saving ? 'Saving…' : 'Save to diary'}
          variant="secondary"
          onPress={handleSave}
          loading={saving}
          disabled={!draft.trim()}
          className="flex-1"
        />
      </View>

      <Text className="text-ink text-lg font-bold mt-7 mb-1">
        Past rants {sorted.length ? `(${sorted.length})` : ''}
      </Text>
    </View>
  );

  return (
    <Screen padded={false}>
      <AppHeader title="Rant Corner" subtitle="Vent it out, then move forward" />

      <FlatList
        data={sorted}
        keyExtractor={(r) => r.id}
        ListHeaderComponent={Composer}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingBottom: 40 }}
        ItemSeparatorComponent={() => <View className="h-3" />}
        renderItem={({ item }) => (
          <View className="px-4">
            <RantRow rant={item} onDelete={() => onDelete(item)} />
          </View>
        )}
        ListEmptyComponent={
          <View className="px-4">
            <EmptyState
              icon={<Flame size={40} color="#f87171" />}
              title="No rants yet"
              subtitle="Nothing on your chest yet. When something breaks you, this is the place."
            />
          </View>
        }
      />

      <AdviceModal
        visible={adviceOpen}
        loading={adviceLoading}
        concern={adviceConcern}
        advice={adviceText}
        onClose={() => setAdviceOpen(false)}
      />
    </Screen>
  );
}

function RantRow({ rant, onDelete }: { rant: Rant; onDelete: () => void }) {
  const mood = (rant.mood ?? 'venting') as Mood;
  return (
    <Card>
      <View className="flex-row items-start justify-between mb-2">
        <Badge label={MOOD_LABEL[mood]} tone={MOOD_TONE[mood]} />
        <Pressable onPress={onDelete} hitSlop={8} className="p-1 -mr-1 active:opacity-60">
          <Trash2 size={18} color="#9ca3af" />
        </Pressable>
      </View>
      <Text className="text-ink text-base leading-relaxed">{rant.content}</Text>
      <Text className="text-ink-muted text-xs mt-2">{formatStamp(rant.createdAt || rant.timestamp)}</Text>
    </Card>
  );
}

function AdviceModal({
  visible, loading, concern, advice, onClose,
}: {
  visible: boolean;
  loading: boolean;
  concern: string;
  advice: string;
  onClose: () => void;
}) {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View className="flex-1 bg-black/60 justify-end">
        <View className="bg-midnight rounded-t-3xl border-t border-hairline px-5 pt-5 pb-8 max-h-[85%]">
          <View className="flex-row items-center mb-4">
            <View className="w-8 h-8 rounded-full bg-accent items-center justify-center mr-2">
              <Bot size={18} color="#fff" />
            </View>
            <Text className="text-ink text-lg font-bold flex-1">Iris's advice</Text>
            <Pressable onPress={onClose} hitSlop={10} className="p-1 active:opacity-60">
              <X size={22} color="#9ca3af" />
            </Pressable>
          </View>

          <ScrollView showsVerticalScrollIndicator={false}>
            {concern ? (
              <View className="bg-midnight-light border border-hairline rounded-2xl p-3.5 mb-4">
                <Text className="text-ink-muted text-xs mb-1">Your concern</Text>
                <Text className="text-ink-muted text-sm italic">"{concern}"</Text>
              </View>
            ) : null}

            {loading ? (
              <View className="items-center py-10">
                <ActivityIndicator color="#3B82F6" />
                <Text className="text-ink-muted text-sm mt-3">Analyzing and crafting advice…</Text>
              </View>
            ) : (
              <Text className="text-ink text-base leading-relaxed">{advice}</Text>
            )}
          </ScrollView>

          <View className="mt-5">
            <Button
              title="Done"
              variant="secondary"
              onPress={onClose}
              icon={<Send size={16} color="#e2e8f0" />}
            />
          </View>
        </View>
      </View>
    </Modal>
  );
}
