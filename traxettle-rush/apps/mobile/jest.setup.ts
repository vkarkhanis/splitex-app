import { jest } from '@jest/globals';

jest.mock('@react-native-async-storage/async-storage', () => {
  const store = new Map<string, string>();
  return {
    getItem: jest.fn(async (key: string) => (store.has(key) ? store.get(key)! : null)),
    setItem: jest.fn(async (key: string, value: string) => {
      store.set(key, value);
    }),
    removeItem: jest.fn(async (key: string) => {
      store.delete(key);
    }),
    clear: jest.fn(async () => {
      store.clear();
    }),
  };
});

jest.mock('react-native', () => ({
  Platform: { OS: 'ios' },
  AppState: {
    addEventListener: jest.fn(() => ({
      remove: jest.fn(),
    })),
  },
  Linking: {
    getInitialURL: jest.fn(async () => null),
    addEventListener: jest.fn(() => ({
      remove: jest.fn(),
    })),
  },
}));

jest.mock('expo-secure-store', () => {
  const store = new Map<string, string>();
  return {
    AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY: 'after-first-unlock',
    getItemAsync: jest.fn(async (key: string) => (store.has(key) ? store.get(key)! : null)),
    setItemAsync: jest.fn(async (key: string, value: string) => {
      store.set(key, value);
    }),
    deleteItemAsync: jest.fn(async (key: string) => {
      store.delete(key);
    }),
  };
});

jest.mock('expo-local-authentication', () => ({
  hasHardwareAsync: jest.fn(async () => true),
  isEnrolledAsync: jest.fn(async () => true),
  authenticateAsync: jest.fn(async () => ({ success: true })),
}));

jest.mock('firebase/auth', () => {
  const currentUser = {
    uid: 'firebase-user',
    email: 'firebase@test.com',
    getIdToken: jest.fn(async () => 'firebase-id-token'),
  };

  return {
    getAuth: jest.fn(() => ({ currentUser })),
    signInWithEmailAndPassword: jest.fn(async () => ({ user: currentUser })),
    createUserWithEmailAndPassword: jest.fn(async () => ({ user: currentUser })),
    updateProfile: jest.fn(async () => {}),
    fetchSignInMethodsForEmail: jest.fn(async () => ['password']),
    signInWithCustomToken: jest.fn(async () => ({
      user: {
        ...currentUser,
        getIdToken: jest.fn(async () => 'custom-token'),
      },
    })),
    signInWithEmailLink: jest.fn(async () => ({
      user: {
        ...currentUser,
        getIdToken: jest.fn(async () => 'email-link-token'),
      },
    })),
    signOut: jest.fn(async () => {}),
  };
});

(global as any).__DEV__ = true;
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
