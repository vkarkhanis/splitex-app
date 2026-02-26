describe('web api client', () => {
  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
    localStorage.clear();
    process.env.NEXT_PUBLIC_API_URL = '';
    process.env.NEXT_PUBLIC_APP_ENV = 'local';
    (global as any).fetch = jest.fn();
  });

  afterEach(() => {
    jest.dontMock('firebase/auth');
  });

  test('adds auth header from localStorage when no firebase user exists', async () => {
    localStorage.setItem('traxettle.authToken', 'cached-token');

    jest.doMock('firebase/auth', () => ({
      getAuth: () => ({ currentUser: null }),
    }));

    const { api } = await import('../../utils/api');

    (fetch as jest.Mock).mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ success: true, data: { ok: true } }),
    });

    await api.get('/health');

    expect(fetch).toHaveBeenCalledWith(
      'http://localhost:3001/health',
      expect.objectContaining({
        method: 'GET',
        headers: expect.objectContaining({
          'Content-Type': 'application/json',
          Authorization: 'Bearer cached-token',
        }),
      }),
    );
  });

  test('uses fresh firebase token and stores it', async () => {
    const getIdToken = jest.fn().mockResolvedValue('fresh-token');

    jest.doMock('firebase/auth', () => ({
      getAuth: () => ({
        currentUser: {
          getIdToken,
        },
      }),
    }));

    const { api } = await import('../../utils/api');

    (fetch as jest.Mock).mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ success: true, data: { id: 1 } }),
    });

    await api.get('/profile');

    expect(getIdToken).toHaveBeenCalledWith(true);
    expect(localStorage.getItem('traxettle.authToken')).toBe('fresh-token');
    expect(fetch).toHaveBeenCalledWith(
      'http://localhost:3001/profile',
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: 'Bearer fresh-token',
        }),
      }),
    );
  });

  test('sends JSON body on post', async () => {
    jest.doMock('firebase/auth', () => ({
      getAuth: () => ({ currentUser: null }),
    }));

    const { api } = await import('../../utils/api');

    (fetch as jest.Mock).mockResolvedValue({
      ok: true,
      status: 201,
      json: async () => ({ success: true, data: { created: true } }),
    });

    await api.post('/events', { name: 'Trip' });

    expect(fetch).toHaveBeenCalledWith(
      'http://localhost:3001/events',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ name: 'Trip' }),
        headers: expect.objectContaining({
          'Content-Type': 'application/json',
        }),
      }),
    );
  });

  test('throws backend-provided error', async () => {
    jest.doMock('firebase/auth', () => ({
      getAuth: () => ({ currentUser: null }),
    }));

    const { api } = await import('../../utils/api');

    (fetch as jest.Mock).mockResolvedValue({
      ok: false,
      status: 400,
      json: async () => ({ success: false, error: 'Invalid input' }),
    });

    await expect(api.get('/bad')).rejects.toThrow('Invalid input');
  });

  test('throws status fallback message when backend has no message', async () => {
    jest.doMock('firebase/auth', () => ({
      getAuth: () => ({ currentUser: null }),
    }));

    const { api } = await import('../../utils/api');

    (fetch as jest.Mock).mockResolvedValue({
      ok: false,
      status: 503,
      json: async () => ({ success: false }),
    });

    await expect(api.get('/down')).rejects.toThrow('Request failed with status 503');
  });

  test('uses cached token when firebase import fails', async () => {
    localStorage.setItem('traxettle.authToken', 'fallback-token');
    jest.doMock('firebase/auth', () => {
      throw new Error('module load failed');
    });

    const { api } = await import('../../utils/api');

    (fetch as jest.Mock).mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ success: true, data: { ok: true } }),
    });

    await api.get('/token-fallback');

    expect(fetch).toHaveBeenCalledWith(
      'http://localhost:3001/token-fallback',
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: 'Bearer fallback-token',
        }),
      }),
    );
  });

  test('supports put and delete helpers', async () => {
    jest.doMock('firebase/auth', () => ({
      getAuth: () => ({ currentUser: null }),
    }));

    const { api } = await import('../../utils/api');

    (fetch as jest.Mock)
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ success: true, data: { updated: true } }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ success: true, data: { deleted: true } }),
      });

    await api.put('/events/1', { name: 'Renamed' });
    await api.delete('/events/1');

    expect(fetch).toHaveBeenNthCalledWith(
      1,
      'http://localhost:3001/events/1',
      expect.objectContaining({
        method: 'PUT',
        body: JSON.stringify({ name: 'Renamed' }),
      }),
    );
    expect(fetch).toHaveBeenNthCalledWith(
      2,
      'http://localhost:3001/events/1',
      expect.objectContaining({
        method: 'DELETE',
      }),
    );
  });

  test('throws when backend returns success=false even with 200 status', async () => {
    jest.doMock('firebase/auth', () => ({
      getAuth: () => ({ currentUser: null }),
    }));

    const { api } = await import('../../utils/api');

    (fetch as jest.Mock).mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ success: false, message: 'not allowed' }),
    });

    await expect(api.get('/business-error')).rejects.toThrow('not allowed');
  });

  test('uses emulator API base when local developer emulator toggle is enabled', async () => {
    process.env.NEXT_PUBLIC_APP_ENV = 'local';
    localStorage.setItem('traxettle.dev.firebaseEmulatorEnabled', 'true');

    jest.doMock('firebase/auth', () => ({
      getAuth: () => ({ currentUser: null }),
    }));

    const { api } = await import('../../utils/api');

    (fetch as jest.Mock).mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ success: true, data: { ok: true } }),
    });

    await api.get('/emulator-health');

    expect(fetch).toHaveBeenCalledWith(
      'http://localhost:3002/emulator-health',
      expect.objectContaining({
        method: 'GET',
      }),
    );
  });
});
