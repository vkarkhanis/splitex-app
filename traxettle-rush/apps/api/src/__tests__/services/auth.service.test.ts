const mockSessionGet = jest.fn();
const mockSessionSet = jest.fn();
const mockSessionsCollectionGet = jest.fn();
const mockBatchSet = jest.fn();
const mockBatchCommit = jest.fn();
const mockUserDocGet = jest.fn();
const mockUserDocSet = jest.fn();
const mockPhoneQueryGet = jest.fn();
const mockEmailQueryGet = jest.fn();

const mockAuth = {
  verifyIdToken: jest.fn(),
  getUser: jest.fn(),
  revokeRefreshTokens: jest.fn(),
};

const mockDb = {
  batch: jest.fn(() => ({
    set: mockBatchSet,
    commit: mockBatchCommit,
  })),
  collection: jest.fn((name: string) => {
    if (name !== 'users') {
      throw new Error(`Unexpected collection ${name}`);
    }

    return {
      doc: jest.fn((id: string) => ({
        id,
        get: mockUserDocGet,
        set: mockUserDocSet,
        collection: jest.fn((sub: string) => {
          if (sub !== 'sessions') throw new Error(`Unexpected subcollection ${sub}`);
          return {
            doc: jest.fn((sessionId: string) => ({
              get: mockSessionGet,
              set: mockSessionSet,
            })),
            get: mockSessionsCollectionGet,
          };
        }),
      })),
      where: jest.fn((field: string, _op: string, value: string) => ({
        limit: jest.fn(() => ({
          get: field === 'phoneNumber' ? mockPhoneQueryGet : mockEmailQueryGet,
        })),
      })),
    };
  }),
};

jest.mock('../../config/firebase', () => ({
  auth: mockAuth,
  db: mockDb,
}));

jest.mock('jsonwebtoken', () => ({
  sign: jest.fn((payload: any, secret: string) => `${secret}:${payload.sessionId}`),
  verify: jest.fn(),
}));

import jwt from 'jsonwebtoken';
import { AuthService } from '../../services/auth.service';

describe('AuthService', () => {
  const envBackup = { ...process.env };

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.JWT_SECRET = 'access-secret';
    process.env.JWT_REFRESH_SECRET = 'refresh-secret';
    mockUserDocGet.mockReset();
    mockUserDocSet.mockReset();
    mockPhoneQueryGet.mockReset();
    mockEmailQueryGet.mockReset();
    mockSessionGet.mockReset();
    mockSessionSet.mockReset();
    mockSessionsCollectionGet.mockReset();
    mockBatchSet.mockReset();
    mockBatchCommit.mockResolvedValue([]);
    mockAuth.verifyIdToken.mockReset();
    mockAuth.getUser.mockReset();
    mockAuth.revokeRefreshTokens.mockReset().mockResolvedValue(undefined);
  });

  afterAll(() => {
    process.env = envBackup;
  });

  it('returns a six-digit OTP for phone sign-in', async () => {
    const service = new AuthService();
    const otp = await service.signInWithPhone('+15551234567');
    expect(otp).toMatch(/^\d{6}$/);
  });

  it('verifies OTP for an existing phone user', async () => {
    mockPhoneQueryGet.mockResolvedValue({
      empty: false,
      docs: [
        {
          id: 'phone-user-1',
          data: () => ({
            userId: 'phone-user-1',
            email: 'phone@example.com',
            phoneNumber: '+15551234567',
            displayName: 'Phone User',
            authProviders: ['phone'],
            preferences: { notifications: true, currency: 'USD', timezone: 'UTC' },
            createdAt: '2026-01-01T00:00:00.000Z',
            updatedAt: '2026-01-01T00:00:00.000Z',
          }),
        },
      ],
    });

    const service = new AuthService();
    const user = await service.verifyOTP('+15551234567', '123456');

    expect(user.id).toBe('phone-user-1');
    expect(user.phoneNumber).toBe('+15551234567');
  });

  it('creates a new phone user when OTP is valid and no phone account exists', async () => {
    mockPhoneQueryGet.mockResolvedValue({ empty: true, docs: [] });

    const service = new AuthService();
    const user = await service.verifyOTP('+15550001111', '123456');

    expect(user.email).toBe('+15550001111@example.com');
    expect(user.authProviders).toEqual(['phone']);
    expect(mockUserDocSet).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: user.id,
        phoneNumber: '+15550001111',
      }),
      { merge: true },
    );
  });

  it('rejects invalid OTP values', async () => {
    const service = new AuthService();
    await expect(service.verifyOTP('+15550002222', '000000')).rejects.toThrow('OTP verification failed');
  });

  it('links Google to an existing email account instead of creating a duplicate user', async () => {
    mockAuth.verifyIdToken.mockRejectedValue(new Error('not firebase token'));

    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        sub: 'google-sub-123',
        email: 'vkarkhanis@gmail.com',
        name: 'Vaibhav',
        picture: 'https://example.com/avatar.png',
      }),
    }) as any;

    mockUserDocGet
      .mockResolvedValueOnce({ exists: false, data: () => null })
      .mockResolvedValueOnce({
        exists: true,
        data: () => ({
          userId: 'email-user-1',
          email: 'vkarkhanis@gmail.com',
          phoneNumber: '',
          displayName: 'Existing User',
          photoURL: '',
          authProviders: ['email'] as any,
          preferences: {
            notifications: true,
            currency: 'USD',
            timezone: 'UTC',
          },
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z',
        }),
      });

    mockEmailQueryGet.mockResolvedValue({
      empty: false,
      docs: [
        {
          id: 'email-user-1',
          data: () => ({
            userId: 'email-user-1',
            email: 'vkarkhanis@gmail.com',
            phoneNumber: '',
            displayName: 'Existing User',
            photoURL: '',
            authProviders: ['email'] as any,
            preferences: {
              notifications: true,
              currency: 'USD',
              timezone: 'UTC',
            },
            createdAt: '2026-01-01T00:00:00.000Z',
            updatedAt: '2026-01-01T00:00:00.000Z',
          }),
        },
      ],
    });

    const service = new AuthService();
    const user = await service.signInWithGoogle('google-token');

    expect(user.id).toBe('email-user-1');
    expect(user.authProviders).toContain('google');
    expect(mockUserDocSet).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'email-user-1',
        email: 'vkarkhanis@gmail.com',
        authProviders: ['email', 'google'],
      }),
      { merge: true },
    );
  });

  it('creates a new Google user when no existing account matches', async () => {
    mockAuth.verifyIdToken.mockRejectedValue(new Error('not firebase token'));
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        sub: 'fresh-google-user',
        email: 'fresh@example.com',
        name: 'Fresh User',
        picture: 'https://example.com/fresh.png',
      }),
    }) as any;
    mockUserDocGet.mockResolvedValue({ exists: false, data: () => null });
    mockEmailQueryGet.mockResolvedValue({ empty: true, docs: [] });

    const service = new AuthService();
    const user = await service.signInWithGoogle('google-token');

    expect(user.email).toBe('fresh@example.com');
    expect(user.authProviders).toEqual(['google']);
  });

  it('surfaces Google tokeninfo failures clearly', async () => {
    mockAuth.verifyIdToken.mockRejectedValue(new Error('not firebase token'));
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 403,
      text: async () => 'denied',
    }) as any;

    const service = new AuthService();
    await expect(service.signInWithGoogle('bad-token')).rejects.toThrow('Google sign-in failed: Google tokeninfo failed (403): denied');
  });

  it('generates and refreshes tokens for an active session', async () => {
    mockSessionSet.mockResolvedValue(undefined);
    mockUserDocGet
      .mockResolvedValueOnce({
        exists: true,
        data: () => ({
          userId: 'user-1',
          email: 'user@example.com',
          displayName: 'User One',
          authProviders: ['email'] as any,
          preferences: { notifications: true, currency: 'USD', timezone: 'UTC' },
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z',
        }),
      })
      .mockResolvedValueOnce({
        exists: true,
        data: () => ({
          userId: 'user-1',
          email: 'user@example.com',
          displayName: 'User One',
          authProviders: ['email'] as any,
          preferences: { notifications: true, currency: 'USD', timezone: 'UTC' },
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z',
        }),
      });
    mockSessionGet.mockResolvedValue({ exists: true, data: () => ({ revokedAt: null }) });
    (jwt.verify as jest.Mock).mockReturnValue({
      userId: 'user-1',
      email: 'user@example.com',
      displayName: 'User One',
      sessionId: 'session-123',
    });

    const service = new AuthService();
    const pair = await service.generateTokens({
      id: 'user-1',
      email: 'user@example.com',
      phoneNumber: '',
      displayName: 'User One',
      photoURL: '',
      authProviders: ['email'] as any,
      preferences: { notifications: true, currency: 'USD', timezone: 'UTC' },
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    });

    expect(pair.accessToken).toContain('access-secret:');
    expect(pair.refreshToken).toContain('refresh-secret:');
    expect(mockSessionSet).toHaveBeenCalled();

    const refreshed = await service.refreshTokens('refresh-token');
    expect(refreshed.accessToken).toBe('access-secret:session-123');
    expect(refreshed.refreshToken).toBe('refresh-secret:session-123');
  });

  it('rejects refresh tokens for revoked sessions', async () => {
    mockUserDocGet.mockResolvedValue({
      exists: true,
      data: () => ({
        userId: 'user-2',
        email: 'user2@example.com',
        displayName: 'User Two',
        authProviders: ['email'] as any,
        preferences: { notifications: true, currency: 'USD', timezone: 'UTC' },
      }),
    });
    mockSessionGet.mockResolvedValue({ exists: true, data: () => ({ revokedAt: '2026-01-01T00:00:00.000Z' }) });
    (jwt.verify as jest.Mock).mockReturnValue({
      userId: 'user-2',
      email: 'user2@example.com',
      displayName: 'User Two',
      sessionId: 'revoked-session',
    });

    const service = new AuthService();
    await expect(service.refreshTokens('refresh-token')).rejects.toThrow('Invalid refresh token');
  });

  it('logs out a single session or all sessions', async () => {
    mockSessionSet.mockResolvedValue(undefined);
    mockSessionsCollectionGet.mockResolvedValue({
      empty: false,
      docs: [
        { ref: { id: 'session-a' } },
        { ref: { id: 'session-b' } },
      ],
    });

    const service = new AuthService();
    await service.logout('user-3', 'session-a');
    expect(mockSessionSet).toHaveBeenCalledWith(expect.objectContaining({ revokedAt: expect.any(String) }), { merge: true });

    await service.logout('user-3');
    expect(mockBatchSet).toHaveBeenCalledTimes(2);
    expect(mockBatchCommit).toHaveBeenCalled();
    expect(mockAuth.revokeRefreshTokens).toHaveBeenCalledWith('user-3');
  });

  it('reports session activity correctly', async () => {
    const service = new AuthService();

    expect(await service.isSessionActive('user-1')).toBe(true);

    mockSessionGet.mockResolvedValueOnce({ exists: true, data: () => ({ revokedAt: null }) });
    expect(await service.isSessionActive('user-1', 'active')).toBe(true);

    mockSessionGet.mockResolvedValueOnce({ exists: false, data: () => ({}) });
    expect(await service.isSessionActive('user-1', 'missing')).toBe(false);

    mockSessionGet.mockRejectedValueOnce(new Error('read failed'));
    expect(await service.isSessionActive('user-1', 'broken')).toBe(false);
  });
});
