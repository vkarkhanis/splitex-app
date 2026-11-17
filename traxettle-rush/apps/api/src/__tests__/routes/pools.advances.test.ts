/**
 * Money pooling Phase 2 — money handed between the custodian and others (design doc §9.3, §10.6):
 * advances, returns and early repayments, what spenders hold, and how that is settled at close.
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

import { auth, buildApp, makePro, poolApi } from '../helpers/poolHarness';

const { __store: store } = require('../../config/firebase');
const { notifyEventParticipants } = require('../../utils/notification-helper');
const app = buildApp();
const api = poolApi(app);

const ANITA = 'mock-anita'; // creator, sponsor, custodian
const RAVI = 'mock-ravi'; // spender
const PRIYA = 'mock-priya'; // spender / lender
const OUTSIDER = 'mock-outsider';
const RECEIPT = { attachments: ['https://r/1.jpg'] };

// The creator of a "Several of us" pool needs Pro (design doc §12).
beforeEach(() => {
  store.reset();
  makePro(store, ANITA);
});

// ── helpers ───────────────────────────────────────────────────────────────

const record = (eventId: string, uid: string, body: Record<string, any>) =>
  request(app).post(`/api/pools/event/${eventId}/advances`).set(auth(uid)).send(body);
const act = (id: string, uid: string, action: 'confirm' | 'reject' | 'cancel', body: Record<string, any> = {}) =>
  request(app).post(`/api/pools/advances/${id}/${action}`).set(auth(uid)).send(body);

/** Record a hand-over and have the receiver confirm it. */
async function handOver(eventId: string, recorder: string, receiver: string, body: Record<string, any>) {
  const created = await record(eventId, recorder, body);
  if (created.status !== 201) throw new Error(`record failed: ${created.status} ${JSON.stringify(created.body)}`);
  if (created.body.data.status === 'confirmed') return created.body.data;
  const confirmed = await act(created.body.data.id, receiver, 'confirm');
  if (confirmed.status !== 200) throw new Error(`confirm failed: ${confirmed.status} ${JSON.stringify(confirmed.body)}`);
  return confirmed.body.data;
}

/** ₹80,000 wedding budget; Ravi and Priya may spend; spends need Anita's approval. */
async function wedding(overrides: Record<string, any> = {}) {
  const eventId = await api.createPool(ANITA, {
    preset: 'sponsor_budget',
    targetAmountMinor: 8000000,
    overrides: { authorizedSpenders: [RAVI, PRIYA], ...overrides },
  });
  await api.join(eventId, ANITA, RAVI);
  await api.join(eventId, ANITA, PRIYA);
  return eventId;
}

/** A spend paid from pool money the spender holds (`paidFrom: 'advance'`). */
async function spendFromHeld(eventId: string, uid: string, amount: number, decision: 'approve' | 'reject' | 'pending' = 'approve') {
  const created = await api.spend(eventId, uid, amount, { ...RECEIPT, alreadyIncurred: true, paidFrom: 'advance', title: `Held ${amount}` });
  if (created.status !== 201) throw new Error(`spend failed: ${created.status} ${JSON.stringify(created.body)}`);
  const expense = created.body.data;
  expect(expense.poolDraw.paidFrom).toBe('advance');
  // Pools without approvals (a kitty) approve the spend straight away.
  if (decision === 'approve' && expense.poolDraw.status === 'pending') expect((await api.approveDraw(expense.id, ANITA)).status).toBe(200);
  if (decision === 'reject') expect((await api.rejectDraw(expense.id, ANITA)).status).toBe(200);
  return expense.id as string;
}

const heldBy = async (eventId: string) => (await api.summary(eventId, ANITA)).holdings.heldBy;

// ── Advances ──────────────────────────────────────────────────────────────

describe('advances (§9.3)', () => {
  it('counts as held only once the spender confirms, and never changes the remaining amount', async () => {
    const eventId = await wedding();
    const created = await record(eventId, ANITA, { kind: 'advance', userId: RAVI, amountMinor: 2000000, note: 'Cash for decorations' });
    expect(created.status).toBe(201);
    expect(created.body.data).toMatchObject({ kind: 'advance', fromUserId: ANITA, toUserId: RAVI, amountMinor: 2000000, status: 'initiated', note: 'Cash for decorations' });

    let s = await api.summary(eventId, ANITA);
    expect(s.totals.balanceMinor).toBe(8000000);
    expect(s.holdings).toEqual({ withCustodianMinor: 8000000, withSpendersMinor: 0, heldBy: {}, pendingOutMinor: 2000000 });

    const confirmed = await act(created.body.data.id, RAVI, 'confirm');
    expect(confirmed.status).toBe(200);
    expect(confirmed.body.data).toMatchObject({ status: 'confirmed' });
    expect(confirmed.body.data.confirmedAt).toBeTruthy();

    s = await api.summary(eventId, ANITA);
    expect(s.totals.balanceMinor).toBe(8000000);
    expect(s.holdings).toEqual({ withCustodianMinor: 6000000, withSpendersMinor: 2000000, heldBy: { [`user:${RAVI}`]: 2000000 }, pendingOutMinor: 0 });
  });

  it('shows hand-overs in the ledger without moving the balance, and what each spender holds', async () => {
    const eventId = await wedding();
    const adv = await handOver(eventId, ANITA, RAVI, { kind: 'advance', userId: RAVI, amountMinor: 2000000, proofUrl: 'https://proof/upi.png' });
    const ledger = await api.ledger(eventId, ANITA);
    expect(ledger.advances).toHaveLength(1);
    expect(ledger.entries.find((e: any) => e.id === adv.id)).toMatchObject({
      type: 'advance', advanceKind: 'advance', title: 'Advance', amountMinor: 2000000, counted: false,
      fromUserId: ANITA, toUserId: RAVI, receiptUrls: ['https://proof/upi.png'],
    });
    expect(ledger.spenders).toEqual([{ spenderId: RAVI, spenderType: 'user', spentMinor: 0, pendingMinor: 0, capMinor: null, heldMinor: 2000000 }]);
  });

  it('only the custodian hands money out, only to someone who can spend', async () => {
    const eventId = await wedding({ authorizedSpenders: [RAVI] });
    expect((await record(eventId, RAVI, { kind: 'advance', userId: PRIYA, amountMinor: 1000 })).status).toBe(403);
    const notSpender = await record(eventId, ANITA, { kind: 'advance', userId: PRIYA, amountMinor: 1000 });
    expect(notSpender.status).toBe(400);
    expect(notSpender.body.code).toBe('POOL_RECIPIENT_INVALID');
    expect((await record(eventId, ANITA, { kind: 'advance', userId: ANITA, amountMinor: 1000 })).body.code).toBe('POOL_RECIPIENT_INVALID');
    expect((await record(eventId, ANITA, { kind: 'advance', amountMinor: 1000 })).body.code).toBe('POOL_RECIPIENT_REQUIRED');
    expect((await record(eventId, OUTSIDER, { kind: 'advance', userId: RAVI, amountMinor: 1000 })).status).toBe(403);
  });

  it('refuses more than the custodian holds, counting advances still waiting', async () => {
    const eventId = await wedding();
    await handOver(eventId, ANITA, RAVI, { kind: 'advance', userId: RAVI, amountMinor: 5000000 });
    expect((await record(eventId, ANITA, { kind: 'advance', userId: PRIYA, amountMinor: 2000000 })).status).toBe(201);
    const tooMuch = await record(eventId, ANITA, { kind: 'advance', userId: PRIYA, amountMinor: 1000001 });
    expect(tooMuch.status).toBe(409);
    expect(tooMuch.body).toMatchObject({ code: 'POOL_ADVANCE_EXCEEDS_CUSTODIAN', data: { availableMinor: 1000000 } });
  });

  it('refuses while the pool is empty or spending is paused', async () => {
    const eventId = await wedding({ expenseApproval: 'none' });
    const spent = await api.spend(eventId, ANITA, 80000, RECEIPT);
    expect(spent.status).toBe(201);
    const res = await record(eventId, ANITA, { kind: 'advance', userId: RAVI, amountMinor: 100 });
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('POOL_ADVANCE_NOT_AVAILABLE');
  });

  it('the receiver can say it never arrived; it then never counts', async () => {
    const eventId = await wedding();
    const created = (await record(eventId, ANITA, { kind: 'advance', userId: RAVI, amountMinor: 1000 })).body.data;
    expect((await act(created.id, ANITA, 'confirm')).status).toBe(403); // only the receiver confirms
    const rejected = await act(created.id, RAVI, 'reject', { reason: 'Never got the cash' });
    expect(rejected.status).toBe(200);
    expect(rejected.body.data).toMatchObject({ status: 'rejected', rejectionReason: 'Never got the cash' });
    expect(await heldBy(eventId)).toEqual({});
    const again = await act(created.id, RAVI, 'confirm');
    expect(again.status).toBe(409);
    expect(again.body.code).toBe('POOL_HANDOVER_DECIDED');
  });

  it('whoever recorded it can cancel it while it waits', async () => {
    const eventId = await wedding();
    const created = (await record(eventId, ANITA, { kind: 'advance', userId: RAVI, amountMinor: 1000 })).body.data;
    expect((await act(created.id, RAVI, 'cancel')).status).toBe(403);
    const cancelled = await act(created.id, ANITA, 'cancel');
    expect(cancelled.body.data.status).toBe('cancelled');
    expect((await api.summary(eventId, ANITA)).holdings.pendingOutMinor).toBe(0);
    expect(store.get('poolAdvances', created.id).auditTrail.map((a: any) => a.action)).toEqual(['created', 'cancelled']);
  });

  it('rejects unknown kinds and non-positive amounts', async () => {
    const eventId = await wedding();
    expect((await record(eventId, ANITA, { kind: 'transfer', userId: RAVI, amountMinor: 100 })).body.code).toBe('VALIDATION_ERROR');
    expect((await record(eventId, ANITA, { kind: 'advance', userId: RAVI, amountMinor: 0 })).body.code).toBe('VALIDATION_ERROR');
  });
});

// ── What spenders hold ────────────────────────────────────────────────────

describe('spending held money (§9.3)', () => {
  it('approved spends from held money lower what the spender holds and the pool', async () => {
    const eventId = await wedding();
    await handOver(eventId, ANITA, RAVI, { kind: 'advance', userId: RAVI, amountMinor: 2000000 });
    await spendFromHeld(eventId, RAVI, 15000);
    const s = await api.summary(eventId, ANITA);
    expect(s.totals.balanceMinor).toBe(6500000);
    expect(s.holdings.heldBy).toEqual({ [`user:${RAVI}`]: 500000 });
    expect(s.holdings.withCustodianMinor).toBe(6000000);
  });

  it('a rejected spend from held money stays in what they hold: no repayment leg', async () => {
    const eventId = await wedding();
    await handOver(eventId, ANITA, RAVI, { kind: 'advance', userId: RAVI, amountMinor: 2000000 });
    await spendFromHeld(eventId, RAVI, 6000, 'reject');
    expect(store.all('settlements')).toHaveLength(0);
    expect(await heldBy(eventId)).toEqual({ [`user:${RAVI}`]: 2000000 });
  });

  it('spending more than they hold means the pool owes them the difference', async () => {
    const eventId = await wedding();
    await handOver(eventId, ANITA, RAVI, { kind: 'advance', userId: RAVI, amountMinor: 200000 });
    await spendFromHeld(eventId, RAVI, 3500);
    expect(await heldBy(eventId)).toEqual({ [`user:${RAVI}`]: -150000 });
  });
});

// ── Returns ───────────────────────────────────────────────────────────────

describe('returns (§9.3, D2)', () => {
  it('a holder returns money and the custodian confirms it', async () => {
    const eventId = await wedding();
    await handOver(eventId, ANITA, RAVI, { kind: 'advance', userId: RAVI, amountMinor: 2000000 });
    const ret = await record(eventId, RAVI, { kind: 'return', amountMinor: 500000 });
    expect(ret.status).toBe(201);
    expect(ret.body.data).toMatchObject({ kind: 'return', fromUserId: RAVI, toUserId: ANITA, status: 'initiated' });
    expect(await heldBy(eventId)).toEqual({ [`user:${RAVI}`]: 2000000 });
    expect((await act(ret.body.data.id, ANITA, 'confirm')).status).toBe(200);
    expect(await heldBy(eventId)).toEqual({ [`user:${RAVI}`]: 1500000 });
  });

  it('"Record money returned": the custodian records cash they received, confirmed at once', async () => {
    const eventId = await wedding();
    await handOver(eventId, ANITA, RAVI, { kind: 'advance', userId: RAVI, amountMinor: 2000000 });
    const ret = await record(eventId, ANITA, { kind: 'return', userId: RAVI, amountMinor: 2000000 });
    expect(ret.body.data).toMatchObject({ fromUserId: RAVI, toUserId: ANITA, status: 'confirmed' });
    expect(await heldBy(eventId)).toEqual({});
  });

  it('refuses more than they hold, counting returns still waiting', async () => {
    const eventId = await wedding();
    await handOver(eventId, ANITA, RAVI, { kind: 'advance', userId: RAVI, amountMinor: 100000 });
    expect((await record(eventId, RAVI, { kind: 'return', amountMinor: 60000 })).status).toBe(201);
    const res = await record(eventId, RAVI, { kind: 'return', amountMinor: 40001 });
    expect(res.status).toBe(409);
    expect(res.body).toMatchObject({ code: 'POOL_RETURN_EXCEEDS_HELD', data: { heldMinor: 40000 } });
    expect((await record(eventId, PRIYA, { kind: 'return', amountMinor: 1 })).body.code).toBe('POOL_RETURN_EXCEEDS_HELD');
    expect((await record(eventId, RAVI, { kind: 'return', userId: PRIYA, amountMinor: 1 })).body.code).toBe('POOL_RECIPIENT_INVALID');
  });
});

// ── Early repayments (§10.6) ──────────────────────────────────────────────

describe('paying back early (§10.6)', () => {
  async function lent(eventId: string, uid: string, amountMinor: number) {
    const topUp = (await api.topUp(eventId, uid, { amountMinor })).body.data;
    expect((await api.markPaid(topUp.id, uid)).status).toBe(200);
    expect((await api.confirm(topUp.id, ANITA)).status).toBe(200);
  }

  it('lowers the remaining amount once the lender confirms, and what is paid back at close', async () => {
    const eventId = await wedding();
    await lent(eventId, PRIYA, 1000000);
    const rep = await record(eventId, ANITA, { kind: 'repayment', userId: PRIYA, amountMinor: 400000 });
    expect(rep.body.data).toMatchObject({ kind: 'repayment', fromUserId: ANITA, toUserId: PRIYA, status: 'initiated' });
    expect((await api.summary(eventId, ANITA)).totals.balanceMinor).toBe(9000000);

    expect((await act(rep.body.data.id, PRIYA, 'confirm')).status).toBe(200);
    const s = await api.summary(eventId, ANITA);
    expect(s.totals).toMatchObject({ balanceMinor: 8600000, earlyRepaymentsMinor: 400000 });
    const entry = (await api.ledger(eventId, ANITA)).entries.find((e: any) => e.id === rep.body.data.id);
    expect(entry).toMatchObject({ title: 'Paid back early', amountMinor: -400000, counted: true });

    // Only the rest of the loan is left to pay back.
    const tooMuch = await record(eventId, ANITA, { kind: 'repayment', userId: PRIYA, amountMinor: 600001 });
    expect(tooMuch.body).toMatchObject({ code: 'POOL_REPAYMENT_EXCEEDS_LOAN', data: { outstandingMinor: 600000 } });

    expect((await api.dissolve(eventId, ANITA)).status).toBe(200);
    const legs = await api.settlements(eventId, ANITA);
    expect(legs.map((l: any) => [l.fromUserId, l.toUserId, l.amount])).toEqual([[ANITA, PRIYA, 6000]]);
  });

  it('only the custodian starts it, and only for money someone lent', async () => {
    const eventId = await wedding();
    await lent(eventId, PRIYA, 1000000);
    expect((await record(eventId, PRIYA, { kind: 'repayment', userId: PRIYA, amountMinor: 1000 })).status).toBe(403);
    expect((await record(eventId, ANITA, { kind: 'repayment', userId: RAVI, amountMinor: 1000 })).body.code).toBe('POOL_REPAYMENT_EXCEEDS_LOAN');
    const gift = (await api.topUp(eventId, RAVI, { amountMinor: 50000, gift: true })).body.data;
    await api.markPaid(gift.id, RAVI);
    await api.confirm(gift.id, ANITA);
    expect((await record(eventId, ANITA, { kind: 'repayment', userId: RAVI, amountMinor: 1 })).body.code).toBe('POOL_REPAYMENT_EXCEEDS_LOAN');
  });

  it('is allowed even when it pauses spending; adding money resumes it', async () => {
    const eventId = await wedding({ expenseApproval: 'none' });
    await lent(eventId, PRIYA, 2000000);
    // ₹1,00,000 in the pool (budget + loan); ₹99,000 spent leaves ₹1,000.
    expect((await api.spend(eventId, ANITA, 99000, RECEIPT)).status).toBe(201);
    const rep = await handOver(eventId, ANITA, PRIYA, { kind: 'repayment', userId: PRIYA, amountMinor: 2000000 });
    expect(rep.status).toBe('confirmed');
    let s = await api.summary(eventId, ANITA);
    expect(s.totals.balanceMinor).toBe(-1900000);
    expect(s.overdraft.latched).toBe(true);
    expect(s.cycle.overdraftLatchedAt).toBeTruthy();

    const topUp = (await api.topUp(eventId, ANITA, { amountMinor: 2000000 })).body.data;
    expect(topUp.status).toBe('confirmed');
    s = await api.summary(eventId, ANITA);
    expect(s.overdraft.latched).toBe(false);
  });
});

// ── Closing and settling up ───────────────────────────────────────────────

describe('closing with money handed over', () => {
  it('blocks closing and settling up while a hand-over waits for confirmation', async () => {
    const eventId = await wedding();
    await record(eventId, ANITA, { kind: 'advance', userId: RAVI, amountMinor: 1000 });
    const dissolve = await api.dissolve(eventId, ANITA);
    expect(dissolve.status).toBe(409);
    expect(dissolve.body).toMatchObject({ code: 'POOL_UNCONFIRMED_MOVEMENTS', data: { count: 1 } });

    const fund = await api.createPool(ANITA, { preset: 'household', defaultContributionMinor: 0 });
    await api.join(fund, ANITA, RAVI);
    await api.topUp(fund, ANITA, { amountMinor: 500000 });
    await record(fund, ANITA, { kind: 'advance', userId: RAVI, amountMinor: 1000 });
    expect((await api.closeCycle(fund, ANITA)).body.code).toBe('POOL_UNCONFIRMED_MOVEMENTS');
  });

  it('worked example: an advance of ₹20,000 with ₹15,000 spent → Ravi pays Anita ₹5,000 at settle-up', async () => {
    const eventId = await wedding();
    await handOver(eventId, ANITA, RAVI, { kind: 'advance', userId: RAVI, amountMinor: 2000000 });
    await spendFromHeld(eventId, RAVI, 15000);
    expect((await api.dissolve(eventId, ANITA)).status).toBe(200);
    const legs = await api.settlements(eventId, ANITA);
    expect(legs.map((l: any) => [l.fromUserId, l.toUserId, l.amount])).toEqual([[RAVI, ANITA, 5000]]);
    expect((await api.event(eventId, ANITA)).status).toBe('review');
  });

  it('a settling close collects what members hold through the pool payments', async () => {
    // Kitty: Anita and Ravi put in ₹10,000 each; Anita hands Ravi ₹5,000, he spends ₹3,000 of it.
    const eventId = await api.createPool(ANITA, { preset: 'trip_kitty', defaultContributionMinor: 1000000 });
    await api.join(eventId, ANITA, RAVI);
    await api.payIn(eventId, ANITA, ANITA);
    await api.payIn(eventId, ANITA, RAVI);
    await handOver(eventId, ANITA, RAVI, { kind: 'advance', userId: RAVI, amountMinor: 500000 });
    await spendFromHeld(eventId, RAVI, 3000);
    const closed = await api.closeCycle(eventId, ANITA);
    expect(closed.status).toBe(200);
    // ₹17,000 left: ₹8,500 each. Ravi already holds ₹2,000 of his, so Anita sends him ₹6,500.
    const legs = store.all('settlements');
    expect(legs.map((l: any) => [l.kind, l.fromUserId, l.toUserId, l.amount])).toEqual([['pool_cycle', ANITA, RAVI, 6500]]);
    expect(closed.body.data.closed.reconciliation.heldBy).toEqual({ [`user:${RAVI}`]: 200000 });
  });

  it('a carry-forward close carries what spenders hold into the next cycle', async () => {
    const eventId = await api.createPool(ANITA, { preset: 'household', defaultContributionMinor: 0 });
    await api.join(eventId, ANITA, RAVI);
    await api.topUp(eventId, ANITA, { amountMinor: 1000000 });
    await handOver(eventId, ANITA, RAVI, { kind: 'advance', userId: RAVI, amountMinor: 300000 });
    const closed = await api.closeCycle(eventId, ANITA);
    expect(closed.status).toBe(200);
    expect(closed.body.data.next.openingHeld).toEqual({ [`user:${RAVI}`]: 300000 });
    const s = await api.summary(eventId, ANITA);
    expect(s.cycle.id).toBe(closed.body.data.next.id);
    expect(s.holdings).toMatchObject({ heldBy: { [`user:${RAVI}`]: 300000 }, withCustodianMinor: 700000 });
  });

  it('a member leaving a rolling fund hands back what they hold in their leaving settlement', async () => {
    const eventId = await api.createPool(ANITA, { preset: 'household', defaultContributionMinor: 0 });
    await api.join(eventId, ANITA, RAVI);
    await api.join(eventId, ANITA, PRIYA);
    await api.topUp(eventId, ANITA, { amountMinor: 900000 });
    await handOver(eventId, ANITA, RAVI, { kind: 'advance', userId: RAVI, amountMinor: 200000 });
    expect((await api.leave(eventId, ANITA, RAVI)).status).toBe(200);
    const exit = store.all('settlements').filter((l: any) => l.kind === 'pool_member_exit');
    // Ravi put nothing in and spent nothing; he just hands back the ₹2,000 he holds.
    expect(exit.map((l: any) => [l.fromUserId, l.toUserId, l.amount])).toEqual([[RAVI, ANITA, 2000]]);
    expect((await api.summary(eventId, ANITA)).holdings.heldBy).toEqual({});
  });
});

// ── Leaving and changing the custodian ────────────────────────────────────

describe('leaving and changing the custodian (D7, D8)', () => {
  it('someone holding money must return it before leaving', async () => {
    const eventId = await wedding();
    await handOver(eventId, ANITA, RAVI, { kind: 'advance', userId: RAVI, amountMinor: 100000 });
    const res = await api.leave(eventId, ANITA, RAVI);
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('POOL_HOLDER_LEAVING');
    expect(res.body.error).toContain('still holds');
    await handOver(eventId, ANITA, ANITA, { kind: 'return', userId: RAVI, amountMinor: 100000 });
    expect((await api.leave(eventId, ANITA, RAVI)).status).toBe(200);
  });

  it('someone the pool owes, or with a hand-over waiting, settles that first', async () => {
    const eventId = await wedding();
    await handOver(eventId, ANITA, RAVI, { kind: 'advance', userId: RAVI, amountMinor: 100000 });
    await spendFromHeld(eventId, RAVI, 1500);
    const owed = await api.leave(eventId, ANITA, RAVI);
    expect(owed.body.code).toBe('POOL_HOLDER_LEAVING');
    expect(owed.body.error).toContain('owes this person');

    await record(eventId, ANITA, { kind: 'advance', userId: PRIYA, amountMinor: 1000 });
    const waiting = await api.leave(eventId, ANITA, PRIYA);
    expect(waiting.body.code).toBe('POOL_HOLDER_LEAVING');
    expect(waiting.body.error).toContain('waiting for confirmation');
  });

  it("the custodian can't change while spenders hold money", async () => {
    const eventId = await wedding();
    await handOver(eventId, ANITA, RAVI, { kind: 'advance', userId: RAVI, amountMinor: 100000 });
    const change = () => request(app).put(`/api/pools/event/${eventId}/config`).set(auth(ANITA)).send({ custodianUserId: PRIYA });
    const blocked = await change();
    expect(blocked.status).toBe(409);
    expect(blocked.body.code).toBe('POOL_CUSTODIAN_CHANGE_BLOCKED');
    await handOver(eventId, ANITA, ANITA, { kind: 'return', userId: RAVI, amountMinor: 100000 });
    expect((await change()).status).toBe(200);
  });
});

// ── Odds and ends ─────────────────────────────────────────────────────────

describe('hand-overs: settings, events and proofs', () => {
  it('stores the card/UPI switch for a budget', async () => {
    const eventId = await wedding();
    const res = await request(app).put(`/api/pools/event/${eventId}/config`).set(auth(ANITA)).send({ allowSponsorCardSpends: false });
    expect(res.status).toBe(200);
    expect(store.get('events', eventId).poolConfig.allowSponsorCardSpends).toBe(false);
  });

  it('only while the event is active', async () => {
    const eventId = await wedding();
    const adv = (await record(eventId, ANITA, { kind: 'advance', userId: RAVI, amountMinor: 1000 })).body.data;
    expect((await act(adv.id, RAVI, 'confirm')).status).toBe(200);
    await handOver(eventId, ANITA, ANITA, { kind: 'return', userId: RAVI, amountMinor: 1000 });
    expect((await api.dissolve(eventId, ANITA)).status).toBe(200);
    const late = await record(eventId, ANITA, { kind: 'advance', userId: RAVI, amountMinor: 1000 });
    expect(late.status).toBe(409);
    expect(late.body.code).toBe('POOL_EVENT_NOT_ACTIVE');
  });

  it('outsiders can neither see nor act on a hand-over; unknown ids are 404', async () => {
    const eventId = await wedding();
    const adv = (await record(eventId, ANITA, { kind: 'advance', userId: RAVI, amountMinor: 1000 })).body.data;
    expect((await act(adv.id, OUTSIDER, 'confirm')).status).toBe(403);
    expect((await act('nope', RAVI, 'confirm')).status).toBe(404);
  });

  it('uploads proof for a hand-over before it is recorded; event participants only', async () => {
    const eventId = await wedding();
    const file = { scope: 'pool_advance_proof', eventId, base64: Buffer.from('fake-png').toString('base64'), contentType: 'image/png', filename: 'upi.png' };
    const ok = await request(app).post('/api/uploads').set(auth(RAVI)).send(file);
    expect(ok.status).toBe(201);
    expect(ok.body.data.url).toContain(`pools/${eventId}/advances`);
    expect((await request(app).post('/api/uploads').set(auth(OUTSIDER)).send(file)).status).toBe(403);
  });
});

// ── How a pool spend was paid (WP3, §9.3, D1, D10) ────────────────────────

describe('how a pool spend was paid', () => {
  const edit = (id: string, uid: string, body: Record<string, any>) => request(app).put(`/api/expenses/${id}`).set(auth(uid)).send(body);

  it("stores the method on the spend and in the ledger, and says it in the notification", async () => {
    const eventId = await wedding();
    (notifyEventParticipants as jest.Mock).mockClear();
    const res = await api.spend(eventId, RAVI, 1200, { ...RECEIPT, alreadyIncurred: false, paidFrom: 'sponsor_card', title: 'Flowers' });
    expect(res.status).toBe(201);
    expect(res.body.data.poolDraw).toMatchObject({ status: 'pending', alreadyIncurred: false, paidFrom: 'sponsor_card' });
    expect(res.body.data.paidFrom).toBeUndefined();
    const entry = (await api.ledger(eventId, ANITA)).entries.find((e: any) => e.id === res.body.data.id);
    expect(entry.paidFrom).toBe('sponsor_card');
    const call = (notifyEventParticipants as jest.Mock).mock.calls.find((c: any[]) => c[2] === 'expense_added');
    expect(call[3]['Paid with']).toBe("The custodian's card or UPI");
  });

  it('a rejected, already-paid spend on the card is owed back; one from held money is not', async () => {
    const eventId = await wedding();
    const card = (await api.spend(eventId, RAVI, 700, { ...RECEIPT, alreadyIncurred: true, paidFrom: 'sponsor_card' })).body.data;
    await api.rejectDraw(card.id, ANITA);
    await handOver(eventId, ANITA, RAVI, { kind: 'advance', userId: RAVI, amountMinor: 100000 });
    await spendFromHeld(eventId, RAVI, 500, 'reject');
    const legs = store.all('settlements');
    expect(legs.map((l: any) => [l.kind, l.expenseId, l.amount])).toEqual([['pool_repayment', card.id, 700]]);
  });

  it('refuses a method on claims, on the custodian\'s own spends, and unknown values', async () => {
    const eventId = await wedding({ expenseApproval: 'none' });
    const claim = await api.claim(eventId, RAVI, 100, { paidFrom: 'advance' });
    expect(claim.status).toBe(400);
    expect(claim.body.code).toBe('POOL_PAID_FROM_INVALID');
    expect((await api.spend(eventId, ANITA, 100, { ...RECEIPT, paidFrom: 'sponsor_card' })).body.code).toBe('POOL_PAID_FROM_INVALID');
    expect((await api.spend(eventId, RAVI, 100, { ...RECEIPT, paidFrom: 'cash' })).body.code).toBe('POOL_PAID_FROM_INVALID');
  });

  it('with card spends switched off: refuses the card, accepts held money and older apps that send no method', async () => {
    const eventId = await wedding({ allowSponsorCardSpends: false });
    const card = await api.spend(eventId, RAVI, 100, { ...RECEIPT, alreadyIncurred: true, paidFrom: 'sponsor_card' });
    expect(card.status).toBe(400);
    expect(card.body.code).toBe('POOL_CARD_SPENDS_OFF');
    expect((await api.spend(eventId, RAVI, 100, { ...RECEIPT, alreadyIncurred: true, paidFrom: 'advance' })).status).toBe(201);
    const legacy = await api.spend(eventId, RAVI, 100, { ...RECEIPT, alreadyIncurred: true });
    expect(legacy.status).toBe(201);
    expect(legacy.body.data.poolDraw.paidFrom).toBeUndefined();
  });

  it('spending from held money is never refused for going past what they hold', async () => {
    const eventId = await wedding();
    await handOver(eventId, ANITA, RAVI, { kind: 'advance', userId: RAVI, amountMinor: 10000 });
    expect((await api.spend(eventId, RAVI, 5000, { ...RECEIPT, alreadyIncurred: true, paidFrom: 'advance' })).status).toBe(201);
  });

  it('changing the method is checked again like an amount change: a rejected card spend moved to held money', async () => {
    const eventId = await wedding();
    await handOver(eventId, ANITA, RAVI, { kind: 'advance', userId: RAVI, amountMinor: 100000 });
    const spend = (await api.spend(eventId, RAVI, 400, { ...RECEIPT, alreadyIncurred: true, paidFrom: 'sponsor_card' })).body.data;
    await api.rejectDraw(spend.id, ANITA);
    expect(store.all('settlements')).toHaveLength(1);

    const moved = await edit(spend.id, RAVI, { paidFrom: 'advance' });
    expect(moved.status).toBe(200);
    expect(moved.body.data.poolDraw).toMatchObject({ status: 'pending', paidFrom: 'advance', alreadyIncurred: true });
    expect(store.all('settlements')).toHaveLength(0); // the unpaid repayment goes away

    expect((await api.rejectDraw(spend.id, ANITA)).status).toBe(200);
    expect(store.all('settlements')).toHaveLength(0); // held money stays owed in what Ravi holds
    expect(await heldBy(eventId)).toEqual({ [`user:${RAVI}`]: 100000 });
  });

  it('an approved spend moved off held money gives the money back to what they hold, pending approval again', async () => {
    const eventId = await wedding();
    await handOver(eventId, ANITA, RAVI, { kind: 'advance', userId: RAVI, amountMinor: 100000 });
    const id = await spendFromHeld(eventId, RAVI, 300);
    expect(await heldBy(eventId)).toEqual({ [`user:${RAVI}`]: 70000 });
    const moved = await edit(id, RAVI, { paidFrom: 'sponsor_card' });
    expect(moved.body.data.poolDraw).toMatchObject({ status: 'pending', paidFrom: 'sponsor_card' });
    expect(await heldBy(eventId)).toEqual({ [`user:${RAVI}`]: 100000 });
  });

  it('turning card spends off later still lets people edit card spends recorded before; a new card method is refused', async () => {
    const eventId = await wedding();
    const card = (await api.spend(eventId, RAVI, 400, { ...RECEIPT, alreadyIncurred: true, paidFrom: 'sponsor_card' })).body.data;
    const held = (await api.spend(eventId, RAVI, 400, { ...RECEIPT, alreadyIncurred: true, paidFrom: 'advance' })).body.data;
    await request(app).put(`/api/pools/event/${eventId}/config`).set(auth(ANITA)).send({ allowSponsorCardSpends: false });
    const amount = await edit(card.id, RAVI, { amount: 450 });
    expect(amount.status).toBe(200);
    expect(amount.body.data.poolDraw.paidFrom).toBe('sponsor_card');
    const toCard = await edit(held.id, RAVI, { paidFrom: 'sponsor_card' });
    expect(toCard.status).toBe(400);
    expect(toCard.body.code).toBe('POOL_CARD_SPENDS_OFF');
  });

  it('an amount edit keeps the method the spend already had', async () => {
    const eventId = await wedding();
    const spend = (await api.spend(eventId, RAVI, 400, { ...RECEIPT, alreadyIncurred: true, paidFrom: 'advance' })).body.data;
    const res = await edit(spend.id, RAVI, { amount: 420 });
    expect(res.body.data.poolDraw.paidFrom).toBe('advance');
  });
});
