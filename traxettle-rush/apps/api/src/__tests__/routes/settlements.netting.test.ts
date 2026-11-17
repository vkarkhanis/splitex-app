/**
 * Money pooling Phase 2 — netting pool payments into the final settlement (design doc §11).
 * Repayments for rejected spends and unpaid claims of the cycle being settled are folded into the
 * fewest-payments plan instead of each being paid on its own.
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

const { __store: store, db } = require('../../config/firebase');
const app = buildApp();
const api = poolApi(app);

const ANITA = 'mock-anita';
const RAVI = 'mock-ravi';
const PRIYA = 'mock-priya';
const RECEIPT = { attachments: ['https://r/1.jpg'] };

// The creator of a "Several of us" pool needs Pro (design doc §12).
beforeEach(() => {
  store.reset();
  makePro(store, ANITA);
});

// ── helpers ───────────────────────────────────────────────────────────────

const planLegs = () => store.all('settlements').filter((s: any) => !s.kind);
const plan = () => planLegs().map((s: any) => [s.fromUserId, s.toUserId, s.amount]).sort();
const regenerate = (eventId: string, uid: string) => request(app).post(`/api/settlements/event/${eventId}/regenerate`).set(auth(uid)).send({});
const approveAll = async (eventId: string, uids: string[]) => {
  for (const uid of uids) expect((await api.approveReview(eventId, uid)).status).toBe(200);
};

async function lend(eventId: string, uid: string, amountMinor: number) {
  const topUp = (await api.topUp(eventId, uid, { amountMinor })).body.data;
  await api.markPaid(topUp.id, uid);
  await api.confirm(topUp.id, ANITA);
}

/** A spend Ravi already paid with the budget's money, which Anita then rejects: he owes it back. */
async function rejectedSpend(eventId: string, uid: string, amount: number, title: string) {
  const spend = (await api.spend(eventId, uid, amount, { ...RECEIPT, alreadyIncurred: true, title })).body.data;
  const rejected = await api.rejectDraw(spend.id, ANITA);
  return { expenseId: spend.id as string, legId: rejected.body.data.poolDraw.settlementId as string };
}

/**
 * Phase 1 test plan, Scenario 1: Anita's wedding budget. Ravi lends ₹10,000 and spent ₹600 on
 * snacks with the budget's money, which Anita rejected.
 */
async function scenario1() {
  const eventId = await api.createPool(ANITA, { preset: 'sponsor_budget', targetAmountMinor: 8000000, overrides: { authorizedSpenders: [RAVI] } });
  await api.join(eventId, ANITA, RAVI);
  await lend(eventId, RAVI, 1000000);
  const snacks = await rejectedSpend(eventId, RAVI, 600, 'Snacks');
  return { eventId, ...snacks };
}

// ── The design doc's examples ─────────────────────────────────────────────

describe('netting at settle-up (§11)', () => {
  it('Scenario 1: one payment, Anita → Ravi ₹9,400, instead of ₹10,000 and ₹600', async () => {
    const { eventId, legId } = await scenario1();
    expect((await api.dissolve(eventId, ANITA)).status).toBe(200);
    expect(plan()).toEqual([[ANITA, RAVI, 9400]]);
    const leg = store.get('settlements', legId);
    expect(leg).toMatchObject({ status: 'netted' });
    expect(leg.nettedAt).toBeTruthy();
    expect(leg.nettedPlanAt).toBe(store.get('events', eventId).lastSettlementGeneratedAt);
    expect(leg.auditTrail.map((a: any) => a.action)).toEqual(['created', 'netted']);
    expect((await api.event(eventId, ANITA)).status).toBe('review');
  });

  it('Scenario 3: office kitty → Anita → Priya ₹1,300 and Ravi → Priya ₹100', async () => {
    const eventId = await api.createPool(ANITA, { preset: 'trip_kitty', defaultContributionMinor: 200000, overrides: { expenseApproval: 'always' } });
    await api.join(eventId, ANITA, RAVI);
    await api.join(eventId, ANITA, PRIYA);
    for (const uid of [ANITA, RAVI, PRIYA]) await api.payIn(eventId, ANITA, uid);
    expect((await api.spend(eventId, ANITA, 1800)).status).toBe(201); // the custodian's own: approved
    await rejectedSpend(eventId, RAVI, 1500, 'Printer ink');
    expect((await api.dissolve(eventId, ANITA)).status).toBe(200);
    expect(plan()).toEqual([[ANITA, PRIYA, 1300], [RAVI, PRIYA, 100]].sort());
  });

  it('folds an unpaid claim too: Anita → Ravi ₹10,800 for the loan plus the taxi', async () => {
    const eventId = await api.createPool(ANITA, { preset: 'sponsor_budget', targetAmountMinor: 8000000, overrides: { authorizedSpenders: [RAVI] } });
    await api.join(eventId, ANITA, RAVI);
    await lend(eventId, RAVI, 1000000);
    const taxi = (await api.claim(eventId, RAVI, 800, { title: 'Taxi' })).body.data;
    const legId = (await api.approveDraw(taxi.id, ANITA)).body.data.settlementId;
    await api.dissolve(eventId, ANITA);
    expect(plan()).toEqual([[ANITA, RAVI, 10800]]);
    expect(store.get('settlements', legId).status).toBe('netted');
  });

  it('a close where only a repayment is open goes to Review with one payment', async () => {
    const eventId = await api.createPool(ANITA, { preset: 'sponsor_budget', targetAmountMinor: 8000000, overrides: { authorizedSpenders: [RAVI] } });
    await api.join(eventId, ANITA, RAVI);
    await rejectedSpend(eventId, RAVI, 600, 'Snacks');
    await api.dissolve(eventId, ANITA);
    expect(plan()).toEqual([[RAVI, ANITA, 600]]);
    expect((await api.event(eventId, ANITA)).status).toBe('review');
  });
});

// ── Preview ───────────────────────────────────────────────────────────────

describe('settle-up preview (§11.4 step 5)', () => {
  it('lists what the final settlement will include', async () => {
    const { eventId, legId, expenseId } = await scenario1();
    const preview = (await api.previewClose(eventId, ANITA, { forDissolution: true })).body.data;
    expect(preview.folded).toEqual([{ settlementId: legId, expenseId, kind: 'pool_repayment', fromUserId: RAVI, toUserId: ANITA, amountMinor: 60000, title: 'Snacks' }]);
    expect(preview.separate).toEqual([]);
    expect(preview.settlementBalances).toEqual({ [`user:${RAVI}`]: 1000000, [`user:${ANITA}`]: -1000000 });
  });

  it('includes payments settle-up will create, and lists ones being paid as separate', async () => {
    const eventId = await api.createPool(ANITA, { preset: 'sponsor_budget', targetAmountMinor: 8000000, overrides: { authorizedSpenders: [RAVI] } });
    await api.join(eventId, ANITA, RAVI);
    // An approved claim whose payment was lost (data from before edits replaced poolDraw).
    const claim = (await api.claim(eventId, RAVI, 400, { title: 'Cake' })).body.data;
    store.seed('expenses', claim.id, { ...store.get('expenses', claim.id), poolDraw: { status: 'approved', decidedBy: ANITA, settlementId: 'gone', alreadyIncurred: true } });
    // A repayment Ravi has already started paying.
    const { legId } = await rejectedSpend(eventId, RAVI, 600, 'Snacks');
    expect((await api.payLeg(legId, RAVI)).status).toBe(200);

    const preview = (await api.previewClose(eventId, ANITA, { forDissolution: true })).body.data;
    expect(preview.folded).toEqual([{ settlementId: null, expenseId: claim.id, kind: 'pool_reimbursement', fromUserId: ANITA, toUserId: RAVI, amountMinor: 40000, title: 'Cake' }]);
    expect(preview.separate).toEqual([expect.objectContaining({ settlementId: legId, kind: 'pool_repayment', status: 'initiated', amountMinor: 60000 })]);
  });

  it('a cycle close preview lists nothing to fold', async () => {
    const eventId = await api.createPool(ANITA, { preset: 'household', defaultContributionMinor: 0 });
    const preview = (await api.previewClose(eventId, ANITA)).body.data;
    expect(preview).toMatchObject({ folded: [], separate: [] });
  });
});

// ── Payments already under way ────────────────────────────────────────────

describe('pool payments already being paid', () => {
  it('stay separate; the event settles once both they and the plan are done', async () => {
    const { eventId, legId } = await scenario1();
    expect((await api.payLeg(legId, RAVI)).status).toBe(200); // initiated before settle-up
    await api.dissolve(eventId, ANITA);
    expect(store.get('settlements', legId).status).toBe('initiated');
    expect(plan()).toEqual([[ANITA, RAVI, 10000]]);
    await approveAll(eventId, [ANITA, RAVI]);
    const planLeg = planLegs()[0];
    await api.payLeg(planLeg.id, ANITA);
    await api.confirmLeg(planLeg.id, RAVI);
    expect((await api.event(eventId, ANITA)).status).toBe('payment'); // the ₹600 is still waiting
    await api.confirmLeg(legId, ANITA);
    expect((await api.event(eventId, ANITA)).status).toBe('settled');
  });

  it('a repayment marked "not received" after settle-up goes back to "to pay", outside the plan', async () => {
    const { eventId, legId } = await scenario1();
    await api.payLeg(legId, RAVI);
    await api.dissolve(eventId, ANITA);
    const rejected = await request(app).post(`/api/settlements/${legId}/reject`).set(auth(ANITA)).send({ reason: 'Not received' });
    expect(rejected.status).toBe(200);
    expect(store.get('settlements', legId).status).toBe('pending');
    expect(plan()).toEqual([[ANITA, RAVI, 10000]]);
  });
});

// ── Re-running the plan and edits during Review ───────────────────────────

describe('re-running the plan (§11.4 step 4)', () => {
  it('restores and folds again, without duplicates', async () => {
    const { eventId, legId } = await scenario1();
    await api.dissolve(eventId, ANITA);
    const res = await regenerate(eventId, ANITA);
    expect(res.status).toBe(201);
    expect(plan()).toEqual([[ANITA, RAVI, 9400]]);
    const leg = store.get('settlements', legId);
    expect(leg.status).toBe('netted');
    expect(leg.auditTrail.map((a: any) => a.action)).toEqual(['created', 'netted', 'unfolded', 'netted']);
    expect(store.all('settlements').filter((s: any) => s.kind === 'pool_repayment')).toHaveLength(1);
  });

  it('a plan that failed to save leaves folded rows the next run restores', async () => {
    const { eventId, legId } = await scenario1();
    await api.dissolve(eventId, ANITA);
    // Simulate a lost plan: the folded row is still `netted`, but the plan's own payments are gone.
    for (const leg of planLegs()) await db.collection('settlements').doc(leg.id).delete();
    expect(store.get('settlements', legId).status).toBe('netted');
    await regenerate(eventId, ANITA);
    expect(plan()).toEqual([[ANITA, RAVI, 9400]]);
    expect(store.get('settlements', legId).status).toBe('netted');
  });

  it('forgiving the spend during Review removes its repayment and marks the plan stale', async () => {
    const { eventId, legId, expenseId } = await scenario1();
    await api.dissolve(eventId, ANITA);
    const del = await request(app).delete(`/api/expenses/${expenseId}`).set(auth(ANITA));
    expect(del.status).toBe(200);
    expect(store.get('settlements', legId)).toBeNull();
    expect(store.get('events', eventId).settlementStale).toBe(true);
    await regenerate(eventId, ANITA);
    expect(plan()).toEqual([[ANITA, RAVI, 10000]]);
  });

  it('the spender still cannot delete the spend they owe for', async () => {
    const { eventId, expenseId } = await scenario1();
    await api.dissolve(eventId, ANITA);
    const del = await request(app).delete(`/api/expenses/${expenseId}`).set(auth(RAVI));
    expect(del.status).toBe(403);
    expect(del.body.code).toBe('POOL_REPAYMENT_OWED');
  });

  it('changing its amount during Review removes the folded repayment until the plan is re-run', async () => {
    const { eventId, legId, expenseId } = await scenario1();
    await api.dissolve(eventId, ANITA);
    const edit = await request(app).put(`/api/expenses/${expenseId}`).set(auth(RAVI)).send({ amount: 500 });
    expect(edit.status).toBe(200);
    expect(store.get('settlements', legId)).toBeNull();
    expect(store.get('events', eventId).settlementStale).toBe(true);
  });
});

// ── Folded rows are done, and can't be paid on their own ──────────────────

describe('folded rows', () => {
  it('count as done: the event settles once the plan is paid, and the cycle records them', async () => {
    const { eventId, legId } = await scenario1();
    await api.dissolve(eventId, ANITA);
    await approveAll(eventId, [ANITA, RAVI]);
    expect((await api.event(eventId, ANITA)).status).toBe('payment');
    const planLeg = planLegs()[0];
    await api.payLeg(planLeg.id, ANITA);
    await api.confirmLeg(planLeg.id, RAVI);
    expect((await api.event(eventId, ANITA)).status).toBe('settled');
    const cycle = store.all('poolCycles')[0];
    expect(cycle.status).toBe('closed');
    expect(cycle.reconciliation.nettedLegIds).toEqual([legId]);
  });

  it("aren't counted as outstanding", async () => {
    const { eventId } = await scenario1();
    await api.dissolve(eventId, ANITA);
    await approveAll(eventId, [ANITA, RAVI]);
    const total = (await request(app).get(`/api/settlements/event/${eventId}/pending-total`).set(auth(ANITA))).body.data;
    expect(total).toEqual({ pendingTotal: 9400 }); // the ₹600 is inside the ₹9,400, not on top of it
  });

  it("can't be paid, marked paid or closed on their own", async () => {
    const { eventId, legId } = await scenario1();
    await api.dissolve(eventId, ANITA);
    const pay = await api.payLeg(legId, RAVI);
    expect(pay.status).toBe(400);
    expect(pay.body.error).toBe('This payment is included in the final settlement');
    const mark = await request(app).post(`/api/settlements/${legId}/mark-paid-by-payee`).set(auth(ANITA)).send({});
    expect(mark.status).toBe(400);
    expect(mark.body.error).toBe('This payment is included in the final settlement');
    const retry = await request(app).post(`/api/settlements/${legId}/retry`).set(auth(RAVI)).send({});
    expect(retry.status).toBe(400);
  });

  it('show as "netted" on the spend in the ledger', async () => {
    const { eventId, expenseId } = await scenario1();
    await api.dissolve(eventId, ANITA);
    const entry = (await api.ledger(eventId, ANITA)).entries.find((e: any) => e.id === expenseId);
    expect(entry.settlementStatus).toBe('netted');
  });

  it('are returned with when they were folded', async () => {
    const { eventId, legId } = await scenario1();
    await api.dissolve(eventId, ANITA);
    const leg = (await api.settlements(eventId, ANITA)).find((s: any) => s.id === legId);
    expect(leg).toMatchObject({ status: 'netted', kind: 'pool_repayment' });
    expect(leg.nettedAt).toBeTruthy();
  });
});

// ── What never folds ──────────────────────────────────────────────────────

describe('what stays separate', () => {
  it('rows from an earlier cycle and leaving settlements are never folded', async () => {
    const eventId = await api.createPool(ANITA, { preset: 'household', defaultContributionMinor: 100000 });
    await api.join(eventId, ANITA, RAVI);
    await api.join(eventId, ANITA, PRIYA);
    for (const uid of [ANITA, RAVI, PRIYA]) await api.payIn(eventId, ANITA, uid);
    expect((await api.leave(eventId, ANITA, PRIYA)).status).toBe(200);
    const exit = store.all('settlements').filter((s: any) => s.kind === 'pool_member_exit');
    expect(exit).toHaveLength(1);
    await api.dissolve(eventId, ANITA);
    expect(store.get('settlements', exit[0].id).status).toBe('pending');
  });
});
