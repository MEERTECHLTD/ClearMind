import { describe, it, expect } from 'vitest';
import { createHash } from 'node:crypto';
import {
  base64url, verifyPkce, isAllowedRedirect, redirectMatches, parseScopes, validateRegistration, hostLabel,
  protectedResourceMetadata, authorizationServerMetadata, redirectWith, DEFAULT_CONNECTOR_SCOPES,
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
});
