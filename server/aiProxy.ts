/**
 * Server-side Gemini proxy (POST /api/v1/ai/generate).
 *
 * Why: a Gemini API key compiled into the web bundle / mobile binary is public.
 * This route keeps the key server-side (GEMINI_SERVER_API_KEY, a Vercel env var
 * that is never exposed to Vite/Expo) and only serves signed-in ClearMind users
 * (Firebase ID token), with per-user rate limits.
 *
 * Contract (mirrors what shared/ai/geminiCore.ts sends today):
 *   POST /api/v1/ai/generate
 *   Authorization: Bearer <Firebase ID token>
 *   { "contents": [{ "role": "user" | "model", "parts": [{ "text": "…" }] }],
 *     "systemInstruction"?: "…", "tools"?: ["urlContext", "googleSearch"] }
 *   → 200 { ok: true, result: { text } }
 *   → 400 invalid | 401 unauthorized | 429 rate_limited (Retry-After)
 *     | 502 upstream_error | 503 ai_unavailable | 504 upstream_timeout
 */
export const AI_MODEL = 'gemini-2.5-flash';
export const AI_LIMITS = { maxTurns: 60, maxTextChars: 120_000, maxSystemChars: 20_000 };
const TOOL_NAMES = ['urlContext', 'googleSearch'] as const;
type ToolName = (typeof TOOL_NAMES)[number];

export interface AiRequest {
  contents: { role: 'user' | 'model'; parts: { text: string }[] }[];
  systemInstruction?: string;
  tools?: ToolName[];
}

/** Validate + normalise the request body; returns a message on failure (never throws). */
export function validateAiRequest(body: unknown): { ok: true; value: AiRequest } | { ok: false; message: string } {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return { ok: false, message: 'Body must be a JSON object.' };
  const b = body as Record<string, unknown>;
  if (!Array.isArray(b.contents) || !b.contents.length) return { ok: false, message: 'contents must be a non-empty array.' };
  if (b.contents.length > AI_LIMITS.maxTurns) return { ok: false, message: `At most ${AI_LIMITS.maxTurns} turns.` };
  let chars = 0;
  const contents: AiRequest['contents'] = [];
  for (const c of b.contents as unknown[]) {
    if (!c || typeof c !== 'object') return { ok: false, message: 'Each content must be an object.' };
    const { role, parts } = c as { role?: unknown; parts?: unknown };
    if (role !== 'user' && role !== 'model') return { ok: false, message: 'role must be "user" or "model".' };
    if (!Array.isArray(parts) || !parts.length || parts.length > 20) return { ok: false, message: 'parts must be a non-empty array (max 20).' };
    const clean: { text: string }[] = [];
    for (const p of parts) {
      const text = (p as { text?: unknown })?.text;
      if (typeof text !== 'string') return { ok: false, message: 'Only text parts are supported.' };
      chars += text.length;
      clean.push({ text });
    }
    contents.push({ role, parts: clean });
  }
  if (chars > AI_LIMITS.maxTextChars) return { ok: false, message: `Prompt too long (max ${AI_LIMITS.maxTextChars} characters).` };
  let systemInstruction: string | undefined;
  if (b.systemInstruction !== undefined && b.systemInstruction !== null) {
    if (typeof b.systemInstruction !== 'string' || b.systemInstruction.length > AI_LIMITS.maxSystemChars) return { ok: false, message: 'systemInstruction must be a string (max 20000 characters).' };
    systemInstruction = b.systemInstruction;
  }
  let tools: ToolName[] | undefined;
  if (b.tools !== undefined && b.tools !== null) {
    if (!Array.isArray(b.tools) || b.tools.some((t) => !(TOOL_NAMES as readonly unknown[]).includes(t))) return { ok: false, message: 'tools may only contain "urlContext" and "googleSearch".' };
    tools = [...new Set(b.tools as ToolName[])];
  }
  return { ok: true, value: { contents, systemInstruction, tools } };
}

export class AiUpstreamError extends Error {
  constructor(public status: number, public code: 'upstream_error' | 'upstream_timeout' | 'ai_unavailable', message: string) { super(message); }
}

/** One Gemini generateContent call. 25 s budget (function maxDuration is 30 s); no retry — generation is not free. */
export async function generateWithGemini(req: AiRequest, apiKey: string, fetchImpl: typeof fetch = fetch, timeoutMs = 25_000): Promise<string> {
  if (!apiKey) throw new AiUpstreamError(503, 'ai_unavailable', 'AI is not configured on the server.');
  const body: Record<string, unknown> = { contents: req.contents };
  if (req.systemInstruction) body.systemInstruction = { parts: [{ text: req.systemInstruction }] };
  if (req.tools?.length) body.tools = req.tools.map((t) => ({ [t]: {} }));
  let r: Response;
  try {
    r = await fetchImpl(`https://generativelanguage.googleapis.com/v1beta/models/${AI_MODEL}:generateContent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (e) {
    if ((e as Error)?.name === 'TimeoutError' || (e as Error)?.name === 'AbortError') throw new AiUpstreamError(504, 'upstream_timeout', 'The AI service took too long. Try again.');
    throw new AiUpstreamError(502, 'upstream_error', 'The AI service is unreachable. Try again.');
  }
  if (!r.ok) throw new AiUpstreamError(r.status === 429 ? 503 : 502, 'upstream_error', r.status === 429 ? 'The AI service is busy. Try again shortly.' : 'The AI service returned an error.');
  const j = (await r.json().catch(() => null)) as { candidates?: { content?: { parts?: { text?: string }[] } }[] } | null;
  return (j?.candidates?.[0]?.content?.parts ?? []).map((p) => p.text ?? '').join('');
}
