describe('firebase client config', () => {
  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
    localStorage.clear();
    process.env.NEXT_PUBLIC_APP_ENV = 'local';
  });

  test('reports firebase is configured with current defaults', async () => {
    const mod = await import('../../config/firebase-client');
    expect(mod.isFirebaseConfigured()).toBe(true);
    expect(mod.firebaseConfigDebug.isConfigured).toBe(true);
  });

  test('initializes real firebase services and caches them', async () => {
    const initializeApp = jest.fn(() => ({ app: 'firebase-app' }));
    const getAuth = jest.fn(() => ({ auth: true }));
    const connectAuthEmulator = jest.fn();
    const getFirestore = jest.fn(() => ({ firestore: true }));
    const connectFirestoreEmulator = jest.fn();
    const getStorage = jest.fn(() => ({ storage: true }));
    const connectStorageEmulator = jest.fn();

    jest.doMock('firebase/app', () => ({ initializeApp }));
    jest.doMock('firebase/auth', () => ({ getAuth, connectAuthEmulator }));
    jest.doMock('firebase/firestore', () => ({ getFirestore, connectFirestoreEmulator }));
    jest.doMock('firebase/storage', () => ({ getStorage, connectStorageEmulator }));

    const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

    const mod = await import('../../config/firebase-client');
    const first = mod.getFirebaseServices();
    const second = mod.getFirebaseServices();

    expect(initializeApp).toHaveBeenCalledTimes(1);
    expect(getAuth).toHaveBeenCalledTimes(1);
    expect(getFirestore).toHaveBeenCalledTimes(1);
    expect(getStorage).toHaveBeenCalledTimes(1);
    expect(first).toBe(second);

    logSpy.mockRestore();
    errorSpy.mockRestore();
  });

  test('falls back to mock services when firebase init fails', async () => {
    const initializeApp = jest.fn(() => {
      throw new Error('boom');
    });

    jest.doMock('firebase/app', () => ({ initializeApp }));
    jest.doMock('firebase/auth', () => ({ getAuth: jest.fn(), connectAuthEmulator: jest.fn() }));
    jest.doMock('firebase/firestore', () => ({ getFirestore: jest.fn(), connectFirestoreEmulator: jest.fn() }));
    jest.doMock('firebase/storage', () => ({ getStorage: jest.fn(), connectStorageEmulator: jest.fn() }));

    const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

    const mod = await import('../../config/firebase-client');
    const services = mod.getFirebaseServices();

    expect(initializeApp).toHaveBeenCalledTimes(1);
    expect(services).toBe(mod.mockFirebaseServices);

    logSpy.mockRestore();
    errorSpy.mockRestore();
  });

  test('connects firebase services to local emulator when local flag is enabled', async () => {
    process.env.NEXT_PUBLIC_APP_ENV = 'local';
    localStorage.setItem('traxettle.dev.firebaseEmulatorEnabled', 'true');

    const initializeApp = jest.fn(() => ({ app: 'firebase-app' }));
    const authObj = { auth: true };
    const firestoreObj = { firestore: true };
    const storageObj = { storage: true };
    const getAuth = jest.fn(() => authObj);
    const connectAuthEmulator = jest.fn();
    const getFirestore = jest.fn(() => firestoreObj);
    const connectFirestoreEmulator = jest.fn();
    const getStorage = jest.fn(() => storageObj);
    const connectStorageEmulator = jest.fn();

    jest.doMock('firebase/app', () => ({ initializeApp }));
    jest.doMock('firebase/auth', () => ({ getAuth, connectAuthEmulator }));
    jest.doMock('firebase/firestore', () => ({ getFirestore, connectFirestoreEmulator }));
    jest.doMock('firebase/storage', () => ({ getStorage, connectStorageEmulator }));

    const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

    const mod = await import('../../config/firebase-client');
    mod.getFirebaseServices();

    expect(connectAuthEmulator).toHaveBeenCalledTimes(1);
    expect(connectFirestoreEmulator).toHaveBeenCalledTimes(1);
    expect(connectStorageEmulator).toHaveBeenCalledTimes(1);

    logSpy.mockRestore();
    errorSpy.mockRestore();
  });
});
