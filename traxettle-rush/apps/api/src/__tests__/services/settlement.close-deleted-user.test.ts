jest.mock('../../config/firebase', () => {
  const { createMemoryFirestore } = require('../helpers/memoryFirestore');
  const store = createMemoryFirestore();
  return { __store: store, db: store.db, auth: { deleteUser: async () => undefined }, storage: {}, firebaseApp: { options: {} } };
});

import { SettlementService } from '../../services/settlement.service';
import { AccountDeletionService } from '../../services/account-deletion.service';

const { __store: store } = require('../../config/firebase');
const service = new SettlementService();

/** Carol (admin), Bob and Alice share a trip in its payment stage; Alice has deleted her account. */
function seed(opts: { aliceDeleted?: boolean; extraPendingLeg?: boolean } = {}) {
  store.seed('events', 'trip', { name: 'Trip', createdBy: 'carol', admins: ['carol'], participantIds: ['carol', 'bob', 'alice'], status: 'payment' });
  store.seed('events/trip/participants', 'carol', { role: 'admin', status: 'accepted' });
  store.seed('events/trip/participants', 'bob', { role: 'member', status: 'accepted' });
  store.seed('events/trip/participants', 'alice', opts.aliceDeleted === false
    ? { role: 'member', status: 'accepted' }
    : { role: 'member', status: 'accepted', displayName: 'Deleted user', deleted: true });
  const leg = (id: string, from: string, to: string, status: string) =>
    store.seed('settlements', id, {
      eventId: 'trip', fromEntityId: from, fromEntityType: 'user', fromUserId: from,
      toEntityId: to, toEntityType: 'user', toUserId: to, amount: 40, currency: 'USD', status, auditTrail: [],
    });
  leg('alice-owes-bob', 'alice', 'bob', 'pending');
  leg('bob-paid-alice', 'bob', 'alice', 'initiated');
  if (opts.extraPendingLeg) leg('bob-owes-carol', 'bob', 'carol', 'pending');
}

describe('SettlementService.closeForDeletedUser', () => {
  beforeEach(() => store.reset());

  it('lets an admin write off what a deleted account owed', async () => {
    seed();
    await service.closeForDeletedUser('alice-owes-bob', 'carol', 'written_off');

    const leg = store.get('settlements', 'alice-owes-bob');
    expect(leg.status).toBe('completed');
    expect(leg.closedForDeletedUser).toEqual({ outcome: 'written_off', by: 'carol', at: expect.any(String) });
    expect(leg.auditTrail.at(-1)).toEqual(expect.objectContaining({
      action: 'closed_by_admin', actorUserId: 'carol', statusFrom: 'pending', statusTo: 'completed',
      note: expect.stringContaining('written off'),
    }));
  });

  it('lets an admin confirm a payment a deleted account can no longer confirm, and settles the event', async () => {
    seed();
    await service.closeForDeletedUser('alice-owes-bob', 'carol', 'written_off');
    const { allComplete } = await service.closeForDeletedUser('bob-paid-alice', 'carol', 'paid', 'Bob showed the transfer');

    expect(allComplete).toBe(true);
    expect(store.get('settlements', 'bob-paid-alice')).toEqual(expect.objectContaining({
      status: 'completed', closedForDeletedUser: expect.objectContaining({ outcome: 'paid' }),
    }));
    expect(store.get('settlements', 'bob-paid-alice').auditTrail.at(-1).note).toBe('Bob showed the transfer');
    expect(store.get('events', 'trip').status).toBe('settled');
  });

  it("doesn't settle the event while other payments are still open", async () => {
    seed({ extraPendingLeg: true });
    const { allComplete } = await service.closeForDeletedUser('alice-owes-bob', 'carol', 'written_off');

    expect(allComplete).toBe(false);
    expect(store.get('events', 'trip').status).toBe('payment');
  });

  it('reports closed payments with how they were closed', async () => {
    seed();
    await service.closeForDeletedUser('alice-owes-bob', 'carol', 'written_off');

    const legs = await service.getEventSettlements('trip');
    expect(legs.find((l) => l.id === 'alice-owes-bob')?.closedForDeletedUser?.outcome).toBe('written_off');
    expect(legs.find((l) => l.id === 'bob-paid-alice')?.closedForDeletedUser).toBeUndefined();
  });

  it('refuses anyone but an event admin', async () => {
    seed();
    await expect(service.closeForDeletedUser('alice-owes-bob', 'bob', 'written_off')).rejects.toThrow('Forbidden');
    expect(store.get('settlements', 'alice-owes-bob').status).toBe('pending');
  });

  it('refuses a payment where nobody deleted their account', async () => {
    seed({ aliceDeleted: false });
    await expect(service.closeForDeletedUser('alice-owes-bob', 'carol', 'paid')).rejects.toThrow('deleted their account');
  });

  it('refuses a payment that is already done, and an unknown outcome', async () => {
    seed();
    await service.closeForDeletedUser('alice-owes-bob', 'carol', 'paid');
    await expect(service.closeForDeletedUser('alice-owes-bob', 'carol', 'written_off')).rejects.toThrow('already completed');
    await expect(service.closeForDeletedUser('bob-paid-alice', 'carol', 'forgiven' as any)).rejects.toThrow("'paid' or 'written_off'");
  });

  it('works end to end after AccountDeletionService anonymises the account', async () => {
    seed({ aliceDeleted: false });
    store.seed('users', 'alice', { email: 'alice@example.com' });
    await new AccountDeletionService().deleteAccount('alice');

    await expect(service.closeForDeletedUser('alice-owes-bob', 'carol', 'written_off')).resolves.toBeDefined();
    expect(store.get('settlements', 'alice-owes-bob').status).toBe('completed');
  });
});
