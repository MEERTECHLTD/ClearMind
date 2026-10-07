/**
 * Auth context — a SINGLE firebaseService.onAuthChange subscription for the whole
 * app (consumed by the root layout for routing and by Settings/Dashboard for the
 * profile). This build embeds Firebase config, so isFirebaseConfigured() is always
 * true; the signed-in profile lives at users/{uid} and is cached into the local
 * sqlite `profile` store so nickname is available offline.
 */
import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import type { User } from 'firebase/auth';
import type { UserProfile } from '@clearmind/shared';
import { firebaseService, isFirebaseConfigured } from '../services/firebaseService';
import { configureGoogleSignin } from '../services/firebaseService';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { dbService, STORES } from '../services/db';
import { flushPending } from '../services/syncService';
import { resetAllStores } from '../lib/collectionStore';
import { logWarn } from '../lib/logger';
import { subscribeProfile } from '@clearmind/shared/data/account';
import { db } from '../lib/firebase';

const PROFILE_ID = 'current-user';
const OWNER_KEY = 'clearmind:localOwnerUid';

/**
 * The local sqlite cache belongs to ONE account. If a different account signs in
 * on this device, wipe the previous account's rows first — otherwise they'd show
 * in the new account and be pushed into its cloud data. The same account signing
 * back in keeps its local data (including edits made offline, not yet synced).
 * First run after upgrading: the existing cache is claimed by whoever is signed in.
 */
async function ensureLocalOwner(uid: string): Promise<void> {
  try {
    const owner = await AsyncStorage.getItem(OWNER_KEY);
    if (owner && owner !== uid) {
      await dbService.wipeAll();
      resetAllStores();
    }
    if (owner !== uid) await AsyncStorage.setItem(OWNER_KEY, uid);
  } catch (e) {
    logWarn('local owner check failed: ' + String(e));
  }
}

interface AuthValue {
  user: User | null;
  profile: UserProfile | null;
  checking: boolean;
  configured: boolean;
  refreshProfile: () => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [checking, setChecking] = useState(true);
  const configured = isFirebaseConfigured();
  const uidRef = useRef<string | null>(null);

  const cacheProfile = useCallback(async (uid: string) => {
    try {
      const cloud = await firebaseService.getUserProfile(uid);
      if (cloud) {
        const local: UserProfile = { id: PROFILE_ID, ...(cloud as any) };
        await dbService.putLocalOnly(STORES.PROFILE, local);
        setProfile(local);
        return;
      }
    } catch {
      // offline — fall back to the local cache below
    }
    const cached = await dbService.get<UserProfile>(STORES.PROFILE, PROFILE_ID);
    if (cached) setProfile(cached);
  }, []);

  const refreshProfile = useCallback(async () => {
    if (uidRef.current) await cacheProfile(uidRef.current);
  }, [cacheProfile]);

  useEffect(() => {
    if (!configured) {
      setChecking(false);
      return;
    }
    try {
      configureGoogleSignin();
    } catch {
      // Play Services / native module unavailable — handled at sign-in time.
    }
    const unsub = firebaseService.onAuthChange(async (u) => {
      // Scope local data to this account BEFORE any screen reads it.
      if (u) await ensureLocalOwner(u.uid);
      setUser(u);
      uidRef.current = u?.uid ?? null;
      if (u) cacheProfile(u.uid);
      else setProfile(null);
      setChecking(false);
    });
    return unsub;
  }, [configured, cacheProfile]);

  // Realtime profile (name/photo edits on any device appear here immediately).
  useEffect(() => {
    if (!user || !configured) return;
    const unsub = subscribeProfile(db, user.uid, (p) => {
      if (!p) return;
      const local: UserProfile = { id: PROFILE_ID, ...(p as any) };
      setProfile(local);
      dbService.putLocalOnly(STORES.PROFILE, local).catch(() => {});
    });
    return unsub;
  }, [user, configured]);

  const signOut = useCallback(async () => {
    // Best-effort: push queued changes (bounded so an offline sign-out never
    // hangs). The outbox persists, so anything unsent goes out next sign-in.
    try {
      await Promise.race([flushPending(), new Promise((r) => setTimeout(r, 8000))]);
    } catch {
      /* offline — data stays on this device for this account */
    }
    await firebaseService.logout();
    resetAllStores();
    setProfile(null);
  }, []);

  return (
    <AuthContext.Provider value={{ user, profile, checking, configured, refreshProfile, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
