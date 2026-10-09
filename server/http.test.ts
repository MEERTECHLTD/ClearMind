import { describe, it, expect, afterEach } from 'vitest';
import { Readable } from 'node:stream';
import { redact, readJson, readForm, clientIp, originOf, withTimeout, HttpError, MAX_FORM_BYTES } from '../api-src/http';

const streamReq = (raw: string, headers: Record<string, string> = {}) => Object.assign(Readable.from([Buffer.from(raw)]), { headers }) as any;

afterEach(() => { delete process.env.PUBLIC_ORIGIN; });

describe('http helpers', () => {
  it('redacts credentials from log strings', () => {
    const s = redact(`Bearer eyJhbGciOiJSUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.sig cm_UserAbc123UserAbc123xy_${'a'.repeat(40)} cmr_${'b'.repeat(48)} /api/mcp?key=cm_x_y AIza${'c'.repeat(35)}`);
    expect(s).not.toMatch(/eyJ|aaaa|bbbb|cccc|cm_x_y/);
    expect(s).toContain('[redacted');
  });

  it('maps bad JSON to 400 and oversized bodies to 413', async () => {
    await expect(readJson(streamReq('{oops'))).rejects.toMatchObject({ status: 400, code: 'invalid_json' });
    await expect(readJson(streamReq('x'.repeat(1_000_001)))).rejects.toBeInstanceOf(HttpError);
    await expect(readJson({ headers: {}, body: '{"a":1}' } as any)).resolves.toEqual({ a: 1 });
  });

  it('parses OAuth forms with a size cap and no prototype surprises', async () => {
    const f = await readForm(streamReq('grant_type=refresh_token&__proto__=x', { 'content-type': 'application/x-www-form-urlencoded' }));
    expect(f.grant_type).toBe('refresh_token');
    expect(({} as any).x).toBeUndefined();
    await expect(readForm(streamReq('a='.padEnd(MAX_FORM_BYTES + 10, 'b')))).rejects.toMatchObject({ status: 413 });
    const j = await readForm({ headers: {}, body: { code: 'c', n: 5, obj: { a: 1 } } } as any);
    expect({ ...j }).toEqual({ code: 'c', n: '5' });
  });

  it('derives client IP from Vercel headers and pins the public origin when configured', () => {
    expect(clientIp({ headers: { 'x-real-ip': '1.2.3.4', 'x-forwarded-for': '9.9.9.9' } } as any)).toBe('1.2.3.4');
    expect(clientIp({ headers: { 'x-forwarded-for': '5.6.7.8, 10.0.0.1' } } as any)).toBe('5.6.7.8');
    expect(originOf({ headers: { 'x-forwarded-host': 'evil.example' } } as any)).toBe('https://evil.example');
    process.env.PUBLIC_ORIGIN = 'https://clearmind.meertech.tech/';
    expect(originOf({ headers: { 'x-forwarded-host': 'evil.example' } } as any)).toBe('https://clearmind.meertech.tech');
  });

  it('times out slow work', async () => {
    await expect(withTimeout(new Promise(() => {}), 10, 'slow')).rejects.toThrow('slow timed out');
    await expect(withTimeout(Promise.resolve(7), 50)).resolves.toBe(7);
  });
});
