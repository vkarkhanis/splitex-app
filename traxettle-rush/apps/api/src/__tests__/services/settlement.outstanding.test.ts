jest.mock('../../config/firebase', () => {
  const { createMemoryFirestore } = require('../helpers/memoryFirestore');
  const store = createMemoryFirestore();
  return { __store: store, db: store.db, auth: {}, storage: {}, firebaseApp: { options: {} } };
});

import { SettlementService } from '../../services/settlement.service';

const { __store: store } = require('../../config/firebase');
const service = new SettlementService();

const event = (id: string, status: string, currency = 'INR') =>
  store.seed('events', id, { name: `Event ${id}`, status, currency, createdBy: 'bob', admins: ['bob'], participantIds: ['alice', 'bob'] });
const leg = (id: string, eventId: string, from: string, to: string, amount: number, status: string) =>
  store.seed('settlements', id, { eventId, fromUserId: from, toUserId: to, fromEntityType: 'user', toEntityType: 'user', amount, currency: 'INR', status });

describe('SettlementService.getOutstandingForUser', () => {
  let balances: Record<string, Array<{ entityId: string; entityType: 'user' | 'group'; amount: number }>>;

  beforeEach(() => {
    store.reset();
    balances = {};
    jest.spyOn(service, 'calculateEntityBalances').mockImplementation(async (eventId: string) => balances[eventId] ?? []);
  });

  afterEach(() => jest.restoreAllMocks());

  it('sums open payments in events that are in payment, ignoring completed ones', async () => {
    event('pay', 'payment');
    leg('a1', 'pay', 'alice', 'bob', 400, 'pending');
    leg('a2', 'pay', 'alice', 'bob', 100, 'initiated');
    leg('b1', 'pay', 'bob', 'alice', 75, 'pending');
    leg('done', 'pay', 'alice', 'bob', 999, 'completed');

    expect(await service.getOutstandingForUser('alice')).toEqual([
      { eventId: 'pay', eventName: 'Event pay', currency: 'INR', owes: 500, owed: 75 },
    ]);
  });

  it('uses the current balance in events not yet settled (negative = owes, positive = owed)', async () => {
    event('trip', 'active', 'USD');
    event('flat', 'review');
    balances.trip = [{ entityId: 'alice', entityType: 'user', amount: -42.5 }, { entityId: 'bob', entityType: 'user', amount: 42.5 }];
    balances.flat = [{ entityId: 'alice', entityType: 'user', amount: 300 }];

    const result = await service.getOutstandingForUser('alice');
    expect(result).toEqual(expect.arrayContaining([
      { eventId: 'trip', eventName: 'Event trip', currency: 'USD', owes: 42.5, owed: 0 },
      { eventId: 'flat', eventName: 'Event flat', currency: 'INR', owes: 0, owed: 300 },
    ]));
    expect(result).toHaveLength(2);
  });

  it("uses the group's balance when the user is in a group", async () => {
    event('trip', 'active');
    store.seed('groups', 'couple', { eventId: 'trip', eventIds: ['trip'], members: ['alice', 'carol'], representative: 'alice', payerUserId: 'alice' });
    balances.trip = [{ entityId: 'couple', entityType: 'group', amount: -120 }];

    expect(await service.getOutstandingForUser('alice')).toEqual([
      { eventId: 'trip', eventName: 'Event trip', currency: 'INR', owes: 120, owed: 0 },
    ]);
  });

  it('skips settled and closed events, and events where nothing is outstanding', async () => {
    event('settled', 'settled');
    event('closed', 'closed');
    event('even', 'active');
    leg('s1', 'settled', 'alice', 'bob', 50, 'pending');
    balances.even = [{ entityId: 'alice', entityType: 'user', amount: 0.004 }];

    expect(await service.getOutstandingForUser('alice')).toEqual([]);
  });
});
