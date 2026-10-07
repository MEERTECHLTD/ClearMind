/**
 * Client-side management of agent tokens (web + mobile, Firebase JS SDK).
 * The token secret is generated on the device, shown once, and only its
 * SHA-256 hash is stored (users/{uid}/agentTokens/{hash}). Revocation takes
 * effect on the agent's very next request.
 */
import { collection, doc, setDoc, updateDoc, onSnapshot, query, orderBy, limit as qlimit, getDocs, writeBatch, type Firestore } from 'firebase/firestore';
import type { AgentScope, AgentToken, AgentAudit } from '../types';
import { makeToken, secretFromBytes, tokenPrefix, DEFAULT_RATE_LIMIT } from '../agents/tokens';

export interface CryptoDeps { sha256: (s: string) => Promise<string>; randomBytes: (n: number) => Uint8Array }

export async function createAgentToken(db: Firestore, uid: string, input: { name: string; scopes: AgentScope[]; rateLimit?: number }, c: CryptoDeps): Promise<{ token: string; record: AgentToken }> {
  const name = input.name.trim().slice(0, 60) || 'AI agent';
  if (!input.scopes.length) throw new Error('Pick at least one permission');
  const token = makeToken(uid, secretFromBytes(c.randomBytes(48)));
  const id = await c.sha256(token);
  const record: AgentToken = { id, name, scopes: input.scopes, createdAt: new Date().toISOString(), lastUsedAt: null, revoked: false, revokedAt: null, rateLimit: input.rateLimit ?? DEFAULT_RATE_LIMIT, prefix: tokenPrefix(token) };
  await setDoc(doc(db, `users/${uid}/agentTokens/${id}`), record);
  return { token, record };
}

export const revokeAgentToken = (db: Firestore, uid: string, id: string) =>
  updateDoc(doc(db, `users/${uid}/agentTokens/${id}`), { revoked: true, revokedAt: new Date().toISOString() });

export async function revokeAllAgentTokens(db: Firestore, uid: string): Promise<number> {
  const s = await getDocs(collection(db, `users/${uid}/agentTokens`));
  const live = s.docs.filter((d) => !d.data().revoked);
  const b = writeBatch(db);
  for (const d of live) b.update(d.ref, { revoked: true, revokedAt: new Date().toISOString() });
  if (live.length) await b.commit();
  return live.length;
}

export const subscribeAgentTokens = (db: Firestore, uid: string, cb: (t: AgentToken[]) => void, onError?: (e: unknown) => void) =>
  onSnapshot(collection(db, `users/${uid}/agentTokens`), (s) => cb(s.docs.map((d) => ({ ...(d.data() as AgentToken), id: d.id })).sort((a, b) => b.createdAt.localeCompare(a.createdAt))), onError);

export const subscribeAgentAudit = (db: Firestore, uid: string, cb: (a: AgentAudit[]) => void, n = 50) =>
  onSnapshot(query(collection(db, `users/${uid}/agentAudit`), orderBy('at', 'desc'), qlimit(n)), (s) => cb(s.docs.map((d) => d.data() as AgentAudit)), () => cb([]));

/** Setup snippets shown after a token is created. */
export function connectionSnippets(token: string, apiBase = 'https://clearmind.meertech.tech/api', localPath = '/path/to/ClearMind/dist-agent/clearmind-mcp.mjs') {
  return {
    claudeCodeHttp: `claude mcp add --transport http clearmind ${apiBase}/mcp --header "Authorization: Bearer ${token}"`,
    claudeCodeLocal: `claude mcp add clearmind -e CLEARMIND_TOKEN=${token} -- node ${localPath}`,
    codexToml: `[mcp_servers.clearmind]\ncommand = "node"\nargs = ["${localPath}"]\nenv = { CLEARMIND_TOKEN = "${token}" }`,
    curl: `curl -X POST ${apiBase}/v1/tools/inbox_capture -H "Authorization: Bearer ${token}" -H "Content-Type: application/json" -d '{"text":"Call Ahmed tomorrow 9am p1"}'`,
    cli: `clearmind login ${token}`,
  };
}
