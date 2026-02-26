import AsyncStorage from '@react-native-async-storage/async-storage';

import { api, clearToken, getResolvedApiBaseUrl, getToken, isFirebaseEmulatorEnabled, setFirebaseEmulatorEnabled, setToken } from '../api';

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
});
