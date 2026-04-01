import AsyncStorage from '@react-native-async-storage/async-storage';
import { getAuth } from 'firebase/auth';
import { ENV } from '../config/env';

import {
  api,
  ApiRequestError,
  clearToken,
  clearTokens,
  getRefreshToken,
  getResolvedApiBaseUrl,
  getToken,
  isFirebaseEmulatorEnabled,
  setFirebaseEmulatorEnabled,
  setRefreshToken,
  setToken,
  setRuntimeApiBaseUrl,
  setTokens,
} from '../api';

describe('mobile api client', () => {
  const fetchMock = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    (global as any).fetch = fetchMock;
  });

  it('gets/sets/clears token in AsyncStorage', async () => {
    await setToken('t-1');
    expect(AsyncStorage.setItem).toHaveBeenCalledWith('@traxettle_token', 't-1');

    const token = await getToken();
    expect(token).toBe('t-1');

    await clearToken();
    expect(AsyncStorage.removeItem).toHaveBeenCalledWith('@traxettle_token');
  });

  it('stores and clears refresh token alongside access token', async () => {
    await setTokens('t-2', 'refresh-2');
    expect(await getRefreshToken()).toBe('refresh-2');

    await clearTokens();
    expect(AsyncStorage.removeItem).toHaveBeenCalledWith('@traxettle_refresh_token');
  });

  it('adds auth header and unwraps data payload', async () => {
    await setToken('token-abc');
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ data: { ok: true } }),
    });

    const result = await api.get('/api/ping');

    expect(result).toEqual({ data: { ok: true }, status: 200 });
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/api/ping'),
      expect.objectContaining({
        method: 'GET',
        headers: expect.objectContaining({
          'Content-Type': 'application/json',
          Authorization: 'Bearer token-abc',
        }),
      })
    );
  });

  it('returns raw json when data wrapper is missing', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 201,
      json: async () => ({ success: true }),
    });

    const result = await api.post('/api/hello', { a: 1 });

    expect(result).toEqual({ data: { success: true }, status: 201 });
    expect(fetchMock).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ a: 1 }),
      })
    );
  });

  it('throws json error field for non-2xx responses', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 400,
      json: async () => ({ error: 'Bad request' }),
    });

    await expect(api.delete('/api/fail')).rejects.toThrow('Bad request');
  });

  it('falls back to status error when response has no json body', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 503,
      json: async () => {
        throw new Error('invalid json');
      },
    });

    await expect(api.put('/api/fail', { x: 1 })).rejects.toThrow('Request failed (503)');
  });

  it('omits Authorization header when token is missing', async () => {
    await clearToken();
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ data: { ok: true } }),
    });

    await api.get('/api/no-token');
    const headers = fetchMock.mock.calls[0][1].headers as Record<string, string>;
    expect(headers.Authorization).toBeUndefined();
  });

  it('throws ApiRequestError with code/feature from payload', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 403,
      json: async () => ({ message: 'Pro required', code: 'FEATURE_REQUIRES_PRO', feature: 'multi_currency_settlement' }),
    });

    await expect(api.post('/api/pro-only', {})).rejects.toMatchObject({
      message: 'Pro required',
      status: 403,
      code: 'FEATURE_REQUIRES_PRO',
      feature: 'multi_currency_settlement',
    });
  });

  it('handles successful response when json parsing fails', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 204,
      json: async () => { throw new Error('no body'); },
    });

    const result = await api.delete('/api/no-content');
    expect(result).toEqual({ data: {}, status: 204 });
  });

  it('supports local emulator preference toggling', async () => {
    await setFirebaseEmulatorEnabled(true);
    expect(await isFirebaseEmulatorEnabled()).toBe(true);
    expect(await getResolvedApiBaseUrl()).toContain(':3002');

    await setFirebaseEmulatorEnabled(false);
    expect(await isFirebaseEmulatorEnabled()).toBe(false);
    expect(await getResolvedApiBaseUrl()).toContain(':3001');
  });

  it('uses the build-time emulator default when no local override is stored', async () => {
    const AsyncStorageModule = require('@react-native-async-storage/async-storage');
    await AsyncStorageModule.clear();

    const originalDefault = ENV.FIREBASE_EMULATOR_DEFAULT;
    (ENV as any).FIREBASE_EMULATOR_DEFAULT = true;

    try {
      expect(await isFirebaseEmulatorEnabled()).toBe(true);
      expect(await getResolvedApiBaseUrl()).toContain(':3002');
    } finally {
      (ENV as any).FIREBASE_EMULATOR_DEFAULT = originalDefault;
    }
  });

  it('refreshes access token after a 401 and retries once', async () => {
    await setTokens('expired-token', 'refresh-123');
    (getAuth as jest.Mock).mockReturnValueOnce({
      currentUser: null,
    });

    fetchMock
      .mockResolvedValueOnce({
        ok: false,
        status: 401,
        json: async () => ({ error: 'Unauthorized', code: 'AUTH_INVALID' }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ data: { accessToken: 'fresh-access', refreshToken: 'refresh-456' } }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ data: { ok: true } }),
      });

    const result = await api.get('/api/retry-me');

    expect(result).toEqual({ data: { ok: true }, status: 200 });
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining('/api/auth/refresh'),
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ refreshToken: 'refresh-123' }),
      }),
    );
    expect(await getToken()).toBe('fresh-access');
    expect(await getRefreshToken()).toBe('refresh-456');
  });

  it('uses the current Firebase session before refresh token fallback', async () => {
    await setTokens('stale-token', 'refresh-123');
    const getIdToken = jest.fn().mockResolvedValue('firebase-fresh-token');
    (getAuth as jest.Mock).mockReturnValueOnce({
      currentUser: {
        getIdToken,
      },
    });

    fetchMock
      .mockResolvedValueOnce({
        ok: false,
        status: 401,
        json: async () => ({ error: 'Unauthorized', code: 'AUTH_INVALID' }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ data: { ok: true } }),
      });

    const result = await api.get('/api/firebase-refresh');

    expect(result).toEqual({ data: { ok: true }, status: 200 });
    expect(getIdToken).toHaveBeenCalledWith(true);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(await getToken()).toBe('firebase-fresh-token');
  });

  it('clears stored tokens and notifies the auth failure handler when refresh fails', async () => {
    const authFailureHandler = jest.fn();
    await setTokens('expired-token', 'refresh-123');
    (getAuth as jest.Mock).mockReturnValueOnce({ currentUser: null });
    const { registerAuthFailureHandler } = require('../api') as typeof import('../api');
    registerAuthFailureHandler(authFailureHandler);

    fetchMock
      .mockResolvedValueOnce({
        ok: false,
        status: 401,
        json: async () => ({ error: 'Unauthorized', code: 'AUTH_INVALID' }),
      })
      .mockResolvedValueOnce({
        ok: false,
        status: 401,
        json: async () => ({ error: 'refresh failed' }),
      });

    await expect(api.get('/api/protected')).rejects.toMatchObject({
      status: 401,
    });
    expect(authFailureHandler).toHaveBeenCalledWith(expect.any(ApiRequestError));
    registerAuthFailureHandler(null);
  });

  it('throws a timeout error when fetch aborts', async () => {
    fetchMock.mockRejectedValueOnce({ name: 'AbortError' });

    await expect(api.get('/api/slow')).rejects.toMatchObject({
      message: 'Request timed out. Please try again.',
      code: 'TIMEOUT',
      status: 0,
    });
  });

  it('throws a network error when fetch fails unexpectedly', async () => {
    fetchMock.mockRejectedValueOnce(new Error('socket hang up'));

    await expect(api.get('/api/offline')).rejects.toMatchObject({
      message: 'Unable to reach server. Please check your internet connection and try again.',
      code: 'NETWORK_ERROR',
      status: 0,
    });
  });

  it('prefers the runtime API override when one is set', async () => {
    setRuntimeApiBaseUrl('https://runtime.example.com');

    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ data: { ok: true } }),
    });

    await api.get('/api/runtime');

    expect(fetchMock).toHaveBeenCalledWith(
      'https://runtime.example.com/api/runtime',
      expect.any(Object),
    );
  });
});
