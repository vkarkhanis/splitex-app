import { initializeFirebase, getEnvironment, getApiUrl } from '../services/firebase';

// Mock the runtime config
jest.mock('../config/runtime', () => ({
  getRuntimeConfig: jest.fn().mockResolvedValue({
    env: 'production',
    apiUrl: 'https://prod-api.traxettle.app',
    firebaseConfig: {
      projectId: 'traxettle-prod',
      apiKey: 'test-api-key',
      authDomain: 'traxettle-prod.firebaseapp.com',
      storageBucket: 'traxettle-prod.firebasestorage.app',
      messagingSenderId: '123456789',
      appId: '1:123456789:web:abcdef'
    }
  }),
  isStagingModeEnabled: jest.fn().mockResolvedValue(false),
  enableStagingMode: jest.fn(),
  disableStagingMode: jest.fn(),
  toggleStagingMode: jest.fn()
}));

// Mock Firebase
jest.mock('firebase/app', () => ({
  initializeApp: jest.fn(),
  getApps: jest.fn().mockReturnValue([]),
  getApp: jest.fn()
}));

jest.mock('firebase/auth', () => ({
  getAuth: jest.fn()
}));

jest.mock('firebase/firestore', () => ({
  getFirestore: jest.fn()
}));

jest.mock('firebase/storage', () => ({
  getStorage: jest.fn()
}));

describe('Firebase Service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('initializeFirebase', () => {
    it('should initialize Firebase with runtime config', async () => {
      const { initializeApp } = require('firebase/app');
      const { getAuth } = require('firebase/auth');
      const { getFirestore } = require('firebase/firestore');
      const { getStorage } = require('firebase/storage');

      await initializeFirebase();

      expect(initializeApp).toHaveBeenCalledWith({
        projectId: 'traxettle-prod',
        apiKey: 'test-api-key',
        authDomain: 'traxettle-prod.firebaseapp.com',
        storageBucket: 'traxettle-prod.firebasestorage.app',
        messagingSenderId: '123456789',
        appId: '1:123456789:web:abcdef'
      });

      expect(getAuth).toHaveBeenCalled();
      expect(getFirestore).toHaveBeenCalled();
      expect(getStorage).toHaveBeenCalled();
    });

    it('should throw error if initialization fails', async () => {
      const { getRuntimeConfig } = require('../config/runtime');
      getRuntimeConfig.mockRejectedValue(new Error('Network error'));

      await expect(initializeFirebase()).rejects.toThrow('Failed to load Firebase configuration');
    });
  });

  describe('environment helpers', () => {
    it('should return environment info after initialization', async () => {
      // Reset mocks before this test
      jest.clearAllMocks();
      
      // Mock successful config for this test
      const { getRuntimeConfig } = require('../config/runtime');
      getRuntimeConfig.mockResolvedValue({
        env: 'production',
        apiUrl: 'https://prod-api.traxettle.app',
        firebaseConfig: {
          projectId: 'traxettle-prod',
          apiKey: 'test-api-key'
        }
      });

      await initializeFirebase();
      
      const env = getEnvironment();
      const apiUrl = getApiUrl();
      
      expect(env).toBe('production');
      expect(apiUrl).toBe('https://prod-api.traxettle.app');
    });
  });
});
