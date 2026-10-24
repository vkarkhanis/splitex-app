const mockDeleteUser = jest.fn();

jest.mock('../../config/firebase', () => {
  const { createMemoryFirestore } = require('../helpers/memoryFirestore');
  const store = createMemoryFirestore();
  return {
    __store: store,
    db: store.db,
    auth: { deleteUser: (uid: string) => mockDeleteUser(uid) },
    storage: {},
    firebaseApp: { options: {} },
  };
});

import { AccountDeletionService } from '../../services/account-deletion.service';
import { EventService } from '../../services/event.service';

const { __store: store } = require('../../config/firebase');

const ALICE = 'alice';
const service = new AccountDeletionService();

/** Alice (being deleted) has a solo event, a trip she created with Bob and Carol, an event in review, and a pool. */
function seed() {
  store.seed('users', ALICE, { displayName: 'Alice', email: 'Alice@Example.com' });
  store.seed('users/alice/sessions', 's1', { createdAt: '2026-10-01' });
  store.seed('users', 'bob', { displayName: 'Bob', email: 'bob@example.com' });
  store.seed('users', 'carol', { displayName: 'Carol', email: 'carol@example.com' });

  // Solo: only Alice joined (Dave is still a pending invitee).
  store.seed('events', 'solo', { name: 'Solo', createdBy: ALICE, admins: [ALICE], participantIds: [ALICE], status: 'active' });
  store.seed('events/solo/participants', ALICE, { role: 'admin', status: 'accepted', joinedAt: '2026-01-01' });
  store.seed('events/solo/participants', 'dave', { role: 'member', status: 'pending', joinedAt: '2026-01-05' });
  store.seed('expenses', 'e-solo', { eventId: 'solo', paidBy: ALICE, amount: 50 });
  store.seed('settlements', 's-solo', { eventId: 'solo', fromUserId: ALICE, toUserId: ALICE });
  store.seed('invitations', 'inv-solo', { eventId: 'solo', invitedBy: ALICE, inviteeEmail: 'dave@example.com', status: 'pending' });
  store.seed('poolCycles', 'c-solo', { eventId: 'solo' });
  store.seed('poolContributions', 'pc-solo', { eventId: 'solo' });
  store.seed('groups', 'g-solo', { eventId: 'solo', members: [ALICE], representative: ALICE, payerUserId: ALICE });

  // Trip Alice created and administers; Carol joined before Bob.
  store.seed('events', 'trip', { name: 'Trip', createdBy: ALICE, admins: [ALICE], participantIds: [ALICE, 'bob', 'carol'], status: 'active' });
  store.seed('events/trip/participants', ALICE, { role: 'admin', status: 'accepted', joinedAt: '2026-01-01', email: 'alice@example.com', displayName: 'Alice', invitedBy: ALICE });
  store.seed('events/trip/participants', 'bob', { role: 'member', status: 'accepted', joinedAt: '2026-01-03', invitedBy: ALICE });
  store.seed('events/trip/participants', 'carol', { role: 'member', status: 'accepted', joinedAt: '2026-01-02', invitedBy: ALICE });
  store.seed('expenses', 'e-trip-alice', { eventId: 'trip', paidBy: ALICE, amount: 120 });
  store.seed('expenses', 'e-trip-bob', { eventId: 'trip', paidBy: 'bob', amount: 30 });
  store.seed('settlements', 's-trip', { eventId: 'trip', fromUserId: 'bob', toUserId: ALICE, status: 'pending' });
  store.seed('groups', 'g-trip', { eventId: 'trip', members: [ALICE, 'bob'], representative: ALICE, payerUserId: ALICE });
  store.seed('groups', 'g-trip-alone', { eventId: 'trip', members: [ALICE], representative: ALICE, payerUserId: ALICE });
  store.seed('invitations', 'inv-sent', { eventId: 'trip', invitedBy: ALICE, inviteeEmail: 'erin@example.com', status: 'pending' });

  // Bob's event, in review, waiting only on Alice's approval.
  store.seed('events', 'review', {
    name: 'Review', createdBy: 'bob', admins: ['bob', ALICE], participantIds: ['bob', ALICE], status: 'review',
    settlementApprovals: { bob: { approved: true, entityType: 'user' }, [ALICE]: { approved: false, entityType: 'user' } },
  });
  store.seed('events/review/participants', 'bob', { role: 'admin', status: 'accepted', joinedAt: '2026-02-01' });
  store.seed('events/review/participants', ALICE, { role: 'admin', status: 'accepted', joinedAt: '2026-02-02' });

  // A pool Alice can spend from and is custodian of.
  store.seed('events', 'pool', {
    name: 'Pool', createdBy: 'bob', admins: ['bob'], participantIds: ['bob', ALICE, 'carol'], status: 'active',
    poolConfig: { custodianUserId: ALICE, authorizedSpenders: [ALICE, 'carol'] },
  });
  store.seed('events/pool/participants', 'bob', { role: 'admin', status: 'accepted', joinedAt: '2026-03-01' });
  store.seed('events/pool/participants', ALICE, { role: 'member', status: 'accepted', joinedAt: '2026-03-02' });
  store.seed('events/pool/participants', 'carol', { role: 'member', status: 'accepted', joinedAt: '2026-03-03' });

  // Invitations addressed to Alice.
  store.seed('invitations', 'inv-to-alice', { eventId: 'elsewhere', invitedBy: 'bob', inviteeUserId: ALICE, status: 'pending' });
  store.seed('invitations', 'inv-to-email', { eventId: 'elsewhere', invitedBy: 'bob', inviteeEmail: 'alice@example.com', status: 'pending' });
}

describe('AccountDeletionService', () => {
  beforeEach(() => {
    store.reset();
    mockDeleteUser.mockReset();
    mockDeleteUser.mockResolvedValue(undefined);
  });

  it('deletes the Firebase sign-in account, the profile and its sessions', async () => {
    seed();
    await service.deleteAccount(ALICE);

    expect(mockDeleteUser).toHaveBeenCalledWith(ALICE);
    expect(store.get('users', ALICE)).toBeNull();
    expect(store.all('users/alice/sessions')).toEqual([]);
    expect(store.get('users', 'bob')).not.toBeNull();
  });

  it('deletes an event only the user joined, with everything in it', async () => {
    seed();
    const result = await service.deleteAccount(ALICE);

    expect(result.deletedEventIds).toEqual(['solo']);
    expect(store.get('events', 'solo')).toBeNull();
    expect(store.all('events/solo/participants')).toEqual([]);
    for (const [collection, id] of [
      ['expenses', 'e-solo'], ['settlements', 's-solo'], ['invitations', 'inv-solo'],
      ['poolCycles', 'c-solo'], ['poolContributions', 'pc-solo'], ['groups', 'g-solo'],
    ]) {
      expect(store.get(collection, id)).toBeNull();
    }
  });

  it('keeps a shared event for the others, anonymises the user and hands over admin', async () => {
    seed();
    const result = await service.deleteAccount(ALICE);

    expect(result.keptEventIds.sort()).toEqual(['pool', 'review', 'trip']);
    const trip = store.get('events', 'trip');
    expect(trip.admins).toEqual(['carol']); // earliest-joined remaining participant
    expect(trip.createdBy).toBe('carol');
    expect(store.get('events/trip/participants', 'carol').role).toBe('admin');
    expect(store.get('events/trip/participants', ALICE)).toEqual({
      role: 'member', status: 'accepted', joinedAt: '2026-01-01', invitedBy: ALICE,
      displayName: 'Deleted user', deleted: true, deletedAt: expect.any(String),
    });
    // Expenses and payments stay, so everyone's balances stay correct.
    expect(store.get('expenses', 'e-trip-alice')).not.toBeNull();
    expect(store.get('expenses', 'e-trip-bob')).not.toBeNull();
    expect(store.get('settlements', 's-trip')).not.toBeNull();
    // An invitation Alice sent for the trip is still valid.
    expect(store.get('invitations', 'inv-sent')).not.toBeNull();
  });

  it('shows "Deleted user" in the participant list', async () => {
    seed();
    await service.deleteAccount(ALICE);

    const participants = await new EventService().getParticipants('trip');
    const alice = participants.find((p) => p.userId === ALICE);
    expect(alice).toEqual(expect.objectContaining({ displayName: 'Deleted user', deleted: true }));
    expect(alice?.email).toBeUndefined();
    expect(participants.find((p) => p.userId === 'bob')?.displayName).toBe('Bob');
  });

  it('approves a pending settlement review on the deleted account\'s behalf', async () => {
    seed();
    await service.deleteAccount(ALICE);

    const review = store.get('events', 'review');
    expect(review.settlementApprovals[ALICE]).toEqual(expect.objectContaining({ approved: true, approvedOnAccountDeletion: true }));
    expect(review.status).toBe('payment'); // everyone has now approved
    expect(review.admins).toEqual(['bob']);
    expect(review.createdBy).toBe('bob');
  });

  it('removes the user as a pool spender but keeps them as the recorded custodian', async () => {
    seed();
    await service.deleteAccount(ALICE);

    const pool = store.get('events', 'pool').poolConfig;
    expect(pool.authorizedSpenders).toEqual(['carol']);
    expect(pool.custodianUserId).toBe(ALICE);
  });

  it('removes the user from groups and hands over representative and payer', async () => {
    seed();
    await service.deleteAccount(ALICE);

    expect(store.get('groups', 'g-trip')).toEqual(expect.objectContaining({ members: ['bob'], representative: 'bob', payerUserId: 'bob' }));
    // Left empty, but the trip still exists and its expenses may refer to the group.
    expect(store.get('groups', 'g-trip-alone')).toEqual(expect.objectContaining({ members: [] }));
  });

  it('deletes invitations addressed to the user or their email', async () => {
    seed();
    await service.deleteAccount(ALICE);

    expect(store.get('invitations', 'inv-to-alice')).toBeNull();
    expect(store.get('invitations', 'inv-to-email')).toBeNull();
  });

  it('fails, so the app reports an error, when Firebase refuses to delete the sign-in', async () => {
    seed();
    mockDeleteUser.mockRejectedValueOnce(Object.assign(new Error('internal'), { code: 'auth/internal-error' }));

    await expect(service.deleteAccount(ALICE)).rejects.toThrow('internal');

    // A retry completes: every step is safe to repeat.
    await expect(service.deleteAccount(ALICE)).resolves.toEqual({ deletedEventIds: [], keptEventIds: expect.any(Array) });
    expect(mockDeleteUser).toHaveBeenCalledTimes(2);
  });

  it('treats an already-deleted Firebase account as done', async () => {
    seed();
    mockDeleteUser.mockRejectedValueOnce(Object.assign(new Error('gone'), { code: 'auth/user-not-found' }));

    await expect(service.deleteAccount(ALICE)).resolves.toBeDefined();
  });

  it('commits large deletions in batches under the Firestore limit', async () => {
    store.seed('users', ALICE, { email: 'alice@example.com' });
    store.seed('events', 'big', { createdBy: ALICE, admins: [ALICE], participantIds: [ALICE] });
    store.seed('events/big/participants', ALICE, { role: 'admin', status: 'accepted' });
    for (let i = 0; i < 950; i += 1) store.seed('expenses', `e${i}`, { eventId: 'big', paidBy: ALICE });
    const batchSpy = jest.spyOn(store.db, 'batch');

    await service.deleteAccount(ALICE);

    expect(store.all('expenses')).toEqual([]);
    expect(batchSpy.mock.calls.length).toBeGreaterThanOrEqual(3); // ≈953 writes at 400 per batch
    batchSpy.mockRestore();
  });
});
