import { describe, it, expect } from 'vitest';
import { createHash } from 'node:crypto';
import {
  base64url, verifyPkce, isAllowedRedirect, redirectMatches, parseScopes, validateRegistration, hostLabel,
  protectedResourceMetadata, authorizationServerMetadata, redirectWith, DEFAULT_CONNECTOR_SCOPES, impersonatesKnownClient, CLIENT_ID_RE,
} from './oauth';

const shaBytes = async (s: string) => new Uint8Array(createHash('sha256').update(s).digest());

describe('oauth helpers', () => {
  it('verifies PKCE S256 (RFC 7636 appendix B vector)', async () => {
    const verifier = 'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk';
    expect(base64url(await shaBytes(verifier))).toBe('E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM');
    expect(await verifyPkce(verifier, 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM', shaBytes)).toBe(true);
    expect(await verifyPkce(verifier + 'x', 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM', shaBytes)).toBe(false);
    expect(await verifyPkce('short', 'x', shaBytes)).toBe(false);
  });
  it('allows https, loopback and native-app redirects; rejects dangerous ones', () => {
    expect(isAllowedRedirect('https://claude.ai/api/mcp/auth_callback')).toBe(true);
    expect(isAllowedRedirect('https://chatgpt.com/connector_platform_oauth_redirect')).toBe(true);
    expect(isAllowedRedirect('http://localhost:6274/oauth/callback')).toBe(true);
    expect(isAllowedRedirect('cursor://anysphere.cursor-retrieval/oauth/callback')).toBe(true);
    expect(isAllowedRedirect('http://evil.example/cb')).toBe(false);
    expect(isAllowedRedirect('javascript:alert(1)')).toBe(false);
    expect(isAllowedRedirect('https://x.com/cb#frag')).toBe(false);
    expect(redirectMatches(['http://127.0.0.1:1234/cb'], 'http://127.0.0.1:5555/cb')).toBe(true);
    expect(redirectMatches(['https://claude.ai/cb'], 'https://claude.ai/cb2')).toBe(false);
  });
  it('validates dynamic client registration', () => {
    const ok = validateRegistration({ client_name: 'Claude', redirect_uris: ['https://claude.ai/api/mcp/auth_callback'], token_endpoint_auth_method: 'none' });
    expect(ok).toEqual({ ok: true, client: { client_name: 'Claude', redirect_uris: ['https://claude.ai/api/mcp/auth_callback'] } });
    expect(validateRegistration({ redirect_uris: [] })).toMatchObject({ ok: false, error: 'invalid_redirect_uri' });
    expect(validateRegistration({ redirect_uris: ['https://a.b/c'], token_endpoint_auth_method: 'client_secret_basic' })).toMatchObject({ ok: false });
    expect((validateRegistration({ redirect_uris: ['https://chatgpt.com/connector_platform_oauth_redirect'] }) as any).client.client_name).toBe('ChatGPT');
    expect(hostLabel('https://claude.ai/x')).toBe('Claude');
  });
  it('parses scopes and builds metadata', () => {
    expect(parseScopes('notes:read tasks:read bogus')).toEqual(['notes:read', 'tasks:read']);
    expect(parseScopes('')).toEqual(DEFAULT_CONNECTOR_SCOPES);
    expect(DEFAULT_CONNECTOR_SCOPES).toContain('notes:write');
    const prm = protectedResourceMetadata('https://clearmind.meertech.tech');
    expect(prm).toMatchObject({ resource: 'https://clearmind.meertech.tech/api/mcp', authorization_servers: ['https://clearmind.meertech.tech'] });
    const as = authorizationServerMetadata('https://clearmind.meertech.tech');
    expect(as).toMatchObject({ authorization_endpoint: 'https://clearmind.meertech.tech/oauth/authorize', code_challenge_methods_supported: ['S256'], token_endpoint_auth_methods_supported: ['none'] });
    expect(redirectWith('https://claude.ai/cb?x=1', { code: 'abc', state: 's t', empty: '' })).toBe('https://claude.ai/cb?x=1&code=abc&state=s+t');
  });
  it('blocks browser-internal / script redirect schemes and credentials in redirect URIs', () => {
    for (const u of ['vbscript:x', 'blob:https://a.b/x', 'about:blank', 'data:text/html,x', 'file:///etc/passwd', 'https://user:pw@claude.ai/cb', 'chrome-extension://abc/cb', 'intent://x#Intent;end']) {
      expect(isAllowedRedirect(u)).toBe(false);
    }
    expect(isAllowedRedirect('com.example.app:/oauth2redirect')).toBe(true);
  });
  it('resists look-alike client names and domains', () => {
    expect(hostLabel('https://evilclaude.ai/cb')).toBe('evilclaude.ai');
    expect(hostLabel('https://www.claude.ai/cb')).toBe('Claude');
    expect(impersonatesKnownClient('Claude', ['https://claude.ai/api/mcp/auth_callback'])).toBe(false);
    expect(impersonatesKnownClient('ChatGPT', ['https://chatgpt.com.evil.example/cb'])).toBe(true);
    expect(impersonatesKnownClient('Claude Code', ['http://localhost:33418/callback'])).toBe(false);
    const v = validateRegistration({ client_name: 'Claude\u202e', redirect_uris: ['https://evil.example/cb'], client_uri: 'javascript:alert(1)' }) as any;
    expect(v.client).toEqual({ client_name: 'Claude (via evil.example)', redirect_uris: ['https://evil.example/cb'] });
    expect(validateRegistration(null as any)).toMatchObject({ ok: false });
    expect(CLIENT_ID_RE.test('cmc_' + 'a'.repeat(24))).toBe(true);
    expect(CLIENT_ID_RE.test('cmc_../x')).toBe(false);
  });
});
