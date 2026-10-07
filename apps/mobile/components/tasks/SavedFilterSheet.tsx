import { useMemo, useState } from 'react';
import { View, Text, TextInput, Pressable } from 'react-native';
import { Star, Trash2 } from 'lucide-react-native';
import type { SavedFilter } from '@clearmind/shared';
import { runFilter, FilterSyntaxError } from '@clearmind/shared/domain';
import { Sheet, Button, confirmDialog } from '../ui';
import { useTaskUI } from './TaskUIProvider';
import { useCollection } from '../../hooks/useCollection';
import { STORES } from '../../services/db';
import { deleteFilter, run } from '../../services/taskActions';
import * as D from '@clearmind/shared/domain';
import { T } from '../../lib/theme';

const EXAMPLES = ['p1 & !@waiting', '(today | overdue) & #Work', 'no date & !subtask', 'this week & #RanaWallet', '@waiting', 'search: invoice'];

/** Create / edit a saved filter (synced; also usable by AI agents). */
export function SavedFilterSheet({ visible, initial, onClose }: { visible: boolean; initial?: SavedFilter | null; onClose: () => void }) {
  const ui = useTaskUI();
  const { items: sections } = useCollection(STORES.SECTIONS);
  const [name, setName] = useState('');
  const [query, setQuery] = useState('');
  const [fav, setFav] = useState(false);
  const [was, setWas] = useState(false);
  if (visible !== was) {
    setWas(visible);
    if (visible) { setName(initial?.name ?? ''); setQuery(initial?.query ?? ''); setFav(!!initial?.favorite); }
  }
  const preview = useMemo(() => {
    if (!query.trim()) return { count: null as number | null, error: null as string | null };
    try { return { count: runFilter(ui.tasks, query, { projects: ui.projects, labels: ui.labels, sections: sections as any, weekStart: ui.prefs.weekStart }).length, error: null }; }
    catch (e) { return { count: null, error: e instanceof FilterSyntaxError ? e.message : 'Invalid query' }; }
  }, [query, ui.tasks, ui.projects, ui.labels, sections, ui.prefs.weekStart]);

  const save = () => {
    if (!name.trim() || !query.trim() || preview.error) return;
    if (initial) run((s, c) => D.saveFilter(s, { id: initial.id, name, query, favorite: fav }, c));
    else run((s, c) => { const r = D.saveFilter(s, { name, query, favorite: fav }, c); return r; });
    onClose();
  };

  return (
    <Sheet visible={visible} onClose={onClose} title={initial ? 'Edit filter' : 'New filter'} right={
      <Pressable onPress={() => setFav(!fav)} hitSlop={10} accessibilityRole="switch" accessibilityState={{ checked: fav }} accessibilityLabel="Favorite">
        <Star size={20} color={fav ? '#F59E0B' : T.muted} fill={fav ? '#F59E0B' : 'transparent'} />
      </Pressable>
    }>
      <TextInput value={name} onChangeText={setName} placeholder="Name, e.g. RanaWallet blockers" placeholderTextColor={T.faint} className="bg-midnight text-ink rounded-xl px-4 py-3 text-base border border-line" accessibilityLabel="Filter name" />
      <TextInput value={query} onChangeText={setQuery} placeholder="Query, e.g. p1 & #RanaWallet & !@waiting" placeholderTextColor={T.faint} autoCapitalize="none" autoCorrect={false} className="bg-midnight text-ink rounded-xl px-4 py-3 text-base border border-line mt-2" accessibilityLabel="Filter query" />
      <Text className={`text-xs mt-1.5 ml-1 ${preview.error ? 'text-red-500' : 'text-ink-muted'}`}>
        {preview.error ?? (preview.count != null ? `${preview.count} matching task${preview.count === 1 ? '' : 's'}` : 'Terms: today, overdue, “no date”, “this week”, p1–p4, #Project, /Section, @label, search: words — combine with & | ! ( )')}
      </Text>
      <View className="flex-row flex-wrap mt-2">
        {EXAMPLES.map((e) => <Pressable key={e} onPress={() => setQuery(e)} className="px-2 py-1 mr-1.5 mb-1.5 rounded-md border border-line"><Text className="text-ink-muted text-xs">{e}</Text></Pressable>)}
      </View>
      <View className="mt-3 mb-1"><Button title={initial ? 'Save' : 'Add filter'} onPress={save} disabled={!name.trim() || !query.trim() || !!preview.error} /></View>
      {initial ? (
        <Pressable onPress={async () => { if (await confirmDialog({ title: 'Delete filter', message: `Delete “${initial.name}”?`, confirmText: 'Delete', destructive: true })) { deleteFilter(initial.id); onClose(); } }} className="flex-row items-center justify-center py-3">
          <Trash2 size={16} color={T.danger} /><Text className="text-red-500 ml-2">Delete filter</Text>
        </Pressable>
      ) : null}
    </Sheet>
  );
}

