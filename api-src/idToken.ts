/**
 * Verify a Firebase Auth ID token without firebase-admin/auth (whose jwks-rsa
 * → jose dependency can't be require()d on Vercel's Node runtime). Implements
 * Firebase's documented checks: RS256 signature against Google's securetoken
 * certificates (cached per Cache-Control), aud = project id,
 * iss = https://securetoken.google.com/<project>, exp/iat/auth_time, non-empty sub.
 */
import { createPublicKey, createVerify } from 'node:crypto';

const CERTS_URL = 'https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com';
const FETCH_TIMEOUT_MS = 4000;
let cache: { certs: Record<string, string>; until: number } | null = null;

/** Google's signing certs: 4s timeout, one retry, cached per Cache-Control. */
async function fetchCerts(): Promise<Record<string, string>> {
  let last: unknown;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const r = await fetch(CERTS_URL, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
      if (!r.ok) throw new Error(`cert fetch ${r.status}`);
      const maxAge = Number(/max-age=(\d+)/.exec(r.headers.get('cache-control') ?? '')?.[1] ?? 3600);
      cache = { certs: (await r.json()) as Record<string, string>, until: Date.now() + maxAge * 1000 };
      return cache.certs;
    } catch (e) { last = e; if (attempt === 0) await new Promise((res) => setTimeout(res, 200)); }
  }
  throw last instanceof Error ? last : new Error('cert fetch failed');
}

async function certFor(kid: string): Promise<string | undefined> {
  if (cache && cache.until > Date.now() && cache.certs[kid]) return cache.certs[kid];
  // Expired cache or an unseen kid (Google rotated keys): refetch once.
  return (await fetchCerts())[kid];
}

/** Test hook: seed the cert cache (no network). */
export function __setCertsForTests(certs: Record<string, string> | null) { cache = certs ? { certs, until: Date.now() + 3_600_000 } : null; }

const b64json = (s: string) => JSON.parse(Buffer.from(s, 'base64url').toString('utf8'));

export async function verifyFirebaseIdToken(token: string, projectId: string, now = Date.now()): Promise<{ uid: string; email?: string; emailVerified: boolean }> {
  const parts = String(token ?? '').split('.');
  if (parts.length !== 3) throw new Error('malformed token');
  const [h, p, sig] = parts;
  const header = b64json(h);
  const claims = b64json(p);
  if (header.alg !== 'RS256' || !header.kid) throw new Error('bad header');
  const pem = await certFor(String(header.kid));
  if (!pem) throw new Error('unknown key id');
  const ok = createVerify('RSA-SHA256').update(`${h}.${p}`).verify(createPublicKey(pem), Buffer.from(sig, 'base64url'));
  if (!ok) throw new Error('bad signature');
  const t = Math.floor(now / 1000);
  if (claims.aud !== projectId || claims.iss !== `https://securetoken.google.com/${projectId}`) throw new Error('wrong project');
  if (typeof claims.exp !== 'number' || claims.exp <= t) throw new Error('expired');
  if (typeof claims.iat !== 'number' || claims.iat > t + 300) throw new Error('issued in the future');
  if (typeof claims.auth_time === 'number' && claims.auth_time > t + 300) throw new Error('bad auth_time');
  if (!claims.sub || typeof claims.sub !== 'string' || claims.sub.length > 128) throw new Error('bad subject');
  return { uid: claims.sub, email: claims.email, emailVerified: claims.email_verified === true };
}
