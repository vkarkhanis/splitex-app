import { Request, Response, NextFunction } from 'express';
import { requireAuth, AuthenticatedRequest } from '../../middleware/auth';

// Mock firebase config
jest.mock('../../config/firebase', () => ({
  auth: {
    verifyIdToken: jest.fn()
  }
}));

import { auth } from '../../config/firebase';

const mockAuth = auth as jest.Mocked<typeof auth>;

function createMockReq(headers: Record<string, string> = {}): AuthenticatedRequest {
  return {
    headers,
    user: undefined
  } as unknown as AuthenticatedRequest;
}

function createMockRes() {
  const res: Partial<Response> = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res as Response;
}

describe('requireAuth middleware', () => {
  let next: NextFunction;

  beforeEach(() => {
    next = jest.fn();
    jest.clearAllMocks();
  });

  it('should return 401 if no Authorization header is present', async () => {
    const req = createMockReq();
    const res = createMockRes();

    await requireAuth(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ success: false, error: 'Unauthorized', code: 'AUTH_MISSING' });
    expect(next).not.toHaveBeenCalled();
  });

  it('should return 401 if Authorization header does not start with Bearer', async () => {
    const req = createMockReq({ authorization: 'Basic abc123' });
    const res = createMockRes();

    await requireAuth(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it('should return 401 if Bearer token is empty', async () => {
    const req = createMockReq({ authorization: 'Bearer ' });
    const res = createMockRes();

    await requireAuth(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it('should authenticate mock tokens (starting with "mock-")', async () => {
    const req = createMockReq({ authorization: 'Bearer mock-user-123' });
    const res = createMockRes();

    await requireAuth(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(req.user).toBeDefined();
    expect(req.user!.uid).toBe('mock-user-123');
    expect(req.user!.email).toBe('mock@example.com');
    expect(req.user!.name).toBe('Mock User');
  });

  it('should verify real Firebase tokens via auth.verifyIdToken', async () => {
    (mockAuth.verifyIdToken as jest.Mock).mockResolvedValue({
      uid: 'firebase-uid-abc',
      email: 'user@example.com',
      name: 'Real User'
    });

    const req = createMockReq({ authorization: 'Bearer real-firebase-token-xyz' });
    const res = createMockRes();

    await requireAuth(req, res, next);

    expect(mockAuth.verifyIdToken).toHaveBeenCalledWith('real-firebase-token-xyz');
    expect(next).toHaveBeenCalled();
    expect(req.user).toEqual({
      uid: 'firebase-uid-abc',
      email: 'user@example.com',
      name: 'Real User'
    });
  });

  it('should return 401 if Firebase token verification fails', async () => {
    (mockAuth.verifyIdToken as jest.Mock).mockRejectedValue(new Error('Token expired'));

    const req = createMockReq({ authorization: 'Bearer expired-token' });
    const res = createMockRes();

    await requireAuth(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ success: false, error: 'Unauthorized', code: 'AUTH_INVALID' });
    expect(next).not.toHaveBeenCalled();
  });

  it('should handle case-insensitive Bearer prefix', async () => {
    const req = createMockReq({ authorization: 'bearer mock-user-456' });
    const res = createMockRes();

    await requireAuth(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(req.user!.uid).toBe('mock-user-456');
  });
});

describe('mock token environment guard', () => {
  const saved = { NODE_ENV: process.env.NODE_ENV, APP_ENV: process.env.APP_ENV, ALLOW_MOCK_AUTH: process.env.ALLOW_MOCK_AUTH };
  let next: NextFunction;

  const setEnv = (env: Partial<Record<keyof typeof saved, string | undefined>>) => {
    for (const key of Object.keys(saved) as Array<keyof typeof saved>) {
      const value = key in env ? env[key] : undefined;
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  };

  beforeEach(() => {
    next = jest.fn();
    jest.clearAllMocks();
    (mockAuth.verifyIdToken as jest.Mock).mockRejectedValue(new Error('not a firebase token'));
  });

  afterAll(() => setEnv(saved));

  it.each([
    ['production', { NODE_ENV: 'production' }],
    ['staging', { NODE_ENV: 'staging' }],
    ['an unset environment', {}],
  ])('refuses mock tokens in %s', async (_label, env) => {
    setEnv(env);
    const req = createMockReq({ authorization: 'Bearer mock-attacker' });
    const res = createMockRes();

    await requireAuth(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ success: false, error: 'Unauthorized', code: 'AUTH_INVALID' });
    expect(next).not.toHaveBeenCalled();
    expect(req.user).toBeUndefined();
  });

  it.each([
    ['tests', { NODE_ENV: 'test' }],
    ['local development', { NODE_ENV: 'production', APP_ENV: 'local' }],
    ['NODE_ENV=development', { NODE_ENV: 'development' }],
    ['an explicit opt-in', { NODE_ENV: 'staging', ALLOW_MOCK_AUTH: 'true' }],
  ])('accepts mock tokens in %s', async (_label, env) => {
    setEnv(env);
    const req = createMockReq({ authorization: 'Bearer mock-dev-user' });
    const res = createMockRes();

    await requireAuth(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(req.user!.uid).toBe('mock-dev-user');
  });
});
