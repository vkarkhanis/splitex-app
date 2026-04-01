describe('config/firebase', () => {
  const envBackup = { ...process.env };

  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
    process.env = { ...envBackup };
    delete process.env.FIREBASE_USE_EMULATOR;
    delete process.env.FIREBASE_PROJECT_ID;
    delete process.env.FIREBASE_CLIENT_EMAIL;
    delete process.env.FIREBASE_PRIVATE_KEY;
    delete process.env.FIREBASE_PRIVATE_KEY_FILE;
    delete process.env.GOOGLE_APPLICATION_CREDENTIALS;
    delete process.env.FIREBASE_STORAGE_BUCKET;
    delete process.env.FIRESTORE_EMULATOR_HOST;
    delete process.env.FIREBASE_AUTH_EMULATOR_HOST;
    delete process.env.STORAGE_EMULATOR_HOST;
  });

  afterAll(() => {
    process.env = envBackup;
  });

  function mockFirebaseAdmin() {
    const initializeApp = jest.fn((config: any, name?: string) => ({ name: name || '[DEFAULT]', config }));
    const app = jest.fn((name?: string) => ({ name: name || 'mock-app' }));
    const cert = jest.fn((config: any) => ({ certConfig: config }));
    const firestore = { settings: jest.fn() };
    const auth = {
      createUser: jest.fn(async (record: any) => ({ uid: `created-${record?.email || 'user'}`, ...record })),
      getUser: jest.fn(async () => null),
      getUserByEmail: jest.fn(async () => null),
      updateUser: jest.fn(async (uid: string, updates: any) => ({ uid, ...updates })),
      deleteUser: jest.fn(async () => undefined),
      verifyIdToken: jest.fn(async () => ({ uid: 'verified-user', email: 'mock@example.com', email_verified: true })),
      createCustomToken: jest.fn(async (uid: string) => `mock-token-${uid}`),
      revokeRefreshTokens: jest.fn(async () => undefined),
    };
    const storage = {
      bucket: jest.fn(() => ({
        file: jest.fn(() => ({
          upload: jest.fn(async () => ({ name: 'uploaded.txt' })),
          getSignedUrl: jest.fn(async () => ['https://example.com/file']),
          delete: jest.fn(async () => undefined),
          exists: jest.fn(async () => [false]),
          get: jest.fn(async () => [null]),
          save: jest.fn(async () => undefined),
          createReadStream: jest.fn(() => {
            const { Readable } = require('stream');
            return Readable.from([]);
          }),
        })),
        upload: jest.fn(async () => ({ name: 'bucket-upload.txt' })),
        exists: jest.fn(async () => [false]),
        getFiles: jest.fn(async () => [[]]),
      })),
    };

    jest.doMock('firebase-admin', () => ({
      __esModule: true,
      default: {
        initializeApp,
        app,
        credential: { cert },
      },
    }));
    jest.doMock('firebase-admin/firestore', () => ({ getFirestore: jest.fn(() => firestore) }));
    jest.doMock('firebase-admin/auth', () => ({ getAuth: jest.fn(() => auth) }));
    jest.doMock('firebase-admin/storage', () => ({ getStorage: jest.fn(() => storage) }));
    jest.doMock('dotenv', () => ({ __esModule: true, default: { config: jest.fn() } }));
    return { initializeApp, app, cert, firestore, auth, storage };
  }

  it('falls back to in-memory mock services and supports CRUD/query helpers', async () => {
    mockFirebaseAdmin();
    const firebase = require('../../config/firebase');

    expect(firebase.isUsingMockServices).toBe(true);
    expect(firebase.firebaseConfigDebug.hasValidCredentials).toBeFalsy();

    const users = firebase.db.collection('users');
    const aliceRef = users.doc('alice');
    await aliceRef.set({ tags: ['trip'], score: 2, nested: { ok: true } });
    await users.doc('bob').set({ tags: ['work'], score: 1 });
    await users.doc('carol').set({ tags: ['trip', 'family'], score: 3 });

    const aliceSnap = await aliceRef.get();
    expect(aliceSnap.exists).toBe(true);
    expect(aliceSnap.data()).toEqual({ tags: ['trip'], score: 2, nested: { ok: true } });

    await aliceRef.update({ score: 4 });
    expect((await aliceRef.get()).data().score).toBe(4);

    const addedRef = await users.add({ tags: ['trip'], score: 5 });
    expect(addedRef.id).toMatch(/^mock-/);

    const equalQuery = await users.where('score', '==', 4).get();
    expect(equalQuery.empty).toBe(false);
    expect(equalQuery.docs).toHaveLength(1);

    const containsQuery = await users.where('tags', 'array-contains', 'trip').orderBy('score', 'desc').limit(2).get();
    expect(containsQuery.docs).toHaveLength(2);
    expect(containsQuery.docs[0].data().score).toBeGreaterThanOrEqual(containsQuery.docs[1].data().score);

    const inQuery = await users.where('score', 'in', [1, 5]).get();
    expect(inQuery.size).toBe(2);

    await firebase.db.runTransaction(async (tx: any) => {
      const bobRef = users.doc('bob');
      const bob = await tx.get(bobRef);
      expect(bob.data().score).toBe(1);
      await tx.update(bobRef, { score: 6 });
    });
    expect((await users.doc('bob').get()).data().score).toBe(6);

    const batch = firebase.db.batch();
    batch.set(users.doc('dora'), { score: 9 });
    batch.delete(users.doc('carol'));
    await batch.commit();
    expect((await users.doc('dora').get()).exists).toBe(true);
    expect((await users.doc('carol').get()).exists).toBe(false);

    const sessionRef = users.doc('alice').collection('sessions').doc('one');
    await sessionRef.set({ active: true });
    expect((await sessionRef.get()).data()).toEqual({ active: true });

    const customToken = await firebase.auth.createCustomToken('alice');
    expect(customToken).toBe('mock-token-alice');
    expect(await firebase.auth.verifyIdToken('token')).toEqual(
      expect.objectContaining({ uid: expect.stringMatching(/^mock-uid-/), email: 'mock@example.com' }),
    );

    const bucket = firebase.storage.bucket();
    const file = bucket.file('avatars/alice.png');
    await file.save(Buffer.from('avatar'));
    const [signedUrl] = await file.getSignedUrl({ action: 'read', expires: new Date() });
    expect(signedUrl).toContain('https://mock-storage-url.com/avatars/alice.png');
    const stream = file.createReadStream();
    expect(typeof stream.on).toBe('function');
  });

  it('initializes Firebase emulator mode and populates emulator hosts', async () => {
    const mocks = mockFirebaseAdmin();
    process.env.FIREBASE_USE_EMULATOR = 'true';
    process.env.FIREBASE_PROJECT_ID = 'traxettle-local';

    const firebase = require('../../config/firebase');

    expect(firebase.firebaseConfigDebug.useFirebaseEmulator).toBe(true);
    expect(process.env.FIRESTORE_EMULATOR_HOST).toBe('127.0.0.1:8080');
    expect(process.env.FIREBASE_AUTH_EMULATOR_HOST).toBe('127.0.0.1:9099');
    expect(process.env.STORAGE_EMULATOR_HOST).toBe('127.0.0.1:9199');
    expect(mocks.initializeApp).toHaveBeenCalledWith({
      projectId: 'traxettle-local',
      storageBucket: 'traxettle-local.appspot.com',
    });
    expect(mocks.firestore.settings).toHaveBeenCalledWith({ ignoreUndefinedProperties: true });
  });

  it('initializes real Firebase credentials when present', async () => {
    const mocks = mockFirebaseAdmin();
    process.env.FIREBASE_PROJECT_ID = 'traxettle-prod';
    process.env.FIREBASE_CLIENT_EMAIL = 'svc@traxettle-prod.iam.gserviceaccount.com';
    process.env.FIREBASE_PRIVATE_KEY = 'line1\\nline2';
    process.env.FIREBASE_STORAGE_BUCKET = 'traxettle-prod.appspot.com';

    const firebase = require('../../config/firebase');

    expect(firebase.isUsingMockServices).toBe(false);
    expect(firebase.firebaseConfigDebug.hasValidCredentials).toBeTruthy();
    expect(mocks.cert).toHaveBeenCalledWith(
      expect.objectContaining({
        projectId: 'traxettle-prod',
        clientEmail: 'svc@traxettle-prod.iam.gserviceaccount.com',
        privateKey: 'line1\nline2',
        storageBucket: 'traxettle-prod.appspot.com',
      }),
    );
    expect(mocks.initializeApp).toHaveBeenCalledWith({
      credential: { certConfig: expect.objectContaining({ projectId: 'traxettle-prod' }) },
      projectId: 'traxettle-prod',
      storageBucket: 'traxettle-prod.appspot.com',
    });
  });
});
