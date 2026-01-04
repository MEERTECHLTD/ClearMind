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
  collection, 
  doc, 
  setDoc, 
  getDoc, 
  getDocs,
  writeBatch,
  serverTimestamp,
  onSnapshot,
  query,
  Unsubscribe
} from 'firebase/firestore';

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

// Helper function to remove undefined values from objects (Firestore doesn't accept undefined)
const sanitizeForFirestore = <T extends object>(obj: T): T => {
  const sanitized: any = {};
  for (const [key, value] of Object.entries(obj)) {
    if (value === undefined) {
      // Convert undefined to null (Firestore accepts null)
      sanitized[key] = null;
    } else if (value !== null && typeof value === 'object' && !Array.isArray(value) && !(value instanceof Date)) {
      // Recursively sanitize nested objects
      sanitized[key] = sanitizeForFirestore(value);
    } else if (Array.isArray(value)) {
      // Sanitize array items
      sanitized[key] = value.map(item => 
        item !== null && typeof item === 'object' ? sanitizeForFirestore(item) : (item === undefined ? null : item)
      );
    } else {
      sanitized[key] = value;
    }
  }
  return sanitized as T;
};

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

  // Sync data to cloud
  async syncToCloud<T extends { id: string }>(storeName: string, items: T[]): Promise<void> {
    if (!auth || !db) throw new Error('Firebase not configured');
    const user = auth.currentUser;
    if (!user) throw new Error('Not authenticated');

    const batch = writeBatch(db);
    const collectionRef = collection(db, `users/${user.uid}/${storeName}`);
    
    items.forEach(item => {
      const docRef = doc(collectionRef, item.id);
      const sanitizedItem = sanitizeForFirestore({ ...item, syncedAt: new Date().toISOString() });
      batch.set(docRef, sanitizedItem);
    });
    
    await batch.commit();
  },

  // Fetch from cloud
  async fetchFromCloud<T>(storeName: string): Promise<T[]> {
    if (!auth || !db) throw new Error('Firebase not configured');
    const user = auth.currentUser;
    if (!user) throw new Error('Not authenticated');

    const collectionRef = collection(db, `users/${user.uid}/${storeName}`);
    const snapshot = await getDocs(collectionRef);
    
    return snapshot.docs.map(doc => doc.data() as T);
  },

  // Full sync (merge local and cloud)
  async fullSync<T extends { id: string; updatedAt?: string; lastEdited?: string }>(
    storeName: string, 
    localItems: T[]
  ): Promise<T[]> {
    const cloudItems = await this.fetchFromCloud(storeName) as (T & { syncedAt?: string })[];
    
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
    
    return finalItems;
  },

  // Subscribe to real-time updates from Firestore
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

    const collectionRef = collection(db, `users/${user.uid}/${storeName}`);
    const q = query(collectionRef);
    
    return onSnapshot(q, (snapshot) => {
      const items: T[] = [];
      snapshot.forEach((doc) => {
        items.push(doc.data() as T);
      });
      onUpdate(items);
    }, (error) => {
      console.error(`Real-time sync error for ${storeName}:`, error);
    });
  },

  // Subscribe to all collections for full real-time sync
  subscribeToAllCollections(
    storeNames: string[],
    onUpdate: (storeName: string, items: any[]) => void
  ): () => void {
    const unsubscribers: Unsubscribe[] = [];
    
    storeNames.forEach((storeName) => {
      const unsubscribe = this.subscribeToCollection(storeName, (items) => {
        onUpdate(storeName, items);
      });
      unsubscribers.push(unsubscribe);
    });
    
    // Return cleanup function
    return () => {
      unsubscribers.forEach((unsubscribe) => unsubscribe());
    };
  },

  // Push a single item to cloud (for instant sync)
  async pushItemToCloud<T extends { id: string }>(storeName: string, item: T): Promise<void> {
    if (!auth || !db) throw new Error('Firebase not configured');
    const user = auth.currentUser;
    if (!user) throw new Error('Not authenticated');

    const docRef = doc(db, `users/${user.uid}/${storeName}`, item.id);
    const sanitizedItem = sanitizeForFirestore({ ...item, syncedAt: new Date().toISOString() });
    await setDoc(docRef, sanitizedItem);
  },

  // Delete a single item from cloud
  async deleteItemFromCloud(storeName: string, itemId: string): Promise<void> {
    if (!auth || !db) throw new Error('Firebase not configured');
    const user = auth.currentUser;
    if (!user) throw new Error('Not authenticated');

    const { deleteDoc } = await import('firebase/firestore');
    const docRef = doc(db, `users/${user.uid}/${storeName}`, itemId);
    await deleteDoc(docRef);
  }
};

export { auth, db };
