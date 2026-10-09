/**
 * Boundary validation for agent tool arguments (MCP / REST / CLI), driven by the
 * tool's own JSON-schema-ish `input` declaration.
 *
 *  - Rejects prototype-pollution keys (__proto__, constructor, prototype) at any depth.
 *  - Type-checks declared properties (string / number / boolean / array / object),
 *    enums, and caps string length, array length and nesting depth.
 *  - Lenient where LLM clients commonly drift, by coercing instead of failing:
 *    numeric strings → numbers, "true"/"false" → booleans, numbers → strings,
 *    enum case ("P1" → "p1"), bare priority digits (1 → "p1"), and a single
 *    scalar where an array is expected ("note" → ["note"]).
 *  - `null` is allowed for any optional property (tools use it to clear a field).
 *  - Undeclared properties pass through untouched (back-compat).
 *
 * Returns a NEW args object; the input is not mutated.
 */
export const ARG_LIMITS = { maxString: 200_000, maxArray: 1000, maxDepth: 8 };
const FORBIDDEN_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

export class ArgError extends Error {}

interface Schema { type?: string | string[]; enum?: unknown[]; items?: Schema; properties?: Record<string, Schema> }

function checkKeys(v: unknown, path: string, depth: number) {
  if (depth > ARG_LIMITS.maxDepth) throw new ArgError(`${path || 'arguments'} is nested too deeply.`);
  if (Array.isArray(v)) {
    if (v.length > ARG_LIMITS.maxArray) throw new ArgError(`${path} has more than ${ARG_LIMITS.maxArray} items.`);
    v.forEach((x, i) => checkKeys(x, `${path}[${i}]`, depth + 1));
  } else if (v && typeof v === 'object') {
    for (const k of Object.keys(v)) {
      if (FORBIDDEN_KEYS.has(k)) throw new ArgError(`Property name "${k}" is not allowed.`);
      checkKeys((v as Record<string, unknown>)[k], path ? `${path}.${k}` : k, depth + 1);
    }
  } else if (typeof v === 'string' && v.length > ARG_LIMITS.maxString) {
    throw new ArgError(`${path} is longer than ${ARG_LIMITS.maxString} characters.`);
  }
}

function coerce(v: unknown, s: Schema, path: string): unknown {
  if (v === null || v === undefined) return v;
  const types = Array.isArray(s.type) ? s.type : s.type ? [s.type] : [];
  let out = v;
  if (types.length && !types.some((t) => matches(out, t))) {
    out = tryCoerce(v, types);
    if (out === undefined) throw new ArgError(`${path} must be ${types.join(' or ')}.`);
  }
  if (s.enum && !s.enum.includes(out)) {
    const lower = typeof out === 'string' ? out.toLowerCase() : out;
    const hit = s.enum.find((e) => e === lower) ?? (/^[1-4]$/.test(String(out)) ? s.enum.find((e) => e === `p${out}`) : undefined);
    if (hit === undefined) throw new ArgError(`${path} must be one of: ${s.enum.join(', ')}.`);
    out = hit;
  }
  if (Array.isArray(out) && s.items) return out.map((x, i) => coerce(x, s.items!, `${path}[${i}]`));
  if (out && typeof out === 'object' && !Array.isArray(out) && s.properties) return coerceObject(out as Record<string, unknown>, s.properties, path);
  return out;
}

function matches(v: unknown, t: string): boolean {
  switch (t) {
    case 'string': return typeof v === 'string';
    case 'number': return typeof v === 'number' && Number.isFinite(v);
    case 'integer': return typeof v === 'number' && Number.isInteger(v);
    case 'boolean': return typeof v === 'boolean';
    case 'array': return Array.isArray(v);
    case 'object': return !!v && typeof v === 'object' && !Array.isArray(v);
    case 'null': return v === null;
    default: return true;
  }
}

function tryCoerce(v: unknown, types: string[]): unknown {
  for (const t of types) {
    if ((t === 'number' || t === 'integer') && typeof v === 'string' && /^-?\d+(\.\d+)?$/.test(v.trim())) {
      const n = Number(v);
      if (t === 'number' || Number.isInteger(n)) return n;
    }
    if (t === 'boolean' && (v === 'true' || v === 'false')) return v === 'true';
    if (t === 'string' && typeof v === 'number' && Number.isFinite(v)) return String(v);
    if (t === 'array' && (typeof v === 'string' || typeof v === 'number')) return [v]; // single item where a list is expected
  }
  return undefined;
}

function coerceObject(obj: Record<string, unknown>, props: Record<string, Schema>, path: string) {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    out[k] = Object.prototype.hasOwnProperty.call(props, k) ? coerce(v, props[k], path ? `${path}.${k}` : k) : v;
  }
  return out;
}

export function validateArgs(input: { properties?: Record<string, Schema> }, args: Record<string, unknown>): Record<string, unknown> {
  checkKeys(args, '', 0);
  return coerceObject(args, input.properties ?? {}, '');
}
