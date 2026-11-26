import request from 'supertest';
import express from 'express';

const mockGetUser = jest.fn();
const mockCreateUser = jest.fn();
const mockCreateCustomToken = jest.fn();

jest.mock('../../config/firebase', () => ({
  auth: {
    getUser: (...args: unknown[]) => mockGetUser(...args),
    createUser: (...args: unknown[]) => mockCreateUser(...args),
    createCustomToken: (...args: unknown[]) => mockCreateCustomToken(...args),
  },
  db: { collection: jest.fn() },
  storage: {},
}));
jest.mock('../../services/email.service', () => ({ EmailService: jest.fn().mockImplementation(() => ({})) }));

import { authRoutes } from '../../routes/auth';
import { AuthService } from '../../services/auth.service';
import { AppleAuthError } from '../../services/apple-auth.service';

const signInWithApple = jest.spyOn(AuthService.prototype, 'signInWithApple');
const generateTokens = jest.spyOn(AuthService.prototype, 'generateTokens');

function app() {
  const a = express();
  a.use(express.json());
  a.use('/api/auth', authRoutes);
  return a;
}

const appleUser = {
  id: 'apple-s1', email: 'ann@example.com', displayName: 'Ann Lee', photoURL: '', phoneNumber: '',
  authProviders: ['apple'], preferences: { notifications: true, currency: 'USD', timezone: 'UTC' },
  createdAt: new Date(), updatedAt: new Date(),
} as any;

describe('POST /api/auth/apple', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetUser.mockRejectedValue(Object.assign(new Error('no user'), { code: 'auth/user-not-found' }));
    mockCreateUser.mockResolvedValue({});
    mockCreateCustomToken.mockResolvedValue('firebase-custom-token');
    generateTokens.mockResolvedValue({ accessToken: 'a', refreshToken: 'r', expiresIn: 3600 } as any);
  });

  it('signs in with Apple and returns the same session data as Google sign-in', async () => {
    signInWithApple.mockResolvedValue(appleUser);

    const res = await request(app())
      .post('/api/auth/apple')
      .send({ identityToken: 'id-token', rawNonce: 'nonce', fullName: 'Ann Lee' });

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual(expect.objectContaining({ firebaseCustomToken: 'firebase-custom-token', tokens: expect.any(Object) }));
    expect(signInWithApple).toHaveBeenCalledWith({ identityToken: 'id-token', rawNonce: 'nonce', fullName: 'Ann Lee' });
    // The Firebase Authentication user is created for the app's uid, as for Google.
    expect(mockCreateUser).toHaveBeenCalledWith(expect.objectContaining({ uid: 'apple-s1', email: 'ann@example.com' }));
    expect(mockCreateCustomToken).toHaveBeenCalledWith('apple-s1');
  });

  it('requires an identity token and a nonce', async () => {
    const res = await request(app()).post('/api/auth/apple').send({ identityToken: 'id-token' });
    expect(res.status).toBe(400);
    expect(signInWithApple).not.toHaveBeenCalled();
  });

  it('returns 401 without details for a rejected token', async () => {
    signInWithApple.mockRejectedValue(new AppleAuthError('Apple identity token nonce mismatch'));
    const res = await request(app()).post('/api/auth/apple').send({ identityToken: 'bad', rawNonce: 'n' });
    expect(res.status).toBe(401);
    expect(res.body.error).toBe('Apple sign-in failed');
  });

  it("explains a 400, e.g. when Apple didn't share an email", async () => {
    signInWithApple.mockRejectedValue(new AppleAuthError("Apple didn't share an email address for this account. Please try again.", 400));
    const res = await request(app()).post('/api/auth/apple').send({ identityToken: 't', rawNonce: 'n' });
    expect(res.status).toBe(400);
    expect(res.body.error).toContain("didn't share an email");
  });
});
