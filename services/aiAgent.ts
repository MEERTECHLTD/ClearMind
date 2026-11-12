/**
 * Web client for the ClearMind AI agent (POST /api/v1/ai/agent).
 *
 * Claude runs on the server with the full ClearMind tool catalog and writes to
 * the user's data directly; the app's realtime sync shows the changes. The
 * server works within a time budget, so this client keeps calling until the
 * turn is done, reporting progress (actions taken so far) as it goes.
 *
 * The raw transcript (`apiMessages`, including tool calls and thinking blocks)
 * stays in memory for the session and is sent back unchanged each turn.
 */
import { DEFAULT_AI_ENDPOINT, AiProxyError } from '@clearmind/shared/ai/transport';
import { auth } from './firebase';
import { isDesktop } from './desktop';

export interface AgentAction { tool: string; ok: boolean; summary?: string; error?: string }
export type ApiMessage = { role: 'user' | 'assistant'; content: unknown };
interface AgentTurn { messages: ApiMessage[]; done: boolean; reply: string; actions: AgentAction[] }

const VERCEL_ORIGINS = ['https://clearmind.meertech.tech', 'https://clearmind.one', 'https://www.clearmind.one'];
const ENDPOINT =
  typeof window !== 'undefined' && (VERCEL_ORIGINS.includes(window.location.origin) || isDesktop())
    ? '/api/v1/ai/agent'
    : DEFAULT_AI_ENDPOINT.replace(/generate$/, 'agent');

const MAX_ROUNDS = 6;

async function post(messages: ApiMessage[], signal?: AbortSignal): Promise<AgentTurn> {
  const token = auth?.currentUser ? await auth.currentUser.getIdToken() : null;
  if (!token) throw new AiProxyError('unauthorized', 'Sign in to ClearMind to use the AI.', 401);
  let res: Response;
  try {
    res = await fetch(ENDPOINT, {
      method: 'POST', signal,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ messages, timezone: Intl.DateTimeFormat().resolvedOptions().timeZone }),
    });
  } catch (e) {
    if ((e as Error)?.name === 'AbortError') throw e;
    throw new AiProxyError('network', 'Couldn’t reach ClearMind AI. Check your connection.', 0);
  }
  let body: any = null;
  try { body = await res.json(); } catch { /* non-JSON */ }
  if (res.ok && body?.ok) return body.result as AgentTurn;
  throw new AiProxyError(body?.error?.code ?? `http_${res.status}`, body?.error?.message ?? 'ClearMind AI is unavailable right now.', res.status);
}

/** Run one user turn to completion. Returns the new transcript, the reply text and every action taken. */
export async function askAgent(history: ApiMessage[], userText: string, opts: { onProgress?: (p: { actions: AgentAction[]; reply: string }) => void; signal?: AbortSignal } = {}) {
  let messages: ApiMessage[] = [...history, { role: 'user', content: userText }];
  const actions: AgentAction[] = [];
  let reply = '';
  for (let round = 0; round < MAX_ROUNDS; round++) {
    const turn = await post(messages, opts.signal);
    messages = turn.messages;
    actions.push(...turn.actions);
    reply += turn.reply;
    opts.onProgress?.({ actions: [...actions], reply });
    if (turn.done) break;
  }
  return { messages, reply: reply.trim(), actions };
}

/** Rebuild a plain-text transcript (for a conversation loaded from storage). */
export function transcriptFromText(msgs: { role: 'user' | 'model'; text: string }[]): ApiMessage[] {
  const out: ApiMessage[] = [];
  for (const m of msgs) {
    const role = m.role === 'model' ? 'assistant' : 'user';
    if (!out.length && role === 'assistant') continue;
    if (!m.text?.trim()) continue;
    const last = out[out.length - 1];
    if (last && last.role === role) last.content = `${last.content as string}\n\n${m.text}`;
    else out.push({ role, content: m.text });
  }
  if (out.length && out[out.length - 1].role === 'user') out.pop(); // an unanswered user message is resent by the next turn
  return out;
}

const AREA: [RegExp, string][] = [
  [/^tasks?_|inbox_capture/, 'Tasks'], [/^projects?_|^sections_/, 'Projects'], [/^notes_/, 'Notes'], [/^habits_/, 'Habits'], [/^goals_/, 'Goals'],
  [/^milestones_/, 'Milestones'], [/^calendar_/, 'Calendar'], [/^daily_map_/, 'Daily map'], [/^journal_/, 'Journal'], [/^applications_/, 'Applications'],
  [/^learning_/, 'Learning'], [/^mindmaps_/, 'Mind maps'], [/^productivity/, 'Productivity'], [/^search|^fetch|^workspace_/, 'Lookup'], [/^ai_chats_/, 'Chats'],
  [/^labels_|^filters_|^comments_/, 'Tasks'], [/^activity_/, 'Activity'],
];
/** Short label for an action chip: the write summary, or "Read <area>". */
export function actionLabel(a: AgentAction): string {
  if (!a.ok) return a.error ? `Couldn’t: ${a.error}` : 'Action failed';
  if (a.summary) return a.summary.charAt(0).toUpperCase() + a.summary.slice(1);
  const area = AREA.find(([re]) => re.test(a.tool))?.[1] ?? 'ClearMind';
  return `Checked ${area.toLowerCase()}`;
}
export const isWrite = (a: AgentAction) => a.ok && !!a.summary;
