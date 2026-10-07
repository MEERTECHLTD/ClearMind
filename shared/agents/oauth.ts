/**
 * OAuth 2.1 for remote MCP connectors (claude.ai, ChatGPT, any MCP client that
 * speaks the MCP authorization spec): Protected Resource Metadata (RFC 9728),
 * Authorization Server Metadata (RFC 8414), Dynamic Client Registration
 * (RFC 7591) for public clients, and the authorization-code flow with PKCE S256.
 *
 * The access token handed to the connector IS a normal ClearMind agent token
 * (cm_<uid>_<secret>, stored hashed, scoped, rate-limited, revocable in
 * Settings → Integrations), so every tool, audit log and revoke path is shared.
 * Pure helpers only — storage lives in api-src/oauth.ts.
 */
import type { AgentScope } from '../types';
import { SCOPES, SCOPE_PRESETS } from './tokens';

export const OAUTH_CODE_TTL_MS = 5 * 60 * 1000;
export const ALL_SCOPES: AgentScope[] = SCOPES.map((s) => s.scope);
/** What a connector gets when it doesn't ask for specific scopes. */
export const DEFAULT_CONNECTOR_SCOPES: AgentScope[] = SCOPE_PRESETS.find((p) => p.id === 'standard')!.scopes;

export function base64url(bytes: Uint8Array): string {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** RFC 7636 S256: BASE64URL(SHA256(verifier)) === challenge. */
export async function verifyPkce(verifier: string, challenge: string, sha256Bytes: (s: string) => Promise<Uint8Array>): Promise<boolean> {
  if (!/^[A-Za-z0-9\-._~]{43,128}$/.test(verifier ?? '')) return false;
  return base64url(await sha256Bytes(verifier)) === challenge;
}

/**
 * Redirect URIs a public client may register: https anywhere (claude.ai,
 * chatgpt.com, …) or http(s) loopback for local/desktop clients. No fragments.
 */
export function isAllowedRedirect(uri: string): boolean {
  let u: URL;
  try { u = new URL(uri); } catch { return false; }
  if (u.hash) return false;
  if (u.protocol === 'https:') return true;
  if (u.protocol === 'http:' && (u.hostname === 'localhost' || u.hostname === '127.0.0.1' || u.hostname === '[::1]')) return true;
  // Native app custom schemes (e.g. cursor://, vscode://) — must contain a dot-less scheme and a path/host.
  return /^[a-z][a-z0-9+.-]*:$/.test(u.protocol) && !['javascript:', 'data:', 'file:', 'http:'].includes(u.protocol);
}

/** Exact match, except loopback redirects may vary the port (RFC 8252 §7.3). */
export function redirectMatches(registered: string[], uri: string): boolean {
  if (registered.includes(uri)) return true;
  try {
    const u = new URL(uri);
    if (u.protocol !== 'http:' || !['localhost', '127.0.0.1', '[::1]'].includes(u.hostname)) return false;
    return registered.some((r) => { try { const x = new URL(r); return x.protocol === u.protocol && x.hostname === u.hostname && x.pathname === u.pathname; } catch { return false; } });
  } catch { return false; }
}

/** Space-separated scope string → known scopes (unknown ones dropped); empty → default. */
export function parseScopes(scope: string | null | undefined): AgentScope[] {
  const want = String(scope ?? '').split(/[\s,]+/).filter(Boolean);
  const known = want.filter((s): s is AgentScope => (ALL_SCOPES as string[]).includes(s));
  return known.length ? [...new Set(known)] : DEFAULT_CONNECTOR_SCOPES;
}

export interface ClientRegistrationInput { client_name?: string; redirect_uris?: unknown; grant_types?: unknown; response_types?: unknown; token_endpoint_auth_method?: string; client_uri?: string; logo_uri?: string }

/** Validate an RFC 7591 registration request for a public (PKCE) client. */
export function validateRegistration(body: ClientRegistrationInput): { ok: true; client: { client_name: string; redirect_uris: string[]; client_uri?: string } } | { ok: false; error: string; description: string } {
  const uris = Array.isArray(body?.redirect_uris) ? body.redirect_uris.filter((x): x is string => typeof x === 'string') : [];
  if (!uris.length) return { ok: false, error: 'invalid_redirect_uri', description: 'redirect_uris is required' };
  const bad = uris.find((u) => !isAllowedRedirect(u));
  if (bad) return { ok: false, error: 'invalid_redirect_uri', description: `Redirect URI not allowed: ${bad}` };
  if (uris.length > 10) return { ok: false, error: 'invalid_client_metadata', description: 'Too many redirect_uris' };
  const method = body.token_endpoint_auth_method ?? 'none';
  if (method !== 'none') return { ok: false, error: 'invalid_client_metadata', description: 'Only public clients (token_endpoint_auth_method "none" with PKCE) are supported' };
  const name = String(body.client_name ?? '').trim().slice(0, 80) || hostLabel(uris[0]);
  return { ok: true, client: { client_name: name, redirect_uris: uris, ...(typeof body.client_uri === 'string' ? { client_uri: body.client_uri } : {}) } };
}

/** Friendly name for a client from its redirect host (claude.ai → Claude, chatgpt.com → ChatGPT). */
export function hostLabel(uri: string): string {
  try {
    const h = new URL(uri).hostname.replace(/^www\./, '');
    if (h.endsWith('claude.ai') || h.endsWith('anthropic.com')) return 'Claude';
    if (h.endsWith('chatgpt.com') || h.endsWith('openai.com')) return 'ChatGPT';
    return h || 'MCP client';
  } catch { return 'MCP client'; }
}

export function protectedResourceMetadata(origin: string) {
  return {
    resource: `${origin}/api/mcp`,
    authorization_servers: [origin],
    scopes_supported: ALL_SCOPES,
    bearer_methods_supported: ['header'],
    resource_name: 'ClearMind',
    resource_documentation: `${origin}/privacy.html`,
  };
}

export function authorizationServerMetadata(origin: string) {
  return {
    issuer: origin,
    authorization_endpoint: `${origin}/oauth/authorize`,
    token_endpoint: `${origin}/api/oauth/token`,
    registration_endpoint: `${origin}/api/oauth/register`,
    revocation_endpoint: `${origin}/api/oauth/revoke`,
    scopes_supported: ALL_SCOPES,
    response_types_supported: ['code'],
    response_modes_supported: ['query'],
    grant_types_supported: ['authorization_code', 'refresh_token'],
    token_endpoint_auth_methods_supported: ['none'],
    revocation_endpoint_auth_methods_supported: ['none'],
    code_challenge_methods_supported: ['S256'],
    service_documentation: `${origin}/privacy.html`,
  };
}

/** Build the client redirect with code/state (or error) appended. */
export function redirectWith(uri: string, params: Record<string, string | undefined | null>): string {
  const u = new URL(uri);
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null && v !== '') u.searchParams.set(k, v);
  return u.toString();
}
