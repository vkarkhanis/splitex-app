import request from 'supertest';
import express from 'express';

const assertCapabilityMock = jest.fn();

jest.mock('../../services/entitlement.service', () => ({
  EntitlementService: jest.fn().mockImplementation(() => ({
    assertCapability: assertCapabilityMock,
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

function app() {
  const a = express();
  a.use(express.json());
  a.use('/api/events', eventRoutes);
  return a;
}

describe('events pro gating', () => {
  beforeEach(() => {
    assertCapabilityMock.mockReset();
    Object.keys(mockEvents).forEach((k) => delete mockEvents[k]);
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
});
