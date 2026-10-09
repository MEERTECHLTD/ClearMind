/**
 * Hash-route helpers for the unified web IA (pure, unit-tested).
 *
 * Old destinations were folded into newer ones (Dashboard -> Today, Productivity
 * + Analytics -> Insights, Daily Log + Rant Corner -> Journal, AI Reviewer ->
 * Applications). Their routes keep working: they redirect to the new view and,
 * where relevant, the right tab. Any query on the old hash (e.g. `?task=<id>`)
 * is carried over.
 */

export const ROUTE_REDIRECTS: Readonly<Record<string, string>> = {
  dashboard: 'today',
  tasks: 'today',
  productivity: 'insights?tab=tasks',
  analytics: 'insights?tab=life',
  dailylog: 'journal?tab=log',
  rant: 'journal?tab=rants',
  reviewer: 'applications?tab=reviewer',
};

function splitOnce(s: string, sep: string): [string, string] {
  const i = s.indexOf(sep);
  return i < 0 ? [s, ''] : [s.slice(0, i), s.slice(i + 1)];
}

/** The hash (without '#') an old route should be replaced with, or null if it is current. */
export function redirectFor(hash: string): string | null {
  const [path, query] = splitOnce(hash.replace(/^#/, ''), '?');
  let head: string;
  try { head = decodeURIComponent(path).split('/')[0]; } catch { head = path.split('/')[0]; }
  const target = ROUTE_REDIRECTS[head];
  if (!target) return null;
  const [tPath, tQuery] = splitOnce(target, '?');
  const params = new URLSearchParams(tQuery);
  new URLSearchParams(query).forEach((v, k) => { if (!params.has(k)) params.set(k, v); });
  const qs = params.toString();
  return qs ? `${tPath}?${qs}` : tPath;
}

/** Read `?<key>=` from a hash like `#insights?tab=life`. */
export function hashParam(hash: string, key: string): string | null {
  const [, query] = splitOnce(hash.replace(/^#/, ''), '?');
  return new URLSearchParams(query).get(key);
}

/** The tab named in the hash, if it is one of `allowed`; otherwise `fallback`. */
export function tabFromHash<T extends string>(hash: string, allowed: readonly T[], fallback: T): T {
  const v = hashParam(hash, 'tab');
  return v && (allowed as readonly string[]).includes(v) ? (v as T) : fallback;
}

/** The same hash with `?<key>=<value>` set (or removed when value is null), other params kept. */
export function withHashParam(hash: string, key: string, value: string | null): string {
  const [path, query] = splitOnce(hash.replace(/^#/, ''), '?');
  const params = new URLSearchParams(query);
  if (value === null) params.delete(key); else params.set(key, value);
  const qs = params.toString();
  return qs ? `${path}?${qs}` : path;
}
