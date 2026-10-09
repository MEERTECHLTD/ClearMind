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
/** Access tokens issued to connectors expire (clients refresh via expires_in / on 401). */
export const OAUTH_ACCESS_TTL_MS = 24 * 60 * 60 * 1000;
/** Refresh tokens rotate on every use; an unused one dies after this long. */
export const OAUTH_REFRESH_TTL_MS = 90 * 24 * 60 * 60 * 1000;
/** Shape of the ids we issue (validated before they are used in a Firestore path). */
export const CLIENT_ID_RE = /^cmc_[A-Za-z0-9]{24}$/;
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
  if (u.hash || uri.length > 2000 || u.username || u.password) return false;
  if (u.protocol === 'https:') return true;
  if (u.protocol === 'http:' && (u.hostname === 'localhost' || u.hostname === '127.0.0.1' || u.hostname === '[::1]')) return true;
  // Native app custom schemes (e.g. cursor://, vscode://, com.example.app:/cb).
  return /^[a-z][a-z0-9+.-]*:$/.test(u.protocol) && !BLOCKED_SCHEMES.includes(u.protocol);
}

/** Schemes that are never a legitimate OAuth redirect (script execution, local files, browser internals). */
const BLOCKED_SCHEMES = ['javascript:', 'vbscript:', 'data:', 'file:', 'http:', 'blob:', 'about:', 'filesystem:', 'ws:', 'wss:', 'ftp:', 'mailto:', 'tel:', 'sms:', 'chrome:', 'chrome-extension:', 'moz-extension:', 'view-source:', 'intent:'];

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
  if (!body || typeof body !== 'object' || Array.isArray(body)) return { ok: false, error: 'invalid_client_metadata', description: 'Body must be a JSON object' };
  const uris = Array.isArray(body.redirect_uris) ? body.redirect_uris.filter((x): x is string => typeof x === 'string') : [];
  if (!uris.length) return { ok: false, error: 'invalid_redirect_uri', description: 'redirect_uris is required' };
  if (uris.length > 10) return { ok: false, error: 'invalid_client_metadata', description: 'Too many redirect_uris' };
  if (uris.some((u) => !isAllowedRedirect(u))) return { ok: false, error: 'invalid_redirect_uri', description: 'A redirect URI is not allowed (https, loopback http, or a native-app scheme; no fragments)' };
  const method = body.token_endpoint_auth_method ?? 'none';
  if (method !== 'none') return { ok: false, error: 'invalid_client_metadata', description: 'Only public clients (token_endpoint_auth_method "none" with PKCE) are supported' };
  // Strip control / bidi characters, cap length.
  const raw = String(body.client_name ?? '').replace(/[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u202a-\u202e\u2066-\u2069]/g, '').trim().slice(0, 80);
  const name = !raw ? hostLabel(uris[0]) : impersonatesKnownClient(raw, uris) ? `${raw} (via ${hostOf(uris[0])})` : raw;
  const clientUri = typeof body.client_uri === 'string' && /^https:\/\/[^\s]{1,500}$/.test(body.client_uri) ? body.client_uri : undefined;
  return { ok: true, client: { client_name: name, redirect_uris: uris, ...(clientUri ? { client_uri: clientUri } : {}) } };
}

const KNOWN_CLIENTS: { pattern: RegExp; domains: string[] }[] = [
  { pattern: /claude|anthropic/i, domains: ['claude.ai', 'anthropic.com', 'claude.com'] },
  { pattern: /chatgpt|openai/i, domains: ['chatgpt.com', 'openai.com'] },
];
const hostOf = (uri: string) => { try { return new URL(uri).host || new URL(uri).protocol.replace(/:$/, ''); } catch { return 'unknown'; } };
const onDomain = (host: string, domain: string) => host === domain || host.endsWith(`.${domain}`);

/**
 * A self-registered client calling itself "Claude"/"ChatGPT" while redirecting
 * elsewhere is a consent-phishing attempt: the name gets the real redirect
 * host appended so the consent page can't be used to impersonate them.
 */
export function impersonatesKnownClient(name: string, uris: string[]): boolean {
  return KNOWN_CLIENTS.some((k) => k.pattern.test(name) && uris.some((u) => {
    let h = '';
    try { const x = new URL(u); h = x.hostname; if (x.protocol === 'http:') return false; } catch { return true; } // loopback dev clients are fine
    return !k.domains.some((d) => onDomain(h, d));
  }));
}

/** Friendly name for a client from its redirect host (claude.ai → Claude, chatgpt.com → ChatGPT). */
export function hostLabel(uri: string): string {
  try {
    const h = new URL(uri).hostname.replace(/^www\./, '');
    if (['claude.ai', 'anthropic.com', 'claude.com'].some((d) => onDomain(h, d))) return 'Claude';
    if (['chatgpt.com', 'openai.com'].some((d) => onDomain(h, d))) return 'ChatGPT';
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
