/**
 * Mobile firebaseService — mirrors the web `firebaseService` method names and
 * signatures (services/firebase.ts) so ported views and the sync layer call an
 * identical surface. All Firestore work delegates to @clearmind/shared/data/
 * firestore with the SAME injected `(db, uid)` the web wrapper uses, guaranteeing
 * mobile reads/writes the identical `users/{uid}/{collection}` paths. (DECISIONS.md D4.)
 *
 * NOTE (Phase 3): email / anonymous / profile / Firestore methods are complete.
 * Google & GitHub sign-in are stubbed — on native there is no signInWithPopup;
 * they must use expo-auth-session to obtain a credential, then signInWithCredential.
 */
import {
  onAuthStateChanged,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  sendEmailVerification,
  sendPasswordResetEmail,
  signInAnonymously as fbSignInAnonymously,
  GoogleAuthProvider,
  signInWithCredential,
  signOut,
  type User,
} from 'firebase/auth';
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { GoogleSignin } from '@react-native-google-signin/google-signin';
import {
  pushItemToCloud as fsPushItem,
  deleteItemFromCloud as fsDeleteItem,
  fetchFromCloud as fsFetch,
  syncToCloud as fsSyncToCloud,
  subscribeToCollection as fsSubscribe,
} from '@clearmind/shared/data/firestore';
import { auth, db, isFirebaseConfigured } from '../lib/firebase';
import { googleWebClientId } from '../lib/config';

export { isFirebaseConfigured };

// Configure Google Sign-In once (idempotent). webClientId is the OAuth 2.0 Web
// client id from google-services.json (NOT the Android client id).
let _googleConfigured = false;
export function configureGoogleSignin(): void {
  if (_googleConfigured) return;
  GoogleSignin.configure({ webClientId: googleWebClientId, offlineAccess: false });
  _googleConfigured = true;
}

export interface FirebaseUser {
  uid: string;
  email: string | null;
  displayName: string | null;
  photoURL: string | null;
  provider: 'email' | 'google' | 'github' | 'anonymous';
}

const requireUid = (): string => {
  const user = auth.currentUser;
  if (!user) throw new Error('Not authenticated');
  return user.uid;
};

export const firebaseService = {
  isConfigured: isFirebaseConfigured,

  async signUpWithEmail(email: string, password: string, nickname: string): Promise<FirebaseUser> {
    const cred = await createUserWithEmailAndPassword(auth, email, password);
    await sendEmailVerification(cred.user);
    await setDoc(doc(db, 'users', cred.user.uid), {
      nickname, email, provider: 'email', joinedAt: serverTimestamp(), photoURL: null,
    });
    return { uid: cred.user.uid, email: cred.user.email, displayName: nickname, photoURL: null, provider: 'email' };
  },

  async signInWithEmail(email: string, password: string): Promise<FirebaseUser> {
    const cred = await signInWithEmailAndPassword(auth, email, password);
    const snap = await getDoc(doc(db, 'users', cred.user.uid));
    const data = snap.data();
    return {
      uid: cred.user.uid,
      email: cred.user.email,
      displayName: data?.nickname || cred.user.displayName,
      photoURL: cred.user.photoURL,
      provider: 'email',
    };
  },

  async signInAnonymously(): Promise<FirebaseUser> {
    const cred = await fbSignInAnonymously(auth);
    const ref = doc(db, 'users', cred.user.uid);
    if (!(await getDoc(ref)).exists()) {
      await setDoc(ref, { nickname: 'Guest', email: null, provider: 'anonymous', photoURL: null, joinedAt: serverTimestamp() });
    }
    return { uid: cred.user.uid, email: null, displayName: 'Guest', photoURL: null, provider: 'anonymous' };
  },

  // Native Google sign-in: GoogleSignin -> idToken -> Firebase credential.
  async signInWithGoogle(): Promise<FirebaseUser> {
    configureGoogleSignin();
    await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
    // @react-native-google-signin v13+ returns { type, data: { idToken, user } };
    // older returns { idToken, user }. Handle both.
    const res: any = await GoogleSignin.signIn();
    const idToken: string | undefined = res?.data?.idToken ?? res?.idToken;
    if (!idToken) throw new Error('Google sign-in returned no idToken');
    const cred = GoogleAuthProvider.credential(idToken);
    const { user } = await signInWithCredential(auth, cred);
    const ref = doc(db, 'users', user.uid);
    if (!(await getDoc(ref)).exists()) {
      await setDoc(ref, {
        nickname: user.displayName || user.email?.split('@')[0] || 'User',
        email: user.email,
        provider: 'google',
        photoURL: user.photoURL,
        joinedAt: serverTimestamp(),
      });
    }
    return {
      uid: user.uid,
      email: user.email,
      displayName: user.displayName,
      photoURL: user.photoURL,
      provider: 'google',
    };
  },
  // Phase 3: expo-auth-session GitHub OAuth -> GithubAuthProvider.credential(token) -> signInWithCredential.
  async signInWithGithub(): Promise<FirebaseUser> {
    throw new Error('GitHub sign-in: implement with expo-auth-session in Phase 3');
  },

  async resetPassword(email: string): Promise<void> {
    await sendPasswordResetEmail(auth, email);
  },

  async logout(): Promise<void> {
    await signOut(auth);
  },

  getCurrentUser(): User | null {
    return auth.currentUser;
  },

  onAuthChange(cb: (user: User | null) => void): () => void {
    return onAuthStateChanged(auth, cb);
  },

  async getUserProfile(uid: string): Promise<any> {
    const snap = await getDoc(doc(db, 'users', uid));
    return snap.exists() ? snap.data() : null;
  },

  async updateUserProfile(uid: string, data: Partial<{ nickname: string; photoURL: string }>): Promise<void> {
    await setDoc(doc(db, 'users', uid), data, { merge: true });
  },

  // --- Firestore data ops: identical paths/semantics to web via the shared core ---
  async pushItemToCloud<T extends { id: string }>(collectionName: string, item: T): Promise<void> {
    return fsPushItem(db, requireUid(), collectionName, item);
  },
  async deleteItemFromCloud(collectionName: string, itemId: string): Promise<void> {
    return fsDeleteItem(db, requireUid(), collectionName, itemId);
  },
  async fetchFromCloud<T>(collectionName: string): Promise<T[]> {
    return fsFetch<T>(db, requireUid(), collectionName);
  },
  async syncToCloud<T extends { id: string }>(collectionName: string, items: T[]): Promise<void> {
    return fsSyncToCloud(db, requireUid(), collectionName, items);
  },
  subscribeToCollection<T>(collectionName: string, onUpdate: (items: T[]) => void): () => void {
    if (!auth.currentUser) return () => {};
    return fsSubscribe<T>(db, auth.currentUser.uid, collectionName, onUpdate, { includeDeleted: false });
  },
  subscribeToCollectionRaw<T>(collectionName: string, onUpdate: (items: T[]) => void): () => void {
    if (!auth.currentUser) return () => {};
    return fsSubscribe<T>(db, auth.currentUser.uid, collectionName, onUpdate, { includeDeleted: true });
  },
  subscribeToAllCollections(collectionNames: string[], onUpdate: (collectionName: string, items: any[]) => void): () => void {
    const unsubs = collectionNames.map(name =>
      this.subscribeToCollectionRaw(name, (items) => onUpdate(name, items))
    );
    return () => unsubs.forEach(u => u());
  },
};
