/**
 * System-browser sign-in page for the macOS app. The desktop app opens this page
 * (/desktop-auth on the deployed web app) in the user's default browser, because
 * Google blocks OAuth inside embedded webviews. The provider popup runs here in
 * a separate, in-memory Firebase instance (so a web session in this browser is
 * left alone and nothing is stored), and the credential goes back to the app
 * sealed in a clearmind-desktop:// link (services/desktopAuthSeal.ts). There is
 * no local server. See docs/MACOS.md.
 */
import React, { useState } from 'react';
import { initializeApp, getApps } from 'firebase/app';
import {
  initializeAuth, inMemoryPersistence, browserPopupRedirectResolver,
  GoogleAuthProvider, GithubAuthProvider, signInWithPopup, type Auth,
} from 'firebase/auth';
import { firebaseConfig, isFirebaseConfigured } from '../../services/firebase';
import { keyFromHash, sealDesktopCredential } from '../../services/desktopAuthSeal';

type Phase = 'ready' | 'working' | 'done' | 'error';

let bridgeAuth: Auth | null = null;
function getBridgeAuth(): Auth {
  if (!bridgeAuth) {
    const app = getApps().find((a) => a.name === 'desktop-auth') ?? initializeApp(firebaseConfig, 'desktop-auth');
    bridgeAuth = initializeAuth(app, { persistence: inMemoryPersistence, popupRedirectResolver: browserPopupRedirectResolver });
  }
  return bridgeAuth;
}

export default function DesktopAuthBridge() {
  const params = new URLSearchParams(window.location.search);
  const provider = params.get('provider') === 'github' ? 'github' : 'google';
  const state = params.get('state') ?? '';
  const [key] = useState(() => keyFromHash(window.location.hash));
  const label = provider === 'github' ? 'GitHub' : 'Google';
  const valid = /^[0-9a-f]{48}$/.test(state) && !!key;
  const [phase, setPhase] = useState<Phase>(valid && isFirebaseConfigured() ? 'ready' : 'error');
  const [message, setMessage] = useState(valid ? '' : 'This sign-in link is incomplete. Start again from the ClearMind app.');
  const [link, setLink] = useState('');

  const run = async () => {
    if (!key) return;
    setPhase('working');
    try {
      const result = await signInWithPopup(getBridgeAuth(), provider === 'github' ? new GithubAuthProvider() : new GoogleAuthProvider());
      const cred = provider === 'github' ? GithubAuthProvider.credentialFromResult(result) : GoogleAuthProvider.credentialFromResult(result);
      if (!cred) throw new Error(`${label} did not return a credential.`);
      const back = await sealDesktopCredential({ providerId: cred.providerId, idToken: cred.idToken, accessToken: cred.accessToken }, state, key);
      setLink(back);
      setPhase('done');
      window.location.href = back; // the browser asks to open ClearMind
    } catch (e: any) {
      setPhase('error');
      setMessage(e?.code === 'auth/popup-closed-by-user' ? 'The sign-in window was closed. Try again.' : e?.message ?? String(e));
    } finally {
      await getBridgeAuth().signOut().catch(() => {});
    }
  };

  return (
    <main className="min-h-screen flex items-center justify-center bg-slate-100 dark:bg-midnight p-6">
      <div className="w-full max-w-sm rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xl p-8 text-center">
        <img src="/clearmindlogo-256.png" alt="" width={64} height={64} className="mx-auto mb-4 rounded-2xl" />
        <h1 className="text-xl font-semibold text-slate-900 dark:text-white">Sign in to ClearMind</h1>
        {phase === 'done' ? (
          <>
            <p role="status" className="mt-4 text-sm text-slate-600 dark:text-slate-300">Almost done. If your browser asks, allow it to open ClearMind. You can close this tab after that.</p>
            <a
              href={link}
              className="mt-6 block w-full rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-medium py-3 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
            >
              Open ClearMind
            </a>
          </>
        ) : (
          <>
            <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">Continue with {label} in your browser. The ClearMind app finishes signing you in.</p>
            {phase === 'error' && message ? <p role="alert" className="mt-4 text-sm text-red-600 dark:text-red-400">{message}</p> : null}
            <button
              type="button"
              onClick={run}
              disabled={phase === 'working' || !valid}
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
