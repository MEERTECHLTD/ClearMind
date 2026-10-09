/**
 * Rants — the "Rants" tab of Journal (#journal?tab=rants), formerly Rant
 * Corner. Vent, burn it or save it, ask Iris for advice grounded in your own
 * data, and edit / delete / turn saved rants into tasks. Rants stay in their
 * own store (STORES.RANTS), separate from daily logs.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Trash2, Save, X, Sparkles, Bot, Loader2, Flame, Pencil, ListPlus, MessageSquare } from 'lucide-react';
import { dbService, STORES } from '../../services/db';
import type { Rant, Project, Task, Note, Habit, Goal, Milestone, LogEntry, UserProfile, CalendarEvent, Application } from '../../types';
import { generateIrisResponse, type UserContext } from '../../services/geminiService';
import { useStore, getStore } from '../tasks/store';
import { useTaskUI } from '../tasks/TaskContext';
import { useTaskToast, cx } from '../tasks/ui';
import { Card, PageLoading } from './PageShell';
import { entryToTask } from '../../utils/journal';

interface IrisAdvice {
  rantContent: string;
  advice: string;
  timestamp: Date;
}

const rantTime = (r: Rant) => new Date(r.createdAt || r.timestamp || 0).getTime();

export default function RantsPanel() {
  const snap = useStore<Rant>(STORES.RANTS);
  const ui = useTaskUI();
  const toast = useTaskToast();
  const [rant, setRant] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [isGettingAdvice, setIsGettingAdvice] = useState(false);
  const [irisAdvice, setIrisAdvice] = useState<IrisAdvice | null>(null);
  const [showAdvicePanel, setShowAdvicePanel] = useState(false);
  const [editing, setEditing] = useState<Rant | null>(null);
  const store = getStore<Rant>(STORES.RANTS);
  const savedRants = useMemo(() => snap.items.filter((r) => !(r as { deleted?: boolean }).deleted).sort((a, b) => rantTime(b) - rantTime(a)), [snap.items]);

  const handleSaveRant = async () => {
    if (!rant.trim()) return;
    setIsSaving(true);
    try {
      const now = new Date().toISOString();
      await store.putMany([{ id: `rant-${Date.now()}`, content: rant, createdAt: now, timestamp: now, mood: 'venting' }]);
      setRant('');
      toast('Saved to your journal');
    } catch (error) {
      console.error('Failed to save rant:', error);
      toast('Could not save the rant');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteRant = async (r: Rant) => {
    if (!confirm('Delete this rant?')) return;
    try { await store.removeMany([r.id]); toast('Rant deleted'); } catch { toast('Could not delete the rant'); }
  };

  const saveEdit = async () => {
    if (!editing || !editing.content.trim()) return;
    try { await store.putMany([{ ...editing, content: editing.content.trim() }]); setEditing(null); toast('Rant updated'); } catch { toast('Could not save the rant'); }
  };

  // Everything Iris needs to give data-grounded advice.
  const fetchUserContext = useCallback(async (): Promise<UserContext | null> => {
    try {
      const [projects, tasks, notes, habits, goals, milestones, logs, rants, events, applications] = await Promise.all([
        dbService.getAll<Project>(STORES.PROJECTS),
        dbService.getAll<Task>(STORES.TASKS),
        dbService.getAll<Note>(STORES.NOTES),
        dbService.getAll<Habit>(STORES.HABITS),
        dbService.getAll<Goal>(STORES.GOALS),
        dbService.getAll<Milestone>(STORES.MILESTONES),
        dbService.getAll<LogEntry>(STORES.LOGS),
        dbService.getAll<Rant>(STORES.RANTS),
        dbService.getAll<CalendarEvent>(STORES.EVENTS),
        dbService.getAll<Application>(STORES.APPLICATIONS),
      ]);
      let profile: UserProfile | undefined;
      try { profile = await dbService.get<UserProfile>(STORES.PROFILE, 'user'); } catch { profile = undefined; }
      return { profile, projects, tasks, notes, habits, goals, milestones, logs, rants, events, applications };
    } catch (error) {
      console.error('Failed to fetch user context:', error);
      return null;
    }
  }, []);

  // Warm the context so the first request is quick.
  useEffect(() => { void fetchUserContext(); }, [fetchUserContext]);

  const handleGetAdvice = async () => {
    if (!rant.trim()) return;
    setIsGettingAdvice(true);
    setShowAdvicePanel(true);
    setIrisAdvice(null);
    try {
      const userContext = await fetchUserContext();
      const advicePrompt = `The user is venting/ranting in the Rant Corner. They are frustrated about their schedules, tasks, or productivity not having the real-life impact they expected.

Here's their rant:
"${rant}"

As Iris, please:
1. Acknowledge their frustration with empathy
2. Analyze their current data (tasks, habits, goals, schedules, projects) to understand their situation
3. Identify specific patterns or issues that might explain why they feel their efforts aren't translating to real-life results
4. Provide 2-3 concrete, actionable suggestions based on THEIR ACTUAL DATA to help bridge the gap between planning and real impact
5. If relevant, suggest adjustments to their tasks, habits, or goals that could help
6. End with encouragement and a specific next step they can take today

Remember: Reference their SPECIFIC tasks, habits, projects, and goals by name. Make this personal and data-driven, not generic advice.`;
      const history = [
        { role: 'model', parts: [{ text: "I'm here to help you work through this frustration. Let me look at your data and see what's really going on..." }] },
      ];
      const response = await generateIrisResponse(history, advicePrompt, userContext || undefined);
      setIrisAdvice({ rantContent: rant, advice: response, timestamp: new Date() });
    } catch (error) {
      console.error('Failed to get advice from Iris:', error);
      setIrisAdvice({
        rantContent: rant,
        advice: "I'm having trouble connecting right now. But I want you to know that your frustration is valid. Take a breath, and let's try again in a moment.",
        timestamp: new Date(),
      });
    } finally {
      setIsGettingAdvice(false);
    }
  };

  if (!snap.loaded) return <PageLoading />;

  return (
    <div className="space-y-4">
      <Card className="relative overflow-hidden">
        <div className="absolute top-0 left-0 w-full h-1 bg-red-500/80" aria-hidden />
        <p className={`text-sm mb-3 ${cx.muted}`}>Vent here — get it out of your system. Burn it, save it, or ask Iris for advice based on your actual tasks, habits and goals.</p>
        <textarea
          value={rant} onChange={(e) => setRant(e.target.value)} rows={7} aria-label="Rant"
          placeholder="Feeling like your tasks aren't making a difference? Let it out here, then ask Iris for personalised advice…"
          className={`w-full bg-transparent resize-y focus:outline-none font-mono text-sm ${cx.text} placeholder:text-gray-400`}
        />
        <div className={`flex flex-wrap justify-end gap-2 pt-3 mt-2 border-t ${cx.border}`}>
          <button onClick={() => setRant('')} disabled={!rant} className={`inline-flex items-center gap-2 ${cx.btnGhost} disabled:opacity-40`}><Flame size={15} className="text-red-500" />Burn it</button>
          <button onClick={handleGetAdvice} disabled={!rant.trim() || isGettingAdvice} className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-semibold bg-violet-600 hover:bg-violet-700 text-white disabled:opacity-40 disabled:cursor-not-allowed">
            {isGettingAdvice ? <Loader2 size={15} className="animate-spin" /> : <Sparkles size={15} />}{isGettingAdvice ? 'Analyzing…' : 'Get advice from Iris'}
          </button>
          <button onClick={handleSaveRant} disabled={!rant.trim() || isSaving} className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-semibold bg-red-600 hover:bg-red-700 text-white disabled:opacity-40 disabled:cursor-not-allowed">
            <Save size={15} />{isSaving ? 'Saving…' : 'Save to journal'}
          </button>
        </div>
      </Card>

      {showAdvicePanel ? (
        <Card title="Iris’s advice" right={<button onClick={() => setShowAdvicePanel(false)} className={`p-1 rounded ${cx.hover} ${cx.muted}`} aria-label="Close advice"><X size={16} /></button>}>
          {isGettingAdvice ? (
            <div className="flex items-center justify-center gap-3 py-8 text-violet-600 dark:text-violet-400">
              <Loader2 size={22} className="animate-spin" /><span className="text-sm">Analyzing your data and crafting personalised advice…</span>
            </div>
          ) : irisAdvice ? (
            <div className="space-y-3">
              <div className="rounded-lg bg-gray-50 dark:bg-white/5 p-3">
                <p className={`text-xs mb-1 ${cx.muted}`}>Your concern</p>
                <p className={`text-sm italic ${cx.text}`}>“{irisAdvice.rantContent}”</p>
              </div>
              <div className="flex gap-2.5">
                <Bot size={18} className="text-violet-500 shrink-0 mt-0.5" />
                <p className={`text-sm whitespace-pre-wrap leading-relaxed ${cx.text}`}>{irisAdvice.advice}</p>
              </div>
              <p className={`text-xs ${cx.faint}`}>Generated at {irisAdvice.timestamp.toLocaleTimeString()} from your current data</p>
            </div>
          ) : null}
        </Card>
      ) : null}

      <section aria-label="Saved rants">
        <h2 className={`text-sm font-semibold mb-3 ${cx.text}`}>Saved rants <span className={`font-normal ${cx.muted}`}>{savedRants.length || ''}</span></h2>
        {!savedRants.length ? (
          <div className={`text-center py-10 ${cx.muted}`}>
            <MessageSquare size={28} className="mx-auto mb-2 opacity-60" />
            <p className="text-sm">Nothing saved yet. Rants you save show up here.</p>
          </div>
        ) : (
          <ul className="space-y-3">
            {savedRants.map((r) => {
              const at = new Date(r.createdAt || r.timestamp || Date.now());
              return (
                <li key={r.id} className={`group rounded-lg border ${cx.border} ${cx.card} p-3`}>
                  {editing?.id === r.id ? (
                    <div className="space-y-2">
                      <textarea value={editing.content} onChange={(e) => setEditing({ ...editing, content: e.target.value })} rows={4} className={`${cx.input} w-full font-mono`} aria-label="Edit rant" autoFocus />
                      <div className="flex justify-end gap-2">
                        <button onClick={() => setEditing(null)} className={cx.btnGhost}>Cancel</button>
                        <button onClick={saveEdit} disabled={!editing.content.trim()} className={cx.btnPrimary}>Save</button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <div className="flex items-start gap-2">
                        <p className={`text-sm whitespace-pre-wrap flex-1 min-w-0 ${cx.text}`}>{r.content}</p>
                        <span className="flex gap-0.5 shrink-0 opacity-100 md:opacity-0 md:group-hover:opacity-100 focus-within:opacity-100">
                          <button onClick={() => ui.openQuickAdd(entryToTask(r.content))} className={`p-1 rounded ${cx.hover} ${cx.muted}`} aria-label="Turn into task" title="Turn into task"><ListPlus size={14} /></button>
                          <button onClick={() => setEditing(r)} className={`p-1 rounded ${cx.hover} ${cx.muted}`} aria-label="Edit rant" title="Edit"><Pencil size={14} /></button>
                          <button onClick={() => handleDeleteRant(r)} className={`p-1 rounded ${cx.hover} text-red-500`} aria-label="Delete rant" title="Delete"><Trash2 size={14} /></button>
                        </span>
                      </div>
                      <p className={`text-xs mt-2 ${cx.faint}`}>{at.toLocaleDateString()} at {at.toLocaleTimeString()}</p>
                    </>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
