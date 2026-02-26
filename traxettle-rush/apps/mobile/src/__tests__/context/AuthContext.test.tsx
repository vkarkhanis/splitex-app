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

import AsyncStorage from '@react-native-async-storage/async-storage';
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

  it('sendEmailLinkSignIn calls API and stores email', async () => {
    (api.post as jest.Mock).mockResolvedValueOnce({ data: {} });
    (AsyncStorage.setItem as jest.Mock).mockResolvedValue(undefined);

    await act(async () => {
      renderer = create(
        <AuthProvider>
          <Probe />
        </AuthProvider>
      );
    });
    await flush();

    await act(async () => {
      await captured?.sendEmailLinkSignIn(' Test@Example.COM ');
    });

    expect(api.post).toHaveBeenCalledWith('/api/auth/email-link/send', { email: 'test@example.com' });
    expect(AsyncStorage.setItem).toHaveBeenCalledWith(
      '@traxettle_pending_email_link_email',
      'test@example.com'
    );
  });

  it('completeEmailLinkSignIn succeeds with stored email', async () => {
    (AsyncStorage.getItem as jest.Mock).mockResolvedValue('stored@test.com');
    (AsyncStorage.removeItem as jest.Mock).mockResolvedValue(undefined);

    (api.post as jest.Mock).mockResolvedValueOnce({
      data: { tokens: { accessToken: 'link-token' } },
    });
    (getToken as jest.Mock).mockResolvedValue('link-token');
    (api.get as jest.Mock).mockResolvedValue({
      data: {
        userId: 'u-link',
        email: 'stored@test.com',
        displayName: 'Link User',
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

    await act(async () => {
      await captured?.completeEmailLinkSignIn('https://app.test?oobCode=abc&mode=signIn');
    });

    expect(api.post).toHaveBeenCalledWith('/api/auth/email-link/complete', {
      email: 'stored@test.com',
      link: 'https://app.test?oobCode=abc&mode=signIn',
    });
    expect(setToken).toHaveBeenCalledWith('link-token');
    expect(AsyncStorage.removeItem).toHaveBeenCalledWith('@traxettle_pending_email_link_email');
  });

  it('completeEmailLinkSignIn uses emailOverride over stored email', async () => {
    (AsyncStorage.getItem as jest.Mock).mockResolvedValue('stored@test.com');
    (AsyncStorage.removeItem as jest.Mock).mockResolvedValue(undefined);

    (api.post as jest.Mock).mockResolvedValueOnce({
      data: { accessToken: 'link-token-2' },
    });
    (getToken as jest.Mock).mockResolvedValue('link-token-2');
    (api.get as jest.Mock).mockResolvedValue({
      data: {
        userId: 'u-override',
        email: 'override@test.com',
        displayName: 'Override User',
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

    await act(async () => {
      await captured?.completeEmailLinkSignIn(
        'https://app.test?oobCode=abc&mode=signIn',
        'Override@Test.COM'
      );
    });

    expect(api.post).toHaveBeenCalledWith('/api/auth/email-link/complete', {
      email: 'override@test.com',
      link: 'https://app.test?oobCode=abc&mode=signIn',
    });
  });

  it('completeEmailLinkSignIn throws when no email available', async () => {
    (AsyncStorage.getItem as jest.Mock).mockResolvedValue(null);

    await act(async () => {
      renderer = create(
        <AuthProvider>
          <Probe />
        </AuthProvider>
      );
    });
    await flush();

    await expect(
      captured!.completeEmailLinkSignIn('https://app.test?oobCode=abc&mode=signIn')
    ).rejects.toThrow('Enter your email');
  });

  it('completeEmailLinkSignIn throws when server returns no token', async () => {
    (AsyncStorage.getItem as jest.Mock).mockResolvedValue('notoken@test.com');
    (api.post as jest.Mock).mockResolvedValueOnce({ data: {} });

    await act(async () => {
      renderer = create(
        <AuthProvider>
          <Probe />
        </AuthProvider>
      );
    });
    await flush();

    await expect(
      captured!.completeEmailLinkSignIn('https://app.test?oobCode=abc&mode=signIn')
    ).rejects.toThrow('No token received');
  });

  it('refreshProfile updates user data', async () => {
    (getToken as jest.Mock).mockResolvedValue('existing-token');
    (api.get as jest.Mock)
      .mockResolvedValueOnce({
        data: {
          userId: 'u-refresh',
          email: 'refresh@test.com',
          displayName: 'Before Refresh',
          tier: 'free',
          internalTester: false,
          capabilities: { multiCurrencySettlement: false },
        },
      })
      .mockResolvedValueOnce({
        data: {
          userId: 'u-refresh',
          email: 'refresh@test.com',
          displayName: 'After Refresh',
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

    expect(captured?.user?.displayName).toBe('Before Refresh');

    await act(async () => {
      await captured?.refreshProfile();
    });

    expect(captured?.user?.displayName).toBe('After Refresh');
    expect(captured?.tier).toBe('pro');
  });

  it('switchTier calls internal endpoint and refreshes profile', async () => {
    (getToken as jest.Mock).mockResolvedValue('existing-token');
    (api.get as jest.Mock)
      .mockResolvedValueOnce({
        data: {
          userId: 'u-switch',
          email: 'switch@test.com',
          displayName: 'Switch User',
          tier: 'free',
          internalTester: false,
          capabilities: { multiCurrencySettlement: false },
        },
      })
      .mockResolvedValueOnce({
        data: {
          userId: 'u-switch',
          email: 'switch@test.com',
          displayName: 'Switch User',
          tier: 'pro',
          internalTester: false,
          capabilities: { multiCurrencySettlement: true },
        },
      });
    (api.post as jest.Mock).mockResolvedValueOnce({ data: {} });

    await act(async () => {
      renderer = create(
        <AuthProvider>
          <Probe />
        </AuthProvider>
      );
    });
    await flush();

    expect(captured?.tier).toBe('free');

    await act(async () => {
      await captured?.switchTier('pro');
    });

    expect(api.post).toHaveBeenCalledWith('/api/internal/entitlements/switch', { tier: 'pro' });
    expect(captured?.tier).toBe('pro');
  });

  it('deep link useEffect processes email link from getInitialURL', async () => {
    const { Linking } = require('react-native');
    const emailLinkUrl = 'https://app.test?oobCode=deep123&mode=signIn';
    (Linking.getInitialURL as jest.Mock).mockResolvedValueOnce(emailLinkUrl);
    (AsyncStorage.getItem as jest.Mock).mockResolvedValue('deep@test.com');
    (AsyncStorage.removeItem as jest.Mock).mockResolvedValue(undefined);

    (api.post as jest.Mock).mockResolvedValueOnce({
      data: { tokens: { accessToken: 'deep-token' } },
    });
    (getToken as jest.Mock).mockResolvedValue('deep-token');
    (api.get as jest.Mock).mockResolvedValue({
      data: {
        userId: 'u-deep',
        email: 'deep@test.com',
        displayName: 'Deep User',
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

    // The deep link should have triggered completeEmailLinkSignIn
    expect(api.post).toHaveBeenCalledWith('/api/auth/email-link/complete', {
      email: 'deep@test.com',
      link: emailLinkUrl,
    });
  });

  it('deep link useEffect handles non-email-link URLs gracefully', async () => {
    const { Linking } = require('react-native');
    (Linking.getInitialURL as jest.Mock).mockResolvedValueOnce('https://app.test/some-page');

    await act(async () => {
      renderer = create(
        <AuthProvider>
          <Probe />
        </AuthProvider>
      );
    });
    await flush();

    // Should NOT call email-link/complete for non-email-link URLs
    expect(api.post).not.toHaveBeenCalledWith(
      '/api/auth/email-link/complete',
      expect.anything()
    );
  });

  it('deep link useEffect handles null getInitialURL', async () => {
    const { Linking } = require('react-native');
    (Linking.getInitialURL as jest.Mock).mockResolvedValueOnce(null);

    await act(async () => {
      renderer = create(
        <AuthProvider>
          <Probe />
        </AuthProvider>
      );
    });
    await flush();

    expect(api.post).not.toHaveBeenCalledWith(
      '/api/auth/email-link/complete',
      expect.anything()
    );
  });

  it('deep link useEffect catches errors from completeEmailLinkSignIn', async () => {
    const { Linking } = require('react-native');
    const emailLinkUrl = 'https://app.test?oobCode=fail123&mode=signIn';
    (Linking.getInitialURL as jest.Mock).mockResolvedValueOnce(emailLinkUrl);
    // No email stored → completeEmailLinkSignIn will throw
    (AsyncStorage.getItem as jest.Mock).mockResolvedValue(null);

    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

    await act(async () => {
      renderer = create(
        <AuthProvider>
          <Probe />
        </AuthProvider>
      );
    });
    await flush();

    // Should have warned about the failure, not crashed
    expect(warnSpy).toHaveBeenCalledWith(
      'Email link completion failed:',
      expect.any(Error)
    );
    warnSpy.mockRestore();
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
