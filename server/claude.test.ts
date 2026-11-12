/** Agent loop with a mocked Claude: no network, no credits. */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createHash } from 'node:crypto';

const calls: any[] = [];
let script: any[] = [];
vi.mock('@anthropic-ai/sdk', () => {
  class APIError extends Error {}
  class Anthropic {
    static AuthenticationError = class extends APIError {};
    static PermissionDeniedError = class extends APIError {};
    static RateLimitError = class extends APIError {};
    static APIConnectionTimeoutError = class extends APIError {};
    static BadRequestError = class extends APIError {};
    beta = { messages: { create: async (body: any) => { calls.push(JSON.parse(JSON.stringify(body))); return script.shift(); } } };
  }
  return { default: Anthropic };
});

import { runAgent, toClaudeMessages, agentTools, validateAgentMessages, generateText } from './claude';
import type { AgentRepo, AuthContext, FullState } from '../shared/agents/tools';
import { stampEdit } from '../shared/sync/fields';

const sha256 = async (s: string) => createHash('sha256').update(s).digest('hex');
class Mem implements AgentRepo {
  d = new Map<string, Map<string, any>>();
  c(n: string) { let m = this.d.get(n); if (!m) this.d.set(n, (m = new Map())); return m; }
  a(n: string) { return [...this.c(n).values()]; }
  async loadState(): Promise<FullState> { return { tasks: this.a('tasks'), projects: this.a('projects'), labels: this.a('labels'), sections: this.a('sections'), comments: [], completions: this.a('completions'), filters: [], preferences: null, notes: this.a('notes') }; }
  async loadCollections(_u: string, cs: string[]) { return Object.fromEntries(cs.map((x) => [x, this.a(x)])); }
  async commit(_u: string, edits: any[]) { for (const e of edits) this.c(e.coll).set(e.id, stampEdit(this.c(e.coll).get(e.id), { ...e.edit, id: e.id }, { clientId: 't', mutationId: 'm' }).record); }
  async getToken() { return null; } async touchToken() {} async audit() {} async recentActivity() { return []; }
}
const auth: AuthContext = { uid: 'u1', tokenHash: 'inapp-u1', source: 'ai', token: { id: 'in-app', name: 'ClearMind AI', scopes: ['tasks:read', 'tasks:write', 'life:read', 'life:write', 'life:delete', 'projects:read'], createdAt: '', prefix: 'app', rateLimit: 999, scopeVersion: 2 } };

beforeEach(() => { calls.length = 0; script = []; process.env.AI_MODEL = ''; });

describe('ClearMind AI agent', () => {
  it('executes tool calls against real data and returns an append-only transcript', async () => {
    const repo = new Mem();
    script = [
      { stop_reason: 'tool_use', content: [{ type: 'thinking', thinking: '', signature: 'sig' }, { type: 'tool_use', id: 't1', name: 'habits_save', input: { name: 'Meditate' } }, { type: 'tool_use', id: 't2', name: 'tasks_create', input: { title: 'Call mum', due_string: 'tomorrow 9am' } }] },
      { stop_reason: 'end_turn', content: [{ type: 'text', text: 'Done: habit and task added.' }] },
    ];
    const turn = await runAgent({ apiKey: 'k', repo, auth, messages: [{ role: 'user', content: 'Add a meditate habit and remind me to call mum tomorrow 9am' }], timezone: 'Africa/Lagos', sha256 });
    expect(turn.done).toBe(true);
    expect(turn.reply).toBe('Done: habit and task added.');
    expect(turn.actions.map((a) => [a.tool, a.ok])).toEqual([['habits_save', true], ['tasks_create', true]]);
    expect(repo.a('habits')[0].name).toBe('Meditate');
    expect(repo.a('tasks')[0]).toMatchObject({ title: 'Call mum', source: 'ai', agent: 'ClearMind AI' });
    // transcript: user, assistant(thinking+tools, unchanged), user(both results in ONE message), assistant
    expect(turn.messages.map((m) => m.role)).toEqual(['user', 'assistant', 'user', 'assistant']);
    expect((turn.messages[1].content as any[])[0]).toEqual({ type: 'thinking', thinking: '', signature: 'sig' });
    expect((turn.messages[2].content as any[]).map((b) => b.tool_use_id)).toEqual(['t1', 't2']);
    // request shape
    expect(calls[0].model).toBe('claude-opus-5-5');
    expect(calls[0].fallbacks).toBe('default');
    expect(calls[0].thinking).toBeUndefined();
    expect(calls[0].tools.some((t: any) => t.name === 'calendar_save')).toBe(true);
    expect(calls[0].tools.some((t: any) => t.type === 'web_search_20260209')).toBe(true);
    expect(calls[0].system[1].text).toContain('Africa/Lagos');
  });

  it('reports tool errors back to Claude instead of throwing', async () => {
    const repo = new Mem();
    script = [
      { stop_reason: 'tool_use', content: [{ type: 'tool_use', id: 'x', name: 'goals_save', input: { id: 'nope', progress: 5 } }] },
      { stop_reason: 'end_turn', content: [{ type: 'text', text: 'That goal does not exist.' }] },
    ];
    const turn = await runAgent({ apiKey: 'k', repo, auth, messages: [{ role: 'user', content: 'x' }], timezone: null, sha256 });
    expect(turn.actions[0]).toMatchObject({ tool: 'goals_save', ok: false });
    expect((turn.messages[2].content as any[])[0].is_error).toBe(true);
  });

  it('stops at the time budget and lets the client continue', async () => {
    const repo = new Mem();
    script = [{ stop_reason: 'tool_use', content: [{ type: 'tool_use', id: 'a', name: 'habits_list', input: {} }] }];
    const turn = await runAgent({ apiKey: 'k', repo, auth, messages: [{ role: 'user', content: 'x' }], timezone: null, sha256, budgetMs: -1 });
    expect(turn.done).toBe(false);
    expect(turn.messages[turn.messages.length - 1].role).toBe('user');
  });

  it('only offers tools the scopes allow, and validates transcripts', () => {
    const names = agentTools(['life:read']).map((t: any) => t.name);
    expect(names).toContain('habits_list');
    expect(names).not.toContain('habits_save');
    expect(validateAgentMessages([{ role: 'assistant', content: 'hi' }]).ok).toBe(false);
    expect(validateAgentMessages([{ role: 'user', content: 'hi' }]).ok).toBe(true);
  });

  it('maps the legacy generate contract (roles, web tools)', async () => {
    expect(toClaudeMessages([{ role: 'model', parts: [{ text: 'Hi, I am Iris' }] }, { role: 'user', parts: [{ text: 'a' }] }, { role: 'user', parts: [{ text: 'b' }] }]))
      .toEqual([{ role: 'user', content: 'a\n\nb' }]);
    script = [{ stop_reason: 'end_turn', content: [{ type: 'text', text: 'review' }] }];
    expect(await generateText({ contents: [{ role: 'user', parts: [{ text: 'Review https://x.org' }] }], tools: ['urlContext', 'googleSearch'] }, 'k')).toBe('review');
    expect(calls[0].tools.map((t: any) => t.type).sort()).toEqual(['web_fetch_20260209', 'web_search_20260209']);
  });
});
