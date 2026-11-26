/**
 * Money pooling Phase 2 — "Several of us" pools are a Pro feature (design doc §12).
 * Only the person creating (or adding) a group pool needs Pro; members join free, and existing
 * pools keep working if the creator's Pro lapses. "Just me" budgets stay free.
 */
import request from 'supertest';

jest.mock('nodemailer', () => ({
  createTransport: jest.fn().mockReturnValue({ sendMail: jest.fn().mockResolvedValue({ messageId: 'x' }) }),
  getTestMessageUrl: jest.fn().mockReturnValue(false),
}));
jest.mock('../../utils/notification-helper', () => ({
  notifyEventParticipants: jest.fn(),
  getUserDisplayName: jest.fn().mockResolvedValue('Someone'),
}));
jest.mock('../../config/firebase', () => {
  const { createMemoryFirestore } = require('../helpers/memoryFirestore');
  const store = createMemoryFirestore();
  return {
    __store: store,
    db: store.db,
    auth: { verifyIdToken: jest.fn().mockRejectedValue(new Error('no firebase')), getUser: jest.fn().mockRejectedValue(new Error('no user')) },
    storage: { bucket: () => ({ file: () => ({ save: jest.fn(), getSignedUrl: jest.fn().mockResolvedValue(['https://x']) }) }) },
    firebaseApp: { options: {} },
  };
});

import { auth, buildApp, makePro, poolApi } from '../helpers/poolHarness';
import { EntitlementService } from '../../services/entitlement.service';

const { __store: store } = require('../../config/firebase');
const app = buildApp();
const api = poolApi(app);

const ANITA = 'mock-anita';
const RAVI = 'mock-ravi';
const PRIYA = 'mock-priya';

beforeEach(() => store.reset());

const withStatus = (uid: string, entitlementStatus: string) => store.seed('users', uid, { tier: 'pro', entitlementStatus });
const createGroupPool = (uid: string, pool: Record<string, any> = { preset: 'trip_kitty', defaultContributionMinor: 100000 }, extra: Record<string, any> = {}) =>
  api.createEvent(uid, { pool, ...extra });
const convert = (eventId: string, uid: string, body: Record<string, any>) =>
  request(app).post(`/api/pools/event/${eventId}/convert`).set(auth(uid)).send(body);

const REFUSAL = {
  success: false,
  error: 'Group pools ("Several of us") require Pro',
  code: 'FEATURE_REQUIRES_PRO',
  feature: 'contributor_pools',
};

describe('creating a "Several of us" pool', () => {
  it.each([
    ['Kitty', { preset: 'trip_kitty' }],
    ['Fund', { preset: 'household' }],
    ['Treasury', { preset: 'club_treasury' }],
    ['Collection', { preset: 'target_collection', targetAmountMinor: 2000000 }],
  ])('a free user is refused a %s, and nothing is created', async (_name, pool) => {
    const res = await createGroupPool(ANITA, pool);
    expect(res.status).toBe(403);
    expect(res.body).toEqual(REFUSAL);
    expect(store.all('events')).toHaveLength(0);
    expect(store.all('poolCycles')).toHaveLength(0);
  });

  it('a free user is refused a hybrid event built on a group pool', async () => {
    const res = await createGroupPool(ANITA, { preset: 'trip_kitty' }, { fundingModel: 'hybrid' });
    expect(res.status).toBe(403);
    expect(res.body.feature).toBe('contributor_pools');
  });

  it.each([
    ['an active subscription', 'active', 201],
    ['the store\'s grace period', 'grace_period', 201],
    ['a billing retry', 'billing_retry', 403],
    ['an expired subscription', 'expired', 403],
    ['a revoked subscription', 'revoked', 403],
  ])('with %s (%s) → HTTP %i', async (_label, status, expected) => {
    withStatus(ANITA, status);
    expect((await createGroupPool(ANITA)).status).toBe(expected);
  });

  it('a free user can still create "Just me" budgets and split-expenses events', async () => {
    expect((await api.createEvent(ANITA, { pool: { preset: 'sponsor_budget', targetAmountMinor: 8000000 } })).status).toBe(201);
    expect((await api.createEvent(ANITA)).status).toBe(201);
  });

  it("can't be got round by turning a \"Just me\" budget into a group pool", async () => {
    const res = await api.createEvent(ANITA, { pool: { preset: 'sponsor_budget', targetAmountMinor: 8000000, overrides: { funderMode: 'contributors' } } });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('VALIDATION_ERROR');
  });
});

describe('adding a group pool to a split-expenses event', () => {
  it('needs Pro', async () => {
    const eventId = (await api.createEvent(ANITA)).body.data.id;
    const res = await convert(eventId, ANITA, { preset: 'trip_kitty' });
    expect(res.status).toBe(403);
    expect(res.body).toEqual(REFUSAL);
    expect(store.get('events', eventId).fundingModel).toBeUndefined();

    makePro(store, ANITA);
    expect((await convert(eventId, ANITA, { preset: 'trip_kitty' })).status).toBe(201);
  });

  it('a "Just me" budget is still refused for its own reason', async () => {
    const eventId = (await api.createEvent(ANITA)).body.data.id;
    const res = await convert(eventId, ANITA, { preset: 'sponsor_budget', targetAmountMinor: 100000 });
    expect(res.status).toBe(400);
  });
});

describe('members and lapses (§12.2)', () => {
  async function kitty() {
    makePro(store, ANITA);
    const eventId = (await createGroupPool(ANITA, { preset: 'trip_kitty', defaultContributionMinor: 100000 })).body.data.id;
    await api.join(eventId, ANITA, RAVI);
    await api.join(eventId, ANITA, PRIYA);
    return eventId;
  }

  it('free members join, pay in, spend and settle up in a Pro creator\'s pool', async () => {
    const eventId = await kitty();
    for (const uid of [ANITA, RAVI, PRIYA]) await api.payIn(eventId, ANITA, uid);
    expect((await api.spend(eventId, RAVI, 600)).status).toBe(201);
    expect((await api.dissolve(eventId, ANITA)).status).toBe(200);
    for (const uid of [ANITA, RAVI, PRIYA]) expect((await api.approveReview(eventId, uid)).status).toBe(200);
    const legs = (await api.settlements(eventId, RAVI)).filter((l: any) => !l.kind);
    for (const leg of legs) {
      expect((await api.payLeg(leg.id, leg.fromUserId)).status).toBe(200);
      expect((await api.confirmLeg(leg.id, leg.toUserId)).status).toBe(200);
    }
    expect((await api.event(eventId, ANITA)).status).toBe('settled');
  });

  it("when the creator's Pro lapses, the pool keeps working; only new group pools are refused", async () => {
    makePro(store, ANITA);
    const fund = (await createGroupPool(ANITA, { preset: 'household', defaultContributionMinor: 100000 })).body.data.id;
    await api.join(fund, ANITA, RAVI);
    for (const uid of [ANITA, RAVI]) await api.payIn(fund, ANITA, uid);
    withStatus(ANITA, 'expired');

    expect((await api.spend(fund, RAVI, 500)).status).toBe(201);
    const closed = await api.closeCycle(fund, ANITA);
    expect(closed.status).toBe(200);
    expect(closed.body.data.next).toBeTruthy(); // the next month opens with the balance carried
    expect((await api.payIn(fund, ANITA, RAVI)).status).toBe('confirmed');
    expect((await api.dissolve(fund, ANITA)).status).toBe(200);

    expect((await createGroupPool(ANITA)).status).toBe(403);
  });
});

describe('capabilities', () => {
  it('reports group pools only for active Pro (or its grace period)', () => {
    const svc = new EntitlementService();
    const caps = (tier: 'free' | 'pro', entitlementStatus: any) =>
      svc.computeCapabilities({ tier, entitlementStatus, entitlementExpiresAt: null, entitlementSource: 'system', internalTester: false });
    expect(caps('pro', 'active')).toEqual({ multiCurrencySettlement: true, contributorPools: true });
    expect(caps('pro', 'grace_period').contributorPools).toBe(true);
    expect(caps('pro', 'expired').contributorPools).toBe(false);
    expect(caps('free', 'active').contributorPools).toBe(false);
    // What a brand-new user's profile reports before they have any subscription record.
    expect(svc.computeCapabilities(svc.getDefaultEntitlement())).toEqual({ multiCurrencySettlement: false, contributorPools: false });
  });
});
