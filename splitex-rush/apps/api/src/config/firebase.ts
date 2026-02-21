import admin from 'firebase-admin';
import { getFirestore } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';
import { getStorage } from 'firebase-admin/storage';
import dotenv from 'dotenv';
import path from 'path';

// Load environment variables — check root .env.local first, then local .env
dotenv.config({ path: path.resolve(__dirname, '../../../../.env.local') });
dotenv.config();

// Initialize Firebase Admin SDK
const firebaseConfig = {
  projectId: process.env.FIREBASE_PROJECT_ID,
  clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
  privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
  storageBucket: process.env.FIREBASE_STORAGE_BUCKET,
};

const useFirebaseEmulator = process.env.FIREBASE_USE_EMULATOR === 'true';
const emulatorProjectId = process.env.FIREBASE_PROJECT_ID || 'splitex-local';

function configureFirebaseEmulatorEnvironment() {
  const firestoreHost = process.env.FIRESTORE_EMULATOR_HOST || `127.0.0.1:${process.env.FIRESTORE_EMULATOR_PORT || '8080'}`;
  const authHost = process.env.FIREBASE_AUTH_EMULATOR_HOST || `127.0.0.1:${process.env.FIREBASE_AUTH_EMULATOR_PORT || '9099'}`;
  const storageHost = process.env.STORAGE_EMULATOR_HOST || `127.0.0.1:${process.env.FIREBASE_STORAGE_EMULATOR_PORT || '9199'}`;

  process.env.FIRESTORE_EMULATOR_HOST = firestoreHost;
  process.env.FIREBASE_AUTH_EMULATOR_HOST = authHost;
  process.env.STORAGE_EMULATOR_HOST = storageHost;
}

// Check if we have valid Firebase credentials
const hasValidCredentials = firebaseConfig.projectId && 
                          firebaseConfig.privateKey && 
                          firebaseConfig.privateKey.trim() !== '' &&
                          firebaseConfig.clientEmail;

// Initialize Firebase app and services
let firebaseApp: admin.app.App;
let db: FirebaseFirestore.Firestore;
let auth: admin.auth.Auth;
let storage: admin.storage.Storage;

if (useFirebaseEmulator) {
  configureFirebaseEmulatorEnvironment();
  console.log('🧪 Initializing Firebase Admin with Local Emulator Suite');
  try {
    firebaseApp = admin.initializeApp({
      projectId: emulatorProjectId,
      storageBucket: firebaseConfig.storageBucket,
    });
    db = getFirestore(firebaseApp);
    db.settings({ ignoreUndefinedProperties: true });
    auth = getAuth(firebaseApp);
    storage = getStorage(firebaseApp);
    console.log('✅ Firebase emulator mode initialized');
  } catch (error) {
    console.error('❌ Failed to initialize Firebase emulator mode:', error);
    console.log('🔧 Falling back to mock services');
    initializeMockServices();
  }
} else if (hasValidCredentials) {
  console.log('🔥 Initializing Firebase with real credentials');
  
  try {
    // Production Firebase initialization
    firebaseApp = admin.initializeApp({
      credential: admin.credential.cert(firebaseConfig),
      projectId: firebaseConfig.projectId,
      storageBucket: firebaseConfig.storageBucket,
    });

    // Export Firebase services
    db = getFirestore(firebaseApp);
    db.settings({ ignoreUndefinedProperties: true });
    auth = getAuth(firebaseApp);
    storage = getStorage(firebaseApp);
    
    console.log('✅ Firebase initialized successfully');
  } catch (error) {
    console.error('❌ Failed to initialize Firebase:', error);
    console.log('🔧 Falling back to mock services');
    initializeMockServices();
  }
} else {
  console.log('🔧 Firebase credentials not found, using mock services');
  initializeMockServices();
}

function initializeMockServices() {
  // Create a minimal app for mock services
  try {
    firebaseApp = admin.initializeApp({
      projectId: firebaseConfig.projectId || 'splitex-mock',
    }, 'mock-app');
  } catch (error: any) {
    // App might already exist, use existing one
    firebaseApp = admin.app('mock-app');
  }

  // Mock Firestore service
  db = {
    collection: (collectionPath: string) => ({
      doc: (docId: string) => ({
        get: () => Promise.resolve({
          exists: false,
          data: () => null,
          id: docId
        }),
        set: (data: any) => Promise.resolve({ writeTime: new Date() }),
        update: (data: any) => Promise.resolve({ writeTime: new Date() }),
        delete: () => Promise.resolve(),
        collection: (subCollectionPath: string) => ({
          add: (data: any) => Promise.resolve({ id: `mock-${Date.now()}` }),
          get: () => Promise.resolve({ docs: [] }),
          where: () => ({
            get: () => Promise.resolve({ docs: [], empty: true }),
            limit: () => ({
              get: () => Promise.resolve({ docs: [], empty: true })
            })
          })
        })
      }),
      add: (data: any) => Promise.resolve({ id: `mock-${Date.now()}` }),
      where: (field: string, op: string, value: any) => ({
        get: () => Promise.resolve({ 
          docs: [], 
          empty: true 
        }),
        limit: (limit: number) => ({
          get: () => Promise.resolve({ docs: [], empty: true })
        }),
        orderBy: (field: string, direction?: 'asc' | 'desc') => ({
          get: () => Promise.resolve({ docs: [], empty: true }),
          limit: (limit: number) => ({
            get: () => Promise.resolve({ docs: [], empty: true })
          })
        })
      }),
      orderBy: (field: string, direction?: 'asc' | 'desc') => ({
        get: () => Promise.resolve({ docs: [], empty: true }),
        limit: (limit: number) => ({
          get: () => Promise.resolve({ docs: [], empty: true })
        })
      }),
      limit: (limit: number) => ({
        get: () => Promise.resolve({ docs: [], empty: true })
      })
    }),
    runTransaction: (updateFunction: any) => {
      return updateFunction({
        get: () => Promise.resolve({ exists: false }),
        set: () => Promise.resolve(),
        update: () => Promise.resolve(),
        delete: () => Promise.resolve(),
      });
    },
    batch: () => ({
      commit: () => Promise.resolve(),
      set: () => ({ commit: () => Promise.resolve() }),
      update: () => ({ commit: () => Promise.resolve() }),
      delete: () => ({ commit: () => Promise.resolve() }),
    })
  } as any;

  // Mock Auth service
  auth = {
    createUser: (userRecord: any) => Promise.resolve({
      uid: `mock-uid-${Date.now()}`,
      email: userRecord.email,
      displayName: userRecord.displayName
    }),
    getUser: (uid: string) => Promise.resolve(null),
    getUserByEmail: (email: string) => Promise.resolve(null),
    updateUser: (uid: string, updates: any) => Promise.resolve({
      uid,
      ...updates
    }),
    deleteUser: (uid: string) => Promise.resolve(),
    verifyIdToken: (idToken: string) => Promise.resolve({
      uid: `mock-uid-${Date.now()}`,
      email: 'mock@example.com',
      email_verified: true
    }),
    createCustomToken: (uid: string, additionalClaims?: any) => 
      Promise.resolve(`mock-token-${uid}`),
    revokeRefreshTokens: (uid: string) => Promise.resolve()
  } as any;

  // Mock Storage service
  storage = {
    bucket: (bucketName?: string) => ({
      file: (filePath: string) => ({
        upload: (buffer: Buffer, metadata?: any) => Promise.resolve({
          name: filePath,
          size: buffer.length,
          timeCreated: new Date(),
          md5Hash: 'mock-hash'
        }),
        getSignedUrl: (config: { action: string, expires: Date }) => 
          Promise.resolve([`https://mock-storage-url.com/${filePath}`]),
        delete: () => Promise.resolve(),
        exists: () => Promise.resolve([false]),
        get: () => Promise.resolve([null]),
        save: (buffer: Buffer) => Promise.resolve(),
        createReadStream: () => {
          const { Readable } = require('stream');
          return Readable.from([]);
        }
      }),
      upload: (filePath: string, buffer: Buffer, metadata?: any) => 
        Promise.resolve({
          name: filePath,
          size: buffer.length,
          timeCreated: new Date()
        }),
      exists: () => Promise.resolve([false]),
      getFiles: () => Promise.resolve([[]])
    })
  } as any;

  console.log('🔧 Mock Firebase services initialized');
}

// Export services and app
export { db, auth, storage, firebaseApp };

// Helper function to check if we're using mock services
export const isUsingMockServices = !hasValidCredentials && !useFirebaseEmulator;

// Export config for debugging
export const firebaseConfigDebug = {
  hasValidCredentials,
  useFirebaseEmulator,
  projectId: firebaseConfig.projectId,
  hasClientEmail: !!firebaseConfig.clientEmail,
  hasPrivateKey: !!firebaseConfig.privateKey,
  hasStorageBucket: !!firebaseConfig.storageBucket
};
