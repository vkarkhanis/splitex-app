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
  storageBucket:
    process.env.FIREBASE_STORAGE_BUCKET ||
    (process.env.FIREBASE_PROJECT_ID ? `${process.env.FIREBASE_PROJECT_ID}.appspot.com` : undefined),
};

const useFirebaseEmulator = process.env.FIREBASE_USE_EMULATOR === 'true';
const emulatorProjectId = process.env.FIREBASE_PROJECT_ID || 'traxettle-local';
const emulatorBucket = process.env.FIREBASE_STORAGE_BUCKET || `${emulatorProjectId}.appspot.com`;

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
      storageBucket: firebaseConfig.storageBucket || emulatorBucket,
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
      projectId: firebaseConfig.projectId || 'traxettle-mock',
    }, 'mock-app');
  } catch (error: any) {
    // App might already exist, use existing one
    firebaseApp = admin.app('mock-app');
  }

  // In-memory mock Firestore service (persistent for current process)
  const mockDocs = new Map<string, Record<string, any>>();
  let mockIdCounter = 1;

  const clone = <T>(value: T): T => {
    if (value === undefined || value === null) return value;
    return JSON.parse(JSON.stringify(value));
  };

  const normalizePath = (p: string) => p.replace(/^\/+|\/+$/g, '');
  const pathId = (p: string) => normalizePath(p).split('/').pop() || '';
  const isDirectChildDoc = (docPath: string, collectionPath: string) => {
    const c = normalizePath(collectionPath);
    const d = normalizePath(docPath);
    if (!d.startsWith(`${c}/`)) return false;
    const rest = d.slice(c.length + 1);
    return rest.length > 0 && !rest.includes('/');
  };

  const setDocData = (docPath: string, value: Record<string, any>, merge = false) => {
    const key = normalizePath(docPath);
    if (!merge || !mockDocs.has(key)) {
      mockDocs.set(key, clone(value || {}));
      return;
    }
    const prev = mockDocs.get(key) || {};
    mockDocs.set(key, { ...prev, ...clone(value || {}) });
  };

  const getDocData = (docPath: string) => {
    const data = mockDocs.get(normalizePath(docPath));
    return data ? clone(data) : null;
  };

  const deleteDocData = (docPath: string) => {
    const key = normalizePath(docPath);
    mockDocs.delete(key);
    for (const existingKey of [...mockDocs.keys()]) {
      if (existingKey.startsWith(`${key}/`)) {
        mockDocs.delete(existingKey);
      }
    }
  };

  const listCollectionDocs = (collectionPath: string) =>
    [...mockDocs.keys()].filter((docPath) => isDirectChildDoc(docPath, collectionPath));

  const makeDocRef = (docPathRaw: string): any => {
    const docPath = normalizePath(docPathRaw);
    return {
      id: pathId(docPath),
      path: docPath,
      get: async () => {
        const data = getDocData(docPath);
        return {
          id: pathId(docPath),
          exists: data !== null,
          data: () => data,
          ref: makeDocRef(docPath),
        };
      },
      set: async (data: any, options?: { merge?: boolean }) => {
        setDocData(docPath, data || {}, Boolean(options?.merge));
        return { writeTime: new Date() };
      },
      update: async (data: any) => {
        const existing = getDocData(docPath);
        if (!existing) throw new Error('Document does not exist');
        setDocData(docPath, data || {}, true);
        return { writeTime: new Date() };
      },
      delete: async () => {
        deleteDocData(docPath);
      },
      collection: (subCollectionPath: string) => makeCollectionRef(`${docPath}/${subCollectionPath}`),
    };
  };

  const makeDocSnapshot = (docPath: string): any => {
    const data = getDocData(docPath) || {};
    return {
      id: pathId(docPath),
      exists: true,
      data: () => clone(data),
      ref: makeDocRef(docPath),
    };
  };

  const applyFilters = (
    docs: any[],
    filters: Array<{ field: string; op: string; value: any }>
  ) => {
    return docs.filter((doc) => {
      const data = doc.data();
      return filters.every((f) => {
        const left = data?.[f.field];
        if (f.op === '==') return left === f.value;
        if (f.op === 'array-contains') return Array.isArray(left) && left.includes(f.value);
        if (f.op === 'in') return Array.isArray(f.value) && f.value.includes(left);
        return false;
      });
    });
  };

  const makeQuery = (
    collectionPath: string,
    filters: Array<{ field: string; op: string; value: any }> = [],
    order: { field: string; direction: 'asc' | 'desc' } | null = null,
    maxItems: number | null = null
  ): any => ({
    where: (field: string, op: string, value: any) =>
      makeQuery(collectionPath, [...filters, { field, op, value }], order, maxItems),
    orderBy: (field: string, direction: 'asc' | 'desc' = 'asc') =>
      makeQuery(collectionPath, filters, { field, direction }, maxItems),
    limit: (limitCount: number) =>
      makeQuery(collectionPath, filters, order, limitCount),
    get: async () => {
      let docs = listCollectionDocs(collectionPath).map(makeDocSnapshot);
      docs = applyFilters(docs, filters);
      if (order) {
        docs.sort((a, b) => {
          const av = a.data()?.[order.field];
          const bv = b.data()?.[order.field];
          if (av === bv) return 0;
          if (av === undefined || av === null) return 1;
          if (bv === undefined || bv === null) return -1;
          const result = av > bv ? 1 : -1;
          return order.direction === 'desc' ? -result : result;
        });
      }
      if (typeof maxItems === 'number') {
        docs = docs.slice(0, maxItems);
      }
      return { docs, empty: docs.length === 0, size: docs.length };
    },
  });

  const makeCollectionRef = (collectionPathRaw: string): any => {
    const collectionPath = normalizePath(collectionPathRaw);
    return {
      doc: (docId: string) => makeDocRef(`${collectionPath}/${docId}`),
      add: async (data: any) => {
        const id = `mock-${Date.now()}-${mockIdCounter++}`;
        setDocData(`${collectionPath}/${id}`, data || {}, false);
        return makeDocRef(`${collectionPath}/${id}`);
      },
      get: async () => {
        const docs = listCollectionDocs(collectionPath).map(makeDocSnapshot);
        return { docs, empty: docs.length === 0, size: docs.length };
      },
      where: (field: string, op: string, value: any) =>
        makeQuery(collectionPath, [{ field, op, value }]),
      orderBy: (field: string, direction: 'asc' | 'desc' = 'asc') =>
        makeQuery(collectionPath, [], { field, direction }),
      limit: (limitCount: number) => makeQuery(collectionPath, [], null, limitCount),
    };
  };

  db = {
    collection: (collectionPath: string) => makeCollectionRef(collectionPath),
    runTransaction: async (updateFunction: any) => {
      const tx = {
        get: (ref: any) => ref.get(),
        set: (ref: any, data: any, options?: { merge?: boolean }) => ref.set(data, options),
        update: (ref: any, data: any) => ref.update(data),
        delete: (ref: any) => ref.delete(),
      };
      return updateFunction(tx);
    },
    batch: () => {
      const ops: Array<() => Promise<any>> = [];
      const batchApi = {
        set: (ref: any, data: any, options?: { merge?: boolean }) => {
          ops.push(() => ref.set(data, options));
          return batchApi;
        },
        update: (ref: any, data: any) => {
          ops.push(() => ref.update(data));
          return batchApi;
        },
        delete: (ref: any) => {
          ops.push(() => ref.delete());
          return batchApi;
        },
        commit: async () => {
          for (const op of ops) {
            await op();
          }
          return [];
        },
      };
      return batchApi;
    },
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
