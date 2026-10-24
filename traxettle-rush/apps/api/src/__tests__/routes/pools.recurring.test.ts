/**
 * Money pooling — recurring pools (UC-1 shared living, UC-4 club treasury):
 * cycle close and carry-forward, deficits, membership changes, arrears,
 * and the immutability of closed cycles.
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
    storage: {},
    firebaseApp: { options: {} },
  };
});

import { auth, buildApp, poolApi } from '../helpers/poolHarness';
import { periodFor } from '../../services/pool.service';

const { __store: store } = require('../../config/firebase');
const app = buildApp();
const api = poolApi(app);

const ALICE = 'mock-alice';
const BOB = 'mock-bob';
const CAROL = 'mock-carol';
const DEV = 'mock-dev';
const RENT = 1500000; // ₹15,000

beforeEach(() => store.reset());

async function household(members: string[], overrides: Record<string, any> = {}) {
  const eventId = await api.createPool(ALICE, { preset: 'household', defaultContributionMinor: RENT, overrides });
  for (const m of members) await api.join(eventId, ALICE, m);
  return eventId;
}

const sum = (o: Record<string, number>) => Object.values(o).reduce((s, v) => s + v, 0);

describe('accounting periods', () => {
  it('labels monthly and quarterly periods in UTC', () => {
    expect(periodFor('monthly', new Date('2026-09-15T10:00:00Z'))).toEqual({
      startDate: '2026-09-01T00:00:00.000Z',
      endDate: '2026-09-30T23:59:59.999Z',
      label: 'September 2026',
    });
    expect(periodFor('quarterly', new Date('2026-11-02T00:00:00Z')).label).toBe('Q4 2026');
    expect(periodFor('monthly', new Date('2026-12-31T23:00:00Z')).endDate).toBe('2026-12-31T23:59:59.999Z');
    expect(periodFor(undefined, new Date('2026-01-01T00:00:00Z'))).toMatchObject({ endDate: null, label: 'Pool' });
  });
});

describe('UC-1 shared living fund', () => {
  it('opens a monthly cycle and lets flatmates join without spawning empty cycles', async () => {
    const eventId = await household([BOB, CAROL]);
    const cycles = await api.cycles(eventId, ALICE);
    expect(cycles).toHaveLength(1);
    const now = new Date();
    expect(cycles[0].label).toBe(periodFor('monthly', now).label);
    expect(cycles[0].roster.map((r: any) => r.entityId).sort()).toEqual([ALICE, BOB, CAROL].sort());
    expect((await api.summary(eventId, ALICE)).totals.expectedRegularMinor).toBe(3 * RENT);
  });

  it('drops a flatmate who leaves before any money moves, along with their unpaid dues', async () => {
    const eventId = await household([BOB, CAROL]);
    expect((await api.leave(eventId, ALICE, CAROL)).status).toBe(200);
    const s = await api.summary(eventId, ALICE);
    expect(s.cycle.roster.map((r: any) => r.entityId).sort()).toEqual([ALICE, BOB].sort());
    expect(s.totals.expectedRegularMinor).toBe(2 * RENT);
    expect(await api.cycles(eventId, ALICE)).toHaveLength(1);
  });

  it('carries a month-end surplus forward per flatmate, with no money moving', async () => {
    const eventId = await household([BOB, CAROL]);
    for (const m of [ALICE, BOB, CAROL]) await api.payIn(eventId, ALICE, m);
    await api.spend(eventId, ALICE, 40000, { title: 'Rent' });

    const res = await api.closeCycle(eventId, ALICE);
    expect(res.status).toBe(200);
    const { closed, next, settlementIds } = res.body.data;
    expect(settlementIds).toEqual([]);
    expect(store.all('settlements')).toHaveLength(0);
    expect(closed).toMatchObject({ status: 'closed', closeReason: 'scheduled' });
    expect(closed.reconciliation).toMatchObject({ disposition: 'carry_forward', closingBalanceMinor: 500000, outcome: 'surplus' });

    expect(next.sequence).toBe(2);
    expect(next.openingBalanceMinor).toBe(500000);
    expect(sum(next.openingCredits)).toBe(500000);
    for (const v of Object.values(next.openingCredits) as number[]) expect(Math.abs(v - 166667)).toBeLessThanOrEqual(1);
    expect(next.label).toBe(periodFor('monthly', new Date(Date.parse(closed.endDate) + 1)).label);

    // The new month starts with fresh dues, and the carried balance is spendable.
    const s = await api.summary(eventId, ALICE);
    expect(s.cycle.id).toBe(next.id);
    expect(s.totals).toMatchObject({ expectedRegularMinor: 3 * RENT, balanceMinor: 500000 });
    expect((await api.event(eventId, ALICE)).status).toBe('active');
  });

  it('records the custodian as covering a month-end deficit and carries who owes whom', async () => {
    const eventId = await household([BOB]);
    await api.payIn(eventId, ALICE, ALICE);
    await api.payIn(eventId, ALICE, BOB);
    await api.spend(eventId, ALICE, 35000); // ₹5,000 over, within the ₹6,000 tolerance

    const { closed, next } = (await api.closeCycle(eventId, ALICE)).body.data;
    expect(closed.reconciliation).toMatchObject({ outcome: 'deficit', preCoverBalanceMinor: -500000, overdraftCoverMinor: 500000, closingBalanceMinor: 0 });
    const cover = store.all('poolContributions').find((c: any) => c.kind === 'overdraft_cover');
    expect(cover).toMatchObject({ fromUserId: ALICE, receivedMinor: 500000, cycleId: closed.id });
    expect(next.openingBalanceMinor).toBe(0);
    expect(next.openingCredits).toEqual({ [`user:${ALICE}`]: 250000, [`user:${BOB}`]: -250000 });
  });

  it('lets someone else be recorded as having covered the deficit', async () => {
    const eventId = await household([BOB]);
    await api.payIn(eventId, ALICE, ALICE);
    await api.payIn(eventId, ALICE, BOB);
    await api.spend(eventId, ALICE, 35000);
    const res = await api.closeCycle(eventId, ALICE, { cover: [{ entityId: BOB, entityType: 'user', amountMinor: 500000 }] });
    expect(res.status).toBe(200);
    expect(res.body.data.next.openingCredits).toEqual({ [`user:${ALICE}`]: -250000, [`user:${BOB}`]: 250000 });
  });

  it('carries an unpaid member\'s share as arrears they can pay off next month', async () => {
    const eventId = await household([BOB, DEV]);
    await api.payIn(eventId, ALICE, ALICE);
    await api.payIn(eventId, ALICE, BOB);
    await api.spend(eventId, ALICE, 30000);
    const { next } = (await api.closeCycle(eventId, ALICE)).body.data;
    expect(next.openingCredits).toEqual({ [`user:${ALICE}`]: 500000, [`user:${BOB}`]: 500000, [`user:${DEV}`]: -1000000 });

    const topUp = (await api.topUp(eventId, DEV, { amountMinor: 1000000, note: 'Last month' })).body.data;
    await api.markPaid(topUp.id, DEV);
    await api.confirm(topUp.id, ALICE);
    const preview = (await api.previewClose(eventId, ALICE)).body.data;
    expect(preview.entityShares.find((e: any) => e.entityId === DEV).netMinor).toBe(0);
  });

  it('rolls the cycle when someone joins after money has moved, without double-charging the month', async () => {
    const eventId = await household([BOB]);
    await api.payIn(eventId, ALICE, ALICE);
    await api.payIn(eventId, ALICE, BOB);
    await api.spend(eventId, ALICE, 20000);
    await api.join(eventId, ALICE, CAROL);

    const cycles = await api.cycles(eventId, ALICE);
    expect(cycles).toHaveLength(2);
    expect(cycles[0]).toMatchObject({ status: 'closed', closeReason: 'membership_change' });
    expect(cycles[1].label).toMatch(/\(from \d{1,2} [A-Z][a-z]{2}\)$/);
    expect(cycles[1].endDate).toBe(cycles[0].endDate);
    expect(cycles[1].roster.map((r: any) => r.entityId).sort()).toEqual([ALICE, BOB, CAROL].sort());
    expect(cycles[1].openingBalanceMinor).toBe(1000000);
    const s = await api.summary(eventId, ALICE);
    expect(s.totals.expectedRegularMinor).toBe(0); // this month's money is already in
  });

  it('pays out a flatmate who leaves in credit and carries everyone else', async () => {
    const eventId = await household([BOB, CAROL]);
    for (const m of [ALICE, BOB, CAROL]) await api.payIn(eventId, ALICE, m);
    await api.spend(eventId, ALICE, 40000);
    expect((await api.leave(eventId, ALICE, CAROL)).status).toBe(200);

    const exits = store.all('settlements').filter((s: any) => s.kind === 'pool_member_exit');
    expect(exits).toHaveLength(1);
    expect(exits[0]).toMatchObject({ fromUserId: ALICE, toUserId: CAROL, status: 'pending' });
    expect(Math.abs(exits[0].amount - 1666.67)).toBeLessThan(0.02);

    const [, next] = await api.cycles(eventId, ALICE);
    expect(next.roster.map((r: any) => r.entityId).sort()).toEqual([ALICE, BOB].sort());
    expect(next.openingCredits[`user:${CAROL}`]).toBeUndefined();
    expect(next.openingBalanceMinor).toBe(sum(next.openingCredits));

    // Paying the exit leg neither locks nor settles the household.
    await api.payLeg(exits[0].id, ALICE);
    await api.confirmLeg(exits[0].id, CAROL);
    expect((await api.event(eventId, ALICE)).status).toBe('active');
  });

  it('will not let the custodian leave', async () => {
    const eventId = await household([BOB]);
    await request(app).put(`/api/pools/event/${eventId}/config`).set(auth(ALICE)).send({ custodianUserId: BOB });
    const res = await api.leave(eventId, BOB, BOB);
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('POOL_CUSTODIAN_LEAVING');
  });

  it('refuses to close a cycle with draws awaiting approval', async () => {
    const eventId = await household([BOB], { expenseApproval: 'always' });
    await api.payIn(eventId, ALICE, ALICE);
    expect((await api.spend(eventId, BOB, 100)).body.data.poolDraw.status).toBe('pending');
    const res = await api.closeCycle(eventId, ALICE);
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('POOL_PENDING_DRAWS');
  });

  it('only lets the custodian or an admin close a cycle', async () => {
    const eventId = await household([BOB]);
    expect((await api.closeCycle(eventId, BOB)).status).toBe(403);
    expect((await api.previewClose(eventId, BOB)).status).toBe(403);
  });

  it('freezes everything in a closed cycle', async () => {
    const eventId = await household([BOB, DEV]);
    await api.payIn(eventId, ALICE, ALICE);
    const exp = (await api.spend(eventId, ALICE, 1000)).body.data;
    const devDues = await api.contributionOf(eventId, ALICE, DEV);
    await api.closeCycle(eventId, ALICE);

    const edit = await request(app).put(`/api/expenses/${exp.id}`).set(auth(ALICE)).send({ title: 'Rewritten' });
    expect(edit.status).toBe(409);
    expect(edit.body.code).toBe('POOL_CYCLE_CLOSED');
    expect((await request(app).delete(`/api/expenses/${exp.id}`).set(auth(ALICE))).status).toBe(409);
    expect((await api.markPaid(devDues.id, DEV)).status).toBe(409);
  });

  it('keeps past cycles readable', async () => {
    const eventId = await household([BOB]);
    await api.payIn(eventId, ALICE, ALICE);
    await api.spend(eventId, ALICE, 2500, { title: 'Electricity' });
    const { closed } = (await api.closeCycle(eventId, ALICE)).body.data;
    const past = (await request(app).get(`/api/pools/event/${eventId}/ledger?cycleId=${closed.id}`).set(auth(BOB))).body.data;
    expect(past.summary.cycle.status).toBe('closed');
    expect(past.entries.map((e: any) => e.title)).toContain('Electricity');
    expect(past.cycles).toHaveLength(2);
  });

  it('pays out every month instead of carrying when the fund refunds surpluses', async () => {
    const eventId = await household([BOB], { surplusPolicy: 'refund_pro_rata' });
    await api.payIn(eventId, ALICE, ALICE);
    await api.payIn(eventId, ALICE, BOB);
    await api.spend(eventId, ALICE, 20000);
    const { closed, next, settlementIds } = (await api.closeCycle(eventId, ALICE)).body.data;
    expect(closed.reconciliation.disposition).toBe('settle');
    expect(settlementIds).toHaveLength(1);
    expect(store.get('settlements', settlementIds[0])).toMatchObject({ kind: 'pool_cycle', fromUserId: ALICE, toUserId: BOB, amount: 5000 });
    expect(next).toMatchObject({ openingBalanceMinor: 0, openingCredits: {} });
  });

  it('cannot close a cycle that is being settled up', async () => {
    const eventId = await household([BOB]);
    await api.payIn(eventId, ALICE, ALICE);
    await api.payIn(eventId, ALICE, BOB);
    await api.spend(eventId, ALICE, 10000);
    await api.dissolve(eventId, ALICE);
    const res = await api.closeCycle(eventId, ALICE);
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('POOL_CYCLE_NOT_OPEN');
  });

  it('settles carried credits and the current month together when the household dissolves', async () => {
    const eventId = await household([BOB]);
    await api.payIn(eventId, ALICE, ALICE);
    await api.payIn(eventId, ALICE, BOB);
    await api.spend(eventId, ALICE, 20000); // ₹10,000 carried, ₹5,000 each
    await api.closeCycle(eventId, ALICE);
    await api.payIn(eventId, ALICE, ALICE); // Bob skips month 2
    await api.spend(eventId, ALICE, 5000);
    // Month 2: opening ₹10,000 + ₹15,000 in − ₹5,000 out = ₹20,000 held by Alice.
    // Fair shares ₹2,500 each ⇒ Alice +5,000+15,000−2,500, Bob +5,000−2,500.
    await api.dissolve(eventId, ALICE);
    const legs = await api.settlements(eventId, ALICE);
    expect(legs).toHaveLength(1);
    expect(legs[0]).toMatchObject({ fromUserId: ALICE, toUserId: BOB, amount: 2500 });
  });
});

describe('UC-4 club treasury', () => {
  it('adds a new member to the roster without rolling the cycle', async () => {
    const eventId = await api.createPool(ALICE, { preset: 'club_treasury', defaultContributionMinor: 50000 });
    await api.payIn(eventId, ALICE, ALICE);
    await api.join(eventId, ALICE, BOB);
    expect(await api.cycles(eventId, ALICE)).toHaveLength(1);
    const ledger = await api.ledger(eventId, ALICE);
    expect(ledger.summary.cycle.roster).toHaveLength(2);
    expect(ledger.contributions.find((c: any) => c.fromUserId === BOB)).toMatchObject({ expectedMinor: 50000, status: 'pending' });
  });

  it('keeps tiered dues and a leaver on the roster; spending is shared by tier', async () => {
    const eventId = await api.createPool(ALICE, { preset: 'club_treasury' });
    await api.join(eventId, ALICE, BOB);
    await api.join(eventId, ALICE, CAROL);
    await api.setContributions(eventId, ALICE, [
      { entityId: ALICE, entityType: 'user', expectedMinor: 200000 }, // patron
      { entityId: BOB, entityType: 'user', expectedMinor: 50000 },    // full
      { entityId: CAROL, entityType: 'user', expectedMinor: 20000 },  // student
    ]);
    for (const m of [ALICE, BOB, CAROL]) await api.payIn(eventId, ALICE, m);
    await api.spend(eventId, ALICE, 3000);
    await api.leave(eventId, ALICE, CAROL);
    const preview = (await api.previewClose(eventId, ALICE)).body.data;
    const share = (id: string) => preview.entityShares.find((e: any) => e.entityId === id).fairShareMinor;
    expect(share(ALICE) + share(BOB) + share(CAROL)).toBe(300000);
    expect(share(ALICE)).toBeGreaterThan(share(BOB));
    expect(share(BOB)).toBeGreaterThan(share(CAROL));
    expect(preview.disposition).toBe('carry_forward');
  });
});
