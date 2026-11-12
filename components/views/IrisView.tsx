/**
 * Iris — the ClearMind AI, rebuilt on Claude.
 *
 * Iris is an agent, not a chatbot: on the server Claude has the same tool
 * catalog as MCP clients (tasks, projects + plans + notes, notes vault, habits,
 * goals, milestones, calendar, daily map, journal, applications, learning
 * vault, mind maps, productivity, web search) and reads/creates/updates/deletes
 * the user's data directly. Changes arrive here through realtime sync.
 */
import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { marked } from 'marked';
import DOMPurify from 'dompurify';
import { ArrowUp, Square, Trash2, Sparkles, Check, AlertCircle, Search, Sun, CalendarRange, ListChecks, Flame, Briefcase, NotebookPen, Network } from 'lucide-react';
import { askAgent, transcriptFromText, actionLabel, isWrite, type ApiMessage } from '../../services/aiAgent';
import { isApiConfigured } from '../../services/geminiService';
import { dbService, STORES } from '../../services/db';
import { syncNow } from '../../services/syncEngine';
import type { ChatMessage, IrisConversation } from '../../types';
import { cx, IconBtn } from '../ui-kit';

const CONVERSATION_ID = 'current-iris-conversation';

const AUTOMATIONS: { icon: React.ReactNode; title: string; prompt: string; tint: string }[] = [
  { icon: <Sun size={18} />, title: 'Plan my day', tint: 'from-amber-400 to-orange-500', prompt: 'Plan my day: look at overdue and today’s tasks, my calendar, habits and daily map, then build a realistic time-blocked plan for today in my daily map and tell me the top 3 things to focus on.' },
  { icon: <ListChecks size={18} />, title: 'Clear my inbox', tint: 'from-sky-400 to-blue-600', prompt: 'Go through my task inbox: give each item a sensible project, priority and date, and file it. Tell me what you did.' },
  { icon: <CalendarRange size={18} />, title: 'Weekly review', tint: 'from-violet-400 to-purple-600', prompt: 'Run my weekly review: what I completed, overdue work (reschedule it sensibly), project health and risks, goal progress, habit streaks, upcoming application deadlines, and my top 3 priorities for next week.' },
  { icon: <Flame size={18} />, title: 'Habits check-in', tint: 'from-rose-400 to-red-500', prompt: 'How are my habits going? Show streaks, tell me which ones I still need to do today, and encourage me.' },
  { icon: <Briefcase size={18} />, title: 'Deadlines ahead', tint: 'from-emerald-400 to-teal-600', prompt: 'What deadlines are coming up in the next 14 days across tasks, applications, goals and calendar? Flag anything at risk and create tasks for missing preparation steps.' },
  { icon: <NotebookPen size={18} />, title: 'Journal for me', tint: 'from-fuchsia-400 to-pink-600', prompt: 'Write today’s journal entry from what I actually did today (completed tasks, habits, time blocks). Pick the mood that fits and save it.' },
];

const md = (text: string) => DOMPurify.sanitize(marked.parse(text, { async: false, breaks: true, gfm: true }) as string, { FORBID_TAGS: ['style', 'form', 'img'], ADD_ATTR: ['target'] });

const newId = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
const greeting = (): ChatMessage => ({
  id: 'init', role: 'model', timestamp: new Date(),
  text: 'Hi, I’m Iris. I can see and change everything in ClearMind: tasks, projects, notes, habits, goals, calendar, your daily map, journal, applications and learning. Tell me what you need, or pick an automation below.',
});

function Orb({ size = 32, busy = false }: { size?: number; busy?: boolean }) {
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }} aria-hidden>
      <div className={`absolute inset-0 rounded-full bg-gradient-to-br from-indigo-500 via-violet-500 to-fuchsia-500 shadow-[0_4px_16px_-4px_rgba(139,92,246,0.6)] ${busy ? 'animate-pulse' : ''}`} />
      <div className="absolute inset-[3px] rounded-full bg-gradient-to-br from-white/40 to-transparent" />
      <Sparkles size={size * 0.45} className="absolute inset-0 m-auto text-white drop-shadow" />
    </div>
  );
}

function ActionChips({ actions }: { actions: NonNullable<ChatMessage['actions']> }) {
  const writes = actions.filter((a) => a.write || !a.ok);
  const reads = actions.length - writes.length;
  if (!actions.length) return null;
  return (
    <div className="flex flex-wrap gap-1.5 mt-2">
      {writes.map((a, i) => (
        <span key={i} className={`inline-flex items-center gap-1 text-[11px] font-medium px-2 py-1 rounded-full ${a.ok ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300' : 'bg-red-50 text-red-600 dark:bg-red-500/10 dark:text-red-300'}`}>
          {a.ok ? <Check size={12} /> : <AlertCircle size={12} />}{a.label}
        </span>
      ))}
      {reads ? <span className={`inline-flex items-center gap-1 text-[11px] px-2 py-1 rounded-full bg-gray-100 dark:bg-white/5 ${cx.muted}`}><Search size={12} />Looked at {reads} thing{reads === 1 ? '' : 's'}</span> : null}
    </div>
  );
}

const IrisView: React.FC = () => {
  const [messages, setMessages] = useState<ChatMessage[]>([greeting()]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<NonNullable<ChatMessage['actions']>>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const transcript = useRef<ApiMessage[] | null>(null);
  const abort = useRef<AbortController | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const ready = isApiConfigured();

  const save = useCallback(async (msgs: ChatMessage[]) => {
    const now = new Date().toISOString();
    const firstUser = msgs.find((m) => m.role === 'user')?.text ?? '';
    const conv: IrisConversation = { id: CONVERSATION_ID, messages: msgs, createdAt: msgs[0]?.timestamp ? new Date(msgs[0].timestamp).toISOString() : now, updatedAt: now, title: firstUser.slice(0, 60) || 'Iris' };
    try { await dbService.put(STORES.IRIS_CONVERSATIONS, conv); } catch { /* storage is best effort */ }
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const c = await dbService.get<IrisConversation>(STORES.IRIS_CONVERSATIONS, CONVERSATION_ID);
        if (c?.messages?.length) setMessages(c.messages.map((m) => ({ ...m, timestamp: new Date(m.timestamp) })));
      } catch { /* fresh start */ }
      setLoading(false);
    })();
  }, []);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }); }, [messages, progress, busy]);

  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
  }, [input]);

  const send = async (text: string) => {
    const t = text.trim();
    if (!t || busy) return;
    setError(null);
    const userMsg: ChatMessage = { id: newId(), role: 'user', text: t, timestamp: new Date() };
    const base = [...messages, userMsg];
    setMessages(base);
    setInput('');
    setBusy(true);
    setProgress([]);
    const history = transcript.current ?? transcriptFromText(messages.filter((m) => m.id !== 'init'));
    const ctrl = new AbortController();
    abort.current = ctrl;
    try {
      const r = await askAgent(history, t, {
        signal: ctrl.signal,
        onProgress: ({ actions }) => setProgress(actions.map((a) => ({ label: actionLabel(a), ok: a.ok, write: isWrite(a) }))),
      });
      transcript.current = r.messages;
      const reply: ChatMessage = { id: newId(), role: 'model', text: r.reply || 'Done.', timestamp: new Date(), actions: r.actions.map((a) => ({ label: actionLabel(a), ok: a.ok, write: isWrite(a) })) };
      const next = [...base, reply];
      setMessages(next);
      void save(next);
      if (r.actions.some(isWrite)) void syncNow().catch(() => undefined);
    } catch (e: any) {
      if (e?.name !== 'AbortError') setError(e?.message ?? 'Something went wrong. Try again.');
      void save(base);
      transcript.current = null; // rebuild from text on the next turn
    } finally {
      setBusy(false);
      setProgress([]);
      abort.current = null;
    }
  };

  const clear = async () => {
    abort.current?.abort();
    transcript.current = null;
    const fresh = [greeting()];
    setMessages(fresh);
    setError(null);
    try { await dbService.delete(STORES.IRIS_CONVERSATIONS, CONVERSATION_ID); } catch { /* ignore */ }
  };

  const empty = useMemo(() => messages.filter((m) => m.id !== 'init').length === 0, [messages]);

  return (
    <div className="h-full flex flex-col overflow-hidden bg-white dark:bg-[#05050A]">
      <header className="shrink-0 border-b border-gray-100 dark:border-white/5 bg-white/80 dark:bg-[#05050A]/80 backdrop-blur-xl">
        <div className="max-w-3xl mx-auto px-4 sm:px-8 py-4 flex items-center gap-3">
          <Orb size={36} busy={busy} />
          <div className="flex-1 min-w-0">
            <h1 className={`text-lg font-semibold tracking-tight ${cx.text}`}>Iris</h1>
            <p className={`text-xs ${cx.muted}`}>{busy ? 'Working on it…' : 'Your AI with full access to ClearMind'}</p>
          </div>
          {!empty ? <IconBtn label="New conversation" onClick={clear}><Trash2 size={16} /></IconBtn> : null}
        </div>
      </header>

      <div className="flex-1 overflow-y-auto">
        <div className="max-w-3xl mx-auto px-4 sm:px-8 py-6 space-y-6">
          {loading ? null : messages.map((m) => (
            <div key={m.id} className={`flex gap-3 ${m.role === 'user' ? 'justify-end' : ''}`}>
              {m.role === 'model' ? <Orb size={28} /> : null}
              <div className={m.role === 'user' ? 'max-w-[85%]' : 'flex-1 min-w-0'}>
                {m.role === 'user' ? (
                  <div className="rounded-2xl rounded-br-md px-4 py-2.5 text-[15px] leading-relaxed whitespace-pre-wrap bg-gradient-to-br from-indigo-500 to-violet-600 text-white shadow-sm">{m.text}</div>
                ) : (
                  <>
                    <div className={`iris-md text-[15px] leading-relaxed ${cx.text}`} dangerouslySetInnerHTML={{ __html: md(m.text) }} />
                    {m.actions?.length ? <ActionChips actions={m.actions} /> : null}
                  </>
                )}
              </div>
            </div>
          ))}

          {empty && !loading ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
              {AUTOMATIONS.map((a) => (
                <button key={a.title} type="button" disabled={!ready || busy} onClick={() => send(a.prompt)}
                  className="group text-left rounded-2xl border border-gray-200/70 dark:border-white/10 bg-white dark:bg-white/[0.03] p-4 hover:shadow-lg hover:-translate-y-0.5 transition-all disabled:opacity-50 disabled:hover:translate-y-0">
                  <span className={`inline-flex w-9 h-9 rounded-xl items-center justify-center text-white bg-gradient-to-br ${a.tint} shadow-sm`}>{a.icon}</span>
                  <span className={`block mt-3 font-semibold text-sm ${cx.text}`}>{a.title}</span>
                  <span className={`block mt-1 text-xs line-clamp-2 ${cx.muted}`}>{a.prompt}</span>
                </button>
              ))}
            </div>
          ) : null}

          {busy ? (
            <div className="flex gap-3" aria-live="polite">
              <Orb size={28} busy />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5 h-7" aria-label="Iris is working">
                  {[0, 150, 300].map((d) => <span key={d} className="w-1.5 h-1.5 rounded-full bg-violet-500 animate-bounce" style={{ animationDelay: `${d}ms` }} />)}
                </div>
                {progress.length ? <ActionChips actions={progress} /> : null}
              </div>
            </div>
          ) : null}

          {error ? (
            <div role="alert" className="flex items-start gap-2 text-sm rounded-xl px-3 py-2.5 bg-red-50 text-red-700 dark:bg-red-500/10 dark:text-red-300"><AlertCircle size={16} className="mt-0.5 shrink-0" />{error}</div>
          ) : null}
          {!ready && !loading ? (
            <div className={`text-sm rounded-xl px-3 py-2.5 bg-amber-50 text-amber-800 dark:bg-amber-500/10 dark:text-amber-200`}>Sign in with your ClearMind account to use Iris.</div>
          ) : null}
          <div ref={bottomRef} />
        </div>
      </div>

      <div className="shrink-0 px-4 sm:px-8 pb-5 pt-2">
        <form className="max-w-3xl mx-auto" onSubmit={(e) => { e.preventDefault(); void send(input); }}>
          <div className="flex items-end gap-2 rounded-3xl border border-gray-200 dark:border-white/10 bg-white dark:bg-white/[0.04] shadow-[0_8px_30px_-12px_rgba(0,0,0,0.25)] pl-4 pr-2 py-2 focus-within:ring-2 focus-within:ring-violet-500/40 transition">
            <label htmlFor="iris-input" className="sr-only">Message Iris</label>
            <textarea
              id="iris-input" ref={inputRef} rows={1} value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void send(input); } }}
              placeholder="Ask Iris to plan, add, update, review… anything in ClearMind"
              className={`flex-1 resize-none bg-transparent outline-none py-2 text-[15px] max-h-[200px] ${cx.text} placeholder:text-gray-400`}
            />
            {busy ? (
              <button type="button" onClick={() => abort.current?.abort()} aria-label="Stop" title="Stop" className="w-9 h-9 rounded-full flex items-center justify-center bg-gray-900 text-white dark:bg-white dark:text-gray-900"><Square size={14} fill="currentColor" /></button>
            ) : (
              <button type="submit" disabled={!input.trim() || !ready} aria-label="Send" title="Send" className="w-9 h-9 rounded-full flex items-center justify-center bg-gradient-to-br from-indigo-500 to-violet-600 text-white disabled:opacity-30 transition"><ArrowUp size={18} /></button>
            )}
          </div>
          <p className={`text-center text-[11px] mt-2 ${cx.faint}`}><Network size={11} className="inline -mt-0.5 mr-1" />Iris acts on your data. Deleting several items always asks you first.</p>
        </form>
      </div>
    </div>
  );
};

export default IrisView;
