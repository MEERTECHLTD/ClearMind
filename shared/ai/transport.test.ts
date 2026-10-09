import { describe, it, expect, vi } from 'vitest';
import { createProxyTransport, transportClient, AiProxyError } from './transport';
import { generateIrisResponse, generateResponse } from './geminiCore';

const okFetch = (text: string) => vi.fn(async () => new Response(JSON.stringify({ ok: true, result: { text } }), { status: 200 }));

describe('Gemini proxy transport', () => {
  it('posts contents/systemInstruction/tools with the ID token and returns text', async () => {
    const f = okFetch('hi');
    const t = createProxyTransport({ endpoint: 'https://x/api', getIdToken: async () => 'tok', fetchImpl: f as any });
    const r = await transportClient(t).models.generateContent({
      model: 'ignored', contents: [{ role: 'user', parts: [{ text: 'q' }] }],
      config: { systemInstruction: 'sys', tools: [{ urlContext: {} }, { googleSearch: {} }] },
    });
    expect(r.text).toBe('hi');
    const [url, init] = (f.mock.calls[0] as unknown) as [string, RequestInit];
    expect(url).toBe('https://x/api');
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer tok');
    expect(JSON.parse(String(init.body))).toEqual({ contents: [{ role: 'user', parts: [{ text: 'q' }] }], systemInstruction: 'sys', tools: ['urlContext', 'googleSearch'] });
  });

  it('refuses without a signed-in user and maps server errors', async () => {
    await expect(createProxyTransport({ getIdToken: async () => null, fetchImpl: okFetch('') as any })({ contents: [] })).rejects.toMatchObject({ code: 'unauthorized' });
    const f = vi.fn(async () => new Response(JSON.stringify({ ok: false, error: { code: 'rate_limited', message: 'AI limit reached. Try again later.' } }), { status: 429 }));
    const t = createProxyTransport({ getIdToken: async () => 't', fetchImpl: f as any });
    await expect(t({ contents: [] })).rejects.toBeInstanceOf(AiProxyError);
    // The core surfaces the proxy's message instead of a generic failure.
    await expect(generateResponse(t, 'x')).rejects.toThrow('AI limit reached');
    expect(await generateIrisResponse(t, [], 'x')).toBe('AI limit reached. Try again later.');
  });

  it('no transport means AI unavailable', async () => {
    await expect(generateResponse(null, 'x')).rejects.toThrow();
  });
});
