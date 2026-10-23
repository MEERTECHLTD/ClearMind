/**
 * Loopback sign-in page for the macOS app. The desktop shell serves the web
 * build on http://localhost and opens this page (/desktop-auth) in the user's
 * default browser, because Google blocks OAuth inside embedded webviews. The
 * provider popup runs here, the credential is posted back to the shell (same
 * origin, checked against the one-time `state`), and this browser's Firebase
 * session is signed out again so nothing stays behind. See docs/MACOS.md.
 */
import React, { useState } from 'react';
import { GoogleAuthProvider, GithubAuthProvider, signInWithPopup, signOut } from 'firebase/auth';
import { auth, isFirebaseConfigured } from '../../services/firebase';

type Phase = 'ready' | 'working' | 'done' | 'error';

export default function DesktopAuthBridge() {
  const params = new URLSearchParams(window.location.search);
  const provider = params.get('provider') === 'github' ? 'github' : 'google';
  const state = params.get('state') ?? '';
  const label = provider === 'github' ? 'GitHub' : 'Google';
  const [phase, setPhase] = useState<Phase>(state && isFirebaseConfigured() ? 'ready' : 'error');
  const [message, setMessage] = useState(state ? '' : 'This sign-in link is incomplete. Start again from the ClearMind app.');

  const run = async () => {
    setPhase('working');
    try {
      const result = await signInWithPopup(auth, provider === 'github' ? new GithubAuthProvider() : new GoogleAuthProvider());
      const cred = provider === 'github' ? GithubAuthProvider.credentialFromResult(result) : GoogleAuthProvider.credentialFromResult(result);
      if (!cred) throw new Error(`${label} did not return a credential.`);
      const res = await fetch('/desktop-auth/complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ state, providerId: cred.providerId, idToken: cred.idToken, accessToken: cred.accessToken }),
      });
      if (!res.ok) throw new Error((await res.text()) || 'The ClearMind app did not accept this sign-in.');
      setPhase('done');
    } catch (e: any) {
      setPhase('error');
      setMessage(e?.code === 'auth/popup-closed-by-user' ? 'The sign-in window was closed. Try again.' : e?.message ?? String(e));
    } finally {
      await signOut(auth).catch(() => {});
    }
  };

  return (
    <main className="min-h-screen flex items-center justify-center bg-slate-100 dark:bg-midnight p-6">
      <div className="w-full max-w-sm rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xl p-8 text-center">
        <img src="/clearmindlogo-256.png" alt="" width={64} height={64} className="mx-auto mb-4 rounded-2xl" />
        <h1 className="text-xl font-semibold text-slate-900 dark:text-white">Sign in to ClearMind for Mac</h1>
        {phase === 'done' ? (
          <p role="status" className="mt-4 text-sm text-slate-600 dark:text-slate-300">You're signed in. Return to the ClearMind app — you can close this tab.</p>
        ) : (
          <>
            <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">Continue with {label} in your browser; ClearMind on your Mac finishes signing you in.</p>
            {phase === 'error' && message ? <p role="alert" className="mt-4 text-sm text-red-600 dark:text-red-400">{message}</p> : null}
            <button
              type="button"
              onClick={run}
              disabled={phase === 'working' || !state}
              className="mt-6 w-full rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-medium py-3 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
            >
              {phase === 'working' ? 'Waiting for ' + label + '…' : 'Continue with ' + label}
            </button>
          </>
        )}
      </div>
    </main>
  );
}
