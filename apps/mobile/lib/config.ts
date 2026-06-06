/**
 * Runtime config. Primary source is `process.env.EXPO_PUBLIC_*`, inlined at
 * bundle time by the transform-inline-environment-variables plugin (see
 * babel.config.js — these vars MUST be in its `include` list).
 *
 * TWO requirements for the inlining to work (both were broken in v0.0.11 →
 * empty config → auth/invalid-api-key launch crash):
 *   1. the var name is in the babel plugin `include` list, AND
 *   2. the access is a STATIC member expression `process.env.EXPO_PUBLIC_X`
 *      (NOT `process.env[someVar]` — dynamic keys can't be statically inlined).
 *
 * `app.config` `extra` (expo-constants) is a secondary fallback for dev.
 */
import Constants from 'expo-constants';

const extra: any =
  (Constants.expoConfig?.extra as any) ??
  ((Constants as any).manifest?.extra) ??
  ((Constants as any).manifest2?.extra) ??
  {};

// First non-empty value (empty strings must NOT win over a real value).
const pick = (...vals: (string | undefined)[]): string => vals.find((v) => !!v && v.length > 0) ?? '';

export const firebaseConfig = {
  apiKey: pick(process.env.EXPO_PUBLIC_FIREBASE_API_KEY, extra.firebase?.apiKey),
  authDomain: pick(process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN, extra.firebase?.authDomain),
  projectId: pick(process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID, extra.firebase?.projectId),
  storageBucket: pick(process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET, extra.firebase?.storageBucket),
  messagingSenderId: pick(process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID, extra.firebase?.messagingSenderId),
  appId: pick(process.env.EXPO_PUBLIC_FIREBASE_APP_ID, extra.firebase?.appId),
};

export const isFirebaseConfigured = (): boolean =>
  !!(firebaseConfig.apiKey && firebaseConfig.projectId);

export const geminiApiKey: string = pick(process.env.EXPO_PUBLIC_GEMINI_API_KEY, extra.geminiApiKey);

// OAuth 2.0 Web client id (from google-services.json) for @react-native-google-signin.
export const googleWebClientId: string = pick(process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID, extra.googleWebClientId);
