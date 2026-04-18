import AsyncStorage from '@react-native-async-storage/async-storage';
import { RuntimeConfigManager } from '../config/runtime';

const mockFetch = jest.fn();

jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: {
    getItem: jest.fn(),
    setItem: jest.fn(),
    removeItem: jest.fn(),
  },
}));

jest.mock('../config/env', () => ({
  ENV: {
    STAGING_API_URL: 'https://staging.example.com',
    PROD_API_URL: 'https://prod.example.com',
  },
  getApiUrl: jest.fn(() => 'http://localhost:3001'),
  isLocalLikeEnv: jest.fn(() => true),
}));

describe('RuntimeConfigManager', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockFetch.mockReset();
    (global as unknown as { fetch: typeof mockFetch }).fetch = mockFetch;
  });

  it('ignores incomplete stored config and fetches a fresh config', async () => {
    (AsyncStorage.getItem as jest.Mock).mockResolvedValueOnce(
      JSON.stringify({
        env: 'local',
        apiUrl: 'http://localhost:3001',
        firebaseConfig: {
          projectId: 'traxettle-test',
          apiKey: '',
          authDomain: '',
          appId: '',
        },
        revenueCatConfig: {
          googleApiKey: '',
          appleApiKey: '',
          proEntitlement: 'pro',
          offering: 'default',
        },
      }),
    );

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        data: {
          env: 'local',
          apiUrl: 'http://localhost:3001',
          firebaseConfig: {
            projectId: 'traxettle-test',
            apiKey: 'fresh-key',
            authDomain: 'traxettle-test.firebaseapp.com',
            appId: 'fresh-app-id',
            messagingSenderId: '123',
            storageBucket: 'traxettle-test.firebasestorage.app',
          },
          revenueCatConfig: {
            googleApiKey: '',
            appleApiKey: '',
            proEntitlement: 'pro',
            offering: 'default',
          },
        },
      }),
    });

    const manager = new RuntimeConfigManager();
    const config = await manager.getConfig();

    expect(config.firebaseConfig.apiKey).toBe('fresh-key');
    expect(AsyncStorage.removeItem).toHaveBeenCalledWith('@traxettle_runtime_config');
    expect(AsyncStorage.setItem).toHaveBeenCalledWith(
      '@traxettle_runtime_config',
      expect.stringContaining('"fresh-key"'),
    );
  });

  it('ignores stored config from the wrong environment and fetches a fresh config', async () => {
    const envModule = require('../config/env');
    envModule.isLocalLikeEnv.mockReturnValue(false);

    (AsyncStorage.getItem as jest.Mock)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(JSON.stringify({
        env: 'staging',
        apiUrl: 'https://staging.example.com',
        firebaseConfig: {
          projectId: 'traxettle-staging',
          apiKey: 'staging-key',
          authDomain: 'traxettle-staging.firebaseapp.com',
          appId: 'staging-app-id',
        },
        revenueCatConfig: {
          googleApiKey: '',
          appleApiKey: '',
          proEntitlement: 'pro',
          offering: 'default',
        },
      }));

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        data: {
          env: 'production',
          apiUrl: 'https://prod.example.com',
          firebaseConfig: {
            projectId: 'traxettle-prod',
            apiKey: 'prod-key',
            authDomain: 'traxettle-prod.firebaseapp.com',
            appId: 'prod-app-id',
            messagingSenderId: '123',
            storageBucket: 'traxettle-prod.firebasestorage.app',
          },
          revenueCatConfig: {
            googleApiKey: '',
            appleApiKey: '',
            proEntitlement: 'pro',
            offering: 'default',
          },
        },
      }),
    });

    const manager = new RuntimeConfigManager();
    const config = await manager.getConfig();

    expect(config.apiUrl).toBe('https://prod.example.com');
    expect(AsyncStorage.removeItem).toHaveBeenCalledWith('@traxettle_runtime_config');
    expect(AsyncStorage.setItem).toHaveBeenCalledWith(
      '@traxettle_runtime_config',
      expect.stringContaining('"https://prod.example.com"'),
    );
  });
});
