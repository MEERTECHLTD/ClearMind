/**
 * Edit mode: a plain multiline TextInput with debounced autosave, `[[link` /
 * `#tag` autocomplete in a suggestion bar above the keyboard, and a small
 * Markdown toolbar. The editor owns its text while mounted; saves flush on
 * blur and unmount.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, TextInput, Pressable, ScrollView, type NativeSyntheticEvent, type TextInputSelectionChangeEventData } from 'react-native';
import { Brackets, Hash, SquareCheck, Bold, Heading, Plus, FileText } from 'lucide-react-native';
import type { Note } from '@clearmind/shared';
import { quickSwitch, extractHeadings, notePath, type VaultIndex } from '@clearmind/shared/notes';
import { T } from '../../lib/theme';
import { saveContent, createNote } from '../../services/notes';
import { detectTrigger, applyLinkCompletion, applyTagCompletion, insertSnippet, type Edit } from './autocomplete';

type Sel = { start: number; end: number };

interface Suggestion { key: string; label: string; hint?: string; create?: boolean; onPick: () => void }

export function NoteEditor({ note, index, autoFocus, onError }: { note: Note; index: VaultIndex; autoFocus?: boolean; onError?: (msg: string) => void }) {
  const [text, setText] = useState(note.content);
  const [sel, setSel] = useState<Sel>({ start: note.content.length, end: note.content.length });
  const [forced, setForced] = useState<Sel | undefined>(undefined);
  const latest = useRef(text);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const id = note.id;
  const errRef = useRef(onError);
  errRef.current = onError;
  const report = (e: any) => errRef.current?.(String(e?.message ?? e));

  const flush = useCallback(() => {
    if (timer.current) { clearTimeout(timer.current); timer.current = null; }
    saveContent(id, latest.current).catch(report);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  useEffect(() => () => flush(), [flush]);

  const change = (next: string) => {
    setText(next);
    latest.current = next;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(flush, 500);
  };

  const apply = (e: Edit) => {
    change(e.text);
    const s = { start: e.cursor, end: e.cursor };
    setSel(s);
    setForced(s);
  };

  const onSelectionChange = (e: NativeSyntheticEvent<TextInputSelectionChangeEventData>) => {
    setSel(e.nativeEvent.selection);
    if (forced) setForced(undefined);
  };

  // ---------------------------------------------------------------- suggestions
  const trigger = sel.start === sel.end ? detectTrigger(text, sel.start) : null;

  const linkTarget = (n: Note) => {
    const dupes = index.notes.filter((x) => x.title.toLowerCase() === n.title.toLowerCase()).length > 1;
    return dupes ? notePath(n) : n.title;
  };

  const suggestions: Suggestion[] = (() => {
    if (!trigger) return [];
    if (trigger.kind === 'tag') {
      const q = trigger.query.toLowerCase();
      return [...index.tags.entries()]
        .filter(([t]) => t !== q && (!q || t.includes(q)))
        .sort((a, b) => Number(b[0].startsWith(q)) - Number(a[0].startsWith(q)) || b[1].size - a[1].size)
        .slice(0, 10)
        .map(([t, ids]) => ({ key: `t:${t}`, label: `#${t}`, hint: String(ids.size), onPick: () => apply(applyTagCompletion(text, sel.start, trigger, t)) }));
    }
    const { ctx } = trigger;
    if (ctx.part === 'target') {
      const hits = quickSwitch(index, ctx.query, 8).filter((h) => h.note.id !== id || ctx.query);
      const out: Suggestion[] = hits.map((h) => ({
        key: h.note.id, label: h.via ? `${h.via} → ${h.note.title}` : h.note.title, hint: h.note.folder ?? undefined,
        onPick: () => apply(applyLinkCompletion(text, sel.start, trigger, linkTarget(h.note) + (h.via ? `|${h.via}` : ''))),
      }));
      const q = ctx.query.trim();
      if (q && !index.resolve(q, id)) {
        out.push({
          key: 'create', label: `Create “${q}”`, create: true,
          onPick: () => {
            createNote({ title: q.split('/').pop(), folder: q.includes('/') ? q.split('/').slice(0, -1).join('/') : note.folder ?? null })
              .catch(report);
            apply(applyLinkCompletion(text, sel.start, trigger, q));
          },
        });
      }
      return out;
    }
    if (ctx.part === 'heading') {
      const target = ctx.target ? index.resolve(ctx.target, id) : index.byId.get(id);
      const src = target?.id === id ? text : target?.content ?? '';
      const q = ctx.query.toLowerCase();
      return extractHeadings(src)
        .filter((h) => !q || h.text.toLowerCase().includes(q))
        .slice(0, 10)
        .map((h, i) => ({ key: `h:${i}`, label: `${'#'.repeat(h.level)} ${h.text}`, onPick: () => apply(applyLinkCompletion(text, sel.start, trigger, h.text)) }));
    }
    return [];
  })();

  const tool = (snippet: string, opts?: { wrap?: boolean; lineStart?: boolean }) => apply(insertSnippet(text, sel, snippet, opts));

  return (
    <View className="flex-1">
      <TextInput
        value={text}
        onChangeText={change}
        selection={forced}
        onSelectionChange={onSelectionChange}
        onBlur={flush}
        multiline
        autoFocus={autoFocus}
        placeholder={'Start writing…\n\nLink notes with [[ and tag with #'}
        placeholderTextColor={T.faint}
        textAlignVertical="top"
        className="flex-1 text-ink text-[15px] leading-6 px-4 pt-3 pb-6"
        style={{ color: T.ink }}
        accessibilityLabel="Note content"
        autoCorrect
        scrollEnabled
      />
      {suggestions.length ? (
        <View className="border-t border-line bg-midnight-light">
          <ScrollView horizontal keyboardShouldPersistTaps="always" showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 8, paddingVertical: 6 }}>
            {suggestions.map((s) => (
              <Pressable
                key={s.key}
                onPress={s.onPick}
                className={`flex-row items-center rounded-full px-3 py-1.5 mr-2 border ${s.create ? 'border-accent' : 'border-line'} bg-midnight active:opacity-70`}
                accessibilityRole="button"
                accessibilityLabel={s.create ? s.label : `Insert ${s.label}`}
              >
                {s.create ? <Plus size={14} color={T.accent} /> : trigger?.kind === 'link' ? <FileText size={14} color={T.muted} /> : null}
                <Text className={`text-sm ${s.create ? 'text-accent font-semibold' : 'text-ink'} ${s.create || trigger?.kind === 'link' ? 'ml-1' : ''}`} numberOfLines={1}>{s.label}</Text>
                {s.hint ? <Text className="text-ink-muted text-xs ml-1.5" numberOfLines={1}>{s.hint}</Text> : null}
              </Pressable>
            ))}
          </ScrollView>
        </View>
      ) : null}
      <View className="flex-row items-center border-t border-line bg-midnight-light px-2 py-1">
        <ToolButton label="Insert link" onPress={() => tool('[[')}><Brackets size={20} color={T.ink} /></ToolButton>
        <ToolButton label="Insert tag" onPress={() => tool(sel.start > 0 && !/\s/.test(text[sel.start - 1]) ? ' #' : '#')}><Hash size={20} color={T.ink} /></ToolButton>
        <ToolButton label="Insert checkbox" onPress={() => tool('- [ ] ', { lineStart: true })}><SquareCheck size={20} color={T.ink} /></ToolButton>
        <ToolButton label="Bold" onPress={() => tool('**', { wrap: true })}><Bold size={20} color={T.ink} /></ToolButton>
        <ToolButton label="Heading" onPress={() => tool('# ', { lineStart: true })}><Heading size={20} color={T.ink} /></ToolButton>
      </View>
    </View>
  );
}

function ToolButton({ label, onPress, children }: { label: string; onPress: () => void; children: React.ReactNode }) {
  return (
    <Pressable onPress={onPress} hitSlop={4} className="px-3 py-2 rounded-lg active:bg-midnight-lighter" accessibilityRole="button" accessibilityLabel={label}>
      {children}
    </Pressable>
  );
}
