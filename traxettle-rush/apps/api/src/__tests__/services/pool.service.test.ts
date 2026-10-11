/**
 * PoolService edge cases: groups as contributors, guard rails, error paths and
 * settlement-integration hooks, exercised directly against a memory Firestore.
 */
jest.mock('../../config/firebase', () => {
  const { createMemoryFirestore } = require('../helpers/memoryFirestore');
  const store = createMemoryFirestore();
  return { __store: store, db: store.db, auth: {}, storage: {}, firebaseApp: { options: {} } };
});

import { buildPoolConfig } from '@traxettle/shared';
import { PoolError, PoolService } from '../../services/pool.service';
import { SettlementService } from '../../services/settlement.service';

const { __store: store } = require('../../config/firebase');
const service = new PoolService();
const settlements = new SettlementService();
const planner = settlements.calculateSettlementPlan.bind(settlements);

const ALICE = 'alice';
const BOB = 'bob';
const CAROL = 'carol';

function seedEvent(id: string, opts: { preset?: any; members?: string[]; status?: string; fundingModel?: string; extra?: Record<string, any>; withParticipantIds?: boolean; config?: Record<string, any> } = {}) {
  const members = opts.members ?? [ALICE];
  const poolConfig = opts.preset ? { ...buildPoolConfig(opts.preset, ALICE, { defaultContributionMinor: 100000 }), ...(opts.config || {}) } : undefined;
  store.seed('events', id, {
    name: id,
    currency: 'INR',
    status: opts.status ?? 'active',
    createdBy: ALICE,
    admins: [ALICE],
    ...(opts.withParticipantIds === false ? {} : { participantIds: members }),
    ...(poolConfig ? { fundingModel: opts.fundingModel ?? 'pool', poolConfig } : {}),
    ...(opts.extra || {}),
  });
  for (const m of members) store.seed(`events/${id}/participants`, m, { userId: m, role: m === ALICE ? 'admin' : 'member', status: 'accepted' });
}

async function expectPoolError(promise: Promise<unknown>, status: number, code?: string) {
  await expect(promise).rejects.toBeInstanceOf(PoolError);
  await promise.catch((err: PoolError) => {
    expect(err.statusCode).toBe(status);
    if (code) expect(err.code).toBe(code);
  });
}

beforeEach(() => store.reset());

describe('groups as contributing entities', () => {
  it('builds the roster from groups and bills a group through its designated payer', async () => {
    seedEvent('e1', { preset: 'trip_kitty', members: [ALICE, BOB, CAROL] });
    store.seed('groups', 'couple', { eventId: 'e1', eventIds: ['e1'], name: 'Couple', members: [BOB, CAROL], payerUserId: CAROL, representative: BOB });
    await service.openFirstCycle('e1', ALICE);
    const cycle = await service.getCurrentCycle('e1');
    expect(cycle.roster).toEqual([{ entityType: 'group', entityId: 'couple' }, { entityType: 'user', entityId: ALICE }]);
    const contributions = await service.listContributions(cycle.id);
    expect(contributions.find((c) => c.fromEntityId === 'couple')).toMatchObject({ fromEntityType: 'group', fromUserId: CAROL });
  });

  it('maps consumption splits on group members to the group', async () => {
    seedEvent('e1', { preset: 'trip_kitty', members: [ALICE, BOB, CAROL], config: { deficitPolicy: 'collect_by_consumption' } });
    store.seed('groups', 'couple', { eventId: 'e1', name: 'Couple', members: [BOB, CAROL], payerUserId: BOB });
    const cycle = await service.openFirstCycle('e1', ALICE);
    store.seed('expenses', 'x1', {
      eventId: 'e1', title: 'Dinner', amount: 3000, currency: 'INR', paidBy: ALICE, fundingSource: 'pool', poolCycleId: cycle.id,
      poolDraw: { status: 'approved' },
      splits: [{ entityType: 'user', entityId: BOB, amount: 1000 }, { entityType: 'user', entityId: ALICE, amount: 2000 }],
    });
    const preview = await service.previewClose('e1', ALICE);
    expect(preview.shareBasis).toBe('consumption');
    expect(preview.entityShares.find((e) => e.entityId === 'couple')!.fairShareMinor).toBe(100000);
    expect(preview.entityShares.find((e) => e.entityId === ALICE)!.fairShareMinor).toBe(200000);
  });
});

describe('guard rails', () => {
  it('refuses pool changes once the event is in payment', async () => {
    seedEvent('e1', { preset: 'trip_kitty' });
    await service.openFirstCycle('e1', ALICE);
    store.seed('events', 'e1', { ...store.get('events', 'e1'), status: 'payment' });
    await expectPoolError(service.setContributions('e1', ALICE, [{ entityId: ALICE, entityType: 'user', expectedMinor: 1 }]), 403);
    await expectPoolError(service.addTopUp('e1', ALICE, { amountMinor: 1 }), 403);
    await expectPoolError(service.updateConfig('e1', ALICE, { overdraftTolerancePercent: 5 }), 403);
  });

  it('needs a target amount for a target collection', () => {
    expect(() => service.buildConfigForNewEvent(ALICE, { preset: 'target_collection' })).toThrow('target amount');
  });

  it('adds a newly named entity to the roster when amounts are set', async () => {
    seedEvent('e1', { preset: 'trip_kitty', members: [ALICE, BOB] });
    const cycle = await service.openFirstCycle('e1', ALICE);
    await service.setContributions('e1', ALICE, [{ entityId: 'guest', entityType: 'user', expectedMinor: 5000 }]);
    const updated = await service.getCycle(cycle.id);
    expect(updated!.roster.map((r) => r.entityId)).toContain('guest');
  });

  it('refuses double confirmation, double payment claims and double waivers', async () => {
    seedEvent('e1', { preset: 'trip_kitty', members: [ALICE, BOB] });
    const cycle = await service.openFirstCycle('e1', ALICE);
    // Re-setting an unchanged amount is harmless (it only adds an audit entry).
    await service.setContributions('e1', ALICE, [{ entityId: BOB, entityType: 'user', expectedMinor: 100000 }]);
    const bob = (await service.listContributions(cycle.id)).find((c) => c.fromUserId === BOB)!;
    await service.markContributionPaid(bob.id, BOB, {});
    await service.confirmContribution(bob.id, ALICE);
    await expectPoolError(service.markContributionPaid(bob.id, BOB, {}), 409);
    await expectPoolError(service.confirmContribution(bob.id, ALICE), 409);
    await expectPoolError(service.waiveContribution(bob.id, ALICE), 409);

    const alice = (await service.listContributions(cycle.id)).find((c) => c.fromUserId === ALICE)!;
    await service.waiveContribution(alice.id, ALICE);
    await expectPoolError(service.waiveContribution(alice.id, ALICE), 409);
  });

  it('rejects zero amounts and returns a partly-paid rejection to partial', async () => {
    seedEvent('e1', { preset: 'trip_kitty', members: [ALICE, BOB] });
    const cycle = await service.openFirstCycle('e1', ALICE);
    const c = (await service.listContributions(cycle.id)).find((x) => x.fromUserId === BOB)!;
    await expectPoolError(service.markContributionPaid(c.id, BOB, { amountMinor: 0 }), 400);
    await service.markContributionPaid(c.id, BOB, { amountMinor: 40000 });
    await service.confirmContribution(c.id, ALICE);
    await service.markContributionPaid(c.id, BOB, { amountMinor: 10000 });
    const rejected = await service.rejectContribution(c.id, ALICE, 'Not seen');
    expect(rejected).toMatchObject({ status: 'partial', receivedMinor: 40000 });
    await expectPoolError(service.confirmContribution(c.id, ALICE, { receivedMinor: 0 }), 400);
  });

  it('confirms the custodian\'s own payment immediately — the money is already in their hands', async () => {
    seedEvent('e1', { preset: 'trip_kitty' });
    const cycle = await service.openFirstCycle('e1', ALICE);
    const c = (await service.listContributions(cycle.id))[0];
    const partial = await service.markContributionPaid(c.id, ALICE, { amountMinor: 40000, reference: 'cash' });
    expect(partial).toMatchObject({ status: 'partial', receivedMinor: 40000 });
    expect(partial.auditTrail.map((a) => a.action)).toEqual(['created', 'marked_paid', 'partially_confirmed']);
    const full = await service.markContributionPaid(c.id, ALICE, {});
    expect(full).toMatchObject({ status: 'confirmed', receivedMinor: 100000 });
    expect((await service.getSummary('e1')).totals.balanceMinor).toBe(100000);
  });

  it('lets a manager record a top-up on someone else\'s behalf', async () => {
    seedEvent('e1', { preset: 'trip_kitty', members: [ALICE, BOB] });
    await service.openFirstCycle('e1', ALICE);
    const topUp = await service.addTopUp('e1', ALICE, { amountMinor: 2500, entityId: BOB, entityType: 'user' });
    expect(topUp).toMatchObject({ fromUserId: BOB, status: 'pending' });
  });

  it('finds a contributor through the participants subcollection on older events', async () => {
    seedEvent('e1', { preset: 'trip_kitty', members: [ALICE, BOB], withParticipantIds: false });
    const cycle = await service.openFirstCycle('e1', ALICE);
    await service.addTopUp('e1', ALICE, { amountMinor: 100000 });
    const prep = await service.prepareDraw('e1', BOB, { amount: 100, currency: 'INR', fundingSource: 'pool' });
    expect(prep).toMatchObject({ poolCycleId: cycle.id, autoApproved: true });
  });

  it('refuses a funding source the event does not allow', async () => {
    seedEvent('e1', { preset: 'trip_kitty' });
    await service.openFirstCycle('e1', ALICE);
    await expectPoolError(service.prepareDraw('e1', ALICE, { amount: 1, currency: 'INR', fundingSource: 'self' }), 400);
  });

  it('refuses to approve an expense that is not a pool draw', async () => {
    seedEvent('e1', { preset: 'trip_kitty' });
    await service.openFirstCycle('e1', ALICE);
    store.seed('expenses', 'x1', { eventId: 'e1', title: 'Dinner', amount: 10, paidBy: ALICE });
    await expectPoolError(service.approveDraw('x1', ALICE), 400);
    await expectPoolError(service.approveDraw('missing', ALICE), 404);
  });

  it('re-evaluates an amount change on a reimbursement claim', async () => {
    seedEvent('e1', { preset: 'trip_kitty', members: [ALICE, BOB] });
    const cycle = await service.openFirstCycle('e1', ALICE);
    await service.addTopUp('e1', ALICE, { amountMinor: 1000000 });
    const claim = { id: 'x1', eventId: 'e1', amount: 1000, fundingSource: 'pool_reimbursement', poolCycleId: cycle.id, paidBy: BOB, poolDraw: { status: 'approved' } };
    store.seed('expenses', 'x1', claim);
    const prep = await service.prepareAmountChange(claim, BOB, 1500);
    expect(prep.poolDraw).toMatchObject({ status: 'approved', alreadyIncurred: true });
  });

  it('reports pending spend per spender in the ledger, biggest spender first', async () => {
    seedEvent('e1', { preset: 'trip_kitty', members: [ALICE, BOB] });
    const cycle = await service.openFirstCycle('e1', ALICE);
    store.seed('expenses', 'a', { eventId: 'e1', title: 'A', amount: 10, paidBy: ALICE, fundingSource: 'pool', poolCycleId: cycle.id, poolDraw: { status: 'approved' } });
    store.seed('expenses', 'b', { eventId: 'e1', title: 'B', amount: 50, paidBy: BOB, fundingSource: 'pool', poolCycleId: cycle.id, poolDraw: { status: 'approved' } });
    store.seed('expenses', 'c', { eventId: 'e1', title: 'C', amount: 7, paidBy: BOB, fundingSource: 'pool', poolCycleId: cycle.id, poolDraw: { status: 'pending' } });
    const ledger = await service.getLedger('e1');
    expect(ledger.spenders).toEqual([
      { spenderId: BOB, spenderType: 'user', spentMinor: 5000, pendingMinor: 700, capMinor: null },
      { spenderId: ALICE, spenderType: 'user', spentMinor: 1000, pendingMinor: 0, capMinor: null },
    ]);
  });

  it('answers 404 for a cycle from another event', async () => {
    seedEvent('e1', { preset: 'trip_kitty' });
    seedEvent('e2', { preset: 'trip_kitty' });
    await service.openFirstCycle('e1', ALICE);
    const other = await service.openFirstCycle('e2', ALICE);
    await expectPoolError(service.getSummary('e1', other.id), 404);
    await expectPoolError(service.getLedger('e1', other.id), 404);
  });
});

describe('cycle lifecycle edge cases', () => {
  it('reports a pool with no cycles', async () => {
    seedEvent('e1', { preset: 'trip_kitty' });
    await expectPoolError(service.getCurrentCycle('e1'), 404, 'POOL_NO_CYCLE');
  });

  it('can open a follow-on cycle for a one-off pool on request', async () => {
    seedEvent('e1', { preset: 'trip_kitty' });
    await service.openFirstCycle('e1', ALICE);
    const { closed, next } = await service.closeCycle('e1', ALICE, { reason: 'manual', openNext: true }, planner);
    expect(closed.status).toBe('closed');
    expect(next).toMatchObject({ sequence: 2, status: 'open' });
  });

  it('closes a one-off pool without opening another by default', async () => {
    seedEvent('e1', { preset: 'trip_kitty' });
    await service.openFirstCycle('e1', ALICE);
    const { next } = await service.closeCycle('e1', ALICE, { reason: 'manual' }, planner);
    expect(next).toBeNull();
  });
});

describe('membership hooks', () => {
  it('does nothing for split-expenses events, sponsor budgets or pools with no cycle', async () => {
    seedEvent('p2p');
    seedEvent('sponsor', { preset: 'sponsor_budget', config: { targetAmountMinor: 100 } });
    seedEvent('empty', { preset: 'trip_kitty' });
    for (const id of ['p2p', 'sponsor', 'empty']) {
      expect(await service.onMembershipChanged(id, ALICE, { joinedUserIds: [BOB] }, planner)).toEqual({ action: 'none' });
    }
  });

  it('refuses a custodian departure', async () => {
    seedEvent('e1', { preset: 'trip_kitty', members: [ALICE, BOB] });
    await service.openFirstCycle('e1', ALICE);
    await expectPoolError(service.onMembershipChanged('e1', ALICE, { leftUserIds: [ALICE] }, planner), 409, 'POOL_CUSTODIAN_LEAVING');
    await expectPoolError(service.assertCanLeave('e1', ALICE), 409);
    await expect(service.assertCanLeave('e1', BOB)).resolves.toBeUndefined();
    await expect(service.assertCanLeave('missing', BOB)).resolves.toBeUndefined();
  });

  it('falls back to a roster update when a household has undecided draws', async () => {
    seedEvent('e1', { preset: 'household', members: [ALICE, BOB] });
    const cycle = await service.openFirstCycle('e1', ALICE);
    await service.addTopUp('e1', ALICE, { amountMinor: 100000 });
    store.seed('expenses', 'p', { eventId: 'e1', title: 'P', amount: 5, paidBy: BOB, fundingSource: 'pool', poolCycleId: cycle.id, poolDraw: { status: 'pending' } });
    store.seed(`events/e1/participants`, CAROL, { userId: CAROL, status: 'accepted' });
    const result = await service.onMembershipChanged('e1', ALICE, { joinedUserIds: [CAROL] }, planner);
    expect(result.action).toBe('roster_updated');
    expect((await service.listCycles('e1'))).toHaveLength(1);
  });
});

describe('settlement integration hooks', () => {
  it('contributes nothing to a plan for split-expenses events or active pools', async () => {
    seedEvent('p2p');
    seedEvent('e1', { preset: 'trip_kitty' });
    await service.openFirstCycle('e1', ALICE);
    expect(await service.computeSettlementBalances('p2p')).toEqual([]);
    expect(await service.computeSettlementBalances('e1')).toEqual([]);
    await expect(service.finalizeOnSettled('p2p')).resolves.toBeUndefined();
    await expect(service.finalizeOnSettled('e1')).resolves.toBeUndefined();
    expect((await service.getCurrentCycle('e1')).status).toBe('open');
  });

  it('refuses to add a pool to an event that is not active', async () => {
    seedEvent('done', { status: 'settled' });
    await expectPoolError(service.convertToHybrid('done', ALICE, { preset: 'trip_kitty' }), 409);
  });

  it('keeps a pool event in payment after regeneration while reimbursements are unpaid', async () => {
    seedEvent('e1', { preset: 'sponsor_budget', members: [ALICE, BOB], config: { targetAmountMinor: 1000000, authorizedSpenders: [BOB] } });
    const cycle = await service.openFirstCycle('e1', ALICE);
    store.seed('expenses', 'claim', { eventId: 'e1', title: 'Claim', amount: 100, paidBy: BOB, fundingSource: 'pool_reimbursement', poolCycleId: cycle.id, poolDraw: { status: 'approved', settlementId: 'leg' } });
    store.seed('settlements', 'leg', { eventId: 'e1', kind: 'pool_reimbursement', fromUserId: ALICE, toUserId: BOB, amount: 100, status: 'pending' });
    await service.beginDissolution('e1', ALICE);
    store.seed('events', 'e1', { ...store.get('events', 'e1'), status: 'review' });
    await settlements.regenerateSettlement('e1', ALICE);
    expect(store.get('events', 'e1').status).toBe('payment');
    expect(store.get('settlements', 'leg')).toMatchObject({ kind: 'pool_reimbursement', status: 'pending' }); // kept, not wiped
  });
});
