import request from 'supertest';
import express from 'express';

const validateWebhookSecretMock = jest.fn();
const parseEventMock = jest.fn();
const hasProcessedMock = jest.fn();
const resolveUserIdMock = jest.fn();
const mapTierMock = jest.fn();
const mapStatusMock = jest.fn();
const getExpiryMock = jest.fn();
const applyRevenueCatEntitlementMock = jest.fn();
const computeCapabilitiesMock = jest.fn();
const markProcessedMock = jest.fn();
const emitToUserMock = jest.fn();

jest.mock('../../services/billing/revenuecat.service', () => ({
  RevenueCatService: jest.fn().mockImplementation(() => ({
    validateWebhookSecret: validateWebhookSecretMock,
    parseEvent: parseEventMock,
    resolveUserId: resolveUserIdMock,
    mapTier: mapTierMock,
    mapStatus: mapStatusMock,
    getExpiry: getExpiryMock,
  })),
}));

jest.mock('../../services/billing/billing-events.service', () => ({
  BillingEventsService: jest.fn().mockImplementation(() => ({
    hasProcessed: hasProcessedMock,
    markProcessed: markProcessedMock,
  })),
}));

jest.mock('../../services/entitlement.service', () => ({
  EntitlementService: jest.fn().mockImplementation(() => ({
    applyRevenueCatEntitlement: applyRevenueCatEntitlementMock,
    computeCapabilities: computeCapabilitiesMock,
  })),
}));

jest.mock('../../config/websocket', () => ({
  emitToUser: (...args: any[]) => emitToUserMock(...args),
}));

import { billingRoutes } from '../../routes/billing';

function app() {
  const a = express();
  a.use(express.json());
  a.use('/api/billing', billingRoutes);
  return a;
}

describe('billing routes', () => {
  const originalAppEnv = process.env.APP_ENV;
  const originalNodeEnv = process.env.NODE_ENV;
  const originalWebhookSecret = process.env.REVENUECAT_WEBHOOK_SECRET;
  const originalHeaderName = process.env.REVENUECAT_WEBHOOK_HEADER_NAME;

  beforeEach(() => {
    validateWebhookSecretMock.mockReset();
    parseEventMock.mockReset();
    hasProcessedMock.mockReset();
    resolveUserIdMock.mockReset();
    mapTierMock.mockReset();
    mapStatusMock.mockReset();
    getExpiryMock.mockReset();
    applyRevenueCatEntitlementMock.mockReset();
    computeCapabilitiesMock.mockReset();
    markProcessedMock.mockReset();
    emitToUserMock.mockReset();

    validateWebhookSecretMock.mockReturnValue(true);
    parseEventMock.mockReturnValue({ id: 'evt-1', type: 'INITIAL_PURCHASE' });
    hasProcessedMock.mockResolvedValue(false);
    resolveUserIdMock.mockReturnValue('mock-user-1');
    mapTierMock.mockReturnValue('pro');
    mapStatusMock.mockReturnValue('active');
    getExpiryMock.mockReturnValue(null);
    applyRevenueCatEntitlementMock.mockResolvedValue({
      tier: 'pro',
      entitlementStatus: 'active',
      entitlementExpiresAt: null,
      entitlementSource: 'revenuecat',
      internalTester: false,
    });
    computeCapabilitiesMock.mockReturnValue({ multiCurrencySettlement: true });
    process.env.APP_ENV = 'test';
    process.env.NODE_ENV = 'test';
    process.env.REVENUECAT_WEBHOOK_SECRET = 'secret';
    delete process.env.REVENUECAT_WEBHOOK_HEADER_NAME;
  });

  afterAll(() => {
    process.env.APP_ENV = originalAppEnv;
    process.env.NODE_ENV = originalNodeEnv;
    process.env.REVENUECAT_WEBHOOK_SECRET = originalWebhookSecret;
    process.env.REVENUECAT_WEBHOOK_HEADER_NAME = originalHeaderName;
  });

  it('returns 404 for webhook debug in production', async () => {
    process.env.APP_ENV = 'production';

    const res = await request(app()).get('/api/billing/revenuecat/webhook-debug');

    expect(res.status).toBe(404);
    expect(res.body.error).toBe('Not found');
  });

  it('returns webhook debug data for non-production environments', async () => {
    validateWebhookSecretMock.mockReturnValue(true);

    const res = await request(app())
      .get('/api/billing/revenuecat/webhook-debug')
      .set('Authorization', 'Bearer secret');

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual(expect.objectContaining({
      appEnv: 'test',
      configuredSecretPresent: true,
      incomingSecretPresent: true,
      incomingMatchesConfigured: true,
    }));
    expect(res.body.data.incomingHeaders).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: 'authorization', present: true }),
      ]),
    );
  });

  it('returns 401 for invalid webhook secret', async () => {
    validateWebhookSecretMock.mockReturnValue(false);

    const res = await request(app())
      .post('/api/billing/revenuecat/webhook')
      .send({ event: { id: 'evt-1' } });

    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
    expect(res.body.data).toEqual(expect.objectContaining({
      hasSecretHeader: false,
      configuredSecretPresent: true,
    }));
  });

  it('hides invalid-secret debug details in production', async () => {
    validateWebhookSecretMock.mockReturnValue(false);
    process.env.APP_ENV = 'production';

    const res = await request(app())
      .post('/api/billing/revenuecat/webhook')
      .set('Authorization', 'Bearer secret')
      .send({ event: { id: 'evt-1' } });

    expect(res.status).toBe(401);
    expect(res.body.data).toBeUndefined();
  });

  it('reads webhook secret from a custom header name', async () => {
    process.env.REVENUECAT_WEBHOOK_HEADER_NAME = 'x-traxettle-secret';
    validateWebhookSecretMock.mockImplementation((secret?: string) => secret === 'secret');

    const res = await request(app())
      .post('/api/billing/revenuecat/webhook')
      .set('x-traxettle-secret', 'secret')
      .send({ event: { id: 'evt-1' } });

    expect(res.status).toBe(200);
    expect(validateWebhookSecretMock).toHaveBeenCalledWith('secret');
  });

  it('returns skipped when event already processed', async () => {
    hasProcessedMock.mockResolvedValue(true);

    const res = await request(app())
      .post('/api/billing/revenuecat/webhook')
      .set('X-Webhook-Secret', 'secret')
      .send({ event: { id: 'evt-1' } });

    expect(res.status).toBe(200);
    expect(res.body.data.skipped).toBe(true);
    expect(markProcessedMock).not.toHaveBeenCalled();
  });

  it('returns 400 when user id cannot be resolved', async () => {
    resolveUserIdMock.mockReturnValue(null);

    const res = await request(app())
      .post('/api/billing/revenuecat/webhook')
      .send({ event: { id: 'evt-1' } });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('Missing app_user_id');
  });

  it('processes webhook and emits tier update', async () => {
    const payload = { event: { id: 'evt-1', type: 'RENEWAL' } };

    const res = await request(app())
      .post('/api/billing/revenuecat/webhook')
      .set('X-Webhook-Secret', 'secret')
      .send(payload);

    expect(res.status).toBe(200);
    expect(res.body.data.processed).toBe(true);
    expect(applyRevenueCatEntitlementMock).toHaveBeenCalledWith(
      'mock-user-1',
      expect.objectContaining({ tier: 'pro', entitlementStatus: 'active' }),
    );
    expect(markProcessedMock).toHaveBeenCalledWith('evt-1', payload);
    expect(emitToUserMock).toHaveBeenCalledWith(
      'mock-user-1',
      'user:tier-updated',
      expect.objectContaining({ tier: 'pro' }),
    );
  });

  it('processes webhook events without an event id and skips markProcessed', async () => {
    parseEventMock.mockReturnValue({ id: '', type: 'RENEWAL' });

    const res = await request(app())
      .post('/api/billing/revenuecat/webhook')
      .set('X-Webhook-Secret', 'secret')
      .send({ event: { type: 'RENEWAL' } });

    expect(res.status).toBe(200);
    expect(markProcessedMock).not.toHaveBeenCalled();
  });

  it('returns 500 when downstream processing throws', async () => {
    validateWebhookSecretMock.mockReturnValue(true);
    parseEventMock.mockReturnValue({ id: 'evt-1', type: 'INITIAL_PURCHASE' });
    hasProcessedMock.mockResolvedValue(false);
    resolveUserIdMock.mockReturnValue('mock-user-1');
    applyRevenueCatEntitlementMock.mockRejectedValue(new Error('boom'));

    const res = await request(app())
      .post('/api/billing/revenuecat/webhook')
      .set('X-Webhook-Secret', 'secret')
      .send({ event: { id: 'evt-1' } });

    expect(res.status).toBe(500);
    expect(res.body.success).toBe(false);
  });
});
