/**
 * How the clients reach Gemini: through the authenticated server proxy
 * (POST /api/v1/ai/generate, see server/aiProxy.ts) — never with an API key in
 * the app. Platform adapters create a transport with their own ID-token getter.
 */

export interface AiRequest {
  contents: { role: string; parts: { text: string }[] }[];
  systemInstruction?: string;
  tools?: ('urlContext' | 'googleSearch')[];
}

/** Sends one generation request; resolves with the model's text. */
export type GeminiTransport = (req: AiRequest) => Promise<string>;

export class AiProxyError extends Error {
  constructor(readonly code: string, message: string, readonly status: number) { super(message); }
}

export const DEFAULT_AI_ENDPOINT = 'https://clearmind.meertech.tech/api/v1/ai/generate';

export function createProxyTransport(opts: {
  endpoint?: string;
  /** Firebase ID token of the signed-in user (null when signed out). */
  getIdToken: () => Promise<string | null>;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}): GeminiTransport {
  const endpoint = opts.endpoint ?? DEFAULT_AI_ENDPOINT;
  const doFetch = opts.fetchImpl ?? fetch;
  return async (req) => {
    const token = await opts.getIdToken();
    if (!token) throw new AiProxyError('unauthorized', 'Sign in to ClearMind to use AI features.', 401);
    const ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const timer = ctrl ? setTimeout(() => ctrl.abort(), opts.timeoutMs ?? 60_000) : null;
    let res: Response;
    try {
      res = await doFetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(req),
        signal: ctrl?.signal,
      });
    } catch {
      throw new AiProxyError('network', 'Couldn’t reach the AI service — check your connection.', 0);
    } finally {
      if (timer) clearTimeout(timer);
    }
    let body: any = null;
    try { body = await res.json(); } catch { /* non-JSON error page */ }
    if (res.ok && body?.ok) return String(body.result?.text ?? '');
    const code = body?.error?.code ?? `http_${res.status}`;
    const message = body?.error?.message ?? 'The AI service is unavailable right now.';
    throw new AiProxyError(code, message, res.status);
  };
}

/** Adapts a transport to the small slice of the @google/genai client the core uses. */
export function transportClient(t: GeminiTransport) {
  return {
    models: {
      async generateContent(p: { model?: string; contents: AiRequest['contents']; config?: { systemInstruction?: string; tools?: Record<string, unknown>[] } }) {
        const tools = (p.config?.tools ?? []).flatMap((x) => Object.keys(x)).filter((k): k is 'urlContext' | 'googleSearch' => k === 'urlContext' || k === 'googleSearch');
        const text = await t({ contents: p.contents, systemInstruction: p.config?.systemInstruction, ...(tools.length ? { tools } : {}) });
        return { text };
      },
    },
  };
}
