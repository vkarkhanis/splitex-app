/**
 * Money pooling — end-to-end flows through the real routers.
 * Covers creation, contributions, pool draws, the graduated overdraft,
 * reimbursements, approvals, dissolution and access control.
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
    storage: {
      bucket: () => ({
        file: (path: string) => ({
          save: jest.fn().mockResolvedValue(undefined),
          getSignedUrl: jest.fn().mockResolvedValue([`https://storage.example/${path}`]),
        }),
      }),
    },
    firebaseApp: { options: {} },
  };
});

import { auth, buildApp, poolApi } from '../helpers/poolHarness';

const { __store: store } = require('../../config/firebase');
const app = buildApp();
const api = poolApi(app);

const ALICE = 'mock-alice'; // creator, admin, custodian
const BOB = 'mock-bob';
const CAROL = 'mock-carol';
const DEV = 'mock-dev';
const OUTSIDER = 'mock-outsider';

beforeEach(() => store.reset());

async function kitty(members: string[], defaultContributionMinor = 1000000, extra: Record<string, any> = {}) {
  const eventId = await api.createPool(ALICE, { preset: 'trip_kitty', defaultContributionMinor, ...extra });
  for (const m of members) await api.join(eventId, ALICE, m);
  return eventId;
}

// ── Creation & backward compatibility ─────────────────────────────────────

describe('creating events', () => {
  it('leaves split-expenses events exactly as before: no funding fields', async () => {
    const res = await api.createEvent(ALICE);
    expect(res.status).toBe(201);
    const stored = store.get('events', res.body.data.id);
    expect(stored.fundingModel).toBeUndefined();
    expect(stored.poolConfig).toBeUndefined();
    expect(store.all('poolCycles')).toHaveLength(0);
  });

  it('creates a trip kitty with an open first cycle and a pending contribution', async () => {
    const eventId = await api.createPool(ALICE, { preset: 'trip_kitty', defaultContributionMinor: 1000000 });
    const event = store.get('events', eventId);
    expect(event.fundingModel).toBe('pool');
    expect(event.poolConfig).toMatchObject({ preset: 'trip_kitty', custodianUserId: ALICE, overdraftPolicy: 'graduated', overdraftTolerancePercent: 20 });
    const summary = await api.summary(eventId, ALICE);
    expect(summary.cycle).toMatchObject({ sequence: 1, status: 'open', currency: 'INR' });
    expect(summary.totals.expectedRegularMinor).toBe(1000000);
    expect(summary.totals.balanceMinor).toBe(0);
    expect(summary.overdraft.zone).toBe('blocked'); // nothing confirmed yet ⇒ hard stop
  });

  it('marks an event hybrid when peer expenses are allowed', async () => {
    const res = await api.createEvent(ALICE, { fundingModel: 'hybrid', pool: { preset: 'trip_kitty' } });
    expect(res.status).toBe(201);
    expect(store.get('events', res.body.data.id).fundingModel).toBe('hybrid');
  });

  it('rejects an unknown preset', async () => {
    const res = await api.createEvent(ALICE, { pool: { preset: 'casino' } });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('VALIDATION_ERROR');
  });

  it('rejects an unknown funding model', async () => {
    const res = await api.createEvent(ALICE, { fundingModel: 'crypto', pool: { preset: 'trip_kitty' } });
    expect(res.status).toBe(400);
  });

  it('requires a budget for a sponsor pool', async () => {
    const res = await api.createEvent(ALICE, { pool: { preset: 'sponsor_budget' } });
    expect(res.status).toBe(400);
    expect(res.body.error).toContain('budget');
  });

  it('opens a sponsor budget fully funded by the sponsor', async () => {
    const eventId = await api.createPool(ALICE, { preset: 'sponsor_budget', targetAmountMinor: 80000000 });
    const summary = await api.summary(eventId, ALICE);
    expect(summary.totals.balanceMinor).toBe(80000000);
    expect(summary.funding).toMatchObject({ targetMinor: 80000000, state: 'funded' });
    expect(summary.overdraft.zone).toBe('healthy');
  });
});

// ── Contributions ─────────────────────────────────────────────────────────

describe('contributions', () => {
  it('gives each joiner the default contribution', async () => {
    const eventId = await kitty([BOB, CAROL]);
    const ledger = await api.ledger(eventId, ALICE);
    expect(ledger.contributions.map((c: any) => c.fromUserId).sort()).toEqual([ALICE, BOB, CAROL].sort());
    expect(ledger.summary.cycle.roster).toHaveLength(3);
  });

  it('runs the mark-paid → confirm handshake; only confirmed money counts', async () => {
    const eventId = await kitty([BOB]);
    const c = await api.contributionOf(eventId, ALICE, BOB);

    expect((await api.markPaid(c.id, ALICE)).status).toBe(403); // not the contributor
    const marked = await api.markPaid(c.id, BOB, { reference: 'UPI-9', proofUrl: 'https://p/1.jpg' });
    expect(marked.status).toBe(200);
    expect(marked.body.data).toMatchObject({ status: 'initiated', claimedMinor: 1000000, paymentReference: 'UPI-9' });
    expect((await api.summary(eventId, ALICE)).totals.balanceMinor).toBe(0);

    expect((await api.confirm(c.id, BOB)).status).toBe(403); // only the custodian confirms
    const confirmed = await api.confirm(c.id, ALICE);
    expect(confirmed.body.data).toMatchObject({ status: 'confirmed', receivedMinor: 1000000 });
    expect(confirmed.body.data.auditTrail.map((a: any) => a.action)).toEqual(['created', 'marked_paid', 'confirmed']);
    expect((await api.summary(eventId, ALICE)).totals.balanceMinor).toBe(1000000);
  });

  it('tracks partial payments as arrears until completed', async () => {
    const eventId = await kitty([BOB]);
    const c = await api.contributionOf(eventId, ALICE, BOB);
    await api.markPaid(c.id, BOB, { amountMinor: 400000 });
    const partial = await api.confirm(c.id, ALICE);
    expect(partial.body.data).toMatchObject({ status: 'partial', receivedMinor: 400000 });
    const s = await api.summary(eventId, ALICE);
    expect(s.arrears).toEqual(expect.arrayContaining([{ entityType: 'user', entityId: BOB, outstandingMinor: 600000 }]));

    await api.markPaid(c.id, BOB);
    const done = await api.confirm(c.id, ALICE);
    expect(done.body.data).toMatchObject({ status: 'confirmed', receivedMinor: 1000000 });
  });

  it('returns a rejected payment claim to pending with a reason', async () => {
    const eventId = await kitty([BOB]);
    const c = await api.contributionOf(eventId, ALICE, BOB);
    await api.markPaid(c.id, BOB);
    const res = await request(app).post(`/api/pools/contributions/${c.id}/reject`).set(auth(ALICE)).send({ reason: 'Nothing arrived' });
    expect(res.body.data).toMatchObject({ status: 'pending', rejectionReason: 'Nothing arrived' });
    const again = await request(app).post(`/api/pools/contributions/${c.id}/reject`).set(auth(ALICE)).send({});
    expect(again.status).toBe(409);
  });

  it('waives a contribution, removing it from expectations', async () => {
    const eventId = await kitty([BOB]);
    const c = await api.contributionOf(eventId, ALICE, BOB);
    expect((await request(app).post(`/api/pools/contributions/${c.id}/waive`).set(auth(BOB)).send({})).status).toBe(403);
    const res = await request(app).post(`/api/pools/contributions/${c.id}/waive`).set(auth(ALICE)).send({ reason: 'Away this trip' });
    expect(res.body.data.status).toBe('waived');
    expect((await api.summary(eventId, ALICE)).totals.expectedRegularMinor).toBe(1000000);
  });

  it('refuses to waive a contribution money was already received against', async () => {
    const eventId = await kitty([BOB]);
    const c = await api.contributionOf(eventId, ALICE, BOB);
    await api.markPaid(c.id, BOB, { amountMinor: 100 });
    await api.confirm(c.id, ALICE);
    expect((await request(app).post(`/api/pools/contributions/${c.id}/waive`).set(auth(ALICE)).send({})).status).toBe(409);
  });

  it('lets the custodian set per-member amounts (tiers); others cannot', async () => {
    const eventId = await kitty([BOB, CAROL]);
    expect((await api.setContributions(eventId, BOB, [{ entityId: BOB, entityType: 'user', expectedMinor: 1 }])).status).toBe(403);
    const res = await api.setContributions(eventId, ALICE, [
      { entityId: BOB, entityType: 'user', expectedMinor: 1500000 },
      { entityId: CAROL, entityType: 'user', expectedMinor: 500000 },
    ]);
    expect(res.status).toBe(200);
    const s = await api.summary(eventId, ALICE);
    expect(s.totals.expectedRegularMinor).toBe(1000000 + 1500000 + 500000);
  });

  it('self-confirms the custodian\'s own top-up; a member\'s top-up awaits confirmation', async () => {
    const eventId = await kitty([BOB]);
    const own = await api.topUp(eventId, ALICE, { amountMinor: 50000 });
    expect(own.body.data).toMatchObject({ kind: 'top_up', status: 'confirmed', receivedMinor: 50000 });
    const member = await api.topUp(eventId, BOB, { amountMinor: 30000 });
    expect(member.body.data).toMatchObject({ kind: 'top_up', status: 'pending', fromUserId: BOB });
    expect((await api.summary(eventId, ALICE)).totals.balanceMinor).toBe(50000);
  });

  it('validates payloads', async () => {
    const eventId = await kitty([]);
    const res = await api.topUp(eventId, ALICE, { amountMinor: -5 });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('VALIDATION_ERROR');
    expect((await api.topUp(eventId, ALICE, { amountMinor: 10.5 })).status).toBe(400);
    expect((await api.topUp(eventId, ALICE, { amountMinor: 100, hack: true })).status).toBe(400);
  });
});

// ── Pool draws ────────────────────────────────────────────────────────────

describe('spending from the pool', () => {
  async function fundedKitty() {
    const eventId = await kitty([BOB, CAROL, DEV]);
    for (const m of [ALICE, BOB, CAROL, DEV]) await api.payIn(eventId, ALICE, m); // 4 × ₹10,000
    return eventId;
  }

  it('deducts a pool expense immediately, with no splits and no peer-to-peer debt', async () => {
    const eventId = await fundedKitty();
    const res = await api.spend(eventId, BOB, 4200, { title: 'Groceries' });
    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({ fundingSource: 'pool', isPrivate: false, poolDraw: { status: 'approved' }, splits: [] });
    expect((await api.summary(eventId, ALICE)).totals.balanceMinor).toBe(4000000 - 420000);
    const balances = (await request(app).get(`/api/settlements/event/${eventId}/balances`).set(auth(ALICE))).body.data;
    expect(balances).toEqual([]);
  });

  it('shows pool expenses to every participant', async () => {
    const eventId = await fundedKitty();
    await api.spend(eventId, BOB, 100);
    const list = (await request(app).get(`/api/expenses/event/${eventId}`).set(auth(CAROL))).body.data;
    expect(list).toHaveLength(1);
  });

  it('requires pool expenses in the pool currency', async () => {
    const eventId = await fundedKitty();
    const res = await api.spend(eventId, BOB, 10, { currency: 'USD' });
    expect(res.status).toBe(400);
    expect(res.body.error).toContain('pool currency');
  });

  it('refuses peer-to-peer expenses in a pure pool event but accepts them in a hybrid', async () => {
    const eventId = await fundedKitty();
    const self = { eventId, title: 'Spa', amount: 100, currency: 'INR', splitType: 'equal', splits: [{ entityType: 'user', entityId: BOB, amount: 100 }] };
    expect((await request(app).post('/api/expenses').set(auth(BOB)).send(self)).body.code).toBe('FUNDING_SOURCE_NOT_ALLOWED');

    const hybrid = (await api.createEvent(ALICE, { fundingModel: 'hybrid', pool: { preset: 'trip_kitty' } })).body.data.id;
    await api.join(hybrid, ALICE, BOB);
    expect((await request(app).post('/api/expenses').set(auth(BOB)).send({ ...self, eventId: hybrid })).status).toBe(201);
  });

  it('refuses a spend from someone outside the event', async () => {
    const eventId = await fundedKitty();
    expect((await api.spend(eventId, OUTSIDER, 10)).status).toBe(403);
  });

  describe('graduated overdraft (₹40,000 pool ⇒ ₹8,000 of overdraft)', () => {
    it('warns, then pauses, then resumes only once the overdraft is repaid plus more', async () => {
      const eventId = await fundedKitty();

      // Down to −₹5,000: allowed with a warning.
      expect((await api.spend(eventId, BOB, 45000)).status).toBe(201);
      let s = await api.summary(eventId, ALICE);
      expect(s.overdraft).toMatchObject({ zone: 'overdrawn', balanceMinor: -500000, floorMinor: -800000, headroomMinor: 300000 });

      // A ₹4,000 bill would breach the floor: refused with structured details.
      const refused = await api.spend(eventId, BOB, 4000);
      expect(refused.status).toBe(409);
      expect(refused.body.code).toBe('POOL_OVERDRAFT_BLOCKED');
      expect(refused.body.data).toMatchObject({ balance: -500000, floor: -800000, requested: 400000, projected: -900000, shortfall: 100000 });

      // Already paid? Then it's recorded and flagged, never refused.
      const recorded = await api.spend(eventId, BOB, 4000, { alreadyIncurred: true });
      expect(recorded.status).toBe(201);
      expect(recorded.body.data.poolFlags).toEqual(['exceeds_tolerance']);
      s = await api.summary(eventId, ALICE);
      expect(s.overdraft).toMatchObject({ zone: 'blocked', latched: true, balanceMinor: -900000 });
      expect(store.get('poolCycles', s.cycle.id).overdraftLatchedAt).toBeTruthy();

      // Paused: even ₹1 is refused.
      expect((await api.spend(eventId, CAROL, 1)).status).toBe(409);

      // A ₹5,000 top-up brings it to −₹4,000: still paused until repaid PLUS more.
      await api.topUp(eventId, ALICE, { amountMinor: 500000 });
      const stillPaused = await api.spend(eventId, CAROL, 1);
      expect(stillPaused.status).toBe(409);
      expect(stillPaused.body.data.clearanceRequired).toBe(400000);
      expect(stillPaused.body.data.shortfall).toBe(400001);

      // Another ₹5,000 takes it to +₹1,000: released automatically.
      await api.topUp(eventId, ALICE, { amountMinor: 500000 });
      s = await api.summary(eventId, ALICE);
      expect(s.overdraft).toMatchObject({ zone: 'healthy', latched: false, balanceMinor: 100000 });
      expect(store.get('poolCycles', s.cycle.id).overdraftLatchedAt).toBeNull();
      expect((await api.spend(eventId, CAROL, 500)).status).toBe(201);
    });

    it('a member\'s top-up only unpauses once the custodian confirms it', async () => {
      const eventId = await fundedKitty();
      await api.spend(eventId, BOB, 48000); // exactly at the floor
      expect((await api.summary(eventId, ALICE)).overdraft.zone).toBe('blocked');
      const topUp = (await api.topUp(eventId, BOB, { amountMinor: 1000000 })).body.data;
      await api.markPaid(topUp.id, BOB);
      expect((await api.summary(eventId, ALICE)).overdraft.zone).toBe('blocked');
      await api.confirm(topUp.id, ALICE);
      expect((await api.summary(eventId, ALICE)).overdraft.zone).toBe('healthy');
    });

    it('alerts the custodian over the socket when a flagged expense is recorded', async () => {
      const ws = require('../../config/websocket');
      const spy = jest.spyOn(ws, 'emitToUser');
      const eventId = await fundedKitty();
      await api.spend(eventId, BOB, 48000);
      await api.spend(eventId, BOB, 100, { alreadyIncurred: true });
      await new Promise((r) => setImmediate(r));
      expect(spy).toHaveBeenCalledWith(ALICE, 'pool:alert', expect.objectContaining({ eventId, flags: ['exceeds_tolerance'] }));
      spy.mockRestore();
    });
  });

  it('target collection refuses spending until the target is reached', async () => {
    const eventId = await api.createPool(ALICE, { preset: 'target_collection', targetAmountMinor: 2000000, defaultContributionMinor: 1000000 });
    await api.join(eventId, ALICE, BOB);
    await api.payIn(eventId, ALICE, ALICE);
    const early = await api.spend(eventId, ALICE, 500);
    expect(early.status).toBe(409);
    expect(early.body.code).toBe('POOL_UNDERFUNDED');
    await api.payIn(eventId, ALICE, BOB);
    expect((await api.spend(eventId, ALICE, 20000)).status).toBe(201);
    expect((await api.spend(eventId, ALICE, 1)).body.code).toBe('POOL_INSUFFICIENT_FUNDS');
  });

  it('lets an approved amount change re-run the overdraft check against the released balance', async () => {
    const eventId = await fundedKitty();
    const exp = (await api.spend(eventId, BOB, 30000)).body.data;
    const grow = await request(app).put(`/api/expenses/${exp.id}`).set(auth(BOB)).send({ amount: 47000 });
    expect(grow.status).toBe(200); // −₹7,000, inside the ₹8,000 tolerance
    const tooFar = await request(app).put(`/api/expenses/${exp.id}`).set(auth(BOB)).send({ amount: 49000 });
    expect(tooFar.status).toBe(409);
    expect((await api.summary(eventId, ALICE)).totals.poolSpendMinor).toBe(4700000);
  });

  it('refuses to change how an expense was paid', async () => {
    const eventId = await fundedKitty();
    const exp = (await api.spend(eventId, BOB, 100)).body.data;
    const res = await request(app).put(`/api/expenses/${exp.id}`).set(auth(BOB)).send({ fundingSource: 'self' });
    expect(res.status).toBe(400);
  });

  it('releases the deduction when a pool expense is deleted', async () => {
    const eventId = await fundedKitty();
    const exp = (await api.spend(eventId, BOB, 1000)).body.data;
    expect((await request(app).delete(`/api/expenses/${exp.id}`).set(auth(CAROL))).status).toBe(403);
    expect((await request(app).delete(`/api/expenses/${exp.id}`).set(auth(BOB))).status).toBe(200);
    expect((await api.summary(eventId, ALICE)).totals.balanceMinor).toBe(4000000);
  });
});

// ── Sponsor budget: approvals, reimbursements, receipts, caps ─────────────

describe('sponsor budget (UC-2)', () => {
  async function wedding(extra: Record<string, any> = {}) {
    const eventId = await api.createPool(ALICE, { preset: 'sponsor_budget', targetAmountMinor: 80000000, ...extra });
    await api.join(eventId, ALICE, BOB);
    await api.join(eventId, ALICE, CAROL);
    return eventId;
  }

  it('only lets authorised spenders draw', async () => {
    const eventId = await wedding();
    const receipt = { attachments: ['https://r/1.jpg'] };
    expect((await api.spend(eventId, BOB, 1000, receipt)).status).toBe(403);
    const cfg = await request(app).put(`/api/pools/event/${eventId}/config`).set(auth(ALICE)).send({ authorizedSpenders: [BOB] });
    expect(cfg.status).toBe(200);
    expect((await api.spend(eventId, BOB, 1000, receipt)).status).toBe(201);
    expect((await api.spend(eventId, CAROL, 1000, receipt)).status).toBe(403);
  });

  it('authorises every member of a spender group', async () => {
    const eventId = await wedding();
    store.seed('groups', 'g-shop', { eventId, eventIds: [eventId], name: 'Shopping', members: [BOB, CAROL], representative: BOB, payerUserId: BOB, createdBy: ALICE });
    await request(app).put(`/api/pools/event/${eventId}/config`).set(auth(ALICE)).send({ authorizedSpenderGroups: ['g-shop'] });
    expect((await api.spend(eventId, CAROL, 1000, { attachments: ['https://r/1.jpg'] })).status).toBe(201);
  });

  it('requires a receipt on every pool draw', async () => {
    const eventId = await wedding({ overrides: { authorizedSpenders: [BOB] } });
    const res = await api.spend(eventId, BOB, 1000);
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('POOL_RECEIPT_REQUIRED');
  });

  it('holds spender draws for approval; only approved draws deduct', async () => {
    const eventId = await wedding({ overrides: { authorizedSpenders: [BOB] } });
    const pending = (await api.spend(eventId, BOB, 50000, { attachments: ['https://r/1.jpg'] })).body.data;
    expect(pending.poolDraw.status).toBe('pending');
    let s = await api.summary(eventId, ALICE);
    expect(s.totals).toMatchObject({ balanceMinor: 80000000, pendingDrawsMinor: 5000000 });

    expect((await api.approveDraw(pending.id, BOB)).status).toBe(403);
    const approved = await api.approveDraw(pending.id, ALICE);
    expect(approved.body.data.expense.poolDraw).toMatchObject({ status: 'approved', decidedBy: ALICE });
    s = await api.summary(eventId, ALICE);
    expect(s.totals.balanceMinor).toBe(75000000);
    expect((await api.approveDraw(pending.id, ALICE)).status).toBe(409);
  });

  it('never deducts a rejected draw', async () => {
    const eventId = await wedding({ overrides: { authorizedSpenders: [BOB] } });
    const pending = (await api.spend(eventId, BOB, 50000, { attachments: ['https://r/1.jpg'] })).body.data;
    const rejected = await api.rejectDraw(pending.id, ALICE, 'Over budget for flowers');
    expect(rejected.body.data.poolDraw).toMatchObject({ status: 'rejected', reason: 'Over budget for flowers' });
    expect((await api.summary(eventId, ALICE)).totals).toMatchObject({ balanceMinor: 80000000, pendingDrawsMinor: 0 });
  });

  it('pays a reimbursement through a settlement leg without settling or locking the event', async () => {
    const eventId = await wedding({ overrides: { authorizedSpenders: [BOB] } });
    const claim = (await api.claim(eventId, BOB, 12000, { title: 'Sarees' })).body.data;
    expect(claim.poolDraw.status).toBe('pending');
    expect(store.all('settlements')).toHaveLength(0);

    const approved = await api.approveDraw(claim.id, ALICE);
    const legId = approved.body.data.settlementId;
    expect(legId).toBeTruthy();
    const leg = store.get('settlements', legId);
    expect(leg).toMatchObject({ kind: 'pool_reimbursement', fromUserId: ALICE, toUserId: BOB, amount: 12000, status: 'pending', expenseId: claim.id });
    expect((await api.summary(eventId, ALICE)).totals.reimbursementsMinor).toBe(1200000);

    // The claimant sees it as money owed to them.
    const unsettled = (await request(app).get('/api/settlements/unsettled-payments').set(auth(BOB))).body.data;
    expect(unsettled[0].pending[0]).toMatchObject({ settlementId: legId, amount: 12000 });

    expect((await api.payLeg(legId, ALICE)).status).toBe(200);
    expect((await api.event(eventId, ALICE)).status).toBe('active'); // not locked into payment
    const confirmed = await api.confirmLeg(legId, BOB);
    expect(confirmed.status).toBe(200);
    expect((await api.event(eventId, ALICE)).status).toBe('active'); // not settled

    const ledger = await api.ledger(eventId, ALICE);
    expect(ledger.entries.find((e: any) => e.id === claim.id)).toMatchObject({ settlementStatus: 'completed', counted: true, amountMinor: -1200000 });
    expect(ledger.spenders).toEqual([{ spenderId: BOB, spenderType: 'user', spentMinor: 1200000, pendingMinor: 0, capMinor: null }]);
  });

  it('requires a receipt on reimbursement claims', async () => {
    const eventId = await wedding({ overrides: { authorizedSpenders: [BOB] } });
    const res = await api.claim(eventId, BOB, 100, { attachments: [] });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('POOL_RECEIPT_REQUIRED');
  });

  it('auto-approves the custodian\'s own claim with no leg to themselves', async () => {
    const eventId = await wedding();
    const claim = (await api.claim(eventId, ALICE, 3000)).body.data;
    expect(claim.poolDraw).toMatchObject({ status: 'approved', selfReimbursed: true });
    expect(store.all('settlements')).toHaveLength(0);
  });

  it('removes a still-pending reimbursement leg when the claim is deleted, but not once payment started', async () => {
    const eventId = await wedding({ overrides: { authorizedSpenders: [BOB] } });
    const first = (await api.claim(eventId, BOB, 1000)).body.data;
    const leg1 = (await api.approveDraw(first.id, ALICE)).body.data.settlementId;
    expect((await request(app).delete(`/api/expenses/${first.id}`).set(auth(BOB))).status).toBe(200);
    expect(store.get('settlements', leg1)).toBeNull();

    const second = (await api.claim(eventId, BOB, 1000)).body.data;
    const leg2 = (await api.approveDraw(second.id, ALICE)).body.data.settlementId;
    await api.payLeg(leg2, ALICE);
    const blocked = await request(app).delete(`/api/expenses/${second.id}`).set(auth(BOB));
    expect(blocked.status).toBe(409);
    expect(blocked.body.code).toBe('POOL_REIMBURSEMENT_IN_PAYMENT');
    expect((await request(app).put(`/api/expenses/${second.id}`).set(auth(BOB)).send({ amount: 2000 })).status).toBe(409);
    // A title fix is still fine.
    expect((await request(app).put(`/api/expenses/${second.id}`).set(auth(BOB)).send({ title: 'Florist' })).status).toBe(200);
  });

  it('pays the new amount when an approved claim is edited and approved again', async () => {
    const eventId = await wedding({ overrides: { authorizedSpenders: [BOB] } });
    const claim = (await api.claim(eventId, BOB, 4000)).body.data;
    const firstLeg = (await api.approveDraw(claim.id, ALICE)).body.data.settlementId;

    const edited = await request(app).put(`/api/expenses/${claim.id}`).set(auth(BOB)).send({ amount: 4500 });
    expect(edited.status).toBe(200);
    expect(edited.body.data.poolDraw).toEqual({ status: 'pending', alreadyIncurred: true });
    expect(store.get('settlements', firstLeg)).toBeNull();

    const secondLeg = (await api.approveDraw(claim.id, ALICE)).body.data.settlementId;
    expect(secondLeg).toBeTruthy();
    expect(secondLeg).not.toBe(firstLeg);
    expect(store.get('settlements', secondLeg)).toMatchObject({ kind: 'pool_reimbursement', toUserId: BOB, amount: 4500, status: 'pending' });
    const ledger = await api.ledger(eventId, ALICE);
    expect(ledger.entries.find((e: any) => e.id === claim.id)).toMatchObject({ settlementStatus: 'pending', amountMinor: -450000 });
  });

  describe('claims still pointing at a deleted payment (written before edits replaced poolDraw)', () => {
    async function staleClaim(status: 'pending' | 'approved') {
      const eventId = await wedding({ overrides: { authorizedSpenders: [BOB] } });
      const claim = (await api.claim(eventId, BOB, 4000)).body.data;
      store.seed('expenses', claim.id, {
        ...store.get('expenses', claim.id),
        poolDraw: { status, decidedBy: ALICE, settlementId: 'leg-deleted', alreadyIncurred: true },
      });
      return { eventId, claimId: claim.id };
    }

    it('creates a fresh payment when such a claim is approved', async () => {
      const { claimId } = await staleClaim('pending');
      const legId = (await api.approveDraw(claimId, ALICE)).body.data.settlementId;
      expect(legId).not.toBe('leg-deleted');
      expect(store.get('settlements', legId)).toMatchObject({ toUserId: BOB, amount: 4000, status: 'pending', expenseId: claimId });
    });

    it('creates the missing payment before settling, so the claimant is still paid back', async () => {
      const { eventId, claimId } = await staleClaim('approved');
      expect((await api.dissolve(eventId, ALICE)).status).toBe(200);
      const legs = store.all('settlements').filter((s: any) => s.kind === 'pool_reimbursement');
      expect(legs).toEqual([expect.objectContaining({ toUserId: BOB, amount: 4000, status: 'pending', expenseId: claimId })]);
      expect((await api.event(eventId, ALICE)).status).toBe('payment');
    });
  });

  it('drops a cleared spending limit while keeping the others', async () => {
    const eventId = await wedding();
    const save = (body: Record<string, any>) => request(app).put(`/api/pools/event/${eventId}/config`).set(auth(ALICE)).send(body);
    await save({ authorizedSpenders: [BOB, CAROL], spenderCapsMinor: { [BOB]: 1000000, [CAROL]: 500000 } });
    expect((await save({ authorizedSpenders: [BOB, CAROL], spenderCapsMinor: { [CAROL]: 500000 } })).status).toBe(200);
    expect(store.get('events', eventId).poolConfig.spenderCapsMinor).toEqual({ [CAROL]: 500000 });
  });

  it('enforces a per-spender cap; an already-paid overrun is held for approval', async () => {
    const eventId = await wedding({ overrides: { authorizedSpenders: [BOB], spenderCapsMinor: { [BOB]: 1000000 }, expenseApproval: 'none' } });
    const receipt = { attachments: ['https://r/1.jpg'] };
    expect((await api.spend(eventId, BOB, 8000, receipt)).status).toBe(201);
    const over = await api.spend(eventId, BOB, 3000, receipt);
    expect(over.status).toBe(409);
    expect(over.body.code).toBe('POOL_SPENDER_CAP');
    const incurred = await api.spend(eventId, BOB, 3000, { ...receipt, alreadyIncurred: true });
    expect(incurred.status).toBe(201);
    expect(incurred.body.data.poolDraw.status).toBe('pending');
    expect(incurred.body.data.poolFlags).toContain('exceeds_spender_cap');
  });

  it('settles straight to "settled" on dissolve: the sponsor keeps what is left', async () => {
    const eventId = await wedding();
    await api.spend(eventId, ALICE, 742300, { attachments: ['https://r/1.jpg'] });
    const res = await api.dissolve(eventId, ALICE);
    expect(res.status).toBe(200);
    expect(res.body.data.plan.settlements).toHaveLength(0);
    expect((await api.event(eventId, ALICE)).status).toBe('settled');
    const [cycle] = await api.cycles(eventId, ALICE);
    expect(cycle.status).toBe('closed');
    expect(cycle.reconciliation).toMatchObject({ closingBalanceMinor: 5770000, shareBasis: 'custodian', disposition: 'settle' });
  });

  it('waits for outstanding reimbursements before settling on dissolve', async () => {
    const eventId = await wedding({ overrides: { authorizedSpenders: [BOB] } });
    const claim = (await api.claim(eventId, BOB, 1000)).body.data;
    const legId = (await api.approveDraw(claim.id, ALICE)).body.data.settlementId;
    await api.dissolve(eventId, ALICE);
    expect((await api.event(eventId, ALICE)).status).toBe('payment');
    await api.payLeg(legId, ALICE);
    await api.confirmLeg(legId, BOB);
    expect((await api.event(eventId, ALICE)).status).toBe('settled');
  });
});

// ── Dissolution of contributor pools ──────────────────────────────────────

describe('settling up a kitty (UC-3)', () => {
  it('refunds the surplus pro-rata through the existing review → payment → settled flow', async () => {
    const eventId = await api.createPool(ALICE, { preset: 'trip_kitty' });
    await api.join(eventId, ALICE, BOB);
    await api.setContributions(eventId, ALICE, [
      { entityId: ALICE, entityType: 'user', expectedMinor: 1500000 },
      { entityId: BOB, entityType: 'user', expectedMinor: 500000 },
    ]);
    await api.payIn(eventId, ALICE, ALICE);
    await api.payIn(eventId, ALICE, BOB);
    await api.spend(eventId, ALICE, 16000);

    const preview = await api.previewClose(eventId, ALICE, { forDissolution: true });
    expect(preview.body.data).toMatchObject({ closingBalanceMinor: 400000, outcome: 'surplus', coverNeededMinor: 0, settlementBalances: { 'user:mock-alice': -100000, 'user:mock-bob': 100000 } });

    const res = await api.dissolve(eventId, ALICE);
    expect(res.status).toBe(200);
    const legs = await api.settlements(eventId, ALICE);
    expect(legs).toHaveLength(1);
    expect(legs[0]).toMatchObject({ fromUserId: ALICE, toUserId: BOB, amount: 1000 });
    expect((await api.event(eventId, ALICE)).status).toBe('review');
    expect((await api.cycles(eventId, ALICE))[0].status).toBe('reconciling');

    // Pool activity is frozen once payments begin.
    await api.approveReview(eventId, ALICE);
    await api.approveReview(eventId, BOB);
    expect((await api.event(eventId, ALICE)).status).toBe('payment');
    expect((await api.spend(eventId, ALICE, 1)).status).toBe(403);

    await api.payLeg(legs[0].id, ALICE);
    await api.confirmLeg(legs[0].id, BOB);
    expect((await api.event(eventId, ALICE)).status).toBe('settled');
    const [cycle] = await api.cycles(eventId, ALICE);
    expect(cycle).toMatchObject({ status: 'closed', closeReason: 'dissolution' });
    expect(cycle.reconciliation.entityShares.find((e: any) => e.entityId === BOB).netMinor).toBe(100000);
    expect(cycle.reconciliation.settlementIds).toEqual([legs[0].id]);
  });

  it('makes a member who paid nothing cover their share of a deficit', async () => {
    const eventId = await kitty([BOB, CAROL, DEV], 1500000);
    for (const m of [ALICE, BOB, CAROL]) await api.payIn(eventId, ALICE, m);
    await api.spend(eventId, ALICE, 50000); // ₹45,000 in, ₹50,000 out (within the ₹9,000 tolerance)
    const preview = (await api.previewClose(eventId, ALICE, { forDissolution: true })).body.data;
    expect(preview).toMatchObject({ coverNeededMinor: 500000, uncoveredDeficitMinor: 0, closingBalanceMinor: 0 });
    await api.dissolve(eventId, ALICE); // the uncovered ₹5,000 defaults to the custodian
    const legs = await api.settlements(eventId, ALICE);
    const paidByDev = legs.filter((l) => l.fromUserId === DEV).reduce((s, l) => s + l.amount, 0);
    expect(paidByDev).toBe(12500);
    const cover = (await api.ledger(eventId, ALICE)).contributions.find((c: any) => c.kind === 'overdraft_cover');
    expect(cover).toMatchObject({ fromUserId: ALICE, receivedMinor: 500000 });
  });

  it('only lets an event admin settle up', async () => {
    const eventId = await kitty([BOB]);
    await request(app).put(`/api/pools/event/${eventId}/config`).set(auth(ALICE)).send({ custodianUserId: BOB });
    const res = await api.dissolve(eventId, BOB);
    expect(res.status).toBe(403);
    expect(store.all('poolContributions').some((c: any) => c.kind === 'overdraft_cover')).toBe(false);
  });

  it('refuses to settle up with draws still awaiting approval', async () => {
    const eventId = await kitty([BOB], 1000000, { overrides: { expenseApproval: 'always' } });
    await api.payIn(eventId, ALICE, ALICE);
    await api.spend(eventId, BOB, 100);
    const res = await api.dissolve(eventId, ALICE);
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('POOL_PENDING_DRAWS');
  });

  it('requires explicit cover to add up to the shortfall', async () => {
    const eventId = await kitty([BOB]);
    await api.payIn(eventId, ALICE, ALICE);
    await api.spend(eventId, ALICE, 12000);
    const res = await api.dissolve(eventId, ALICE, { cover: [{ entityId: BOB, entityType: 'user', amountMinor: 1 }] });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('POOL_COVER_MISMATCH');
  });

  it('reopens the cycle if the admin returns the event to active during review', async () => {
    const eventId = await kitty([BOB]);
    await api.payIn(eventId, ALICE, ALICE);
    await api.payIn(eventId, ALICE, BOB);
    await api.spend(eventId, ALICE, 5000);
    await api.dissolve(eventId, ALICE);
    expect((await api.event(eventId, ALICE)).status).toBe('review');
    await request(app).put(`/api/events/${eventId}`).set(auth(ALICE)).send({ status: 'active' });
    const s = await api.summary(eventId, ALICE);
    expect(s.cycle.status).toBe('open');
    expect((await api.spend(eventId, ALICE, 100)).status).toBe(201);
  });

  it('settles a hybrid event in ONE plan covering pool refunds and peer debts', async () => {
    const eventId = (await api.createEvent(ALICE, { fundingModel: 'hybrid', pool: { preset: 'trip_kitty', defaultContributionMinor: 1000000 } })).body.data.id;
    await api.join(eventId, ALICE, BOB);
    await api.payIn(eventId, ALICE, ALICE);
    await api.payIn(eventId, ALICE, BOB);
    await api.spend(eventId, ALICE, 10000); // pool: ₹20,000 in, ₹10,000 out ⇒ ₹5,000 back each
    // Peer-to-peer: Bob paid ₹3,000 for a dinner split equally.
    await request(app).post('/api/expenses').set(auth(BOB)).send({
      eventId, title: 'Dinner', amount: 3000, currency: 'INR', splitType: 'equal',
      splits: [{ entityType: 'user', entityId: ALICE, amount: 1500 }, { entityType: 'user', entityId: BOB, amount: 1500 }],
    });
    await api.dissolve(eventId, ALICE);
    const legs = await api.settlements(eventId, ALICE);
    // Pool: Alice holds ₹10,000, owes Bob ₹5,000. Peer: Alice owes Bob ₹1,500. One leg.
    expect(legs).toHaveLength(1);
    expect(legs[0]).toMatchObject({ fromUserId: ALICE, toUserId: BOB, amount: 6500 });
  });
});

// ── Access control & configuration ────────────────────────────────────────

describe('access control and configuration', () => {
  it('keeps pool data away from outsiders', async () => {
    const eventId = await kitty([BOB]);
    const c = await api.contributionOf(eventId, ALICE, BOB);
    expect((await request(app).get(`/api/pools/event/${eventId}/summary`).set(auth(OUTSIDER))).status).toBe(403);
    expect((await request(app).get(`/api/pools/event/${eventId}/ledger`).set(auth(OUTSIDER))).status).toBe(403);
    expect((await api.markPaid(c.id, OUTSIDER)).status).toBe(403);
    expect((await request(app).get('/api/pools/event/nope/summary').set(auth(ALICE))).status).toBe(404);
  });

  it('answers 400 for pool endpoints on a split-expenses event', async () => {
    const eventId = (await api.createEvent(ALICE)).body.data.id;
    const res = await request(app).get(`/api/pools/event/${eventId}/summary`).set(auth(ALICE));
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('POOL_NOT_ENABLED');
  });

  it('restricts settings changes to admins and keeps the funding shape fixed', async () => {
    const eventId = await kitty([BOB]);
    expect((await request(app).put(`/api/pools/event/${eventId}/config`).set(auth(BOB)).send({ overdraftTolerancePercent: 50 })).status).toBe(403);
    expect((await request(app).put(`/api/pools/event/${eventId}/config`).set(auth(ALICE)).send({ funderMode: 'sponsor' })).status).toBe(400);
    expect((await request(app).put(`/api/pools/event/${eventId}/config`).set(auth(ALICE)).send({ custodianUserId: OUTSIDER })).status).toBe(400);
    const ok = await request(app).put(`/api/pools/event/${eventId}/config`).set(auth(ALICE)).send({ overdraftTolerancePercent: 10, custodianUserId: BOB });
    expect(ok.body.data).toMatchObject({ overdraftTolerancePercent: 10, custodianUserId: BOB, funderMode: 'contributors' });
  });

  it('adds a pool to an existing split-expenses event, keeping its expenses', async () => {
    const eventId = (await api.createEvent(ALICE)).body.data.id;
    await api.join(eventId, ALICE, BOB);
    const p2p = await request(app).post('/api/expenses').set(auth(BOB)).send({
      eventId, title: 'Taxi', amount: 600, currency: 'INR', splitType: 'equal',
      splits: [{ entityType: 'user', entityId: ALICE, amount: 300 }, { entityType: 'user', entityId: BOB, amount: 300 }],
    });
    expect(p2p.status).toBe(201);
    expect((await request(app).post(`/api/pools/event/${eventId}/convert`).set(auth(BOB)).send({ preset: 'trip_kitty' })).status).toBe(403);
    const converted = await request(app).post(`/api/pools/event/${eventId}/convert`).set(auth(ALICE)).send({ preset: 'trip_kitty', defaultContributionMinor: 500000 });
    expect(converted.status).toBe(201);
    expect(store.get('events', eventId).fundingModel).toBe('hybrid');
    expect((await request(app).get(`/api/expenses/event/${eventId}`).set(auth(ALICE))).body.data).toHaveLength(1);
    const balances = (await request(app).get(`/api/settlements/event/${eventId}/balances`).set(auth(ALICE))).body.data;
    expect(balances.find((b: any) => b.entityId === BOB).amount).toBe(300);
    expect((await request(app).post(`/api/pools/event/${eventId}/convert`).set(auth(ALICE)).send({ preset: 'trip_kitty' })).status).toBe(409);
  });

  it('will not add a sponsor budget to a split-expenses event', async () => {
    const eventId = (await api.createEvent(ALICE)).body.data.id;
    const res = await request(app).post(`/api/pools/event/${eventId}/convert`).set(auth(ALICE)).send({ preset: 'sponsor_budget', targetAmountMinor: 100 });
    expect(res.status).toBe(400);
  });
});

// ── Uploads ───────────────────────────────────────────────────────────────

describe('receipt and proof uploads', () => {
  const png = Buffer.from('fake-image').toString('base64');

  it('stores a receipt for a participant, including PDF bills', async () => {
    const eventId = await kitty([BOB]);
    const img = await request(app).post('/api/uploads').set(auth(BOB)).send({ scope: 'expense_receipt', eventId, base64: png, contentType: 'image/png', filename: 'bill.png' });
    expect(img.status).toBe(201);
    expect(img.body.data.url).toContain(`events/${eventId}/receipts/${BOB}-`);
    const pdf = await request(app).post('/api/uploads').set(auth(BOB)).send({ scope: 'expense_receipt', eventId, base64: png, contentType: 'application/pdf' });
    expect(pdf.status).toBe(201);
  });

  it('rejects outsiders, unknown types and oversized files', async () => {
    const eventId = await kitty([BOB]);
    expect((await request(app).post('/api/uploads').set(auth(OUTSIDER)).send({ scope: 'expense_receipt', eventId, base64: png })).status).toBe(403);
    const exe = await request(app).post('/api/uploads').set(auth(BOB)).send({ scope: 'expense_receipt', eventId, base64: png, contentType: 'application/x-msdownload' });
    expect(exe.status).toBe(400);
    expect(exe.body.error).toContain('Unsupported receipt file type');
    const huge = Buffer.alloc(5 * 1024 * 1024 + 1).toString('base64');
    expect((await request(app).post('/api/uploads').set(auth(BOB)).send({ scope: 'expense_receipt', eventId, base64: huge })).status).toBe(400);
    expect((await request(app).post('/api/uploads').set(auth(BOB)).send({ scope: 'nope', eventId, base64: png })).status).toBe(400);
  });

  it('only lets the contributor or custodian attach proof to a contribution', async () => {
    const eventId = await kitty([BOB, CAROL]);
    const c = await api.contributionOf(eventId, ALICE, BOB);
    const body = { scope: 'pool_contribution_proof', contributionId: c.id, base64: png, contentType: 'image/jpeg' };
    expect((await request(app).post('/api/uploads').set(auth(CAROL)).send(body)).status).toBe(403);
    expect((await request(app).post('/api/uploads').set(auth(BOB)).send(body)).status).toBe(201);
    expect((await request(app).post('/api/uploads').set(auth(ALICE)).send(body)).status).toBe(201);
    expect((await request(app).post('/api/uploads').set(auth(BOB)).send({ ...body, contributionId: 'missing' })).status).toBe(404);
  });

  it('keeps the existing settlement proof upload behaviour', async () => {
    store.seed('settlements', 's1', { eventId: 'e', fromUserId: BOB, toUserId: ALICE, status: 'pending' });
    expect((await request(app).post('/api/settlements/s1/upload-proof').set(auth(ALICE)).send({ base64: png })).status).toBe(403);
    const pdf = await request(app).post('/api/settlements/s1/upload-proof').set(auth(BOB)).send({ base64: png, contentType: 'application/pdf' });
    expect(pdf.status).toBe(400);
    expect(pdf.body.error).toBe('Unsupported proof file type. Allowed: JPG, PNG, WEBP, HEIC');
    const ok = await request(app).post('/api/settlements/s1/upload-proof').set(auth(BOB)).send({ base64: png });
    expect(ok.status).toBe(200);
    expect(ok.body.data.proofUrl).toContain('settlements/s1/proofs/');
  });
});

describe('route validation edges', () => {
  async function fundedPair() {
    const eventId = await kitty([BOB, CAROL]);
    await api.payIn(eventId, ALICE, ALICE);
    return eventId;
  }

  it('guards edits to a pool expense', async () => {
    const eventId = await fundedPair();
    const exp = (await api.spend(eventId, BOB, 100)).body.data;
    expect((await request(app).put(`/api/expenses/${exp.id}`).set(auth(CAROL)).send({ title: 'x' })).status).toBe(403);
    expect((await request(app).put(`/api/expenses/${exp.id}`).set(auth(BOB)).send({ currency: 'USD' })).status).toBe(400);
    expect((await request(app).put(`/api/expenses/${exp.id}`).set(auth(BOB)).send({ amount: 0 })).status).toBe(400);
    expect((await request(app).put(`/api/expenses/${exp.id}`).set(auth(BOB)).send({ amount: 'lots' })).status).toBe(400);
  });

  it('rejects a non-numeric pool amount at creation', async () => {
    const eventId = await fundedPair();
    expect((await api.spend(eventId, BOB, 'NaN' as any)).status).toBe(400);
  });

  it('keeps cycles and draw decisions away from outsiders', async () => {
    const eventId = await fundedPair();
    const exp = (await api.spend(eventId, BOB, 100)).body.data;
    expect((await request(app).get(`/api/pools/event/${eventId}/cycles`).set(auth(OUTSIDER))).status).toBe(403);
    expect((await api.rejectDraw(exp.id, OUTSIDER)).status).toBe(403);
    expect((await api.rejectDraw('missing', ALICE)).status).toBe(404);
    expect((await api.approveDraw(exp.id, ALICE)).status).toBe(409); // already approved
  });

  it('answers 400 for pool actions on a split-expenses event', async () => {
    const eventId = (await api.createEvent(ALICE)).body.data.id;
    expect((await api.topUp(eventId, ALICE, { amountMinor: 100 })).status).toBe(400);
    expect((await api.closeCycle(eventId, ALICE)).status).toBe(400);
    expect((await api.dissolve(eventId, ALICE)).status).toBe(400);
  });

  it('validates close and settle-up payloads', async () => {
    const eventId = await fundedPair();
    expect((await api.closeCycle(eventId, ALICE, { cover: [{ entityId: BOB, entityType: 'alien', amountMinor: 1 }] })).status).toBe(400);
    expect((await api.dissolve(eventId, ALICE, { cover: 'everyone' })).status).toBe(400);
    expect((await api.previewClose(eventId, ALICE, { forDissolution: 'yes' })).status).toBe(400);
    expect((await api.setContributions(eventId, ALICE, [])).status).toBe(400);
  });
});

describe('generic settlement generation on a pool event', () => {
  it('reconciles the pool first instead of silently ignoring pool money', async () => {
    const eventId = await kitty([BOB]);
    await api.payIn(eventId, ALICE, ALICE);
    await api.payIn(eventId, ALICE, BOB);
    await api.spend(eventId, ALICE, 5000);
    const res = await request(app).post(`/api/settlements/event/${eventId}/generate`).set(auth(ALICE)).send({});
    expect(res.status).toBe(201);
    // ₹20,000 in, ₹5,000 out ⇒ Alice holds ₹15,000 and owes Bob ₹7,500.
    expect(res.body.data.settlements).toHaveLength(1);
    expect(res.body.data.settlements[0]).toMatchObject({ fromUserId: ALICE, toUserId: BOB, amount: 7500 });
    expect((await api.cycles(eventId, ALICE))[0].status).toBe('reconciling');
  });

  it('still refuses when pool draws are undecided', async () => {
    const eventId = await kitty([BOB], 1000000, { overrides: { expenseApproval: 'always' } });
    await api.payIn(eventId, ALICE, ALICE);
    await api.spend(eventId, BOB, 100);
    const res = await request(app).post(`/api/settlements/event/${eventId}/generate`).set(auth(ALICE)).send({});
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('POOL_PENDING_DRAWS');
  });
});
