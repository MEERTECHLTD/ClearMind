/**
 * Firebase initialisation for React Native (Expo).
 *
 * Config comes from lib/config.ts (embedded via app.config `extra`). Auth uses
 * AsyncStorage persistence via the firebase RN build's getReactNativePersistence.
 *
 * IMPORTANT: only initialise when actually configured. Calling getAuth()/
 * initializeAuth() with an empty apiKey throws `auth/invalid-api-key`, which —
 * if uncaught at module load — crashes the app on launch (the v0.0.11 bug).
 */
import { initializeApp, getApps, getApp, type FirebaseApp } from 'firebase/app';
// Metro resolves firebase/auth's `react-native` condition, whose build DOES
// export getReactNativePersistence (the node build does not — hence @ts-ignore).
// @ts-ignore
import { initializeAuth, getAuth, getReactNativePersistence, type Auth } from 'firebase/auth';
import { getFirestore, type Firestore } from 'firebase/firestore';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { firebaseConfig, isFirebaseConfigured } from './config';

export { isFirebaseConfigured };

let _app: FirebaseApp | null = null;
let _auth: Auth | null = null;
let _db: Firestore | null = null;

if (isFirebaseConfigured()) {
  _app = getApps().length ? getApp() : initializeApp(firebaseConfig);
  try {
    _auth = initializeAuth(_app, {
      persistence: getReactNativePersistence(AsyncStorage),
    });
  } catch {
    // Already initialised (Fast Refresh) — reuse the existing instance.
    _auth = getAuth(_app);
  }
  _db = getFirestore(_app);
}

// Non-null assertions for ergonomics: callers gate on isFirebaseConfigured()
// (firebaseService throws a clear "not configured" error otherwise).
export const app = _app;
export const auth = _auth as Auth;
export const db = _db as Firestore;
