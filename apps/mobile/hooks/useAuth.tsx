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
import { dbService, STORES } from '../services/db';

const PROFILE_ID = 'current-user';

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
    const unsub = firebaseService.onAuthChange((u) => {
      setUser(u);
      uidRef.current = u?.uid ?? null;
      if (u) cacheProfile(u.uid);
      else setProfile(null);
      setChecking(false);
    });
    return unsub;
  }, [configured, cacheProfile]);

  const signOut = useCallback(async () => {
    await firebaseService.logout();
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
