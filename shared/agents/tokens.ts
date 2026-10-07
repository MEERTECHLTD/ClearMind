/**
 * Agent credentials (MCP / REST API / CLI).
 *
 * Format:  cm_<uid>_<secret>   (secret: 40 random base62 chars)
 * Stored:  users/{uid}/agentTokens/{sha256(token)} — the secret itself is never
 *          stored; it's shown once when created. Tokens carry explicit scopes,
 *          a rate limit, and can be revoked at any time from Settings.
 */
import type { AgentScope } from '../types';

export const TOKEN_PREFIX = 'cm_';
const B62 = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';

export function secretFromBytes(bytes: Uint8Array, len = 40): string {
  let s = '';
  for (let i = 0; i < len; i++) s += B62[bytes[i % bytes.length] % 62];
  return s;
}

export const makeToken = (uid: string, secret: string) => `${TOKEN_PREFIX}${uid}_${secret}`;

export function parseToken(token: string): { uid: string; secret: string } | null {
  if (typeof token !== 'string' || !token.startsWith(TOKEN_PREFIX)) return null;
  const body = token.slice(TOKEN_PREFIX.length);
  const i = body.lastIndexOf('_');
  if (i <= 0) return null;
  const uid = body.slice(0, i);
  const secret = body.slice(i + 1);
  if (!/^[A-Za-z0-9]{20,128}$/.test(uid) || !/^[A-Za-z0-9]{32,}$/.test(secret)) return null;
  return { uid, secret };
}

export const tokenPrefix = (token: string) => `${token.slice(0, 7)}…${token.slice(-4)}`;

export interface ScopeInfo { scope: AgentScope; label: string; detail: string; risky?: boolean }
export const SCOPES: ScopeInfo[] = [
  { scope: 'tasks:read', label: 'Read tasks', detail: 'Inbox, Today, Upcoming, search, comments' },
  { scope: 'tasks:write', label: 'Create & edit tasks', detail: 'Capture, update, complete, move, comment' },
  { scope: 'tasks:delete', label: 'Delete tasks', detail: 'Single deletes (bulk needs “Bulk”)', risky: true },
  { scope: 'projects:read', label: 'Read projects', detail: 'Projects, sections, labels, progress' },
  { scope: 'projects:write', label: 'Manage projects', detail: 'Create/rename/archive projects & sections' },
  { scope: 'projects:delete', label: 'Delete projects', detail: 'Removes a project and its tasks', risky: true },
  { scope: 'productivity:read', label: 'Read productivity', detail: 'Momentum, goals, streaks, history' },
  { scope: 'bulk', label: 'Bulk operations', detail: 'Change or delete many items at once (with confirmation)', risky: true },
];

export const SCOPE_PRESETS: { id: string; label: string; scopes: AgentScope[] }[] = [
  { id: 'read', label: 'Read only', scopes: ['tasks:read', 'projects:read', 'productivity:read'] },
  { id: 'standard', label: 'Standard (no deletes)', scopes: ['tasks:read', 'tasks:write', 'projects:read', 'projects:write', 'productivity:read'] },
  { id: 'full', label: 'Full access', scopes: ['tasks:read', 'tasks:write', 'tasks:delete', 'projects:read', 'projects:write', 'projects:delete', 'productivity:read', 'bulk'] },
];

export const DEFAULT_RATE_LIMIT = 60; // requests per minute
