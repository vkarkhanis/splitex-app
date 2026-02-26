describe('AuthContext local override behavior', () => {
  afterEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
  });

  it('uses DEFAULT_TIER override in local-like internal mode', async () => {
    jest.doMock('../../config/env', () => ({
      ENV: {
        DEFAULT_TIER: 'pro',
        INTERNAL_FEATURES_ENABLED: true,
      },
      isLocalLikeEnv: () => true,
    }));

    const apiGet = jest.fn().mockResolvedValue({
      data: {
        userId: 'u-local',
        email: 'local@test.com',
        displayName: 'Local User',
        tier: 'free',
        internalTester: false,
        capabilities: { multiCurrencySettlement: false },
      },
    });

    jest.doMock('../../api', () => ({
      api: {
        get: apiGet,
        post: jest.fn(),
      },
      setToken: jest.fn(async () => {}),
      clearToken: jest.fn(async () => {}),
      getToken: jest.fn(async () => 'token-local'),
    }));

    const React = require('react');
    const { act, create } = require('react-test-renderer');
    const { AuthProvider, useAuth } = require('../../context/AuthContext');

    let captured: any = null;
    const Probe = () => {
      captured = useAuth();
      return null;
    };

    let renderer: any;
    await act(async () => {
      renderer = create(
        React.createElement(AuthProvider, null, React.createElement(Probe, null))
      );
    });

    await act(async () => {
      await Promise.resolve();
    });

    expect(captured.tier).toBe('pro');
    expect(captured.capabilities.multiCurrencySettlement).toBe(true);

    await act(async () => {
      renderer.unmount();
    });
  });
});
