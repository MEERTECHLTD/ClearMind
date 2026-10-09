/**
 * A single note: reading mode (rendered Markdown with live [[wikilinks]],
 * #tags, embeds, task checkboxes + backlinks / mentions / outgoing links /
 * local graph) and edit mode (TextInput with link & tag autocomplete).
 *
 * `note/new` (optional `title`) creates a note — or opens the existing one a
 * title resolves to — and replaces itself with it.
 *
 * This screen lives in the Tabs navigator, so following links between notes
 * only changes the `id` param; an in-screen trail makes Back retrace them.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, TextInput, Pressable, ScrollView, BackHandler } from 'react-native';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import * as Clipboard from 'expo-clipboard';
import { ChevronLeft, Star, EllipsisVertical, BookOpen, Pencil, Trash2, FolderInput, Copy, Network, FileQuestion, CalendarDays } from 'lucide-react-native';
import type { Note } from '@clearmind/shared';
import { notePath, slugify, type GraphNode } from '@clearmind/shared/notes';
import { toggleTaskLine } from '@clearmind/shared/notes/markdown';
import { Screen, Spinner, Sheet, ActionMenu, EmptyState, Input, Button, useToast, type MenuAction } from '../../../components/ui';
import { MarkdownBlocks, type LinkRef } from '../../../components/notes/MarkdownBlocks';
import { NoteEditor } from '../../../components/notes/NoteEditor';
import { CanvasSummary } from '../../../components/notes/CanvasSummary';
import { NoteSections } from '../../../components/notes/NoteSections';
import { useVault, createNote, saveContent, renameNote, deleteNotes, toggleBookmark, openOrCreateLink, VaultError } from '../../../services/notes';
import { T } from '../../../lib/theme';

// Notes visited by following links (newest last) + how the current id was reached.
const trail: string[] = [];
let navKind: 'link' | 'back' | null = null;

const errMsg = (e: unknown) => (e instanceof Error ? e.message : String(e));

export default function NoteRoute() {
  const params = useLocalSearchParams<{ id: string; title?: string; edit?: string }>();
  const id = String(params.id ?? '');
  const router = useRouter();
  const prev = useRef<string | null>(null);

  // Maintain the trail when the id changes.
  useEffect(() => {
    const p = prev.current;
    if (p && p !== id && p !== 'new') {
      if (navKind === 'link') trail.push(p);
      else if (navKind !== 'back') trail.length = 0;
    }
    navKind = null;
    prev.current = id;
  }, [id]);

  const goTo = useCallback((nextId: string) => {
    navKind = 'link';
    router.push(`/(app)/note/${nextId}`);
  }, [router]);

  const goBack = useCallback(() => {
    const p = trail.pop();
    if (p) { navKind = 'back'; router.push(`/(app)/note/${p}`); return; }
    if (router.canGoBack()) router.back(); else router.replace('/(app)/notes');
  }, [router]);

  // Android hardware back follows the link trail first; leaving the screen resets it.
  useFocusEffect(useCallback(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (!trail.length) return false;
      goBack();
      return true;
    });
    return () => { sub.remove(); trail.length = 0; };
  }, [goBack]));

  if (id === 'new') return <NewNote key={`new:${params.title ?? ''}`} title={params.title} />;
  return <NoteScreen key={id} id={id} startEditing={params.edit === '1'} goTo={goTo} goBack={goBack} />;
}

function NewNote({ title }: { title?: string }) {
  const router = useRouter();
  const toast = useToast();
  const started = useRef(false);
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    (title?.trim() ? openOrCreateLink(title.trim()) : createNote())
      .then((n) => router.replace(`/(app)/note/${n.id}`))
      .catch((e) => { toast.show(errMsg(e), 'error'); router.replace('/(app)/notes'); });
  }, [title, router, toast]);
  return <Spinner label="Creating note…" />;
}

function NoteScreen({ id, startEditing, goTo, goBack }: { id: string; startEditing: boolean; goTo: (id: string) => void; goBack: () => void }) {
  const router = useRouter();
  const toast = useToast();
  const { index, loaded } = useVault();
  const note = index.byId.get(id) ?? null;

  const [editing, setEditing] = useState<boolean>(() => startEditing);
  const decided = useRef(startEditing);
  useEffect(() => {
    // Empty notes open straight into the editor (decided once, when the note first appears).
    if (!decided.current && note) { decided.current = true; if (!note.content.trim()) setEditing(true); }
  }, [note]);

  const [title, setTitle] = useState(note?.title ?? '');
  const lastTitle = useRef(note?.title ?? '');
  useEffect(() => {
    // Follow renames from elsewhere (sync / web) unless the user is mid-edit.
    if (note && note.title !== lastTitle.current) { lastTitle.current = note.title; setTitle(note.title); }
  }, [note]);

  const [menu, setMenu] = useState(false);
  const [moveOpen, setMoveOpen] = useState(false);

  const scroll = useRef<ScrollView>(null);
  const headingY = useRef(new Map<string, number>());
  const contentY = useRef(0);

  const commitTitle = async () => {
    if (!note) return;
    const t = title.trim();
    if (t === note.title) return;
    try {
      const n = await renameNote(note.id, { title: t });
      lastTitle.current = t;
      if (n > 0) toast.show(`Updated links in ${n} note${n === 1 ? '' : 's'}`, 'success');
    } catch (e) {
      toast.show(e instanceof VaultError ? e.message : errMsg(e), 'error');
      setTitle(note.title);
    }
  };

  const openLink = useCallback(async (l: LinkRef) => {
    if (!note) return;
    const target = l.target ? index.resolve(l.target, note.id) : note;
    if (target && target.id === note.id) {
      if (l.heading) {
        const y = headingY.current.get(slugify(l.heading));
        if (y !== undefined) scroll.current?.scrollTo({ y: Math.max(0, contentY.current + y - 8), animated: true });
      }
      return;
    }
    if (target) { goTo(target.id); return; }
    try { const n = await openOrCreateLink(l.target, note); goTo(n.id); }
    catch (e) { toast.show(errMsg(e), 'error'); }
  }, [note, index, goTo, toast]);

  const openTag = useCallback((tag: string) => router.push({ pathname: '/(app)/notes', params: { q: `tag:#${tag}` } }), [router]);

  const toggleTask = useCallback((line: number) => {
    if (!note) return;
    saveContent(note.id, toggleTaskLine(note.content, line)).catch((e) => toast.show(errMsg(e), 'error'));
  }, [note, toast]);

  const onGraphNode = useCallback((node: GraphNode) => {
    if (node.type === 'note') goTo(node.noteId ?? node.id);
    else if (node.type === 'unresolved') openLink({ target: node.label });
    else if (node.type === 'tag') openTag(node.label.replace(/^#/, ''));
  }, [goTo, openLink, openTag]);

  const linkText = useMemo(() => {
    if (!note) return '';
    const dupes = index.notes.filter((n) => n.title.toLowerCase() === note.title.toLowerCase()).length > 1;
    return `[[${dupes ? notePath(note) : note.title}]]`;
  }, [note, index]);

  if (!loaded) return <Spinner label="Loading note…" />;
  if (!note) {
    return (
      <Screen padded={false}>
        <Header onBack={goBack} />
        <EmptyState icon={<FileQuestion size={34} color={T.faint} />} title="Note not found" subtitle="It may have been deleted or not synced to this device yet." ctaTitle="All notes" onCta={() => router.replace('/(app)/notes')} />
      </Screen>
    );
  }

  const remove = async () => {
    try {
      const undo = await deleteNotes([note.id]);
      toast.show(`Deleted “${note.title}”`, 'info', { label: 'Undo', onPress: () => { undo().catch(() => {}); } });
      goBack();
    } catch (e) { toast.show(errMsg(e), 'error'); }
  };

  const actions: MenuAction[] = [
    { label: note.bookmarked ? 'Remove bookmark' : 'Bookmark', icon: <Star size={18} color={T.muted} />, onPress: () => { toggleBookmark(note).catch(() => {}); } },
    { label: 'Move to folder…', icon: <FolderInput size={18} color={T.muted} />, hint: note.folder ?? 'Vault root', onPress: () => setMoveOpen(true) },
    { label: 'Copy link', icon: <Copy size={18} color={T.muted} />, hint: linkText, onPress: () => { Clipboard.setStringAsync(linkText).then(() => toast.show('Link copied', 'success')).catch(() => {}); } },
    { label: 'Open in graph', icon: <Network size={18} color={T.muted} />, onPress: () => router.push({ pathname: '/(app)/notes-graph', params: { focus: note.id } }) },
    { label: 'Delete note', icon: <Trash2 size={18} color={T.danger} />, destructive: true, onPress: remove },
  ];

  return (
    <Screen padded={false}>
      <Header onBack={goBack}>
        <TextInput
          value={title}
          onChangeText={setTitle}
          onBlur={commitTitle}
          onSubmitEditing={commitTitle}
          returnKeyType="done"
          blurOnSubmit
          className="flex-1 text-ink text-xl font-extrabold py-1"
          style={{ color: T.ink }}
          placeholder="Untitled"
          placeholderTextColor={T.faint}
          accessibilityLabel="Note title"
        />
        {note.kind === 'canvas' ? null : (
          <Pressable onPress={() => setEditing((e) => !e)} hitSlop={8} className="p-2 active:opacity-60" accessibilityRole="button" accessibilityLabel={editing ? 'Reading view' : 'Edit note'}>
            {editing ? <BookOpen size={20} color={T.accent} /> : <Pencil size={20} color={T.ink} />}
          </Pressable>
        )}
        <Pressable onPress={() => toggleBookmark(note).catch(() => {})} hitSlop={8} className="p-2 active:opacity-60" accessibilityRole="button" accessibilityLabel={note.bookmarked ? 'Remove bookmark' : 'Bookmark'} accessibilityState={{ selected: !!note.bookmarked }}>
          <Star size={20} color={note.bookmarked ? '#F59E0B' : T.muted} fill={note.bookmarked ? '#F59E0B' : 'transparent'} />
        </Pressable>
        <Pressable onPress={() => setMenu(true)} hitSlop={8} className="p-2 -mr-2 active:opacity-60" accessibilityRole="button" accessibilityLabel="Note actions">
          <EllipsisVertical size={20} color={T.ink} />
        </Pressable>
      </Header>
      {note.folder || note.kind === 'daily' ? (
        <View className="flex-row items-center px-4 pt-2">
          {note.kind === 'daily' ? <CalendarDays size={12} color={T.faint} /> : null}
          <Text className="text-ink-muted text-xs ml-1" numberOfLines={1}>{note.folder ?? ''}</Text>
        </View>
      ) : null}

      {editing && note.kind !== 'canvas' ? (
        <NoteEditor note={note} index={index} autoFocus={!note.content} onError={(m) => toast.show(m, 'error')} />
      ) : (
        <ScrollView ref={scroll} className="flex-1" contentContainerStyle={{ padding: 16, paddingBottom: 48 }} keyboardShouldPersistTaps="handled">
          <View onLayout={(e) => { contentY.current = e.nativeEvent.layout.y; }}>
            {note.kind === 'canvas' ? (
              <CanvasSummary note={note} index={index} onLink={openLink} onTag={openTag} />
            ) : note.content.trim() ? (
              <MarkdownBlocks
                note={note}
                index={index}
                onLink={openLink}
                onTag={openTag}
                onToggleTask={toggleTask}
                onHeadingLayout={(slug, y) => headingY.current.set(slug, y)}
              />
            ) : (
              <Pressable onPress={() => setEditing(true)} className="py-6 active:opacity-60" accessibilityRole="button">
                <Text className="text-ink-muted italic">Empty note — tap to start writing.</Text>
              </Pressable>
            )}
          </View>
          <NoteSections
            note={note}
            index={index}
            onOpenNote={goTo}
            onOpenTarget={(t) => openLink({ target: t })}
            onGraphNode={onGraphNode}
            onExpandGraph={() => router.push({ pathname: '/(app)/notes-graph', params: { focus: note.id } })}
            onSaveOther={(nid, content) => { saveContent(nid, content).then(() => toast.show('Linked', 'success')).catch((e) => toast.show(errMsg(e), 'error')); }}
          />
        </ScrollView>
      )}

      <ActionMenu visible={menu} onClose={() => setMenu(false)} title={note.title} actions={actions} />
      <MoveSheet visible={moveOpen} onClose={() => setMoveOpen(false)} note={note} folders={index.folders} onMoved={(msg) => toast.show(msg, 'success')} onError={(m) => toast.show(m, 'error')} />
    </Screen>
  );
}

function Header({ onBack, children }: { onBack: () => void; children?: React.ReactNode }) {
  return (
    <View className="flex-row items-center px-3 pt-2 pb-2 border-b border-line bg-midnight">
      <Pressable onPress={onBack} hitSlop={12} className="mr-1 p-1 active:opacity-60" accessibilityLabel="Back" accessibilityRole="button">
        <ChevronLeft size={26} color={T.ink} />
      </Pressable>
      {children ?? <View className="flex-1" />}
    </View>
  );
}

function MoveSheet({ visible, onClose, note, folders, onMoved, onError }: {
  visible: boolean; onClose: () => void; note: Note; folders: string[]; onMoved: (msg: string) => void; onError: (msg: string) => void;
}) {
  const [custom, setCustom] = useState('');
  const move = async (folder: string | null) => {
    onClose();
    if ((folder ?? null) === (note.folder ?? null)) return;
    try {
      const n = await renameNote(note.id, { folder });
      onMoved(`Moved to ${folder || 'vault root'}${n ? ` · updated links in ${n} note${n === 1 ? '' : 's'}` : ''}`);
    } catch (e) { onError(errMsg(e)); }
  };
  const options: (string | null)[] = [null, ...folders];
  return (
    <Sheet visible={visible} onClose={onClose} title="Move to folder">
      <ScrollView style={{ maxHeight: 320 }} keyboardShouldPersistTaps="handled">
        {options.map((f) => {
          const cur = (f ?? null) === (note.folder ?? null);
          return (
            <Pressable key={f ?? '__root'} onPress={() => move(f)} className="flex-row items-center py-3 active:opacity-60" accessibilityRole="button" accessibilityState={{ selected: cur }}>
              <FolderInput size={16} color={cur ? T.accent : T.muted} />
              <Text className={`ml-2.5 text-base flex-1 ${cur ? 'text-accent font-semibold' : 'text-ink'}`} numberOfLines={1}>{f ?? 'Vault root'}</Text>
            </Pressable>
          );
        })}
      </ScrollView>
      <View className="flex-row items-center mt-2">
        <View className="flex-1 mr-2">
          <Input placeholder="New folder, e.g. Projects/App" value={custom} onChangeText={setCustom} autoCapitalize="none" onSubmitEditing={() => custom.trim() && move(custom.trim())} />
        </View>
        <Button title="Move" onPress={() => custom.trim() && move(custom.trim())} full={false} />
      </View>
    </Sheet>
  );
}
