import React from 'react';
import { act, create, ReactTestRenderer } from 'react-test-renderer';

jest.mock('../../api', () => ({
  api: {
    get: jest.fn(),
    post: jest.fn(),
  },
  setToken: jest.fn(async () => {}),
  setTokens: jest.fn(async () => {}),
  clearToken: jest.fn(async () => {}),
  clearTokens: jest.fn(async () => {}),
  getToken: jest.fn(async () => null),
  registerAuthFailureHandler: jest.fn(),
}));

import AsyncStorage from '@react-native-async-storage/async-storage';
import { AuthProvider, useAuth } from '../../context/AuthContext';
import { api, clearTokens, getToken, setTokens } from '../../api';
import {
  createUserWithEmailAndPassword,
  fetchSignInMethodsForEmail,
  signInWithCustomToken,
  signInWithEmailAndPassword,
  signInWithEmailLink,
  updateProfile,
} from 'firebase/auth';

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
    (signInWithEmailAndPassword as jest.Mock).mockResolvedValue({
      user: {
        getIdToken: jest.fn(async () => 'firebase-id-token'),
      },
    });
    (createUserWithEmailAndPassword as jest.Mock).mockResolvedValue({
      user: {
        getIdToken: jest.fn(async () => 'firebase-register-token'),
      },
    });
    (updateProfile as jest.Mock).mockResolvedValue(undefined);
    (fetchSignInMethodsForEmail as jest.Mock).mockResolvedValue(['password']);
    (signInWithCustomToken as jest.Mock).mockResolvedValue({
      user: {
        getIdToken: jest.fn(async () => 'custom-token'),
      },
    });
    (signInWithEmailLink as jest.Mock).mockResolvedValue({
      user: {
        getIdToken: jest.fn(async () => 'email-link-token'),
      },
    });
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
    (getToken as jest.Mock).mockResolvedValue('firebase-id-token');

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

    expect(signInWithEmailAndPassword).toHaveBeenCalled();
    expect(setTokens).toHaveBeenCalledWith('firebase-id-token', null);
    expect(captured?.user?.userId).toBe('u2');
  });

  it('login falls back to backend bootstrap when Firebase auth misses the account', async () => {
    (signInWithEmailAndPassword as jest.Mock).mockRejectedValueOnce(new Error('missing'));
    (fetchSignInMethodsForEmail as jest.Mock).mockResolvedValueOnce([]);
    (api.post as jest.Mock).mockResolvedValueOnce({ data: { firebaseCustomToken: 'firebase-custom-token' } });
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
    (getToken as jest.Mock).mockResolvedValue('custom-token');

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

    expect(api.post).toHaveBeenCalledWith('/api/auth/login', {
      identifier: 'u2b@test.com',
      password: 'pass1234',
      provider: 'email',
    });
    expect(setTokens).toHaveBeenCalledWith('custom-token', null);
    expect(captured?.user?.userId).toBe('u2b');
  });

  it('login shows a provider-aware message for Google-only accounts', async () => {
    (signInWithEmailAndPassword as jest.Mock).mockRejectedValueOnce(new Error('missing'));
    (fetchSignInMethodsForEmail as jest.Mock).mockResolvedValueOnce(['google.com']);

    await act(async () => {
      renderer = create(
        <AuthProvider>
          <Probe />
        </AuthProvider>
      );
    });
    await flush();

    await expect(captured!.login('google-only@test.com', 'pass1234')).rejects.toThrow(
      'This account uses Google sign-in. Sign in with Google or set a password first.',
    );
  });

  it('login fails cleanly when backend bootstrap does not return a Firebase session', async () => {
    (signInWithEmailAndPassword as jest.Mock).mockRejectedValueOnce(new Error('missing'));
    (fetchSignInMethodsForEmail as jest.Mock).mockResolvedValueOnce([]);
    (api.post as jest.Mock).mockResolvedValueOnce({ data: {} });

    await act(async () => {
      renderer = create(
        <AuthProvider>
          <Probe />
        </AuthProvider>
      );
    });
    await flush();

    await expect(captured!.login('legacy@test.com', 'pass1234')).rejects.toThrow(
      'Unable to establish a secure session. Please try again.',
    );
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

    await expect(captured!.loginWithGoogle('id-token')).rejects.toThrow('No Firebase session received from server');
  });

  it('google login accepts nested token and loads profile', async () => {
    (api.post as jest.Mock).mockResolvedValueOnce({ data: { firebaseCustomToken: 'firebase-custom-token' } });
    (getToken as jest.Mock).mockResolvedValue('custom-token');
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

    expect(setTokens).toHaveBeenCalledWith('custom-token', null);
    expect(captured?.user?.userId).toBe('u-google');
  });

  it('register stores token and loads profile', async () => {
    (getToken as jest.Mock).mockResolvedValue('firebase-register-token');
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

    expect(createUserWithEmailAndPassword).toHaveBeenCalled();
    expect(updateProfile).toHaveBeenCalled();
    expect(setTokens).toHaveBeenCalledWith('firebase-register-token', null);
    expect(captured?.user?.userId).toBe('u3');
  });

  it('register shows a provider-aware message for Google-only existing accounts', async () => {
    (createUserWithEmailAndPassword as jest.Mock).mockRejectedValueOnce({ code: 'auth/email-already-in-use' });
    (fetchSignInMethodsForEmail as jest.Mock).mockResolvedValueOnce(['google.com']);

    await act(async () => {
      renderer = create(
        <AuthProvider>
          <Probe />
        </AuthProvider>
      );
    });
    await flush();

    await expect(
      captured!.register('existing@test.com', 'pass1234', 'Existing User'),
    ).rejects.toThrow('This email is already registered with Google. Sign in with Google or set a password first.');
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

    expect(clearTokens).toHaveBeenCalled();
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

    (getToken as jest.Mock).mockResolvedValue('email-link-token');
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

    expect(signInWithEmailLink).toHaveBeenCalledWith(expect.anything(), 'stored@test.com', 'https://app.test?oobCode=abc&mode=signIn');
    expect(setTokens).toHaveBeenCalledWith('email-link-token', null);
    expect(AsyncStorage.removeItem).toHaveBeenCalledWith('@traxettle_pending_email_link_email');
  });

  it('completeEmailLinkSignIn uses emailOverride over stored email', async () => {
    (AsyncStorage.getItem as jest.Mock).mockResolvedValue('stored@test.com');
    (AsyncStorage.removeItem as jest.Mock).mockResolvedValue(undefined);

    (getToken as jest.Mock).mockResolvedValue('email-link-token');
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

    expect(signInWithEmailLink).toHaveBeenCalledWith(expect.anything(), 'override@test.com', 'https://app.test?oobCode=abc&mode=signIn');
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

  it('completeEmailLinkSignIn throws when Firebase link completion fails', async () => {
    (AsyncStorage.getItem as jest.Mock).mockResolvedValue('notoken@test.com');
    (signInWithEmailLink as jest.Mock).mockRejectedValueOnce(new Error('Invalid or expired sign-in link'));

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
    ).rejects.toThrow('Invalid or expired sign-in link');
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

    (getToken as jest.Mock).mockResolvedValue('email-link-token');
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
    expect(signInWithEmailLink).toHaveBeenCalledWith(expect.anything(), 'deep@test.com', emailLinkUrl);
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

  it('deep link subscription processes later email-link events', async () => {
    const { Linking } = require('react-native');
    let urlListener: ((event: { url?: string }) => void) | null = null;
    (Linking.addEventListener as jest.Mock).mockImplementationOnce((_event: string, listener: (event: { url?: string }) => void) => {
      urlListener = listener;
      return { remove: jest.fn() };
    });
    (AsyncStorage.getItem as jest.Mock).mockResolvedValue('later@test.com');
    (AsyncStorage.removeItem as jest.Mock).mockResolvedValue(undefined);
    (getToken as jest.Mock).mockResolvedValue('email-link-token');
    (api.get as jest.Mock).mockResolvedValue({
      data: {
        userId: 'u-later',
        email: 'later@test.com',
        displayName: 'Later User',
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
      await urlListener?.({ url: 'https://app.test?oobCode=later123&mode=signIn' });
    });

    expect(signInWithEmailLink).toHaveBeenCalledWith(
      expect.anything(),
      'later@test.com',
      'https://app.test?oobCode=later123&mode=signIn',
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

    expect(clearTokens).toHaveBeenCalled();
    expect(captured?.loading).toBe(false);
  });

  it('logs out when the registered auth failure handler receives a 401', async () => {
    (getToken as jest.Mock).mockResolvedValue('existing-token');
    (api.get as jest.Mock).mockResolvedValue({
      data: {
        userId: 'u-auth-failure',
        email: 'auth@test.com',
        displayName: 'Auth Failure',
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

    const registeredHandler = (require('../../api').registerAuthFailureHandler as jest.Mock).mock.calls.find(
      ([handler]: [unknown]) => typeof handler === 'function',
    )?.[0] as ((error: { status: number }) => Promise<void>) | undefined;

    await act(async () => {
      await registeredHandler?.({ status: 401 });
    });

    expect(clearTokens).toHaveBeenCalled();
    expect(captured?.user).toBeNull();
  });

  it('locks the session after five minutes in the background and supports local unlock actions', async () => {
    const { AppState } = require('react-native');
    let appStateListener: ((state: string) => void) | null = null;
    (AppState.addEventListener as jest.Mock).mockImplementation((_event: string, listener: (state: string) => void) => {
      appStateListener = listener;
      return { remove: jest.fn() };
    });
    (getToken as jest.Mock).mockResolvedValue('existing-token');
    (api.get as jest.Mock).mockResolvedValue({
      data: {
        userId: 'u-lock',
        email: 'lock@test.com',
        displayName: 'Lock User',
        tier: 'free',
        internalTester: false,
        capabilities: { multiCurrencySettlement: false },
      },
    });

    let now = 1_000_000;
    const dateNowSpy = jest.spyOn(Date, 'now').mockImplementation(() => now);

    await act(async () => {
      renderer = create(
        <AuthProvider>
          <Probe />
        </AuthProvider>
      );
    });
    await flush();

    await act(async () => {
      await captured?.setupPin('1234', true);
    });
    expect(captured?.biometricsEnabled).toBe(true);
    expect(appStateListener).toBeTruthy();

    act(() => {
      appStateListener?.('background');
    });
    now += 5 * 60 * 1000 + 1;
    act(() => {
      appStateListener?.('active');
    });
    await flush();
    expect(captured?.sessionLocked).toBe(true);

    await act(async () => {
      const ok = await captured?.unlockWithPin('1234');
      expect(ok).toBe(true);
    });
    expect(captured?.sessionLocked).toBe(false);

    await act(async () => {
      await captured?.toggleBiometrics(false);
      captured?.lockSession();
    });
    expect(captured?.biometricsEnabled).toBe(false);
    expect(captured?.sessionLocked).toBe(true);

    await act(async () => {
      const ok = await captured?.unlockWithBiometrics();
      expect(ok).toBe(false);
    });
    expect(captured?.sessionLocked).toBe(true);

    dateNowSpy.mockRestore();
  });
});
