import request from 'supertest';
import express from 'express';

const assertCapabilityMock = jest.fn();
const getEntitlementMock = jest.fn();

jest.mock('../../services/entitlement.service', () => ({
  EntitlementService: jest.fn().mockImplementation(() => ({
    assertCapability: assertCapabilityMock,
    getEntitlement: getEntitlementMock,
  })),
}));

const mockEvents: Record<string, any> = {};

jest.mock('../../config/firebase', () => ({
  auth: {
    verifyIdToken: jest.fn().mockResolvedValue({ uid: 'firebase-user-1', email: 'u@test.com', name: 'U' }),
  },
  db: {
    collection: jest.fn().mockImplementation((collectionPath: string) => ({
      doc: jest.fn().mockImplementation((id: string) => ({
        get: jest.fn().mockResolvedValue({ exists: Boolean(mockEvents[id]), data: () => mockEvents[id], id }),
        set: jest.fn().mockResolvedValue({}),
        delete: jest.fn().mockResolvedValue({}),
        collection: jest.fn().mockReturnValue({
          doc: jest.fn().mockReturnValue({ set: jest.fn().mockResolvedValue({}) }),
          get: jest.fn().mockResolvedValue({ docs: [], empty: true }),
        }),
      })),
      add: jest.fn().mockImplementation(async (data: any) => {
        const id = `evt-${Object.keys(mockEvents).length + 1}`;
        mockEvents[id] = data;
        return { id };
      }),
      where: jest.fn().mockReturnValue({
        get: jest.fn().mockResolvedValue({ docs: [], empty: true }),
      }),
    })),
  },
}));

import { eventRoutes } from '../../routes/events';
import { EventService } from '../../services/event.service';

function app() {
  const a = express();
  a.use(express.json());
  a.use('/api/events', eventRoutes);
  return a;
}

describe('events pro gating', () => {
  beforeEach(() => {
    assertCapabilityMock.mockReset();
    getEntitlementMock.mockReset();
    getEntitlementMock.mockResolvedValue({ tier: 'free', entitlementStatus: 'active' });
    Object.keys(mockEvents).forEach((k) => delete mockEvents[k]);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('blocks FX event creation when capability assertion fails', async () => {
    assertCapabilityMock.mockRejectedValue(new Error('This feature requires Pro'));

    const res = await request(app())
      .post('/api/events')
      .set('Authorization', 'Bearer real-firebase-token')
      .send({
        name: 'FX event',
        type: 'event',
        startDate: '2026-01-01',
        currency: 'USD',
        settlementCurrency: 'INR',
        fxRateMode: 'predefined',
        predefinedFxRates: { USD_INR: 82.5 },
      });

    expect(res.status).toBe(403);
    expect(res.body.code).toBe('FEATURE_REQUIRES_PRO');
    expect(res.body.feature).toBe('multi_currency_settlement');
  });

  it('allows FX event creation when capability assertion passes', async () => {
    assertCapabilityMock.mockResolvedValue(undefined);

    const res = await request(app())
      .post('/api/events')
      .set('Authorization', 'Bearer real-firebase-token')
      .send({
        name: 'FX event pro',
        type: 'event',
        startDate: '2026-01-01',
        currency: 'USD',
        settlementCurrency: 'INR',
        fxRateMode: 'predefined',
        predefinedFxRates: { USD_INR: 82.5 },
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
  });

  describe('editing a multi-currency event', () => {
    const fxEvent = {
      id: 'evt-fx', name: 'Tokyo trip', type: 'event', status: 'active', currency: 'USD',
      settlementCurrency: 'INR', fxRateMode: 'predefined', predefinedFxRates: { USD_INR: 83 },
      createdBy: 'firebase-user-1', admins: ['firebase-user-1'],
    };
    let update: jest.SpyInstance;

    beforeEach(() => {
      // A free admin (or a creator whose Pro lapsed): the capability check fails.
      assertCapabilityMock.mockRejectedValue(new Error('requires Pro'));
      jest.spyOn(EventService.prototype, 'getEvent').mockResolvedValue({ ...fxEvent } as any);
      update = jest.spyOn(EventService.prototype, 'updateEvent').mockImplementation(async (_id, _uid, dto) => ({ ...fxEvent, ...dto }) as any);
    });

    it('lets them rename it: the edit form resends the unchanged FX settings', async () => {
      const res = await request(app())
        .put('/api/events/evt-fx')
        .set('Authorization', 'Bearer real-firebase-token')
        .send({ name: 'Tokyo, final', description: '', type: 'event', currency: 'USD', settlementCurrency: 'INR', status: 'active' });

      expect(res.status).toBe(200);
      expect(update).toHaveBeenCalled();
      expect(assertCapabilityMock).not.toHaveBeenCalled();
    });

    it('still needs Pro to change the settlement currency or the rate', async () => {
      const newCurrency = await request(app())
        .put('/api/events/evt-fx')
        .set('Authorization', 'Bearer real-firebase-token')
        .send({ name: 'Tokyo trip', currency: 'USD', settlementCurrency: 'EUR' });
      expect(newCurrency.status).toBe(403);
      expect(newCurrency.body.code).toBe('FEATURE_REQUIRES_PRO');

      const newRate = await request(app())
        .put('/api/events/evt-fx')
        .set('Authorization', 'Bearer real-firebase-token')
        .send({ predefinedFxRates: { USD_INR: 84 } });
      expect(newRate.status).toBe(403);
      expect(update).not.toHaveBeenCalled();
    });
  });

  describe('free-tier event limit', () => {
    const createPlainEvent = () =>
      request(app())
        .post('/api/events')
        .set('Authorization', 'Bearer real-firebase-token')
        .send({ name: 'Fourth event', type: 'event', startDate: '2026-01-01', currency: 'USD' });

    beforeEach(() => {
      jest.spyOn(EventService.prototype, 'getUserEvents').mockResolvedValue(
        ['e1', 'e2', 'e3'].map((id) => ({ id, status: 'active' }) as any),
      );
    });

    it('blocks a 4th event for a lapsed subscriber whose tier still reads pro', async () => {
      getEntitlementMock.mockResolvedValue({ tier: 'pro', entitlementStatus: 'expired' });

      const res = await createPlainEvent();

      expect(res.status).toBe(403);
      expect(res.body.error).toMatch(/at most 3/);
    });

    it('allows a 4th event for a paid-up Pro subscriber', async () => {
      getEntitlementMock.mockResolvedValue({ tier: 'pro', entitlementStatus: 'active' });

      const res = await createPlainEvent();

      expect(res.status).toBe(201);
    });

    it('allows a 4th event during the store grace period', async () => {
      getEntitlementMock.mockResolvedValue({ tier: 'pro', entitlementStatus: 'grace_period' });

      const res = await createPlainEvent();

      expect(res.status).toBe(201);
    });
  });
});
