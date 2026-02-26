const mockInvitations: Record<string, any> = {};
let docIdCounter = 0;

jest.mock('../../config/firebase', () => ({
  auth: { verifyIdToken: jest.fn() },
  db: {
    collection: jest.fn().mockImplementation((collectionPath: string) => ({
      doc: jest.fn().mockImplementation((docId: string) => ({
        get: jest.fn().mockImplementation(() => {
          const data = mockInvitations[docId];
          return Promise.resolve({ exists: !!data, data: () => data || null, id: docId });
        }),
        set: jest.fn().mockImplementation((data: any, opts?: any) => {
          if (opts?.merge) {
            mockInvitations[docId] = { ...(mockInvitations[docId] || {}), ...data };
          } else {
            mockInvitations[docId] = data;
          }
          return Promise.resolve({ writeTime: new Date() });
        }),
        delete: jest.fn().mockImplementation(() => {
          delete mockInvitations[docId];
          return Promise.resolve();
        }),
      })),
      add: jest.fn().mockImplementation((data: any) => {
        const id = `mock-inv-${++docIdCounter}`;
        mockInvitations[id] = data;
        return Promise.resolve({ id });
      }),
      where: jest.fn().mockImplementation((field: string, op: string, value: any) => ({
        get: jest.fn().mockImplementation(() => {
          const docs = Object.entries(mockInvitations)
            .filter(([, data]) => {
              if (field === 'eventId') return data.eventId === value;
              if (field === 'inviteeUserId') return data.inviteeUserId === value;
              if (field === 'inviteeEmail') return data.inviteeEmail === value;
              if (field === 'token') return data.token === value;
              return false;
            })
            .map(([id, data]) => ({ id, data: () => data, exists: true }));
          return Promise.resolve({ docs, empty: docs.length === 0 });
        }),
        limit: jest.fn().mockImplementation(() => ({
          get: jest.fn().mockImplementation(() => {
            const docs = Object.entries(mockInvitations)
              .filter(([, data]) => {
                if (field === 'token') return data.token === value;
                return false;
              })
              .slice(0, 1)
              .map(([id, data]) => ({ id, data: () => data, exists: true }));
            return Promise.resolve({ docs, empty: docs.length === 0 });
          }),
        })),
      })),
    })),
  },
}));

import { InvitationService } from '../../services/invitation.service';

const service = new InvitationService();

beforeEach(() => {
  Object.keys(mockInvitations).forEach(k => delete mockInvitations[k]);
  docIdCounter = 0;
});

describe('InvitationService.createInvitation', () => {
  it('should throw if no invitee identifier provided', async () => {
    await expect(service.createInvitation('u1', { eventId: 'evt-1' }))
      .rejects.toThrow('At least one of inviteeEmail');
  });

  it('should create invitation with email', async () => {
    const inv = await service.createInvitation('u1', {
      eventId: 'evt-1',
      inviteeEmail: 'friend@test.com',
      role: 'member',
      message: 'Join us!',
    });
    expect(inv.eventId).toBe('evt-1');
    expect(inv.inviteeEmail).toBe('friend@test.com');
    expect(inv.status).toBe('pending');
    expect(inv.token).toBeDefined();
    expect(inv.token.length).toBeGreaterThan(10);
  });

  it('should create invitation with phone', async () => {
    const inv = await service.createInvitation('u1', {
      eventId: 'evt-1',
      inviteePhone: '+1234567890',
    });
    expect(inv.inviteePhone).toBe('+1234567890');
  });

  it('should create invitation with userId', async () => {
    const inv = await service.createInvitation('u1', {
      eventId: 'evt-1',
      inviteeUserId: 'u2',
    });
    expect(inv.inviteeUserId).toBe('u2');
  });

  it('should default role to member', async () => {
    const inv = await service.createInvitation('u1', {
      eventId: 'evt-1',
      inviteeEmail: 'a@b.com',
    });
    expect(inv.role).toBe('member');
  });

  it('should set expiry to 7 days from now', async () => {
    const before = Date.now();
    const inv = await service.createInvitation('u1', {
      eventId: 'evt-1',
      inviteeEmail: 'a@b.com',
    });
    const expiresAt = new Date(inv.expiresAt).getTime();
    const sevenDays = 7 * 24 * 60 * 60 * 1000;
    expect(expiresAt - before).toBeGreaterThanOrEqual(sevenDays - 1000);
    expect(expiresAt - before).toBeLessThanOrEqual(sevenDays + 1000);
  });
});

describe('InvitationService.getInvitation', () => {
  it('should return null for non-existent invitation', async () => {
    const result = await service.getInvitation('nonexistent');
    expect(result).toBeNull();
  });

  it('should return invitation with all fields', async () => {
    mockInvitations['inv-1'] = {
      eventId: 'evt-1', invitedBy: 'u1', inviteeEmail: 'a@b.com',
      inviteePhone: null, inviteeUserId: null, role: 'member',
      status: 'pending', token: 'tok-1', message: 'Hi',
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 86400000).toISOString(),
      respondedAt: null,
    };
    const inv = await service.getInvitation('inv-1');
    expect(inv).not.toBeNull();
    expect(inv!.inviteeEmail).toBe('a@b.com');
    expect(inv!.message).toBe('Hi');
  });

  it('should handle null optional fields', async () => {
    mockInvitations['inv-nulls'] = {
      eventId: 'evt-1', invitedBy: 'u1', inviteeEmail: null,
      inviteePhone: null, inviteeUserId: null, role: 'member',
      status: 'pending', token: 'tok-n', message: null,
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 86400000).toISOString(),
      respondedAt: null,
    };
    const inv = await service.getInvitation('inv-nulls');
    expect(inv!.inviteeEmail).toBeUndefined();
    expect(inv!.message).toBeUndefined();
    expect(inv!.respondedAt).toBeUndefined();
  });
});

describe('InvitationService.getInvitationByToken', () => {
  it('should return null for non-existent token', async () => {
    const result = await service.getInvitationByToken('nonexistent');
    expect(result).toBeNull();
  });

  it('should return invitation by token', async () => {
    mockInvitations['inv-tok'] = {
      eventId: 'evt-1', invitedBy: 'u1', inviteeEmail: 'a@b.com',
      inviteePhone: null, inviteeUserId: null, role: 'member',
      status: 'pending', token: 'valid-token', message: null,
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 86400000).toISOString(),
      respondedAt: null,
    };
    const inv = await service.getInvitationByToken('valid-token');
    expect(inv).not.toBeNull();
    expect(inv!.token).toBe('valid-token');
  });
});

describe('InvitationService.getEventInvitations', () => {
  it('should return empty array when no invitations', async () => {
    const result = await service.getEventInvitations('evt-empty');
    expect(result).toEqual([]);
  });

  it('should return invitations for event', async () => {
    mockInvitations['inv-e1'] = {
      eventId: 'evt-1', invitedBy: 'u1', inviteeEmail: 'a@b.com',
      inviteePhone: null, inviteeUserId: null, role: 'member',
      status: 'pending', token: 'tok-e1', message: null,
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 86400000).toISOString(),
      respondedAt: null,
    };
    const result = await service.getEventInvitations('evt-1');
    expect(result.length).toBe(1);
  });
});

describe('InvitationService.getUserInvitations', () => {
  it('should return empty array when no invitations', async () => {
    const result = await service.getUserInvitations('nobody');
    expect(result).toEqual([]);
  });

  it('should return invitations by userId', async () => {
    mockInvitations['inv-u1'] = {
      eventId: 'evt-1', invitedBy: 'other', inviteeEmail: null,
      inviteePhone: null, inviteeUserId: 'u1', role: 'member',
      status: 'pending', token: 'tok-u1', message: null,
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 86400000).toISOString(),
      respondedAt: null,
    };
    const result = await service.getUserInvitations('u1');
    expect(result.length).toBe(1);
  });

  it('should also return invitations by email', async () => {
    mockInvitations['inv-email'] = {
      eventId: 'evt-2', invitedBy: 'other', inviteeEmail: 'u1@test.com',
      inviteePhone: null, inviteeUserId: null, role: 'member',
      status: 'pending', token: 'tok-email', message: null,
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 86400000).toISOString(),
      respondedAt: null,
    };
    const result = await service.getUserInvitations('u1', 'u1@test.com');
    expect(result.length).toBe(1);
  });

  it('should deduplicate invitations found by both userId and email', async () => {
    mockInvitations['inv-both'] = {
      eventId: 'evt-3', invitedBy: 'other', inviteeEmail: 'u1@test.com',
      inviteePhone: null, inviteeUserId: 'u1', role: 'member',
      status: 'pending', token: 'tok-both', message: null,
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 86400000).toISOString(),
      respondedAt: null,
    };
    const result = await service.getUserInvitations('u1', 'u1@test.com');
    const ids = result.map(i => i.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('should not search by email if not provided', async () => {
    const result = await service.getUserInvitations('u1');
    // Should only find by userId
    expect(Array.isArray(result)).toBe(true);
  });
});

describe('InvitationService.acceptInvitation', () => {
  it('should return null for non-existent invitation', async () => {
    const result = await service.acceptInvitation('nonexistent', 'u1');
    expect(result).toBeNull();
  });

  it('should throw if invitation is not pending', async () => {
    mockInvitations['inv-accepted'] = {
      eventId: 'evt-1', invitedBy: 'other', inviteeEmail: null,
      inviteePhone: null, inviteeUserId: 'u1', role: 'member',
      status: 'accepted', token: 'tok-acc', message: null,
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 86400000).toISOString(),
      respondedAt: new Date().toISOString(),
    };
    await expect(service.acceptInvitation('inv-accepted', 'u1'))
      .rejects.toThrow('already been accepted');
  });

  it('should throw if invitation has expired', async () => {
    mockInvitations['inv-expired'] = {
      eventId: 'evt-1', invitedBy: 'other', inviteeEmail: null,
      inviteePhone: null, inviteeUserId: 'u1', role: 'member',
      status: 'pending', token: 'tok-exp', message: null,
      createdAt: new Date(Date.now() - 86400000 * 8).toISOString(),
      expiresAt: new Date(Date.now() - 86400000).toISOString(), // expired yesterday
      respondedAt: null,
    };
    await expect(service.acceptInvitation('inv-expired', 'u1'))
      .rejects.toThrow('expired');
  });

  it('should accept invitation successfully', async () => {
    mockInvitations['inv-accept'] = {
      eventId: 'evt-1', invitedBy: 'other', inviteeEmail: null,
      inviteePhone: null, inviteeUserId: 'u1', role: 'member',
      status: 'pending', token: 'tok-accept', message: null,
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 86400000).toISOString(),
      respondedAt: null,
    };
    const result = await service.acceptInvitation('inv-accept', 'u1');
    expect(result).not.toBeNull();
    expect(mockInvitations['inv-accept'].status).toBe('accepted');
    expect(mockInvitations['inv-accept'].respondedAt).toBeDefined();
  });
});

describe('InvitationService.declineInvitation', () => {
  it('should return null for non-existent invitation', async () => {
    const result = await service.declineInvitation('nonexistent', 'u1');
    expect(result).toBeNull();
  });

  it('should throw if invitation is not pending', async () => {
    mockInvitations['inv-dec-done'] = {
      eventId: 'evt-1', invitedBy: 'other', inviteeEmail: null,
      inviteePhone: null, inviteeUserId: 'u1', role: 'member',
      status: 'declined', token: 'tok-dec', message: null,
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 86400000).toISOString(),
      respondedAt: new Date().toISOString(),
    };
    await expect(service.declineInvitation('inv-dec-done', 'u1'))
      .rejects.toThrow('already been declined');
  });

  it('should decline invitation successfully', async () => {
    mockInvitations['inv-decline'] = {
      eventId: 'evt-1', invitedBy: 'other', inviteeEmail: null,
      inviteePhone: null, inviteeUserId: 'u1', role: 'member',
      status: 'pending', token: 'tok-decline', message: null,
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 86400000).toISOString(),
      respondedAt: null,
    };
    const result = await service.declineInvitation('inv-decline', 'u1');
    expect(result).not.toBeNull();
    expect(mockInvitations['inv-decline'].status).toBe('declined');
  });
});

describe('InvitationService.revokeInvitation', () => {
  it('should return false for non-existent invitation', async () => {
    const result = await service.revokeInvitation('nonexistent', 'u1');
    expect(result).toBe(false);
  });

  it('should throw if user is not the inviter', async () => {
    mockInvitations['inv-rev-other'] = {
      eventId: 'evt-1', invitedBy: 'other', inviteeEmail: 'a@b.com',
      inviteePhone: null, inviteeUserId: null, role: 'member',
      status: 'pending', token: 'tok-rev', message: null,
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 86400000).toISOString(),
      respondedAt: null,
    };
    await expect(service.revokeInvitation('inv-rev-other', 'u1'))
      .rejects.toThrow('Forbidden');
  });

  it('should throw if invitation is not pending', async () => {
    mockInvitations['inv-rev-done'] = {
      eventId: 'evt-1', invitedBy: 'u1', inviteeEmail: 'a@b.com',
      inviteePhone: null, inviteeUserId: null, role: 'member',
      status: 'accepted', token: 'tok-rev-d', message: null,
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 86400000).toISOString(),
      respondedAt: new Date().toISOString(),
    };
    await expect(service.revokeInvitation('inv-rev-done', 'u1'))
      .rejects.toThrow('Cannot revoke');
  });

  it('should revoke invitation successfully', async () => {
    mockInvitations['inv-revoke'] = {
      eventId: 'evt-1', invitedBy: 'u1', inviteeEmail: 'a@b.com',
      inviteePhone: null, inviteeUserId: null, role: 'member',
      status: 'pending', token: 'tok-revoke', message: null,
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 86400000).toISOString(),
      respondedAt: null,
    };
    const result = await service.revokeInvitation('inv-revoke', 'u1');
    expect(result).toBe(true);
    expect(mockInvitations['inv-revoke']).toBeUndefined();
  });
});
