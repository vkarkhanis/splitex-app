/**
 * Money pooling Phase 3 (traxettle-app/docs/utility/MONEY_POOLING_PHASE3_PROPOSAL.md):
 * A. a spender list in "Several of us" pools, B. the approver permission,
 * C. pool spends entered in another currency, D. split expenses in another currency.
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
    storage: { bucket: () => ({ file: () => ({ save: jest.fn(), getSignedUrl: jest.fn().mockResolvedValue(['https://storage.example/x']) }) }) },
    firebaseApp: { options: {} },
  };
});

import { auth, buildApp, makePro, poolApi } from '../helpers/poolHarness';

const { __store: store } = require('../../config/firebase');
const app = buildApp();
const api = poolApi(app);

const ANITA = 'mock-anita'; // creator and custodian (Pro)
const RAVI = 'mock-ravi';
const PRIYA = 'mock-priya';
const RECEIPT = { attachments: ['https://r/1.jpg'] };
const today = () => new Date().toISOString().split('T')[0];

// No test may reach the real rates service: rates come from the seeded daily cache.
const fetchSpy = jest.spyOn(global, 'fetch').mockRejectedValue(new Error('offline in tests'));

beforeEach(() => {
  store.reset();
  makePro(store, ANITA);
  fetchSpy.mockClear();
});
afterAll(() => fetchSpy.mockRestore());

const config = (eventId: string, uid: string, patch: Record<string, any>) =>
  request(app).put(`/api/pools/event/${eventId}/config`).set(auth(uid)).send(patch);
const record = (eventId: string, uid: string, body: Record<string, any>) =>
  request(app).post(`/api/pools/event/${eventId}/advances`).set(auth(uid)).send(body);
const decide = (id: string, uid: string, action: 'confirm' | 'reject' | 'cancel') =>
  request(app).post(`/api/pools/advances/${id}/${action}`).set(auth(uid)).send({});

/** "Goa trip" kitty: ₹2,000 each from Anita, Ravi and Priya, so ₹6,000 in. */
async function kitty(overrides: Record<string, any> = {}, extra: Record<string, any> = {}) {
  const eventId = await api.createPool(ANITA, { preset: 'trip_kitty', defaultContributionMinor: 200000, overrides }, extra);
  await api.join(eventId, ANITA, RAVI);
  await api.join(eventId, ANITA, PRIYA);
  for (const uid of [ANITA, RAVI, PRIYA]) await api.payIn(eventId, ANITA, uid);
  return eventId;
}

/** Only Ravi (and Anita, the custodian) may spend. */
async function listedKitty(overrides: Record<string, any> = {}) {
  const eventId = await kitty({ spendersMode: 'listed', ...overrides });
  expect((await config(eventId, ANITA, { authorizedSpenders: [RAVI] })).status).toBe(200);
  return eventId;
}

// ── A. Spender list ───────────────────────────────────────────────────────

describe('A. a spender list in a "Several of us" pool', () => {
  it('lets listed people spend; others can only claim, and their claims always wait for approval', async () => {
    const eventId = await listedKitty();
    expect((await api.spend(eventId, RAVI, 500, { paidFrom: 'sponsor_card', alreadyIncurred: true })).body.data.poolDraw.status).toBe('approved');

    const refused = await api.spend(eventId, PRIYA, 500, { paidFrom: 'sponsor_card', alreadyIncurred: true });
    expect(refused.status).toBe(403);
    expect(refused.body).toMatchObject({
      code: 'POOL_NOT_A_SPENDER',
      error: 'Only the people the organiser chose can spend from the kitty. You can still claim back money you spent.',
    });

    // The kitty asks for no approval, yet Priya's claim waits for it.
    const claim = await api.claim(eventId, PRIYA, 300, { title: 'Snacks' });
    expect(claim.status).toBe(201);
    expect(claim.body.data.poolDraw.status).toBe('pending');
    // Editing its amount keeps it waiting.
    const edited = await request(app).put(`/api/expenses/${claim.body.data.id}`).set(auth(PRIYA)).send({ amount: 350 });
    expect(edited.body.data.poolDraw.status).toBe('pending');
    expect((await api.approveDraw(claim.body.data.id, ANITA)).status).toBe(200);
  });

  it('is off by default: everyone in the event can spend, as before', async () => {
    const eventId = await kitty();
    expect((await api.spend(eventId, PRIYA, 500, { paidFrom: 'sponsor_card', alreadyIncurred: true })).status).toBe(201);
  });

  it('lists a whole group, and applies per-person limits', async () => {
    const eventId = await kitty({ spendersMode: 'listed' });
    store.seed('groups', 'g-fam', { eventId, eventIds: [eventId], name: 'Family', members: [PRIYA], representative: PRIYA, payerUserId: PRIYA, createdBy: ANITA });
    expect((await config(eventId, ANITA, { authorizedSpenderGroups: ['g-fam'], spenderCapsMinor: { 'g-fam': 50000 } })).status).toBe(200);
    expect((await api.spend(eventId, PRIYA, 400, { paidFrom: 'sponsor_card' })).status).toBe(201);
    expect((await api.spend(eventId, PRIYA, 200, { paidFrom: 'sponsor_card' })).body.code).toBe('POOL_SPENDER_CAP');
  });

  it('hands money only to listed spenders, and keeps a holder on the list until it is returned', async () => {
    const eventId = await listedKitty();
    expect((await record(eventId, ANITA, { kind: 'advance', userId: PRIYA, amountMinor: 10000 })).body.code).toBe('POOL_RECIPIENT_INVALID');
    const advance = (await record(eventId, ANITA, { kind: 'advance', userId: RAVI, amountMinor: 100000 })).body.data;

    // Waiting for Ravi to confirm: he can't be taken off yet.
    expect((await config(eventId, ANITA, { authorizedSpenders: [] })).body.code).toBe('POOL_HOLDER_DELISTED');
    await decide(advance.id, RAVI, 'confirm');
    const held = await config(eventId, ANITA, { authorizedSpenders: [] });
    expect(held.status).toBe(409);
    expect(held.body).toMatchObject({ code: 'POOL_HOLDER_DELISTED', error: "Someone you're taking off the spender list still holds ₹1,000.00 of pool money. It needs to be returned first." });

    await record(eventId, ANITA, { kind: 'return', userId: RAVI, amountMinor: 100000 });
    expect((await config(eventId, ANITA, { authorizedSpenders: [] })).status).toBe(200);
  });

  it('chosen at creation from the funding choice', async () => {
    const eventId = await kitty({ spendersMode: 'listed' });
    expect((await api.event(eventId, ANITA)).poolConfig).toMatchObject({ spendersMode: 'listed' });
  });
});

// ── B. Approvers ──────────────────────────────────────────────────────────

describe('B. the approver permission', () => {
  async function approvalKitty() {
    const eventId = await kitty({ expenseApproval: 'always' });
    expect((await config(eventId, ANITA, { approverUserIds: [RAVI] })).status).toBe(200);
    return eventId;
  }

  it("approves and rejects other people's spends, but never their own", async () => {
    const eventId = await approvalKitty();
    const priyas = (await api.spend(eventId, PRIYA, 500, { paidFrom: 'sponsor_card' })).body.data;
    expect(priyas.poolDraw.status).toBe('pending');
    expect((await api.approveDraw(priyas.id, RAVI)).status).toBe(200);
    const another = (await api.spend(eventId, PRIYA, 200, { paidFrom: 'sponsor_card' })).body.data;
    expect((await api.rejectDraw(another.id, RAVI)).status).toBe(200);

    // Ravi's own spend waits for someone else.
    const ravis = (await api.spend(eventId, RAVI, 300, { paidFrom: 'sponsor_card' })).body.data;
    expect(ravis.poolDraw.status).toBe('pending');
    expect((await api.approveDraw(ravis.id, RAVI)).body.code).toBe('POOL_SELF_APPROVAL');
    expect((await api.approveDraw(ravis.id, ANITA)).status).toBe(200);
  });

  it("can't settle up, close a month, change settings or amounts, or confirm money", async () => {
    const eventId = await approvalKitty();
    expect((await api.dissolve(eventId, RAVI)).status).toBe(403);
    expect((await api.closeCycle(eventId, RAVI)).status).toBe(403);
    expect((await config(eventId, RAVI, { expenseApproval: 'none' })).status).toBe(403);
    expect((await api.setContributions(eventId, RAVI, [{ entityId: PRIYA, entityType: 'user', expectedMinor: 1 }])).status).toBe(403);
    const topUp = (await api.topUp(eventId, PRIYA, { amountMinor: 50000 })).body.data;
    await api.markPaid(topUp.id, PRIYA);
    expect((await api.confirm(topUp.id, RAVI)).status).toBe(403);
  });

  it('must be in the event, and is dropped on leaving', async () => {
    const eventId = await kitty();
    expect((await config(eventId, ANITA, { approverUserIds: ['mock-stranger'] })).body.code).toBe('POOL_APPROVER_INVALID');
    expect((await config(eventId, ANITA, { approverUserIds: [PRIYA], spendersMode: 'listed', authorizedSpenders: [PRIYA] })).status).toBe(200);
    expect((await api.leave(eventId, PRIYA, PRIYA)).status).toBe(200);
    expect((await api.event(eventId, ANITA)).poolConfig).toMatchObject({ approverUserIds: [], authorizedSpenders: [] });
  });
});

// ── C. Pool spends in another currency ────────────────────────────────────

describe('C. a pool spend entered in another currency', () => {
  const rate = (from: string, rates: Record<string, number>) => store.seed('fx_rates_cache', `${from}_${today()}`, { base: from, rates, date: today() });

  it('is converted to the pool currency at today\'s rate, keeping what was entered', async () => {
    const eventId = await kitty();
    rate('USD', { INR: 83.5 });
    const res = await api.spend(eventId, RAVI, 10, { currency: 'USD', paidFrom: 'sponsor_card', alreadyIncurred: true });
    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({
      amount: 835, currency: 'INR', originalAmount: 10, originalCurrency: 'USD', fxRate: 83.5, fxRateDate: today(), fxRateSource: 'eod',
    });
    expect((await api.summary(eventId, ANITA)).totals.balanceMinor).toBe(600000 - 83500);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("uses the event's predefined rate before today's", async () => {
    const eventId = await kitty();
    rate('USD', { INR: 83.5 });
    store.seed('events', eventId, { ...store.get('events', eventId), fxRateMode: 'predefined', predefinedFxRates: { USD_INR: 80 } });
    const res = await api.spend(eventId, RAVI, 10, { currency: 'USD', paidFrom: 'sponsor_card', alreadyIncurred: true });
    expect(res.body.data).toMatchObject({ amount: 800, fxRate: 80, fxRateSource: 'predefined' });
  });

  it('applies the approval threshold to the converted amount', async () => {
    const eventId = await kitty({ expenseApproval: 'above_threshold', approvalThresholdMinor: 100000 });
    rate('USD', { INR: 83.5 });
    expect((await api.spend(eventId, RAVI, 10, { currency: 'USD', paidFrom: 'sponsor_card' })).body.data.poolDraw.status).toBe('approved'); // ₹835
    expect((await api.spend(eventId, RAVI, 20, { currency: 'USD', paidFrom: 'sponsor_card' })).body.data.poolDraw.status).toBe('pending'); // ₹1,670
  });

  it('keeps the rate when the amount is edited, gets a new one for a new currency, and clears it back in the pool currency', async () => {
    const eventId = await kitty();
    rate('USD', { INR: 83.5 });
    const spend = (await api.spend(eventId, RAVI, 10, { currency: 'USD', paidFrom: 'sponsor_card', alreadyIncurred: true })).body.data;
    rate('USD', { INR: 90 }); // the day's rate moved: an amount edit still uses 83.5
    const put = (body: Record<string, any>) => request(app).put(`/api/expenses/${spend.id}`).set(auth(RAVI)).send(body);

    expect((await put({ title: 'Visa fee' })).body.data).toMatchObject({ title: 'Visa fee', amount: 835, originalAmount: 10 });
    expect((await put({ amount: 20, currency: 'USD' })).body.data).toMatchObject({ amount: 1670, originalAmount: 20, fxRate: 83.5 });
    rate('EUR', { INR: 90.25 });
    expect((await put({ amount: 10, currency: 'EUR' })).body.data).toMatchObject({ amount: 902.5, originalCurrency: 'EUR', fxRate: 90.25 });
    const back = (await put({ amount: 500, currency: 'INR' })).body.data;
    expect(back).toMatchObject({ amount: 500, currency: 'INR' });
    expect(back.originalCurrency).toBeUndefined();
  });

  it("lets an amount be edited at the saved rate after the organiser's Pro ends, but not a new currency", async () => {
    const eventId = await kitty();
    rate('USD', { INR: 80 });
    const spend = (await api.spend(eventId, RAVI, 10, { currency: 'USD', paidFrom: 'sponsor_card', alreadyIncurred: true })).body.data;
    store.seed('users', ANITA, { tier: 'free', entitlementStatus: 'expired', entitlementSource: 'manual_override' });
    const put = (body: Record<string, any>) => request(app).put(`/api/expenses/${spend.id}`).set(auth(RAVI)).send(body);

    const same = await put({ amount: 15, currency: 'USD' });
    expect(same.status).toBe(200);
    expect(same.body.data).toMatchObject({ amount: 1200, originalAmount: 15, originalCurrency: 'USD', fxRate: 80 });

    rate('EUR', { INR: 90 });
    const euro = await put({ amount: 10, currency: 'EUR' });
    expect(euro.status).toBe(403);
    expect(euro.body.code).toBe('OTHER_CURRENCY_NOT_ALLOWED');

    const back = await put({ amount: 900, currency: 'INR' });
    expect(back.status).toBe(200);
    expect(back.body.data).toMatchObject({ amount: 900, currency: 'INR' });
    expect(back.body.data.originalCurrency).toBeUndefined();
  });

  it("needs the organiser's Pro, and says so clearly when no rate can be had", async () => {
    const eventId = await kitty();
    const noRate = await api.spend(eventId, RAVI, 10, { currency: 'CHF', paidFrom: 'sponsor_card', alreadyIncurred: true });
    expect(noRate.status).toBe(503);
    expect(noRate.body).toMatchObject({ code: 'FX_RATE_UNAVAILABLE', error: "Couldn't get today's CHF→INR rate. Enter the amount in INR, or try again later." });
    expect((await api.spend(eventId, RAVI, 10, { currency: 'nope', paidFrom: 'sponsor_card' })).body.code).toBe('CURRENCY_INVALID');
  });
});

// ── D. Split expenses in another currency ─────────────────────────────────

describe('D. a split expense entered in another currency', () => {
  it('is converted with its splits before balances are worked out', async () => {
    const eventId = await kitty({}, {});
    // A hybrid kitty takes ordinary split expenses too.
    store.seed('events', eventId, { ...store.get('events', eventId), fundingModel: 'hybrid' });
    store.seed('fx_rates_cache', `USD_${today()}`, { base: 'USD', rates: { INR: 83.5 }, date: today() });
    const res = await request(app).post('/api/expenses').set(auth(RAVI)).send({
      eventId, title: 'Dinner', amount: 10, currency: 'USD', splitType: 'custom',
      splits: [
        { entityType: 'user', entityId: ANITA, amount: 3.33 },
        { entityType: 'user', entityId: RAVI, amount: 3.33 },
        { entityType: 'user', entityId: PRIYA, amount: 3.34 },
      ],
    });
    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({ amount: 835, currency: 'INR', originalAmount: 10, originalCurrency: 'USD' });
    const splits = res.body.data.splits.map((s: any) => s.amount);
    expect(splits.reduce((a: number, b: number) => a + b, 0)).toBeCloseTo(835, 2);
    expect(splits).toEqual([278.06, 278.06, 278.88]);

    const balances = (await request(app).get(`/api/settlements/event/${eventId}/balances`).set(auth(ANITA))).body.data;
    expect(balances.find((b: any) => b.entityId === RAVI).amount).toBeCloseTo(835 - 278.06, 2);
  });
});

// ── The event flag and the preview ────────────────────────────────────────

describe('telling the apps whether another currency is allowed', () => {
  it('flags the event by its creator\'s Pro, and previews a conversion', async () => {
    const eventId = await kitty();
    expect((await api.event(eventId, RAVI)).otherCurrencyExpenses).toBe(true);
    store.seed('fx_rates_cache', `USD_${today()}`, { base: 'USD', rates: { INR: 83.5 }, date: today() });
    const preview = await request(app).get(`/api/events/${eventId}/fx-preview?from=usd&amount=12`).set(auth(RAVI));
    expect(preview.body.data).toEqual({ from: 'USD', to: 'INR', rate: 83.5, date: today(), source: 'eod', amount: 1002 });

    store.seed('users', ANITA, { tier: 'free' });
    expect((await api.event(eventId, RAVI)).otherCurrencyExpenses).toBe(false);
    expect((await request(app).get(`/api/events/${eventId}/fx-preview?from=USD&amount=12`).set(auth(RAVI))).body.code).toBe('OTHER_CURRENCY_NOT_ALLOWED');
  });
});
