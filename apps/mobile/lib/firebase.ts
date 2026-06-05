/**
 * Firebase initialisation for React Native (Expo).
 *
 * Uses the SAME Firebase project config as the web app (read from EXPO_PUBLIC_*),
 * so a single user's data lives in the same Firestore. The only RN-specific
 * difference vs. web is auth persistence: `getAuth` has no persistence on RN, so
 * we use `initializeAuth` with `getReactNativePersistence(AsyncStorage)` to keep
 * the user signed in across app launches.
 */
import { initializeApp, getApps, getApp, type FirebaseApp } from 'firebase/app';
// NOTE (Phase 3): getReactNativePersistence exists at runtime on RN but is absent
// from firebase's web type surface in some versions. @ts-ignore (not -expect-error)
// so it stays valid whichever way the installed RN types land; revisit once the
// toolchain is installed and type-checked.
// @ts-ignore
import { initializeAuth, getAuth, getReactNativePersistence, type Auth } from 'firebase/auth';
import { getFirestore, type Firestore } from 'firebase/firestore';
import AsyncStorage from '@react-native-async-storage/async-storage';

const firebaseConfig = {
  apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY ?? '',
  authDomain: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN ?? '',
  projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID ?? '',
  storageBucket: process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET ?? '',
  messagingSenderId: process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID ?? '',
  appId: process.env.EXPO_PUBLIC_FIREBASE_APP_ID ?? '',
};

export const isFirebaseConfigured = (): boolean =>
  !!(firebaseConfig.apiKey && firebaseConfig.projectId);

const app: FirebaseApp = getApps().length ? getApp() : initializeApp(firebaseConfig);

// initializeAuth throws if called twice (e.g. Fast Refresh); fall back to getAuth.
let _auth: Auth;
try {
  _auth = initializeAuth(app, {
    persistence: getReactNativePersistence(AsyncStorage),
  });
} catch {
  _auth = getAuth(app);
}

export const auth: Auth = _auth;
export const db: Firestore = getFirestore(app);
