import React from 'react';
import { act, create, ReactTestRenderer } from 'react-test-renderer';

jest.mock('../../api', () => ({
  api: {
    get: jest.fn(),
    post: jest.fn(),
  },
  setToken: jest.fn(async () => {}),
  clearToken: jest.fn(async () => {}),
  getToken: jest.fn(async () => null),
}));

import { AuthProvider, useAuth } from '../../context/AuthContext';
import { api, clearToken, getToken, setToken } from '../../api';

describe('AuthContext', () => {
  let captured: ReturnType<typeof useAuth> | null = null;
  let renderer: ReactTestRenderer;

  const Probe = () => {
    captured = useAuth();
    return null;
  };

  const flush = async () => {
    await act(async () => {
      await Promise.resolve();
    });
  };

  beforeEach(() => {
    captured = null;
    jest.clearAllMocks();
    (getToken as jest.Mock).mockResolvedValue(null);
  });

  afterEach(async () => {
    if (!renderer) return;
    await act(async () => {
      renderer.unmount();
    });
  });

  it('starts unauthenticated when no token exists', async () => {
    await act(async () => {
      renderer = create(
        <AuthProvider>
          <Probe />
        </AuthProvider>
      );
    });

    await flush();

    expect(getToken).toHaveBeenCalled();
    expect(captured?.loading).toBe(false);
    expect(captured?.user).toBeNull();
    expect(captured?.tier).toBe('free');
  });

  it('loads user profile when token exists', async () => {
    (getToken as jest.Mock).mockResolvedValue('abc');
    (api.get as jest.Mock).mockResolvedValue({
      data: {
        userId: 'u1',
        email: 'u1@test.com',
        displayName: 'User One',
        tier: 'free',
        internalTester: false,
        capabilities: { multiCurrencySettlement: false },
      },
    });

    await act(async () => {
      renderer = create(
        <AuthProvider>
          <Probe />
        </AuthProvider>
      );
    });

    await flush();

    expect(api.get).toHaveBeenCalledWith('/api/users/profile');
    expect(captured?.user?.userId).toBe('u1');
  });

  it('login stores token then reloads profile', async () => {
    (api.post as jest.Mock).mockResolvedValueOnce({ data: { accessToken: 'new-token' } });
    (api.get as jest.Mock).mockResolvedValue({
      data: {
        userId: 'u2',
        email: 'u2@test.com',
        displayName: 'User Two',
        tier: 'free',
        internalTester: false,
        capabilities: { multiCurrencySettlement: false },
      },
    });
    (getToken as jest.Mock).mockResolvedValue('new-token');

    await act(async () => {
      renderer = create(
        <AuthProvider>
          <Probe />
        </AuthProvider>
      );
    });
    await flush();

    await act(async () => {
      await captured?.login('u2@test.com', 'pass1234');
    });

    expect(api.post).toHaveBeenCalledWith('/api/auth/login', {
      identifier: 'u2@test.com',
      password: 'pass1234',
      provider: 'email',
    });
    expect(setToken).toHaveBeenCalledWith('new-token');
    expect(captured?.user?.userId).toBe('u2');
  });

  it('login falls back to data.token when accessToken is absent', async () => {
    (api.post as jest.Mock).mockResolvedValueOnce({ data: { token: 'fallback-token' } });
    (api.get as jest.Mock).mockResolvedValue({
      data: {
        userId: 'u2b',
        email: 'u2b@test.com',
        displayName: 'User Two B',
        tier: 'free',
        internalTester: false,
        capabilities: { multiCurrencySettlement: false },
      },
    });
    (getToken as jest.Mock).mockResolvedValue('fallback-token');

    await act(async () => {
      renderer = create(
        <AuthProvider>
          <Probe />
        </AuthProvider>
      );
    });
    await flush();

    await act(async () => {
      await captured?.login('u2b@test.com', 'pass1234');
    });

    expect(setToken).toHaveBeenCalledWith('fallback-token');
    expect(captured?.user?.userId).toBe('u2b');
  });

  it('google login rejects when token missing in response', async () => {
    (api.post as jest.Mock).mockResolvedValueOnce({ data: {} });

    await act(async () => {
      renderer = create(
        <AuthProvider>
          <Probe />
        </AuthProvider>
      );
    });
    await flush();

    await expect(captured!.loginWithGoogle('id-token')).rejects.toThrow('No token received from server');
  });

  it('google login accepts nested token and loads profile', async () => {
    (api.post as jest.Mock).mockResolvedValueOnce({ data: { tokens: { accessToken: 'google-token' } } });
    (getToken as jest.Mock).mockResolvedValue('google-token');
    (api.get as jest.Mock).mockResolvedValue({
      data: {
        userId: 'u-google',
        email: 'g@test.com',
        displayName: 'Google User',
        tier: 'pro',
        internalTester: false,
        capabilities: { multiCurrencySettlement: true },
      },
    });

    await act(async () => {
      renderer = create(
        <AuthProvider>
          <Probe />
        </AuthProvider>
      );
    });
    await flush();

    await act(async () => {
      await captured?.loginWithGoogle('id-token');
    });

    expect(setToken).toHaveBeenCalledWith('google-token');
    expect(captured?.user?.userId).toBe('u-google');
  });

  it('register stores token and loads profile', async () => {
    (api.post as jest.Mock).mockResolvedValueOnce({ data: { token: 'reg-token' } });
    (getToken as jest.Mock).mockResolvedValue('reg-token');
    (api.get as jest.Mock).mockResolvedValue({
      data: {
        userId: 'u3',
        email: 'u3@test.com',
        displayName: 'User Three',
        tier: 'pro',
        internalTester: true,
        capabilities: { multiCurrencySettlement: true },
      },
    });

    await act(async () => {
      renderer = create(
        <AuthProvider>
          <Probe />
        </AuthProvider>
      );
    });
    await flush();

    await act(async () => {
      await captured?.register('u3@test.com', 'pass1234', 'User Three');
    });

    expect(api.post).toHaveBeenCalledWith('/api/auth/register', {
      email: 'u3@test.com',
      password: 'pass1234',
      displayName: 'User Three',
      provider: 'email',
    });
    expect(setToken).toHaveBeenCalledWith('reg-token');
    expect(captured?.user?.userId).toBe('u3');
  });

  it('logout clears token and resets user; switchTier invokes internal endpoint', async () => {
    await act(async () => {
      renderer = create(
        <AuthProvider>
          <Probe />
        </AuthProvider>
      );
    });
    await flush();

    (api.post as jest.Mock).mockResolvedValueOnce({ data: {} });
    (api.get as jest.Mock).mockResolvedValueOnce({
      data: {
        userId: 'u4',
        email: 'u4@test.com',
        displayName: 'User Four',
        tier: 'pro',
        internalTester: true,
        capabilities: { multiCurrencySettlement: true },
      },
    });
    await act(async () => {
      await captured?.switchTier('pro');
    });
    expect(api.post).toHaveBeenCalledWith('/api/internal/entitlements/switch', { tier: 'pro' });
    expect(captured?.tier).toBe('pro');

    await act(async () => {
      await captured?.logout();
    });

    expect(clearToken).toHaveBeenCalled();
    expect(captured?.user).toBeNull();
  });

  it('clears token when loading profile fails with an existing token', async () => {
    (getToken as jest.Mock).mockResolvedValue('bad-token');
    (api.get as jest.Mock).mockRejectedValue(new Error('Unauthorized'));

    await act(async () => {
      renderer = create(
        <AuthProvider>
          <Probe />
        </AuthProvider>
      );
    });
    await flush();

    expect(clearToken).toHaveBeenCalled();
    expect(captured?.loading).toBe(false);
  });
});
