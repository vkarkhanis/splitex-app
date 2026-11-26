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

  describe('stored production config', () => {
    const prodConfig = (appleApiKey: string) => ({
      env: 'production',
      apiUrl: 'https://prod.example.com',
      firebaseConfig: {
        projectId: 'traxettle-prod',
        apiKey: 'prod-key',
        authDomain: 'traxettle-prod.firebaseapp.com',
        appId: 'prod-app-id',
      },
      revenueCatConfig: { googleApiKey: '', appleApiKey, proEntitlement: 'traxettle-pro', offering: 'default' },
    });
    const apiServes = (config: object) => mockFetch.mockResolvedValueOnce({ ok: true, json: async () => ({ data: config }) });

    beforeEach(() => {
      require('../config/env').isLocalLikeEnv.mockReturnValue(false);
      const stored = JSON.stringify(prodConfig('appl_old'));
      (AsyncStorage.getItem as jest.Mock).mockImplementation(async (key: string) =>
        key === '@traxettle_runtime_config' ? stored : null,
      );
    });

    it('is used at once, then refreshed from the API in the background', async () => {
      apiServes(prodConfig('appl_new'));
      const manager = new RuntimeConfigManager();

      const config = await manager.getConfig();
      expect(config.revenueCatConfig.appleApiKey).toBe('appl_old'); // no wait for the network

      const latest = await manager.getLatestConfig();
      expect(latest.revenueCatConfig.appleApiKey).toBe('appl_new');
      expect(mockFetch).toHaveBeenCalledWith('https://prod.example.com/api/config', expect.anything());
      expect(AsyncStorage.setItem).toHaveBeenCalledWith('@traxettle_runtime_config', expect.stringContaining('"appl_new"'));
      expect((await manager.getConfig()).revenueCatConfig.appleApiKey).toBe('appl_new');
    });

    it('keeps the stored config when the API is unreachable', async () => {
      mockFetch.mockRejectedValueOnce(new Error('offline'));
      const manager = new RuntimeConfigManager();

      const latest = await manager.getLatestConfig();
      expect(latest.revenueCatConfig.appleApiKey).toBe('appl_old');
      expect(AsyncStorage.setItem).not.toHaveBeenCalled();
    });

    it('discards a refresh that finishes after an environment switch', async () => {
      let respond: (value: unknown) => void = () => {};
      mockFetch.mockReturnValueOnce(new Promise((resolve) => { respond = resolve; }));
      const manager = new RuntimeConfigManager();

      await manager.getConfig(); // starts the refresh
      await manager.clearCache(); // e.g. the 7-tap switch
      respond({ ok: true, json: async () => ({ data: prodConfig('appl_new') }) });
      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(AsyncStorage.setItem).not.toHaveBeenCalled();
    });
  });
});
