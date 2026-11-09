/**
 * Delete account: Settings › Account › Danger zone (also in Data & privacy, and
 * ClearMind › Delete Account… in the macOS menu bar). The same complete,
 * immediate deletion as iOS:
 *   1. confirm the sign-in when it is too old for Firebase to delete the login
 *      (password, or the provider's own sign-in), so nothing stops halfway
 *   2. every Firestore document of the account (shared/data/account.ts)
 *   3. revoke the Sign in with Apple token (Apple requirement)
 *   4. the Firebase Auth login
 *   5. this device's local copy
 */
import React, { useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle2 } from 'lucide-react';
import { deleteUser } from 'firebase/auth';
import { auth, db, firebaseService } from '../../services/firebase';
import { dbService, getSyncableStores, getFirestoreCollectionName } from '../../services/db';
import { stopSync } from '../../services/syncEngine';
import { deleteAccountData } from '../../shared/data/account';
import { cx, Modal } from '../tasks/ui';

const PROVIDER_NAME: Record<string, string> = { apple: 'Apple', google: 'Google', github: 'GitHub' };

function reauthError(e: any): string {
  switch (e?.code) {
    case 'auth/wrong-password':
    case 'auth/invalid-credential':
    case 'auth/invalid-login-credentials': return 'That password isn’t right. Nothing was deleted.';
    case 'auth/too-many-requests': return 'Too many attempts. Wait a minute and try again. Nothing was deleted.';
    case 'auth/user-mismatch': return 'That’s a different account. Confirm with the account you’re deleting. Nothing was deleted.';
    case 'auth/popup-closed-by-user':
    case 'auth/cancelled-popup-request':
    case 'canceled': return 'Confirmation was cancelled. Nothing was deleted.';
    case 'auth/network-request-failed': return 'You’re offline. Connect to the internet and try again. Nothing was deleted.';
    default: return /cancel/i.test(e?.message ?? '') ? 'Confirmation was cancelled. Nothing was deleted.' : `${e?.message ?? 'Couldn’t confirm it’s you.'} Nothing was deleted.`;
  }
}

/** `available`: signed in to a cloud account. The dialog stays up after the login is gone, to show the result. */
export function DeleteAccountDialog({ open, available, onClose, onDeleted }: { open: boolean; available: boolean; onClose: () => void; onDeleted: () => void }) {
  const [confirmText, setConfirmText] = useState('');
  const [password, setPassword] = useState('');
  const [needsLogin, setNeedsLogin] = useState(false);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState('');
  const [error, setError] = useState('');
  const [done, setDone] = useState<null | { loginKept: boolean; guest: boolean }>(null);
  const fb = auth?.currentUser ?? null;
  const method = fb ? firebaseService.reauthMethod(fb) : null;

  const shown = open && (available || busy || !!done);
  useEffect(() => {
    if (!open) return;
    setConfirmText(''); setPassword(''); setError(''); setProgress(''); setDone(null); setNeedsLogin(false);
    const u = auth?.currentUser;
    if (u) firebaseService.needsRecentLogin(u).then(setNeedsLogin, () => {});
  }, [open]);

  // After deletion there is no account to go back to: closing returns to the welcome screen.
  const close = () => { if (busy) return; if (done) onDeleted(); else onClose(); };

  const run = async () => {
    const u = auth?.currentUser;
    if (!u) return;
    setBusy(true);
    setError('');
    let step: 'confirm' | 'delete' = 'confirm';
    try {
      let appleCode: string | undefined;
      if (await firebaseService.needsRecentLogin(u)) {
        setNeedsLogin(true);
        if (method === 'password' && !password) { setError('Enter your password to continue. Nothing was deleted.'); return; }
        setProgress(method === 'password' ? 'Checking your password…' : `Confirm it’s you with ${PROVIDER_NAME[method ?? ''] ?? 'your sign-in'}…`);
        appleCode = (await firebaseService.reauthenticate(u, password)).appleAuthorizationCode;
      }
      step = 'delete';
      stopSync();
      await deleteAccountData(db, u.uid, getSyncableStores().map(getFirestoreCollectionName), setProgress);
      if (u.providerData.some((p) => p.providerId === 'apple.com')) setProgress('Revoking Sign in with Apple…');
      await firebaseService.revokeAppleIfLinked(u, appleCode);
      setProgress('Removing your login…');
      let loginKept = false;
      try { await deleteUser(u); } catch (e: any) {
        if (e?.code !== 'auth/requires-recent-login') throw e;
        loginKept = true;
      }
      setProgress('Removing data from this device…');
      await dbService.wipeAll();
      setDone({ loginKept, guest: u.isAnonymous });
    } catch (e: any) {
      setError(step === 'confirm' ? reauthError(e) : `Deletion didn’t finish: ${e?.message ?? 'unknown error'}. Try again to delete the rest.`);
    } finally { setBusy(false); setProgress(''); }
  };

  const pwField = needsLogin && method === 'password';
  return (
    <Modal open={shown} onClose={close} title={done ? 'Account deleted' : 'Delete account'}>
      {done ? (
        <div className="p-5 space-y-4" role="status">
          <p className={`text-sm flex gap-2 ${cx.text}`}><CheckCircle2 size={18} className="text-green-600 shrink-0" />
            {done.guest && done.loginKept
              ? 'Your guest workspace was deleted. All its data was permanently removed from ClearMind and this device.'
              : done.loginKept
                ? 'All your ClearMind data was deleted. To remove the login itself, sign in once more and delete again.'
                : 'Your ClearMind account was deleted. Your login, profile and all your data were permanently removed from ClearMind and this device.'}
          </p>
          <div className="flex justify-end"><button className={cx.btnPrimary} onClick={onDeleted} autoFocus>Done</button></div>
        </div>
      ) : (
        <form className="p-5 space-y-3" onSubmit={(e) => { e.preventDefault(); if (confirmText.trim() === 'DELETE' && !busy) void run(); }}>
          <p className={`text-sm flex gap-2 ${cx.muted}`}><AlertTriangle size={18} className="text-red-500 shrink-0" />
            This permanently deletes your ClearMind account{fb?.email ? ` (${fb.email})` : ''} and everything in it on all devices: tasks, projects, notes, your profile, agent access and shared workspaces you own. This can’t be undone.
          </p>
          {pwField ? (
            <label className="block">
              <span className={`text-xs ${cx.muted}`}>For your security, enter your password</span>
              <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} className={`${cx.input} w-full mt-1`} autoComplete="current-password" aria-label="Password" disabled={busy} />
            </label>
          ) : needsLogin && method ? (
            <p className={`text-xs ${cx.muted}`}>For your security, {PROVIDER_NAME[method]} will ask you to confirm it’s you first.</p>
          ) : null}
          <label className="block">
            <span className={`text-xs ${cx.muted}`}>Type DELETE to confirm</span>
            <input value={confirmText} onChange={(e) => setConfirmText(e.target.value)} className={`${cx.input} w-full mt-1`} placeholder="DELETE" aria-label="Type DELETE to confirm" autoFocus={!pwField} disabled={busy} />
          </label>
          {progress ? <p className={`text-xs ${cx.muted}`} aria-live="polite">{progress}</p> : null}
          {error ? <p className="text-xs text-red-600 dark:text-red-400" role="alert">{error}</p> : null}
          <div className="flex justify-end gap-2">
            <button type="button" className={cx.btnGhost} onClick={close} disabled={busy}>Cancel</button>
            <button type="submit" className="px-3 py-1.5 rounded-lg text-sm font-semibold bg-red-600 text-white disabled:opacity-40" disabled={confirmText.trim() !== 'DELETE' || busy || (pwField && !password)}>
              {busy ? 'Deleting…' : 'Delete my account'}
            </button>
          </div>
        </form>
      )}
    </Modal>
  );
}
