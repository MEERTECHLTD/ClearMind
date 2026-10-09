/**
 * Shared HTTP plumbing for the Vercel functions (api/v1, api/mcp, api/oauth):
 * request ids, structured logs with secret redaction, bounded body parsing,
 * CORS policies, client IP and timeouts.
 */
import type { IncomingMessage, ServerResponse } from 'node:http';
import { randomUUID } from 'node:crypto';

export type Req = IncomingMessage & { body?: unknown };

/** An error that maps to a specific HTTP status + stable code (never carries internals). */
export class HttpError extends Error {
  constructor(public status: number, public code: string, message: string) { super(message); }
}

export function bearer(req: IncomingMessage): string | null {
  const h = req.headers.authorization ?? '';
  const m = /^Bearer\s+(.+)$/i.exec(Array.isArray(h) ? h[0] : h);
  return m ? m[1].trim() : null;
}

export const MAX_JSON_BYTES = 1_000_000;
export const MAX_FORM_BYTES = 64 * 1024;

async function readRaw(req: Req, limit: number): Promise<string> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const c of req) {
    size += (c as Buffer).length;
    if (size > limit) throw new HttpError(413, 'payload_too_large', `Request body exceeds ${limit} bytes.`);
    chunks.push(c as Buffer);
  }
  return Buffer.concat(chunks).toString('utf8');
}

function parseJson(raw: string): any {
  if (!raw) return null;
  try { return JSON.parse(raw); } catch { throw new HttpError(400, 'invalid_json', 'Request body is not valid JSON.'); }
}

/** JSON body (Vercel may have pre-parsed it into req.body). Throws HttpError 400/413. */
export async function readJson(req: Req): Promise<any> {
  if (req.body !== undefined) {
    if (typeof req.body === 'string') {
      if (req.body.length > MAX_JSON_BYTES) throw new HttpError(413, 'payload_too_large', `Request body exceeds ${MAX_JSON_BYTES} bytes.`);
      return parseJson(req.body);
    }
    return req.body;
  }
  return parseJson(await readRaw(req, MAX_JSON_BYTES));
}

/** OAuth endpoints accept form-encoded (spec) or JSON bodies; always returns a flat string map. */
export async function readForm(req: Req): Promise<Record<string, string>> {
  let obj: unknown;
  if (req.body && typeof req.body === 'object') obj = req.body;
  else {
    const raw = typeof req.body === 'string' ? req.body : await readRaw(req, MAX_FORM_BYTES);
    if (raw.length > MAX_FORM_BYTES) throw new HttpError(413, 'payload_too_large', 'Request body too large.');
    const type = String(req.headers['content-type'] ?? '');
    if (type.includes('application/json')) { try { obj = JSON.parse(raw || '{}'); } catch { obj = {}; } }
    else obj = Object.fromEntries(new URLSearchParams(raw));
  }
  const out: Record<string, string> = Object.create(null);
  if (obj && typeof obj === 'object' && !Array.isArray(obj)) {
    for (const [k, v] of Object.entries(obj as Record<string, unknown>)) if (typeof v === 'string' || typeof v === 'number') out[k] = String(v);
  }
  return out;
}

export function sendJson(res: ServerResponse, status: number, body: unknown) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.end(JSON.stringify(body));
}

/** Public origin of this deployment. PUBLIC_ORIGIN pins it; otherwise Vercel's forwarded headers. */
export function originOf(req: IncomingMessage): string {
  const pinned = process.env.PUBLIC_ORIGIN?.replace(/\/+$/, '');
  if (pinned) return pinned;
  const host = (req.headers['x-forwarded-host'] as string) ?? req.headers.host ?? 'clearmind.meertech.tech';
  const proto = (req.headers['x-forwarded-proto'] as string) ?? (host.startsWith('localhost') ? 'http' : 'https');
  return `${proto.split(',')[0].trim()}://${host.split(',')[0].trim()}`;
}

/** Client IP as seen by Vercel's edge (x-real-ip / first x-forwarded-for hop, both set by Vercel). */
export function clientIp(req: IncomingMessage): string {
  const real = req.headers['x-real-ip'];
  if (typeof real === 'string' && real) return real.trim();
  const xff = req.headers['x-forwarded-for'];
  const first = (Array.isArray(xff) ? xff[0] : xff)?.split(',')[0]?.trim();
  return first || req.socket?.remoteAddress || 'unknown';
}

// ------------------------------------------------------------------ request ids + logs

const REQUEST_ID = /^[A-Za-z0-9._:-]{1,128}$/;

/** Accept a well-formed inbound x-request-id, else generate one; echo it on the response. */
export function requestIdFor(req: IncomingMessage, res: ServerResponse): string {
  const inbound = req.headers['x-request-id'];
  const v = Array.isArray(inbound) ? inbound[0] : inbound;
  const id = v && REQUEST_ID.test(v) ? v : randomUUID();
  res.setHeader('X-Request-Id', id);
  return id;
}

/** Strip anything credential-shaped before it reaches a log line. */
export function redact(s: string): string {
  return String(s)
    .replace(/\bcm[arc]?_[A-Za-z0-9_]{8,}/g, '[redacted-token]')
    .replace(/\bBearer\s+[^\s"']+/gi, 'Bearer [redacted]')
    .replace(/\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]*/g, '[redacted-jwt]')
    .replace(/\bAIza[0-9A-Za-z_-]{20,}/g, '[redacted-key]')
    .replace(/-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g, '[redacted-key]')
    .replace(/([?&](?:key|token|code|refresh_token|id_token|code_verifier)=)[^&\s]+/gi, '$1[redacted]');
}

type Level = 'info' | 'warn' | 'error';
/** One JSON object per line (Vercel log drains parse these). Strings are redacted. */
export function log(level: Level, msg: string, fields: Record<string, unknown> = {}) {
  const clean: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(fields)) clean[k] = typeof v === 'string' ? redact(v) : v;
  const line = JSON.stringify({ level, msg: redact(msg), time: new Date().toISOString(), ...clean });
  if (level === 'error') console.error(line); else if (level === 'warn') console.warn(line); else console.log(line);
}

/** Path without the query string (the MCP ?key= credential must never be logged). */
export const pathOf = (req: IncomingMessage) => String(req.url ?? '/').split('?')[0].slice(0, 200);

/**
 * Wrap a function handler: request id, one structured access-log line per
 * request, and a last-resort 500 (shape supplied by the caller) that never
 * leaks the exception.
 */
export function withRequest<R extends Req>(
  fn: string,
  handler: (req: R, res: ServerResponse, ctx: { requestId: string }) => Promise<unknown>,
  fallback: (requestId: string) => unknown,
) {
  return async (req: R, res: ServerResponse) => {
    const started = Date.now();
    const requestId = requestIdFor(req, res);
    try {
      await handler(req, res, { requestId });
    } catch (e: any) {
      log('error', 'unhandled', { fn, requestId, error: e?.name ?? 'Error', detail: String(e?.message ?? '').slice(0, 300) });
      if (!res.headersSent) sendJson(res, 500, fallback(requestId));
    } finally {
      log('info', 'request', { fn, requestId, method: req.method, path: pathOf(req), status: res.statusCode, durationMs: Date.now() - started });
    }
  };
}

// ------------------------------------------------------------------ CORS

/**
 * Origins allowed to call the first-party REST API from a browser (web app on
 * both hosts + local dev). Extend with CORS_ALLOWED_ORIGINS (comma-separated).
 * Never combined with credentials: every API is bearer-token, no cookies.
 */
export const FIRST_PARTY_ORIGINS = ['https://clearmind.meertech.tech', 'https://clearmind.expo.app', 'http://localhost:3000', 'http://localhost:8081'];

export function allowedOrigins(): string[] {
  const extra = (process.env.CORS_ALLOWED_ORIGINS ?? '').split(',').map((s) => s.trim().replace(/\/+$/, '')).filter(Boolean);
  return [...FIRST_PARTY_ORIGINS, ...extra];
}

/** Allowlist CORS: reflect the Origin only when it is allowlisted (with Vary: Origin). */
export function corsAllowlist(req: IncomingMessage, res: ServerResponse, methods = 'GET, POST, OPTIONS') {
  res.setHeader('Vary', 'Origin');
  const origin = req.headers.origin;
  if (typeof origin === 'string' && allowedOrigins().includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Methods', methods);
    res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type, X-Request-Id, X-ClearMind-Client');
    res.setHeader('Access-Control-Expose-Headers', 'X-Request-Id, Retry-After');
    res.setHeader('Access-Control-Max-Age', '600');
  }
}

/**
 * Public CORS for the MCP + OAuth endpoints: any MCP client (claude.ai,
 * chatgpt.com, MCP Inspector, desktop apps' webviews) must reach them. Safe
 * because they are bearer-token / PKCE public-client endpoints: no cookies, and
 * Access-Control-Allow-Credentials is never sent, so a page can't ride a session.
 */
export function corsPublic(res: ServerResponse, headers: string, methods = 'GET, POST, OPTIONS') {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', methods);
  res.setHeader('Access-Control-Allow-Headers', headers);
  res.setHeader('Access-Control-Expose-Headers', 'WWW-Authenticate, X-Request-Id, Retry-After');
}

// ------------------------------------------------------------------ timeouts

export class TimeoutError extends Error { constructor(what: string) { super(`${what} timed out`); this.name = 'TimeoutError'; } }

/** Race a promise against a deadline (the underlying work isn't cancelled; the caller just stops waiting). */
export function withTimeout<T>(p: Promise<T>, ms: number, what = 'operation'): Promise<T> {
  let t: ReturnType<typeof setTimeout>;
  return Promise.race([
    p.finally(() => clearTimeout(t)),
    new Promise<never>((_, reject) => { t = setTimeout(() => reject(new TimeoutError(what)), ms); }),
  ]);
}
