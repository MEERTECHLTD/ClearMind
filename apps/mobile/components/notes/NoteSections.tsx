/**
 * Reading-mode footer for a note: backlinks (linked mentions with context),
 * unlinked mentions (collapsed, one-tap "Link"), outgoing links and the local
 * graph.
 */
import React, { useMemo, useState } from 'react';
import { View, Text, Pressable } from 'react-native';
import { ChevronDown, ChevronRight, FileText, Link as LinkIcon, FilePlus } from 'lucide-react-native';
import type { Note } from '@clearmind/shared';
import { linkedMentions, unlinkedMentions, linkMention, type VaultIndex, type GraphNode, type Mention } from '@clearmind/shared/notes';
import { T } from '../../lib/theme';
import { NoteGraph } from './NoteGraph';
import { previewLines } from './markdown';

export interface NoteSectionsProps {
  note: Note;
  index: VaultIndex;
  onOpenNote: (id: string) => void;
  onOpenTarget: (target: string) => void;
  onGraphNode: (node: GraphNode) => void;
  onExpandGraph: () => void;
  /** Persist a changed source note (used by "Link" on unlinked mentions). */
  onSaveOther: (id: string, content: string) => void;
}

function Section({ title, count, initiallyOpen = true, children }: { title: string; count: number; initiallyOpen?: boolean; children: React.ReactNode }) {
  const [open, setOpen] = useState(initiallyOpen);
  return (
    <View className="mt-5">
      <Pressable
        onPress={() => setOpen((o) => !o)}
        className="flex-row items-center py-2 active:opacity-60"
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        accessibilityLabel={`${title}, ${count}`}
      >
        {open ? <ChevronDown size={16} color={T.muted} /> : <ChevronRight size={16} color={T.muted} />}
        <Text className="text-ink font-bold text-sm ml-1 flex-1">{title}</Text>
        <Text className="text-ink-muted text-xs">{count}</Text>
      </Pressable>
      {open ? children : null}
    </View>
  );
}

const contextLine = (m: Mention) => previewLines(m.text, 1)[0] ?? m.text;

export function NoteSections({ note, index, onOpenNote, onOpenTarget, onGraphNode, onExpandGraph, onSaveOther }: NoteSectionsProps) {
  const linked = useMemo(() => linkedMentions(index, note.id), [index, note.id]);
  const [showUnlinked, setShowUnlinked] = useState(false);
  const unlinked = useMemo(() => (showUnlinked ? unlinkedMentions(index, note.id) : null), [index, note.id, showUnlinked]);
  const outgoing = useMemo(() => {
    const seen = new Map<string, { target: string; to: string | null }>();
    for (const l of index.links.get(note.id) ?? []) {
      if (!l.target || l.to === note.id) continue;
      const k = l.to ?? `?${l.target.toLowerCase()}`;
      if (!seen.has(k)) seen.set(k, { target: l.target, to: l.to });
    }
    return [...seen.values()];
  }, [index, note.id]);

  const linkedCount = linked.reduce((s, g) => s + g.mentions.length, 0);

  return (
    <View className="mt-6 border-t border-line pt-2">
      <Section title="Backlinks" count={linkedCount}>
        {linked.length ? linked.map((g) => (
          <View key={g.note.id} className="mb-2 rounded-xl border border-line bg-midnight-light px-3 py-2">
            <Pressable onPress={() => onOpenNote(g.note.id)} className="flex-row items-center active:opacity-60" accessibilityRole="link" accessibilityLabel={`Open ${g.note.title}`}>
              <FileText size={14} color={T.accent} />
              <Text className="text-accent font-semibold text-sm ml-1.5 flex-1" numberOfLines={1}>{g.note.title}</Text>
            </Pressable>
            {g.mentions.map((m, i) => (
              <Pressable key={i} onPress={() => onOpenNote(g.note.id)} className="mt-1 active:opacity-60">
                <Text className="text-ink-muted text-sm leading-5" numberOfLines={3}>{contextLine(m)}</Text>
              </Pressable>
            ))}
          </View>
        )) : <Text className="text-ink-muted text-sm">No notes link here yet.</Text>}
      </Section>

      <View className="mt-3">
        <Pressable
          onPress={() => setShowUnlinked((o) => !o)}
          className="flex-row items-center py-2 active:opacity-60"
          accessibilityRole="button"
          accessibilityState={{ expanded: showUnlinked }}
          accessibilityLabel="Unlinked mentions"
        >
          {showUnlinked ? <ChevronDown size={16} color={T.muted} /> : <ChevronRight size={16} color={T.muted} />}
          <Text className="text-ink font-bold text-sm ml-1 flex-1">Unlinked mentions</Text>
          {unlinked ? <Text className="text-ink-muted text-xs">{unlinked.reduce((s, g) => s + g.mentions.length, 0)}</Text> : null}
        </Pressable>
        {unlinked ? (unlinked.length ? unlinked.map((g) => (
          <View key={g.note.id} className="mb-2 rounded-xl border border-line bg-midnight-light px-3 py-2">
            <Pressable onPress={() => onOpenNote(g.note.id)} className="active:opacity-60" accessibilityRole="link" accessibilityLabel={`Open ${g.note.title}`}>
              <Text className="text-ink font-semibold text-sm" numberOfLines={1}>{g.note.title}</Text>
            </Pressable>
            {g.mentions.map((m, i) => (
              <View key={`${m.start}-${i}`} className="flex-row items-center mt-1">
                <Text className="text-ink-muted text-sm leading-5 flex-1 mr-2" numberOfLines={3}>{m.text}</Text>
                <Pressable
                  onPress={() => onSaveOther(g.note.id, linkMention(g.note.content, m, note.title))}
                  className="flex-row items-center px-2.5 py-1 rounded-full bg-accent/15 active:opacity-60"
                  accessibilityRole="button"
                  accessibilityLabel={`Link mention in ${g.note.title}`}
                >
                  <LinkIcon size={12} color={T.accent} />
                  <Text className="text-accent text-xs font-semibold ml-1">Link</Text>
                </Pressable>
              </View>
            ))}
          </View>
        )) : <Text className="text-ink-muted text-sm">No unlinked mentions.</Text>) : null}
      </View>

      <Section title="Outgoing links" count={outgoing.length}>
        {outgoing.length ? (
          <View className="flex-row flex-wrap">
            {outgoing.map((o) => {
              const n = o.to ? index.byId.get(o.to) : null;
              return (
                <Pressable
                  key={o.to ?? o.target}
                  onPress={() => (n ? onOpenNote(n.id) : onOpenTarget(o.target))}
                  className={`flex-row items-center rounded-full px-3 py-1.5 mr-2 mb-2 border ${n ? 'border-line' : 'border-dashed border-line'} active:opacity-60`}
                  accessibilityRole="link"
                  accessibilityLabel={n ? `Open ${n.title}` : `Create ${o.target}`}
                >
                  {n ? <FileText size={13} color={T.accent} /> : <FilePlus size={13} color={T.faint} />}
                  <Text className={`text-sm ml-1 ${n ? 'text-accent' : 'text-ink-muted'}`} numberOfLines={1}>{n ? n.title : o.target}</Text>
                </Pressable>
              );
            })}
          </View>
        ) : <Text className="text-ink-muted text-sm">This note doesn’t link anywhere yet.</Text>}
      </Section>

      <Section title="Local graph" count={(index.backlinks.get(note.id)?.length ?? 0) + outgoing.length}>
        <View className="rounded-xl border border-line overflow-hidden bg-midnight-light">
          <NoteGraph index={index} activeId={note.id} mode="local" onOpen={onGraphNode} onExpand={onExpandGraph} />
        </View>
      </Section>
    </View>
  );
}
