describe('env config', () => {
  const loadEnv = (os: 'ios' | 'android', isDev: boolean, overrideEnv: Record<string, string | undefined> = {}) => {
    jest.resetModules();
    Object.assign(process.env, {
      EXPO_PUBLIC_USE_REAL_PAYMENTS: undefined,
      EXPO_PUBLIC_API_URL: undefined,
      ...overrideEnv,
    });

    jest.doMock('react-native', () => ({ Platform: { OS: os } }));
    (global as any).__DEV__ = isDev;

    return require('../config/env') as typeof import('../config/env');
  };

  afterEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
  });

  it('uses android emulator host in development', () => {
    const { ENV } = loadEnv('android', true);
    expect(ENV.API_URL).toBe('http://10.0.2.2:3001');
    expect(ENV.WS_URL).toBe('ws://10.0.2.2:3001/ws');
  });

  it('uses localhost for iOS development', () => {
    const { ENV } = loadEnv('ios', true);
    expect(ENV.API_URL).toBe('http://localhost:3001');
    expect(ENV.WS_URL).toBe('ws://localhost:3001/ws');
  });

  it('uses production URLs when __DEV__ is false', () => {
    const { ENV } = loadEnv('ios', false);
    expect(ENV.API_URL).toBe('https://api.splitex.app');
    expect(ENV.WS_URL).toBe('wss://api.splitex.app/ws');
  });

  it('parses real payment flag from EXPO_PUBLIC_USE_REAL_PAYMENTS', () => {
    const { ENV } = loadEnv('ios', true, { EXPO_PUBLIC_USE_REAL_PAYMENTS: 'true' });
    expect(ENV.USE_REAL_PAYMENTS).toBe(true);
  });

  it('returns API override from getApiUrl when EXPO_PUBLIC_API_URL is provided', () => {
    const { getApiUrl, ENV } = loadEnv('ios', true, { EXPO_PUBLIC_API_URL: 'http://192.168.1.5:3001' });
    expect(getApiUrl()).toBe('http://192.168.1.5:3001');
    expect(ENV.API_URL).toBe('http://localhost:3001');
  });

  it('returns emulator API override from getEmulatorApiUrl when EXPO_PUBLIC_API_URL_EMULATOR is provided', () => {
    const { getEmulatorApiUrl, ENV } = loadEnv('ios', true, { EXPO_PUBLIC_API_URL_EMULATOR: 'http://192.168.1.5:3002' });
    expect(getEmulatorApiUrl()).toBe('http://192.168.1.5:3002');
    expect(ENV.API_URL_EMULATOR).toBe('http://localhost:3002');
  });
});
