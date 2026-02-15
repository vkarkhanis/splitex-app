const mockEvents: Record<string, any> = {};
const mockParticipants: Record<string, Record<string, any>> = {};
const mockSettlements: Record<string, any> = {};
let docIdCounter = 0;
let settlementIdCounter = 0;

const makeBatch = () => {
  const ops: Array<() => void> = [];
  return {
    update: jest.fn().mockImplementation((ref: any, data: any) => {
      ops.push(() => { if (ref._update) ref._update(data); });
    }),
    delete: jest.fn().mockImplementation((ref: any) => {
      ops.push(() => { if (ref._delete) ref._delete(); });
    }),
    commit: jest.fn().mockImplementation(() => {
      ops.forEach(op => op());
      return Promise.resolve();
    }),
  };
};

jest.mock('../../config/firebase', () => ({
  auth: { verifyIdToken: jest.fn() },
  db: {
    batch: jest.fn().mockImplementation(() => makeBatch()),
    collection: jest.fn().mockImplementation((collectionPath: string) => {
      if (collectionPath === 'settlements') {
        return {
          where: jest.fn().mockImplementation((field: string, op: string, value: any) => ({
            where: jest.fn().mockImplementation((field2: string, op2: string, value2: any) => ({
              get: jest.fn().mockImplementation(() => {
                const docs = Object.entries(mockSettlements)
                  .filter(([, s]) => s.eventId === value && s.status === value2)
                  .map(([id, data]) => ({
                    id,
                    data: () => data,
                    ref: {
                      _update: (d: any) => { mockSettlements[id] = { ...mockSettlements[id], ...d }; },
                    },
                  }));
                return Promise.resolve({ docs, empty: docs.length === 0 });
              }),
            })),
            get: jest.fn().mockImplementation(() => {
              return Promise.resolve({ docs: [], empty: true });
            }),
          })),
        };
      }
      return {
        doc: jest.fn().mockImplementation((docId: string) => ({
          get: jest.fn().mockImplementation(() => {
            if (collectionPath === 'events') {
              const data = mockEvents[docId];
              return Promise.resolve({ exists: !!data, data: () => data || null, id: docId });
            }
            return Promise.resolve({ exists: false, data: () => null, id: docId });
          }),
          set: jest.fn().mockImplementation((data: any, opts?: any) => {
            if (collectionPath === 'events') {
              if (opts?.merge) {
                mockEvents[docId] = { ...(mockEvents[docId] || {}), ...data };
              } else {
                mockEvents[docId] = data;
              }
            }
            return Promise.resolve({ writeTime: new Date() });
          }),
          delete: jest.fn().mockImplementation(() => {
            if (collectionPath === 'events') delete mockEvents[docId];
            return Promise.resolve();
          }),
          collection: jest.fn().mockImplementation(() => ({
            doc: jest.fn().mockImplementation((subDocId: string) => ({
              get: jest.fn().mockImplementation(() => {
                const key = `${docId}/${subDocId}`;
                const data = mockParticipants[key];
                return Promise.resolve({ exists: !!data, data: () => data || null, id: subDocId });
              }),
              set: jest.fn().mockImplementation((data: any) => {
                mockParticipants[`${docId}/${subDocId}`] = data;
                return Promise.resolve();
              }),
              delete: jest.fn().mockImplementation(() => {
                delete mockParticipants[`${docId}/${subDocId}`];
                return Promise.resolve();
              }),
            })),
            get: jest.fn().mockImplementation(() => {
              const docs = Object.entries(mockParticipants)
                .filter(([key]) => key.startsWith(`${docId}/`))
                .map(([key, data]) => ({
                  id: key.split('/')[1],
                  data: () => data,
                  exists: true,
                  ref: {
                    _delete: () => { delete mockParticipants[key]; },
                  },
                }));
              return Promise.resolve({ docs, empty: docs.length === 0 });
            }),
          })),
        })),
        add: jest.fn().mockImplementation((data: any) => {
          const id = `mock-event-${++docIdCounter}`;
          mockEvents[id] = data;
          return Promise.resolve({ id });
        }),
        where: jest.fn().mockImplementation((field: string, op: string, value: any) => ({
          get: jest.fn().mockImplementation(() => {
            const docs = Object.entries(mockEvents)
              .filter(([, data]) => {
                if (field === 'createdBy') return data.createdBy === value;
                if (field === 'admins') return (data.admins || []).includes(value);
                if (field === 'participantIds') return (data.participantIds || []).includes(value);
                return false;
              })
              .map(([id, data]) => ({ id, data: () => data, exists: true }));
            return Promise.resolve({ docs, empty: docs.length === 0 });
          }),
        })),
      };
    }),
  },
}));

import { EventService } from '../../services/event.service';

const service = new EventService();

beforeEach(() => {
  Object.keys(mockEvents).forEach(k => delete mockEvents[k]);
  Object.keys(mockParticipants).forEach(k => delete mockParticipants[k]);
  Object.keys(mockSettlements).forEach(k => delete mockSettlements[k]);
  docIdCounter = 0;
  settlementIdCounter = 0;
});

describe('EventService.createEvent', () => {
  it('should create event and add creator as participant', async () => {
    const event = await service.createEvent('user-1', {
      name: 'Test',
      type: 'trip',
      startDate: new Date('2025-01-01'),
      currency: 'USD',
    });
    expect(event.name).toBe('Test');
    expect(event.status).toBe('active');
    expect(event.createdBy).toBe('user-1');
    expect(event.admins).toContain('user-1');
  });

  it('should handle optional fields', async () => {
    const event = await service.createEvent('user-1', {
      name: 'No Desc',
      type: 'event',
      startDate: new Date('2025-01-01'),
      currency: 'EUR',
      description: 'A description',
      endDate: new Date('2025-01-10'),
    });
    expect(event.description).toBe('A description');
    expect(event.endDate).toBeDefined();
  });
});

describe('EventService.getEvent', () => {
  it('should return null for non-existent event', async () => {
    const result = await service.getEvent('nonexistent');
    expect(result).toBeNull();
  });

  it('should return event with all fields', async () => {
    mockEvents['evt-1'] = {
      name: 'Test', type: 'trip', startDate: '2025-01-01', endDate: '2025-01-10',
      currency: 'USD', status: 'active', createdBy: 'u1', admins: ['u1'],
      createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    };
    const event = await service.getEvent('evt-1');
    expect(event).not.toBeNull();
    expect(event!.name).toBe('Test');
    expect(event!.endDate).toBeDefined();
  });

  it('should handle event without endDate', async () => {
    mockEvents['evt-noend'] = {
      name: 'No End', type: 'event', startDate: '2025-01-01',
      currency: 'USD', status: 'active', createdBy: 'u1', admins: ['u1'],
      createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    };
    const event = await service.getEvent('evt-noend');
    expect(event!.endDate).toBeUndefined();
  });

  it('should handle event without admins array', async () => {
    mockEvents['evt-noadmins'] = {
      name: 'No Admins', type: 'event', startDate: '2025-01-01',
      currency: 'USD', status: 'active', createdBy: 'u1',
      createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    };
    const event = await service.getEvent('evt-noadmins');
    expect(event!.admins).toEqual([]);
  });
});

describe('EventService.getUserEvents', () => {
  it('should return empty array when no events', async () => {
    const events = await service.getUserEvents('nobody');
    expect(events).toEqual([]);
  });

  it('should return events created by user', async () => {
    mockEvents['evt-u1'] = {
      name: 'My Event', type: 'event', startDate: '2025-01-01',
      currency: 'USD', status: 'active', createdBy: 'user-1', admins: ['user-1'],
      createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    };
    const events = await service.getUserEvents('user-1');
    expect(events.length).toBe(1);
    expect(events[0].name).toBe('My Event');
  });

  it('should deduplicate events where user is both creator and admin', async () => {
    mockEvents['evt-dup'] = {
      name: 'Dup Event', type: 'event', startDate: '2025-01-01',
      currency: 'USD', status: 'active', createdBy: 'user-1', admins: ['user-1'],
      createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    };
    const events = await service.getUserEvents('user-1');
    // Should not have duplicates
    const ids = events.map(e => e.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('should include events where user is admin but not creator', async () => {
    mockEvents['evt-admin-only'] = {
      name: 'Admin Only', type: 'event', startDate: '2025-01-01',
      currency: 'USD', status: 'active', createdBy: 'other-user', admins: ['other-user', 'user-1'],
      createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    };
    const events = await service.getUserEvents('user-1');
    expect(events.some(e => e.name === 'Admin Only')).toBe(true);
  });
});

describe('EventService.updateEvent', () => {
  it('should return null for non-existent event', async () => {
    const result = await service.updateEvent('nonexistent', 'u1', { name: 'Updated' });
    expect(result).toBeNull();
  });

  it('should throw Forbidden if user is not admin', async () => {
    mockEvents['evt-forbidden'] = {
      name: 'Forbidden', type: 'event', startDate: '2025-01-01',
      currency: 'USD', status: 'active', createdBy: 'other', admins: ['other'],
      createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    };
    await expect(service.updateEvent('evt-forbidden', 'user-1', { name: 'Hacked' }))
      .rejects.toThrow('Forbidden');
  });

  it('should update all provided fields', async () => {
    mockEvents['evt-update'] = {
      name: 'Original', type: 'event', startDate: '2025-01-01', description: 'Old',
      currency: 'USD', status: 'active', createdBy: 'u1', admins: ['u1'],
      createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    };
    const result = await service.updateEvent('evt-update', 'u1', {
      name: 'Updated', description: 'New', type: 'trip', startDate: new Date('2025-06-01'),
      endDate: new Date('2025-06-10'), currency: 'EUR', status: 'settled',
    });
    expect(result).not.toBeNull();
    expect(result!.name).toBe('Updated');
  });
});

describe('EventService.deleteEvent', () => {
  it('should return false for non-existent event', async () => {
    const result = await service.deleteEvent('nonexistent', 'u1');
    expect(result).toBe(false);
  });

  it('should throw Forbidden if user is not creator', async () => {
    mockEvents['evt-del-forbidden'] = {
      name: 'No Delete', type: 'event', startDate: '2025-01-01',
      currency: 'USD', status: 'active', createdBy: 'other', admins: ['other'],
      createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    };
    await expect(service.deleteEvent('evt-del-forbidden', 'user-1'))
      .rejects.toThrow('Forbidden');
  });

  it('should delete event successfully', async () => {
    mockEvents['evt-del'] = {
      name: 'Delete Me', type: 'event', startDate: '2025-01-01',
      currency: 'USD', status: 'active', createdBy: 'u1', admins: ['u1'],
      createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    };
    const result = await service.deleteEvent('evt-del', 'u1');
    expect(result).toBe(true);
  });
});

describe('EventService.getParticipants', () => {
  it('should return empty array when no participants', async () => {
    const result = await service.getParticipants('evt-empty');
    expect(result).toEqual([]);
  });

  it('should return participants with defaults for missing fields', async () => {
    mockParticipants['evt-p/u1'] = {
      userId: 'u1', joinedAt: new Date().toISOString(), invitedBy: 'u1',
    };
    const result = await service.getParticipants('evt-p');
    expect(result.length).toBe(1);
    expect(result[0].role).toBe('member'); // default
    expect(result[0].status).toBe('accepted'); // default
  });

  it('should return participant with groupId', async () => {
    mockParticipants['evt-pg/u2'] = {
      userId: 'u2', groupId: 'g1', role: 'admin',
      joinedAt: new Date().toISOString(), invitedBy: 'u1', status: 'pending',
    };
    const result = await service.getParticipants('evt-pg');
    expect(result[0].groupId).toBe('g1');
  });
});

describe('EventService.addParticipant', () => {
  it('should add participant as member', async () => {
    const result = await service.addParticipant('evt-add', 'u2', 'u1', 'member');
    expect(result.role).toBe('member');
    expect(result.status).toBe('accepted');
  });

  it('should add participant as admin and update admins array', async () => {
    mockEvents['evt-admin-add'] = {
      name: 'Admin Add', type: 'event', startDate: '2025-01-01',
      currency: 'USD', status: 'active', createdBy: 'u1', admins: ['u1'],
      createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    };
    const result = await service.addParticipant('evt-admin-add', 'u2', 'u1', 'admin');
    expect(result.role).toBe('admin');
    expect(mockEvents['evt-admin-add'].admins).toContain('u2');
  });

  it('should not duplicate admin in admins array', async () => {
    mockEvents['evt-admin-dup'] = {
      name: 'Admin Dup', type: 'event', startDate: '2025-01-01',
      currency: 'USD', status: 'active', createdBy: 'u1', admins: ['u1', 'u2'],
      createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    };
    await service.addParticipant('evt-admin-dup', 'u2', 'u1', 'admin');
    // Should not have duplicated u2
    const admins = mockEvents['evt-admin-dup'].admins;
    expect(admins.filter((a: string) => a === 'u2').length).toBe(1);
  });
});

describe('EventService.removeParticipant', () => {
  it('should return false for non-existent event', async () => {
    const result = await service.removeParticipant('nonexistent', 'u2', 'u1');
    expect(result).toBe(false);
  });

  it('should throw Forbidden if requester is not admin and not self', async () => {
    mockEvents['evt-rm-forbid'] = {
      name: 'Forbid', type: 'event', startDate: '2025-01-01',
      currency: 'USD', status: 'active', createdBy: 'other', admins: ['other'],
      createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    };
    await expect(service.removeParticipant('evt-rm-forbid', 'u2', 'u1'))
      .rejects.toThrow('Forbidden');
  });

  it('should throw when trying to remove creator', async () => {
    mockEvents['evt-rm-creator'] = {
      name: 'Creator', type: 'event', startDate: '2025-01-01',
      currency: 'USD', status: 'active', createdBy: 'u1', admins: ['u1'],
      createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    };
    await expect(service.removeParticipant('evt-rm-creator', 'u1', 'u1'))
      .rejects.toThrow('Cannot remove the event creator');
  });

  it('should remove participant and update admins array', async () => {
    mockEvents['evt-rm-admin'] = {
      name: 'Remove Admin', type: 'event', startDate: '2025-01-01',
      currency: 'USD', status: 'active', createdBy: 'u1', admins: ['u1', 'u2'],
      createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    };
    mockParticipants['evt-rm-admin/u2'] = { userId: 'u2', role: 'admin' };
    const result = await service.removeParticipant('evt-rm-admin', 'u2', 'u1');
    expect(result).toBe(true);
    expect(mockEvents['evt-rm-admin'].admins).not.toContain('u2');
  });

  it('should allow user to remove themselves', async () => {
    mockEvents['evt-rm-self'] = {
      name: 'Self Remove', type: 'event', startDate: '2025-01-01',
      currency: 'USD', status: 'active', createdBy: 'other', admins: ['other'],
      createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    };
    mockParticipants['evt-rm-self/u1'] = { userId: 'u1', role: 'member' };
    const result = await service.removeParticipant('evt-rm-self', 'u1', 'u1');
    expect(result).toBe(true);
  });
});

describe('EventService.isParticipant', () => {
  it('should return false when not a participant', async () => {
    const result = await service.isParticipant('evt-1', 'nobody');
    expect(result).toBe(false);
  });

  it('should return true when participant exists', async () => {
    mockParticipants['evt-isp/u1'] = { userId: 'u1', role: 'member' };
    const result = await service.isParticipant('evt-isp', 'u1');
    expect(result).toBe(true);
  });
});

describe('EventService.isAdmin', () => {
  it('should return false for non-existent event', async () => {
    const result = await service.isAdmin('nonexistent', 'u1');
    expect(result).toBe(false);
  });

  it('should return true for creator', async () => {
    mockEvents['evt-isadmin'] = {
      name: 'Admin Check', type: 'event', startDate: '2025-01-01',
      currency: 'USD', status: 'active', createdBy: 'u1', admins: [],
      createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    };
    const result = await service.isAdmin('evt-isadmin', 'u1');
    expect(result).toBe(true);
  });

  it('should return true for admin in admins array', async () => {
    mockEvents['evt-isadmin2'] = {
      name: 'Admin Check 2', type: 'event', startDate: '2025-01-01',
      currency: 'USD', status: 'active', createdBy: 'other', admins: ['other', 'u1'],
      createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    };
    const result = await service.isAdmin('evt-isadmin2', 'u1');
    expect(result).toBe(true);
  });

  it('should return false for non-admin', async () => {
    mockEvents['evt-notadmin'] = {
      name: 'Not Admin', type: 'event', startDate: '2025-01-01',
      currency: 'USD', status: 'active', createdBy: 'other', admins: ['other'],
      createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    };
    const result = await service.isAdmin('evt-notadmin', 'u1');
    expect(result).toBe(false);
  });
});

describe('EventService.createEvent — participantIds', () => {
  it('should include creator in participantIds', async () => {
    const event = await service.createEvent('user-1', {
      name: 'PID Test', type: 'trip', startDate: new Date('2025-01-01'), currency: 'USD',
    });
    const stored = mockEvents[event.id!];
    expect(stored.participantIds).toContain('user-1');
  });
});

describe('EventService.getEvent — participantIds', () => {
  it('should return participantIds from event doc', async () => {
    mockEvents['evt-pid'] = {
      name: 'PID', type: 'event', startDate: '2025-01-01',
      currency: 'USD', status: 'active', createdBy: 'u1', admins: ['u1'],
      participantIds: ['u1', 'u2'],
      createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    };
    const event = await service.getEvent('evt-pid');
    expect((event as any).participantIds).toEqual(['u1', 'u2']);
  });

  it('should default participantIds to empty array when missing', async () => {
    mockEvents['evt-nopid'] = {
      name: 'No PID', type: 'event', startDate: '2025-01-01',
      currency: 'USD', status: 'active', createdBy: 'u1', admins: ['u1'],
      createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    };
    const event = await service.getEvent('evt-nopid');
    expect((event as any).participantIds).toEqual([]);
  });
});

describe('EventService.getUserEvents — participantIds query', () => {
  it('should find events via participantIds', async () => {
    mockEvents['evt-member'] = {
      name: 'Member Event', type: 'event', startDate: '2025-01-01',
      currency: 'USD', status: 'active', createdBy: 'admin-user', admins: ['admin-user'],
      participantIds: ['admin-user', 'member-user'],
      createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    };
    const events = await service.getUserEvents('member-user');
    expect(events.length).toBe(1);
    expect(events[0].name).toBe('Member Event');
  });

  it('should deduplicate across participantIds, createdBy, and admins', async () => {
    mockEvents['evt-all'] = {
      name: 'All Queries', type: 'event', startDate: '2025-01-01',
      currency: 'USD', status: 'active', createdBy: 'u1', admins: ['u1'],
      participantIds: ['u1'],
      createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    };
    const events = await service.getUserEvents('u1');
    const ids = events.map(e => e.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('EventService.deleteEvent — admin permissions', () => {
  it('should allow admin (not creator) to delete', async () => {
    mockEvents['evt-admin-del'] = {
      name: 'Admin Delete', type: 'event', startDate: '2025-01-01',
      currency: 'USD', status: 'active', createdBy: 'creator', admins: ['creator', 'admin-user'],
      createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    };
    const result = await service.deleteEvent('evt-admin-del', 'admin-user');
    expect(result).toBe(true);
    expect(mockEvents['evt-admin-del']).toBeUndefined();
  });

  it('should throw Forbidden for non-admin non-creator', async () => {
    mockEvents['evt-no-perm'] = {
      name: 'No Perm', type: 'event', startDate: '2025-01-01',
      currency: 'USD', status: 'active', createdBy: 'creator', admins: ['creator'],
      createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    };
    await expect(service.deleteEvent('evt-no-perm', 'random-user'))
      .rejects.toThrow('Forbidden');
  });

  it('should terminate pending settlements on delete', async () => {
    mockEvents['evt-settle'] = {
      name: 'Settle Event', type: 'event', startDate: '2025-01-01',
      currency: 'USD', status: 'active', createdBy: 'u1', admins: ['u1'],
      createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    };
    mockSettlements['s1'] = { eventId: 'evt-settle', status: 'pending', amount: 50 };
    mockSettlements['s2'] = { eventId: 'evt-settle', status: 'completed', amount: 30 };

    await service.deleteEvent('evt-settle', 'u1');
    expect(mockSettlements['s1'].status).toBe('terminated');
    expect(mockSettlements['s1'].terminatedReason).toBe('Event deleted');
    // Completed settlement should not be changed
    expect(mockSettlements['s2'].status).toBe('completed');
  });

  it('should clean up participants subcollection on delete', async () => {
    mockEvents['evt-cleanup'] = {
      name: 'Cleanup', type: 'event', startDate: '2025-01-01',
      currency: 'USD', status: 'active', createdBy: 'u1', admins: ['u1'],
      createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    };
    mockParticipants['evt-cleanup/u1'] = { userId: 'u1', role: 'admin' };
    mockParticipants['evt-cleanup/u2'] = { userId: 'u2', role: 'member' };

    await service.deleteEvent('evt-cleanup', 'u1');
    expect(mockParticipants['evt-cleanup/u1']).toBeUndefined();
    expect(mockParticipants['evt-cleanup/u2']).toBeUndefined();
  });
});

describe('EventService.backfillParticipantIds', () => {
  it('should rebuild participantIds from subcollection', async () => {
    mockEvents['evt-backfill'] = {
      name: 'Backfill', type: 'event', startDate: '2025-01-01',
      currency: 'USD', status: 'active', createdBy: 'u1', admins: ['u1'],
      createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    };
    mockParticipants['evt-backfill/u1'] = { userId: 'u1', role: 'admin' };
    mockParticipants['evt-backfill/u2'] = { userId: 'u2', role: 'member' };

    const ids = await service.backfillParticipantIds('evt-backfill');
    expect(ids).toContain('u1');
    expect(ids).toContain('u2');
    expect(mockEvents['evt-backfill'].participantIds).toEqual(expect.arrayContaining(['u1', 'u2']));
  });

  it('should handle event with no participants', async () => {
    mockEvents['evt-empty-bf'] = {
      name: 'Empty BF', type: 'event', startDate: '2025-01-01',
      currency: 'USD', status: 'active', createdBy: 'u1', admins: ['u1'],
      createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    };
    const ids = await service.backfillParticipantIds('evt-empty-bf');
    expect(ids).toEqual([]);
  });
});

describe('EventService.addParticipant — participantIds update', () => {
  it('should add userId to participantIds', async () => {
    mockEvents['evt-add-pid'] = {
      name: 'Add PID', type: 'event', startDate: '2025-01-01',
      currency: 'USD', status: 'active', createdBy: 'u1', admins: ['u1'],
      participantIds: ['u1'],
      createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    };
    await service.addParticipant('evt-add-pid', 'u2', 'u1', 'member');
    expect(mockEvents['evt-add-pid'].participantIds).toContain('u2');
  });

  it('should backfill participantIds when array is empty', async () => {
    mockEvents['evt-add-empty'] = {
      name: 'Add Empty', type: 'event', startDate: '2025-01-01',
      currency: 'USD', status: 'active', createdBy: 'u1', admins: ['u1'],
      createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    };
    // Existing participant in subcollection but no participantIds on event doc
    mockParticipants['evt-add-empty/u1'] = { userId: 'u1', role: 'admin' };

    await service.addParticipant('evt-add-empty', 'u2', 'u1', 'member');
    expect(mockEvents['evt-add-empty'].participantIds).toContain('u1');
    expect(mockEvents['evt-add-empty'].participantIds).toContain('u2');
  });

  it('should not duplicate userId in participantIds', async () => {
    mockEvents['evt-add-dup'] = {
      name: 'Add Dup', type: 'event', startDate: '2025-01-01',
      currency: 'USD', status: 'active', createdBy: 'u1', admins: ['u1'],
      participantIds: ['u1', 'u2'],
      createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    };
    await service.addParticipant('evt-add-dup', 'u2', 'u1', 'member');
    const pids = mockEvents['evt-add-dup'].participantIds;
    expect(pids.filter((id: string) => id === 'u2').length).toBe(1);
  });
});

describe('EventService.removeParticipant — participantIds update', () => {
  it('should remove userId from participantIds', async () => {
    mockEvents['evt-rm-pid'] = {
      name: 'Rm PID', type: 'event', startDate: '2025-01-01',
      currency: 'USD', status: 'active', createdBy: 'u1', admins: ['u1'],
      participantIds: ['u1', 'u2'],
      createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    };
    mockParticipants['evt-rm-pid/u2'] = { userId: 'u2', role: 'member' };
    await service.removeParticipant('evt-rm-pid', 'u2', 'u1');
    expect(mockEvents['evt-rm-pid'].participantIds).not.toContain('u2');
  });
});
