// Firebase Client Configuration for Web App
// This configuration is used for client-side Firebase operations

import { initializeApp } from 'firebase/app';
import { connectAuthEmulator, getAuth } from 'firebase/auth';
import { connectFirestoreEmulator, getFirestore } from 'firebase/firestore';
import { connectStorageEmulator, getStorage } from 'firebase/storage';
import { isFirebaseEmulatorEnabled } from './dev-options';

export const firebaseConfig = {
  // Uses env vars first so staging/prod can be deployed without code changes.
  // Fallback values keep current local behavior.
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY || "AIzaSyAdw0Qu_T9SHu4SUAQsJ-z1DDt3rn7enIo",
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN || "app-splitex.firebaseapp.com",
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || "app-splitex",
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || "app-splitex.firebasestorage.app",
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || "368026022797",
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID || "1:368026022797:web:58a7ebb934a2f8af5183c4",
  measurementId: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID || "G-8G5C8Q1RZW"
};

// Singleton instance for Firebase app
let firebaseApp: any = null;
let firebaseServices: any = null;

// Helper function to check if Firebase is properly configured
export const isFirebaseConfigured = (): boolean => {
  return !!(
    firebaseConfig.apiKey && 
    firebaseConfig.apiKey !== "your-api-key-here" &&
    firebaseConfig.apiKey !== "" &&
    firebaseConfig.projectId && 
    firebaseConfig.projectId !== "your-project-id" &&
    firebaseConfig.projectId !== "" &&
    firebaseConfig.appId && 
    firebaseConfig.appId !== "your-app-id"
  );
};

// Mock Firebase client services for development
export const mockFirebaseServices = {
  auth: {
    signInWithPhoneNumber: async (phoneNumber: string) => {
      console.log('🔧 Mock: Phone auth requested for', phoneNumber);
      return {
        user: {
          uid: `mock-uid-${Date.now()}`,
          phoneNumber: phoneNumber,
          displayName: 'Mock User'
        },
        verificationId: `mock-verification-${Date.now()}`
      };
    },
    signInWithPopup: async (provider: any) => {
      console.log('🔧 Mock: OAuth sign-in with', provider.providerId);
      return {
        user: {
          uid: `mock-uid-${Date.now()}`,
          email: 'mock@example.com',
          displayName: 'Mock User',
          photoURL: 'https://via.placeholder.com/150'
        }
      };
    },
    signOut: async () => {
      console.log('🔧 Mock: Sign out');
      return true;
    },
    onAuthStateChanged: (callback: Function) => {
      console.log('🔧 Mock: Auth state listener registered');
      // Simulate no user initially
      callback(null);
      return () => console.log('🔧 Mock: Auth state listener unsubscribed');
    }
  },
  firestore: {
    collection: (name: string) => ({
      doc: (id: string) => ({
        get: () => Promise.resolve({ exists: false }),
        set: () => Promise.resolve(),
        update: () => Promise.resolve(),
        delete: () => Promise.resolve(),
        onSnapshot: (callback: Function) => {
          console.log('🔧 Mock: Firestore snapshot listener for', name, id);
          return () => console.log('🔧 Mock: Snapshot listener unsubscribed');
        }
      }),
      add: (data: any) => Promise.resolve({ id: `mock-doc-${Date.now()}` }),
      where: () => ({
        get: () => Promise.resolve({ docs: [], empty: true }),
        onSnapshot: (callback: Function) => {
          console.log('🔧 Mock: Firestore query snapshot listener');
          callback({ docs: [], empty: true });
          return () => console.log('🔧 Mock: Query snapshot listener unsubscribed');
        }
      }),
      onSnapshot: (callback: Function) => {
        console.log('🔧 Mock: Firestore collection snapshot listener for', name);
        callback({ docs: [], empty: true });
        return () => console.log('🔧 Mock: Collection snapshot listener unsubscribed');
      }
    })
  },
  storage: {
    ref: (path: string) => ({
      put: (file: File) => {
        console.log('🔧 Mock: File upload to', path);
        return Promise.resolve({
          ref: { fullPath: path },
          state: 'success',
          metadata: { size: file.size }
        });
      },
      getDownloadURL: () => Promise.resolve(`https://mock-storage-url.com/${path}`),
      delete: () => Promise.resolve()
    })
  }
};

// Export appropriate services based on configuration
export const getFirebaseServices = () => {
  // Return cached services if already initialized
  if (firebaseServices) {
    console.log('🔄 Using cached Firebase services');
    return firebaseServices;
  }

  if (isFirebaseConfigured()) {
    console.log('🔥 Initializing real Firebase services');
    // Import and return real Firebase services
    try {
      // Initialize Firebase app
      firebaseApp = initializeApp(firebaseConfig);
      const auth = getAuth(firebaseApp);
      const firestore = getFirestore(firebaseApp);
      const storage = getStorage(firebaseApp);

      if (isFirebaseEmulatorEnabled()) {
        const authHost = process.env.NEXT_PUBLIC_FIREBASE_AUTH_EMULATOR_HOST || '127.0.0.1';
        const authPort = Number(process.env.NEXT_PUBLIC_FIREBASE_AUTH_EMULATOR_PORT || '9099');
        const firestoreHost = process.env.NEXT_PUBLIC_FIREBASE_FIRESTORE_EMULATOR_HOST || '127.0.0.1';
        const firestorePort = Number(process.env.NEXT_PUBLIC_FIREBASE_FIRESTORE_EMULATOR_PORT || '8080');
        const storageHost = process.env.NEXT_PUBLIC_FIREBASE_STORAGE_EMULATOR_HOST || '127.0.0.1';
        const storagePort = Number(process.env.NEXT_PUBLIC_FIREBASE_STORAGE_EMULATOR_PORT || '9199');

        connectAuthEmulator(auth, `http://${authHost}:${authPort}`, { disableWarnings: true });
        connectFirestoreEmulator(firestore, firestoreHost, firestorePort);
        connectStorageEmulator(storage, storageHost, storagePort);
        console.log('🧪 Firebase web client connected to Local Emulator Suite');
      }

      firebaseServices = {
        app: firebaseApp,
        auth,
        firestore,
        storage
      };
      
      console.log('✅ Firebase services initialized successfully');
      return firebaseServices;
    } catch (error) {
      console.error('❌ Failed to initialize Firebase client:', error);
      console.log('🔧 Falling back to mock services');
      firebaseServices = mockFirebaseServices;
      return firebaseServices;
    }
  } else {
    console.log('🔧 Firebase not configured, using mock services');
    firebaseServices = mockFirebaseServices;
    return firebaseServices;
  }
};

// Export the config for debugging
export const firebaseConfigDebug = {
  isConfigured: isFirebaseConfigured(),
  emulatorEnabled: isFirebaseEmulatorEnabled(),
  projectId: firebaseConfig.projectId,
  hasApiKey: firebaseConfig.apiKey !== "your-api-key-here",
  hasAppId: firebaseConfig.appId !== "your-app-id"
};
