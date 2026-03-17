const mockGet = jest.fn();
const mockSet = jest.fn();
const mockWhere = jest.fn();

jest.mock('../../config/firebase', () => ({
  auth: {
    verifyIdToken: jest.fn(),
    getUser: jest.fn(),
  },
  db: {
    collection: jest.fn(() => ({
      doc: jest.fn(() => ({
        get: mockGet,
        set: mockSet,
      })),
      where: mockWhere,
    })),
  },
}));

import { auth, db } from '../../config/firebase';
import { AuthService } from '../../services/auth.service';

describe('AuthService.signInWithGoogle', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGet.mockReset();
    mockSet.mockReset();
    mockWhere.mockReset();
  });

  it('links Google to an existing email account instead of creating a duplicate user', async () => {
    (auth.verifyIdToken as jest.Mock).mockRejectedValue(new Error('not firebase token'));

    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        sub: 'google-sub-123',
        email: 'vkarkhanis@gmail.com',
        name: 'Vaibhav',
        picture: 'https://example.com/avatar.png',
      }),
    }) as any;

    mockGet
      .mockResolvedValueOnce({ exists: false, data: () => null })
      .mockResolvedValueOnce({
        exists: true,
        data: () => ({
          userId: 'email-user-1',
          email: 'vkarkhanis@gmail.com',
          phoneNumber: '',
          displayName: 'Existing User',
          photoURL: '',
          authProviders: ['email'],
          preferences: {
            notifications: true,
            currency: 'USD',
            timezone: 'UTC',
          },
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z',
        }),
      })
      .mockResolvedValueOnce({
        exists: true,
        data: () => ({
          userId: 'email-user-1',
          email: 'vkarkhanis@gmail.com',
          phoneNumber: '',
          displayName: 'Existing User',
          photoURL: '',
          authProviders: ['email'],
          preferences: {
            notifications: true,
            currency: 'USD',
            timezone: 'UTC',
          },
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z',
        }),
      });

    mockWhere.mockReturnValue({
      limit: jest.fn(() => ({
        get: jest.fn().mockResolvedValue({
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
                authProviders: ['email'],
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
        }),
      })),
    });

    const service = new AuthService();
    const user = await service.signInWithGoogle('google-token');

    expect(user.id).toBe('email-user-1');
    expect(user.authProviders).toContain('google');
    expect(mockSet).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'email-user-1',
        email: 'vkarkhanis@gmail.com',
        authProviders: ['email', 'google'],
      }),
      { merge: true },
    );
  });
});
