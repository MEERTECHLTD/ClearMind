import { initializeApp } from 'firebase/app';
import { 
  getAuth, 
  createUserWithEmailAndPassword, 
  signInWithEmailAndPassword, 
  signOut,
  onAuthStateChanged,
  sendEmailVerification,
  sendPasswordResetEmail,
  signInWithPopup,
  signInAnonymously,
  GoogleAuthProvider,
  GithubAuthProvider,
  User
} from 'firebase/auth';
import {
  getFirestore,
  doc,
  setDoc,
  getDoc,
  serverTimestamp,
  Unsubscribe
} from 'firebase/firestore';
// Firestore read/write/subscribe logic lives in the shared core (injected db+uid).
// These thin wrappers keep firebaseService's public signatures unchanged while
// the implementation is shared verbatim with mobile. (See DECISIONS.md, D4.)
import {
  pushItemToCloud as fsPushItem,
  deleteItemFromCloud as fsDeleteItem,
  fetchFromCloud as fsFetch,
  syncToCloud as fsSyncToCloud,
  subscribeToCollection as fsSubscribe,
} from '@clearmind/shared/data/firestore';

// Firebase config - Replace with your Firebase project config
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || '',
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || '',
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || '',
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || '',
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || '',
  appId: import.meta.env.VITE_FIREBASE_APP_ID || ''
};

// Check if Firebase is configured
export const isFirebaseConfigured = () => {
  return !!(firebaseConfig.apiKey && firebaseConfig.projectId);
};

// Initialize Firebase only if configured
let app: any = null;
let auth: any = null;
let db: any = null;

if (isFirebaseConfigured()) {
  app = initializeApp(firebaseConfig);
  auth = getAuth(app);
  db = getFirestore(app);
}

// Auth Providers
const googleProvider = new GoogleAuthProvider();
const githubProvider = new GithubAuthProvider();

// (sanitizeForFirestore moved to @clearmind/shared/data/firestore — the cloud
// write paths below delegate there, so no local copy is needed.)

export interface FirebaseUser {
  uid: string;
  email: string | null;
  displayName: string | null;
  photoURL: string | null;
  provider: 'email' | 'google' | 'github';
}

export const firebaseService = {
  // Check if Firebase is ready
  isConfigured(): boolean {
    return isFirebaseConfigured();
  },

  // Sign up with email
  async signUpWithEmail(email: string, password: string, nickname: string): Promise<FirebaseUser> {
    if (!auth) throw new Error('Firebase not configured');
    
    const userCredential = await createUserWithEmailAndPassword(auth, email, password);
    await sendEmailVerification(userCredential.user);
    
    // Create user profile in Firestore
    await setDoc(doc(db, 'users', userCredential.user.uid), {
      nickname,
      email,
      provider: 'email',
      joinedAt: serverTimestamp(),
      photoURL: null
    });
    
    return {
      uid: userCredential.user.uid,
      email: userCredential.user.email,
      displayName: nickname,
      photoURL: null,
      provider: 'email'
    };
  },

  // Sign in with email
  async signInWithEmail(email: string, password: string): Promise<FirebaseUser> {
    if (!auth) throw new Error('Firebase not configured');
    
    const userCredential = await signInWithEmailAndPassword(auth, email, password);
    const userDoc = await getDoc(doc(db, 'users', userCredential.user.uid));
    const userData = userDoc.data();
    
    return {
      uid: userCredential.user.uid,
      email: userCredential.user.email,
      displayName: userData?.nickname || userCredential.user.displayName,
      photoURL: userCredential.user.photoURL,
      provider: 'email'
    };
  },

  // Sign in with Google
  async signInWithGoogle(): Promise<FirebaseUser> {
    if (!auth) throw new Error('Firebase not configured');
    
    const result = await signInWithPopup(auth, googleProvider);
    const user = result.user;
    
    // Check if user exists in Firestore, if not create profile
    const userDoc = await getDoc(doc(db, 'users', user.uid));
    if (!userDoc.exists()) {
      await setDoc(doc(db, 'users', user.uid), {
        nickname: user.displayName,
        email: user.email,
        provider: 'google',
        photoURL: user.photoURL,
        joinedAt: serverTimestamp()
      });
    }
    
    return {
      uid: user.uid,
      email: user.email,
      displayName: user.displayName,
      photoURL: user.photoURL,
      provider: 'google'
    };
  },

  // Sign in with GitHub
  async signInWithGithub(): Promise<FirebaseUser> {
    if (!auth) throw new Error('Firebase not configured');
    
    const result = await signInWithPopup(auth, githubProvider);
    const user = result.user;
    
    // Check if user exists in Firestore, if not create profile
    const userDoc = await getDoc(doc(db, 'users', user.uid));
    if (!userDoc.exists()) {
      await setDoc(doc(db, 'users', user.uid), {
        nickname: user.displayName || user.email?.split('@')[0],
        email: user.email,
        provider: 'github',
        photoURL: user.photoURL,
        joinedAt: serverTimestamp()
      });
    }
    
    return {
      uid: user.uid,
      email: user.email,
      displayName: user.displayName || user.email?.split('@')[0] || 'User',
      photoURL: user.photoURL,
      provider: 'github'
    };
  },

  // Sign in anonymously
  async signInAnonymously(): Promise<FirebaseUser> {
    if (!auth) throw new Error('Firebase not configured');
    
    const result = await signInAnonymously(auth);
    const user = result.user;
    
    // Create anonymous user profile
    const userDoc = await getDoc(doc(db, 'users', user.uid));
    if (!userDoc.exists()) {
      await setDoc(doc(db, 'users', user.uid), {
        nickname: 'Guest',
        email: null,
        provider: 'anonymous',
        photoURL: null,
        joinedAt: serverTimestamp()
      });
    }
    
    return {
      uid: user.uid,
      email: null,
      displayName: 'Guest',
      photoURL: null,
      provider: 'anonymous' as any
    };
  },

  // Sign out
  async logout(): Promise<void> {
    if (!auth) throw new Error('Firebase not configured');
    await signOut(auth);
  },

  // Reset password
  async resetPassword(email: string): Promise<void> {
    if (!auth) throw new Error('Firebase not configured');
    await sendPasswordResetEmail(auth, email);
  },

  // Get current user
  getCurrentUser(): User | null {
    if (!auth) return null;
    return auth.currentUser;
  },

  // Listen to auth state changes
  onAuthChange(callback: (user: User | null) => void): () => void {
    if (!auth) {
      callback(null);
      return () => {};
    }
    return onAuthStateChanged(auth, callback);
  },

  // Get user profile from Firestore
  async getUserProfile(uid: string): Promise<any> {
    if (!db) throw new Error('Firebase not configured');
    const userDoc = await getDoc(doc(db, 'users', uid));
    return userDoc.exists() ? userDoc.data() : null;
  },

  // Update user profile
  async updateUserProfile(uid: string, data: Partial<{ nickname: string; photoURL: string }>): Promise<void> {
    if (!db) throw new Error('Firebase not configured');
    await setDoc(doc(db, 'users', uid), data, { merge: true });
  },

  // Sync data to cloud - batch chunking lives in the shared core.
  async syncToCloud<T extends { id: string }>(storeName: string, items: T[]): Promise<void> {
    if (!auth || !db) throw new Error('Firebase not configured');
    const user = auth.currentUser;
    if (!user) throw new Error('Not authenticated');
    await fsSyncToCloud(db, user.uid, storeName, items);
  },

  // Fetch from cloud
  async fetchFromCloud<T>(storeName: string): Promise<T[]> {
    if (!auth || !db) throw new Error('Firebase not configured');
    const user = auth.currentUser;
    if (!user) throw new Error('Not authenticated');
    return fsFetch<T>(db, user.uid, storeName);
  },

  // Full sync (merge local and cloud)
  async fullSync<T extends { id: string; updatedAt?: string; lastEdited?: string; deleted?: boolean }>(
    storeName: string, 
    localItems: T[]
  ): Promise<T[]> {
    const cloudItems = await this.fetchFromCloud(storeName) as (T & { syncedAt?: string; deleted?: boolean })[];
    
    const merged = new Map<string, T>();
    
    // Add cloud items first
    cloudItems.forEach(item => merged.set(item.id, item));
    
    // Merge local items - newest wins
    localItems.forEach(localItem => {
      const cloudItem = merged.get(localItem.id);
      
      if (!cloudItem) {
        merged.set(localItem.id, localItem);
      } else {
        // Compare timestamps - newest wins
        const localTime = localItem.updatedAt || localItem.lastEdited || '0';
        const cloudTime = (cloudItem as any).updatedAt || (cloudItem as any).lastEdited || '0';
        if (new Date(localTime) > new Date(cloudTime)) {
          merged.set(localItem.id, localItem);
        }
      }
    });
    
    const finalItems = Array.from(merged.values());
    
    // Push merged result back to cloud
    await this.syncToCloud(storeName, finalItems);
    
    // Return only non-deleted items for the UI
    return finalItems.filter(item => !(item as any).deleted);
  },

  // Subscribe to real-time updates from Firestore
  // Note: This filters out soft-deleted items (deleted: true) before calling onUpdate
  subscribeToCollection<T>(
    storeName: string,
    onUpdate: (items: T[]) => void
  ): Unsubscribe {
    if (!auth || !db) {
      console.warn('Firebase not configured - real-time sync disabled');
      return () => {};
    }

    const user = auth.currentUser;
    if (!user) {
      console.warn('Not authenticated - real-time sync disabled');
      return () => {};
    }

    return fsSubscribe<T>(db, user.uid, storeName, onUpdate, { includeDeleted: false });
  },

  // Subscribe to all collections for full real-time sync
  // Note: This returns ALL items INCLUDING deleted ones for proper sync logic
  subscribeToAllCollections(
    storeNames: string[],
    onUpdate: (storeName: string, items: any[]) => void
  ): () => void {
    const unsubscribers: Unsubscribe[] = [];
    
    storeNames.forEach((storeName) => {
      // Use raw subscription that includes deleted items for sync
      const unsubscribe = this.subscribeToCollectionRaw(storeName, (items) => {
        onUpdate(storeName, items);
      });
      unsubscribers.push(unsubscribe);
    });
    
    // Return cleanup function
    return () => {
      unsubscribers.forEach((unsubscribe) => unsubscribe());
    };
  },

  // Subscribe to real-time updates INCLUDING deleted items (for sync purposes)
  subscribeToCollectionRaw<T>(
    storeName: string,
    onUpdate: (items: T[]) => void
  ): Unsubscribe {
    if (!auth || !db) {
      console.warn('Firebase not configured - real-time sync disabled');
      return () => {};
    }

    const user = auth.currentUser;
    if (!user) {
      console.warn('Not authenticated - real-time sync disabled');
      return () => {};
    }

    return fsSubscribe<T>(db, user.uid, storeName, onUpdate, { includeDeleted: true });
  },

  // Push a single item to cloud (for instant sync)
  async pushItemToCloud<T extends { id: string }>(storeName: string, item: T): Promise<void> {
    if (!auth || !db) throw new Error('Firebase not configured');
    const user = auth.currentUser;
    if (!user) throw new Error('Not authenticated');
    await fsPushItem(db, user.uid, storeName, item);
  },

  // Delete a single item from cloud
  async deleteItemFromCloud(storeName: string, itemId: string): Promise<void> {
    if (!auth || !db) throw new Error('Firebase not configured');
    const user = auth.currentUser;
    if (!user) throw new Error('Not authenticated');
    await fsDeleteItem(db, user.uid, storeName, itemId);
  }
};

export { auth, db };
