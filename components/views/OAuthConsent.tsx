/**
 * OAuth consent page for remote MCP connectors (claude.ai, ChatGPT, …) at
 * /oauth/authorize. Signs the user in (Firebase), shows who is asking and what
 * they'll be able to do, then asks the server to issue an authorization code
 * (POST /api/oauth/approve with the user's ID token) and redirects back.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { onAuthStateChanged, type User } from 'firebase/auth';
import { ShieldCheck, ShieldAlert, Bot, Loader2, LogOut } from 'lucide-react';
import { auth, firebaseService, isFirebaseConfigured } from '../../services/firebase';
import { SCOPES } from '../../shared/agents/tokens';
import { parseScopes } from '../../shared/agents/oauth';
import type { AgentScope } from '../../types';

type Params = { response_type: string; client_id: string; redirect_uri: string; code_challenge: string; code_challenge_method: string; state: string; scope: string; resource: string };

export default function OAuthConsent() {
  const p = useMemo<Params>(() => {
    const q = new URLSearchParams(window.location.search);
    const g = (k: string) => q.get(k) ?? '';
    return { response_type: g('response_type'), client_id: g('client_id'), redirect_uri: g('redirect_uri'), code_challenge: g('code_challenge'), code_challenge_method: g('code_challenge_method') || 'plain', state: g('state'), scope: g('scope'), resource: g('resource') };
  }, []);
  const [user, setUser] = useState<User | null | undefined>(undefined);
  const [client, setClient] = useState<{ client_name: string; redirect_host: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [scopes, setScopes] = useState<AgentScope[]>(() => parseScopes(p.scope));
  const [busy, setBusy] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  useEffect(() => {
    if (!isFirebaseConfigured()) { setError('Sign-in is not available on this deployment.'); return; }
    return onAuthStateChanged(auth, (u) => setUser(u));
  }, []);

  useEffect(() => {
    if (p.response_type !== 'code') { setError('Unsupported request (response_type must be "code").'); return; }
    if (!p.client_id || !p.redirect_uri) { setError('This link is missing client_id or redirect_uri.'); return; }
    if (p.code_challenge_method !== 'S256' || !p.code_challenge) { setError('This app must use PKCE (S256).'); return; }
    fetch(`/api/oauth/client?client_id=${encodeURIComponent(p.client_id)}&redirect_uri=${encodeURIComponent(p.redirect_uri)}`)
      .then(async (r) => { const b = await r.json(); if (!r.ok) throw new Error(b.error_description ?? 'Unknown app'); setClient(b); })
      .catch((e) => setError(e.message));
  }, [p]);

  const decide = async (deny: boolean) => {
    if (!user || !client) return;
    setBusy(true);
    try {
      const r = await fetch('/api/oauth/approve', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...p, scopes, deny, id_token: await user.getIdToken() }),
      });
      const b = await r.json();
      if (!r.ok) throw new Error(b.error_description ?? 'Could not complete the connection');
      window.location.assign(b.redirect);
    } catch (e: any) { setError(e.message); setBusy(false); }
  };

  const signInEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true); setError(null);
    try { await firebaseService.signInWithEmail(email, password); } catch (err: any) { setError(err?.message ?? 'Sign-in failed'); } finally { setBusy(false); }
  };

  const shell = (children: React.ReactNode) => (
    <div className="min-h-screen bg-slate-50 dark:bg-[#05050A] flex items-center justify-center p-4">
      <div className="w-full max-w-md rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0B0F1A] shadow-xl p-6">
        <div className="flex items-center gap-3 mb-5">
          <img src="/icon-192.png" alt="" className="w-10 h-10 rounded-xl" />
          <span className="text-lg font-extrabold text-slate-900 dark:text-white">ClearMind</span>
        </div>
        {children}
      </div>
    </div>
  );

  if (error) return shell(<div className="flex gap-2 text-sm text-red-600 dark:text-red-400"><ShieldAlert size={18} className="shrink-0" />{error}</div>);
  if (user === undefined || !client) return shell(<div className="flex items-center gap-2 text-slate-500"><Loader2 size={16} className="animate-spin" />Loading…</div>);

  if (!user || user.isAnonymous) {
    return shell(
      <>
        <h1 className="text-xl font-bold text-slate-900 dark:text-white mb-1">Sign in to connect {client.client_name}</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400 mb-5">Use the account whose tasks and notes {client.client_name} should access.</p>
        <button onClick={async () => { setBusy(true); setError(null); try { await firebaseService.signInWithGoogle(); } catch (e: any) { setError(e?.message ?? 'Google sign-in failed'); } finally { setBusy(false); } }}
          disabled={busy} className="w-full py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 font-semibold text-slate-800 dark:text-slate-100 hover:bg-slate-50 dark:hover:bg-white/5">Continue with Google</button>
        <div className="my-4 text-center text-xs text-slate-400">or</div>
        <form onSubmit={signInEmail} className="space-y-3">
          <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email" autoComplete="email" className="w-full px-3 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-transparent text-slate-900 dark:text-white" />
          <input type="password" required value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Password" autoComplete="current-password" className="w-full px-3 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-transparent text-slate-900 dark:text-white" />
          <button type="submit" disabled={busy} className="w-full py-2.5 rounded-xl bg-blue-600 text-white font-semibold disabled:opacity-50">Sign in</button>
        </form>
      </>,
    );
  }

  const toggle = (s: AgentScope) => setScopes((cur) => (cur.includes(s) ? cur.filter((x) => x !== s) : [...cur, s]));
  return shell(
    <>
      <div className="flex items-center gap-2 mb-1"><Bot size={20} className="text-blue-600" /><h1 className="text-xl font-bold text-slate-900 dark:text-white">{client.client_name} wants to access ClearMind</h1></div>
      <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">Signed in as <b>{user.email ?? user.displayName}</b> · returns to <b>{client.redirect_host}</b></p>
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-400 mb-2">Allow it to</p>
      <div className="space-y-1 mb-5 max-h-72 overflow-y-auto">
        {SCOPES.map((s) => (
          <label key={s.scope} className="flex items-start gap-3 py-1.5 cursor-pointer">
            <input type="checkbox" className="mt-1" checked={scopes.includes(s.scope)} onChange={() => toggle(s.scope)} />
            <span><span className="text-sm text-slate-900 dark:text-slate-100">{s.label}{s.risky ? ' ⚠︎' : ''}</span><span className="block text-xs text-slate-500">{s.detail}</span></span>
          </label>
        ))}
      </div>
      <div className="flex items-start gap-2 text-xs text-slate-500 dark:text-slate-400 mb-5"><ShieldCheck size={16} className="shrink-0 text-green-600" />Every action is logged, and you can disconnect it any time in ClearMind → Settings → Integrations.</div>
      <div className="flex gap-2">
        <button onClick={() => decide(true)} disabled={busy} className="flex-1 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 font-semibold text-slate-700 dark:text-slate-200">Deny</button>
        <button onClick={() => decide(false)} disabled={busy || !scopes.length} className="flex-1 py-2.5 rounded-xl bg-blue-600 text-white font-semibold disabled:opacity-50 inline-flex items-center justify-center gap-2">{busy ? <Loader2 size={16} className="animate-spin" /> : null}Allow</button>
      </div>
      <button onClick={() => firebaseService.logout()} className="mt-4 w-full text-xs text-slate-400 hover:text-slate-600 inline-flex items-center justify-center gap-1"><LogOut size={12} />Use a different account</button>
    </>,
  );
}
