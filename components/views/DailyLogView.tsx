/**
 * Daily log — the "Daily log" tab of Journal (#journal). Write today's entry
 * with a mood, browse history, edit or delete past entries, or turn one into a
 * task. Logs stay in their own store (STORES.LOGS); rants live separately.
 */
import React, { useMemo, useState } from 'react';
import { Calendar, Frown, Meh, Zap, Save, CheckCircle, Pencil, Trash2, ListPlus, NotebookPen } from 'lucide-react';
import type { LogEntry } from '../../types';
import { STORES } from '../../services/db';
import { useStore, getStore } from '../tasks/store';
import { useTaskUI } from '../tasks/TaskContext';
import { useTaskToast, cx } from '../tasks/ui';
import { Card, PageLoading } from './PageShell';
import { entryToTask } from '../../utils/journal';

const MOODS: LogEntry['mood'][] = ['Productive', 'Flow State', 'Neutral', 'Frustrated'];

export function MoodIcon({ mood, size = 16 }: { mood: LogEntry['mood']; size?: number }) {
  switch (mood) {
    case 'Productive': return <CheckCircle size={size} className="text-green-500" aria-label="Productive" />;
    case 'Flow State': return <Zap size={size} className="text-yellow-500" aria-label="Flow state" />;
    case 'Frustrated': return <Frown size={size} className="text-red-500" aria-label="Frustrated" />;
    default: return <Meh size={size} className="text-gray-500" aria-label="Neutral" />;
  }
}

function MoodPicker({ value, onChange }: { value: LogEntry['mood']; onChange: (m: LogEntry['mood']) => void }) {
  return (
    <div role="radiogroup" aria-label="Mood" className="flex gap-1.5 flex-wrap">
      {MOODS.map((mood) => (
        <button key={mood} role="radio" aria-checked={value === mood} onClick={() => onChange(mood)}
          className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border transition-colors ${value === mood
            ? 'bg-blue-600 border-blue-600 text-white'
            : `${cx.border} ${cx.muted} hover:border-blue-500`}`}>
          {mood}
        </button>
      ))}
    </div>
  );
}

const sortLogs = (a: LogEntry, b: LogEntry) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id, undefined, { numeric: true });

export default function DailyLogPanel() {
  const snap = useStore<LogEntry>(STORES.LOGS);
  const ui = useTaskUI();
  const toast = useTaskToast();
  const [content, setContent] = useState('');
  const [mood, setMood] = useState<LogEntry['mood']>('Neutral');
  const [editing, setEditing] = useState<LogEntry | null>(null);
  const entries = useMemo(() => snap.items.filter((e) => !(e as { deleted?: boolean }).deleted).sort(sortLogs), [snap.items]);
  const store = getStore<LogEntry>(STORES.LOGS);

  const save = async () => {
    if (!content.trim()) return;
    const entry: LogEntry = { id: Date.now().toString(), date: new Date().toISOString().split('T')[0], content: content.trim(), mood };
    try { await store.putMany([entry]); setContent(''); toast('Entry saved'); } catch { toast('Could not save the entry'); }
  };
  const saveEdit = async () => {
    if (!editing || !editing.content.trim()) return;
    try { await store.putMany([{ ...editing, content: editing.content.trim() }]); setEditing(null); toast('Entry updated'); } catch { toast('Could not save the entry'); }
  };
  const remove = async (e: LogEntry) => {
    if (!confirm(`Delete the log entry from ${e.date}?`)) return;
    try { await store.removeMany([e.id]); toast('Entry deleted'); } catch { toast('Could not delete the entry'); }
  };

  if (!snap.loaded) return <PageLoading />;

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_18rem]">
      <Card>
        <div className={`flex flex-wrap items-center gap-3 pb-3 mb-3 border-b ${cx.border}`}>
          <span className={`text-xs font-mono ${cx.muted}`}>{new Date().toDateString()}</span>
          <MoodPicker value={mood} onChange={setMood} />
        </div>
        <textarea
          value={content} onChange={(e) => setContent(e.target.value)} rows={8} aria-label="Today’s log"
          placeholder="How did today go? Wins, failures, what you learned…"
          className={`w-full bg-transparent resize-y focus:outline-none leading-relaxed ${cx.text} placeholder:text-gray-400`}
        />
        <div className="flex justify-end mt-2">
          <button onClick={save} disabled={!content.trim()} className={`inline-flex items-center gap-2 ${cx.btnPrimary}`}><Save size={15} />Save entry</button>
        </div>
      </Card>

      <section aria-label="Log history" className="min-w-0">
        <h2 className={`text-sm font-semibold mb-3 flex items-center gap-2 ${cx.text}`}><Calendar size={16} />History</h2>
        {!entries.length ? (
          <div className={`text-center py-10 ${cx.muted}`}>
            <NotebookPen size={28} className="mx-auto mb-2 opacity-60" />
            <p className="text-sm">No logs yet. Write your first entry.</p>
          </div>
        ) : (
          <ul className="space-y-3">
            {entries.map((entry) => (
              <li key={entry.id} className={`group rounded-lg border ${cx.border} ${cx.card} p-3`}>
                {editing?.id === entry.id ? (
                  <div className="space-y-2">
                    <MoodPicker value={editing.mood} onChange={(m) => setEditing({ ...editing, mood: m })} />
                    <textarea value={editing.content} onChange={(e) => setEditing({ ...editing, content: e.target.value })} rows={4} className={`${cx.input} w-full`} aria-label="Edit log entry" autoFocus />
                    <div className="flex justify-end gap-2">
                      <button onClick={() => setEditing(null)} className={cx.btnGhost}>Cancel</button>
                      <button onClick={saveEdit} disabled={!editing.content.trim()} className={cx.btnPrimary}>Save</button>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xs text-blue-600 dark:text-blue-400 font-mono">{entry.date}</span>
                      <MoodIcon mood={entry.mood} size={14} />
                      <span className="flex-1" />
                      <span className="flex gap-0.5 opacity-100 md:opacity-0 md:group-hover:opacity-100 focus-within:opacity-100">
                        <button onClick={() => ui.openQuickAdd(entryToTask(entry.content))} className={`p-1 rounded ${cx.hover} ${cx.muted}`} aria-label="Turn into task" title="Turn into task"><ListPlus size={14} /></button>
                        <button onClick={() => setEditing(entry)} className={`p-1 rounded ${cx.hover} ${cx.muted}`} aria-label="Edit entry" title="Edit"><Pencil size={14} /></button>
                        <button onClick={() => remove(entry)} className={`p-1 rounded ${cx.hover} text-red-500`} aria-label="Delete entry" title="Delete"><Trash2 size={14} /></button>
                      </span>
                    </div>
                    <p className={`text-sm whitespace-pre-wrap line-clamp-6 ${cx.text}`}>{entry.content}</p>
                  </>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
