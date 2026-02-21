import request from 'supertest';
import express from 'express';

const getEntitlementMock = jest.fn();
const computeCapabilitiesMock = jest.fn();
const switchTierMock = jest.fn();
const emitToUserMock = jest.fn();

jest.mock('../../services/entitlement.service', () => ({
  EntitlementService: jest.fn().mockImplementation(() => ({
    getEntitlement: getEntitlementMock,
    computeCapabilities: computeCapabilitiesMock,
    switchTier: switchTierMock,
  })),
}));

jest.mock('../../config/websocket', () => ({
  emitToUser: (...args: any[]) => emitToUserMock(...args),
}));

jest.mock('../../config/firebase', () => ({
  auth: {
    verifyIdToken: jest.fn().mockResolvedValue({ uid: 'firebase-user', email: 'u@test.com', name: 'User' }),
  },
  db: {
    collection: jest.fn(),
  },
}));

import { internalEntitlementRoutes } from '../../routes/internal-entitlements';

function app() {
  const a = express();
  a.use(express.json());
  a.use('/api/internal/entitlements', internalEntitlementRoutes);
  return a;
}

describe('internal entitlement routes', () => {
  const oldEnv = process.env;

  beforeEach(() => {
    process.env = { ...oldEnv };
    process.env.INTERNAL_TIER_SWITCH_ENABLED = 'true';
    process.env.APP_ENV = 'local';
    getEntitlementMock.mockReset();
    computeCapabilitiesMock.mockReset();
    switchTierMock.mockReset();
    emitToUserMock.mockReset();

    getEntitlementMock.mockResolvedValue({
      tier: 'free',
      entitlementStatus: 'active',
      entitlementExpiresAt: null,
      entitlementSource: 'system',
      internalTester: false,
    });
    computeCapabilitiesMock.mockReturnValue({ multiCurrencySettlement: false });
  });

  afterAll(() => {
    process.env = oldEnv;
  });

  it('returns 403 when feature flag is disabled', async () => {
    process.env.INTERNAL_TIER_SWITCH_ENABLED = 'false';

    const res = await request(app())
      .get('/api/internal/entitlements/me')
      .set('Authorization', 'Bearer mock-user-1');

    expect(res.status).toBe(403);
    expect(res.body.success).toBe(false);
  });

  it('returns current entitlement on /me', async () => {
    const res = await request(app())
      .get('/api/internal/entitlements/me')
      .set('Authorization', 'Bearer mock-user-1');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.capabilities.multiCurrencySettlement).toBe(false);
  });

  it('validates tier on /switch', async () => {
    const res = await request(app())
      .post('/api/internal/entitlements/switch')
      .set('Authorization', 'Bearer mock-user-1')
      .send({ tier: 'gold' });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('tier must be free or pro');
  });

  it('switches tier and emits websocket event', async () => {
    switchTierMock.mockResolvedValue({
      tier: 'pro',
      entitlementStatus: 'active',
      entitlementExpiresAt: null,
      entitlementSource: 'manual_override',
      internalTester: false,
    });
    computeCapabilitiesMock.mockReturnValue({ multiCurrencySettlement: true });

    const res = await request(app())
      .post('/api/internal/entitlements/switch')
      .set('Authorization', 'Bearer mock-user-1')
      .send({ tier: 'pro' });

    expect(res.status).toBe(200);
    expect(switchTierMock).toHaveBeenCalledWith('mock-user-1', 'pro', 'manual_override');
    expect(emitToUserMock).toHaveBeenCalledWith(
      'mock-user-1',
      'user:tier-updated',
      expect.objectContaining({ tier: 'pro' }),
    );
  });

  it('blocks switching other user in staging/internal env', async () => {
    process.env.APP_ENV = 'staging';
    getEntitlementMock.mockResolvedValue({
      tier: 'free',
      entitlementStatus: 'active',
      entitlementExpiresAt: null,
      entitlementSource: 'system',
      internalTester: true,
    });

    const res = await request(app())
      .post('/api/internal/entitlements/switch')
      .set('Authorization', 'Bearer mock-user-1')
      .send({ tier: 'pro', userId: 'mock-user-2' });

    expect(res.status).toBe(403);
    expect(res.body.error).toContain('Cannot switch other users');
  });
});
