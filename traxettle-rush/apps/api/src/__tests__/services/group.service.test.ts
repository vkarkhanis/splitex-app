import { GroupService } from '../../services/group.service';

const mockGroups: Record<string, any> = {};
let docIdCounter = 0;

jest.mock('../../config/firebase', () => ({
  auth: { verifyIdToken: jest.fn() },
  db: {
    collection: jest.fn().mockImplementation((collectionPath: string) => ({
      doc: jest.fn().mockImplementation((docId: string) => ({
        get: jest.fn().mockImplementation(() => {
          const data = mockGroups[docId];
          return Promise.resolve({ exists: !!data, data: () => data || null, id: docId });
        }),
        set: jest.fn().mockImplementation((data: any, opts?: any) => {
          if (opts?.merge) {
            mockGroups[docId] = { ...(mockGroups[docId] || {}), ...data };
          } else {
            mockGroups[docId] = data;
          }
          return Promise.resolve();
        }),
        delete: jest.fn().mockImplementation(() => {
          delete mockGroups[docId];
          return Promise.resolve();
        }),
      })),
      add: jest.fn().mockImplementation((data: any) => {
        const id = `mock-group-${++docIdCounter}`;
        mockGroups[id] = data;
        return Promise.resolve({ id });
      }),
      where: jest.fn().mockImplementation((field: string, op: string, value: any) => ({
        get: jest.fn().mockImplementation(() => {
          const docs = Object.entries(mockGroups)
            .filter(([, data]) => {
              if (op === '==' && field === 'eventId') return data.eventId === value;
              if (op === '==' && field === 'createdBy') return data.createdBy === value;
              if (op === 'array-contains' && field === 'members') return Array.isArray(data.members) && data.members.includes(value);
              if (op === 'array-contains' && field === 'eventIds') return Array.isArray(data.eventIds) && data.eventIds.includes(value);
              return false;
            })
            .map(([id, data]) => ({ id, data: () => data, exists: true }));
          return Promise.resolve({ docs, empty: docs.length === 0 });
        }),
      })),
    })),
  },
}));

describe('GroupService', () => {
  let service: GroupService;

  beforeEach(() => {
    Object.keys(mockGroups).forEach(k => delete mockGroups[k]);
    docIdCounter = 0;
    service = new GroupService();
  });

  describe('createGroup', () => {
    it('should create a group with explicit representative', async () => {
      const group = await service.createGroup('user-1', {
        eventId: 'evt-1',
        name: 'Family',
        memberIds: ['user-1', 'user-2'],
        payerUserId: 'user-1',
        representative: 'user-2',
      });
      expect(group.name).toBe('Family');
      expect(group.representative).toBe('user-2');
    });

    it('should default representative to first member when not provided', async () => {
      const group = await service.createGroup('user-1', {
        eventId: 'evt-1',
        name: 'Auto Rep',
        memberIds: ['user-A', 'user-B'],
        payerUserId: 'user-A',
      });
      expect(group.representative).toBe('user-A');
    });

    it('should default representative to payerUserId when memberIds is empty', async () => {
      const group = await service.createGroup('user-1', {
        eventId: 'evt-1',
        name: 'Empty Members',
        memberIds: [],
        payerUserId: 'user-1',
      });
      expect(group.representative).toBe('user-1');
    });

    it('should include description when provided', async () => {
      const group = await service.createGroup('user-1', {
        eventId: 'evt-1',
        name: 'Described',
        description: 'A description',
        memberIds: ['user-1'],
        payerUserId: 'user-1',
      });
      expect(group.description).toBe('A description');
    });
  });

  describe('getGroup', () => {
    it('should return null for non-existent group', async () => {
      const result = await service.getGroup('nonexistent');
      expect(result).toBeNull();
    });

    it('should return group with eventIds fallback', async () => {
      mockGroups['grp-no-eventids'] = {
        eventId: 'evt-1',
        name: 'No EventIds',
        createdBy: 'user-1',
        members: ['user-1'],
        payerUserId: 'user-1',
        createdAt: '2024-01-01',
        updatedAt: '2024-01-01',
      };
      const group = await service.getGroup('grp-no-eventids');
      expect(group!.eventIds).toEqual(['evt-1']);
    });

    it('should resolve representative from payerUserId when representative is missing', async () => {
      mockGroups['grp-no-rep'] = {
        eventId: 'evt-1',
        name: 'No Rep',
        createdBy: 'user-1',
        members: ['user-1'],
        payerUserId: 'user-P',
        createdAt: '2024-01-01',
        updatedAt: '2024-01-01',
      };
      const group = await service.getGroup('grp-no-rep');
      expect(group!.representative).toBe('user-P');
    });

    it('should resolve representative from first member when both representative and payerUserId are missing', async () => {
      mockGroups['grp-no-rep-payer'] = {
        eventId: 'evt-1',
        name: 'No Rep Payer',
        createdBy: 'user-1',
        members: ['user-X', 'user-Y'],
        createdAt: '2024-01-01',
        updatedAt: '2024-01-01',
      };
      const group = await service.getGroup('grp-no-rep-payer');
      expect(group!.representative).toBe('user-X');
    });
  });

  describe('getEventGroups', () => {
    it('should return groups matching by eventId', async () => {
      mockGroups['grp-evt'] = {
        eventId: 'evt-1',
        eventIds: ['evt-1'],
        name: 'Event Group',
        createdBy: 'user-1',
        members: ['user-1'],
        payerUserId: 'user-1',
        createdAt: '2024-01-01',
        updatedAt: '2024-01-01',
      };
      const groups = await service.getEventGroups('evt-1');
      expect(groups).toHaveLength(1);
      expect(groups[0].name).toBe('Event Group');
    });

    it('should deduplicate groups found by both eventId and eventIds', async () => {
      // This group matches both eventId == 'evt-1' and eventIds array-contains 'evt-1'
      mockGroups['grp-dedup'] = {
        eventId: 'evt-1',
        eventIds: ['evt-1', 'evt-2'],
        name: 'Dedup Group',
        createdBy: 'user-1',
        members: ['user-1'],
        payerUserId: 'user-1',
        createdAt: '2024-01-01',
        updatedAt: '2024-01-01',
      };
      const groups = await service.getEventGroups('evt-1');
      expect(groups).toHaveLength(1);
    });

    it('should include reusable groups found only via eventIds', async () => {
      // This group's eventId is 'evt-original' but eventIds includes 'evt-reuse'
      mockGroups['grp-reusable'] = {
        eventId: 'evt-original',
        eventIds: ['evt-original', 'evt-reuse'],
        name: 'Reusable Group',
        createdBy: 'user-1',
        members: ['user-1'],
        payerUserId: 'user-1',
        createdAt: '2024-01-01',
        updatedAt: '2024-01-01',
      };
      const groups = await service.getEventGroups('evt-reuse');
      expect(groups).toHaveLength(1);
      expect(groups[0].name).toBe('Reusable Group');
    });

    it('should return empty array when no groups match', async () => {
      const groups = await service.getEventGroups('evt-empty');
      expect(groups).toEqual([]);
    });
  });

  describe('updateGroup', () => {
    it('should return null for non-existent group', async () => {
      const result = await service.updateGroup('nonexistent', 'user-1', { name: 'Updated' });
      expect(result).toBeNull();
    });

    it('should throw if user is not creator, representative, or event admin', async () => {
      mockGroups['grp-noauth'] = {
        eventId: 'evt-1',
        name: 'NoAuth',
        createdBy: 'other-user',
        representative: 'other-user',
        members: ['other-user'],
        payerUserId: 'other-user',
        createdAt: '2024-01-01',
        updatedAt: '2024-01-01',
      };
      await expect(service.updateGroup('grp-noauth', 'random-user', { name: 'Hack' }))
        .rejects.toThrow('Forbidden');
    });

    it('should allow event admin to update', async () => {
      mockGroups['grp-admin-upd'] = {
        eventId: 'evt-1',
        name: 'Admin Update',
        createdBy: 'other-user',
        representative: 'other-user',
        members: ['other-user'],
        payerUserId: 'other-user',
        createdAt: '2024-01-01',
        updatedAt: '2024-01-01',
      };
      const result = await service.updateGroup('grp-admin-upd', 'admin-user', { name: 'Admin Updated' }, true);
      expect(result).not.toBeNull();
    });

    it('should update name, description, memberIds, payerUserId', async () => {
      mockGroups['grp-fields'] = {
        eventId: 'evt-1',
        name: 'Original',
        description: 'Old desc',
        createdBy: 'user-1',
        members: ['user-1'],
        payerUserId: 'user-1',
        createdAt: '2024-01-01',
        updatedAt: '2024-01-01',
      };
      await service.updateGroup('grp-fields', 'user-1', {
        name: 'New Name',
        description: 'New desc',
        memberIds: ['user-1', 'user-2'],
        payerUserId: 'user-2',
      });
      expect(mockGroups['grp-fields'].name).toBe('New Name');
      expect(mockGroups['grp-fields'].description).toBe('New desc');
      expect(mockGroups['grp-fields'].members).toEqual(['user-1', 'user-2']);
      expect(mockGroups['grp-fields'].payerUserId).toBe('user-2');
    });

    it('should update representative when valid member', async () => {
      mockGroups['grp-rep-upd'] = {
        eventId: 'evt-1',
        name: 'Rep Update',
        createdBy: 'user-1',
        members: ['user-1', 'user-2'],
        payerUserId: 'user-1',
        createdAt: '2024-01-01',
        updatedAt: '2024-01-01',
      };
      await service.updateGroup('grp-rep-upd', 'user-1', { representative: 'user-2' });
      expect(mockGroups['grp-rep-upd'].representative).toBe('user-2');
    });

    it('should throw when representative is not a member', async () => {
      mockGroups['grp-rep-invalid'] = {
        eventId: 'evt-1',
        name: 'Invalid Rep',
        createdBy: 'user-1',
        members: ['user-1', 'user-2'],
        payerUserId: 'user-1',
        createdAt: '2024-01-01',
        updatedAt: '2024-01-01',
      };
      await expect(service.updateGroup('grp-rep-invalid', 'user-1', { representative: 'outsider' }))
        .rejects.toThrow('Representative must be a member');
    });

    it('should validate representative against updated memberIds', async () => {
      mockGroups['grp-rep-new-members'] = {
        eventId: 'evt-1',
        name: 'New Members Rep',
        createdBy: 'user-1',
        members: ['user-1', 'user-2'],
        payerUserId: 'user-1',
        createdAt: '2024-01-01',
        updatedAt: '2024-01-01',
      };
      // Updating memberIds to ['user-1', 'user-3'] and setting representative to 'user-3' should work
      await service.updateGroup('grp-rep-new-members', 'user-1', {
        memberIds: ['user-1', 'user-3'],
        representative: 'user-3',
      });
      expect(mockGroups['grp-rep-new-members'].representative).toBe('user-3');
    });
  });

  describe('deleteGroup', () => {
    it('should return false for non-existent group', async () => {
      const result = await service.deleteGroup('nonexistent', 'user-1');
      expect(result).toBe(false);
    });

    it('should throw if user is not creator, representative, or event admin', async () => {
      mockGroups['grp-del-noauth'] = {
        eventId: 'evt-1',
        name: 'NoAuth Del',
        createdBy: 'other-user',
        representative: 'other-user',
        members: ['other-user'],
        payerUserId: 'other-user',
        createdAt: '2024-01-01',
        updatedAt: '2024-01-01',
      };
      await expect(service.deleteGroup('grp-del-noauth', 'random-user'))
        .rejects.toThrow('Forbidden');
    });

    it('should allow event admin to delete', async () => {
      mockGroups['grp-del-admin'] = {
        eventId: 'evt-1',
        name: 'Admin Del',
        createdBy: 'other-user',
        representative: 'other-user',
        members: ['other-user'],
        payerUserId: 'other-user',
        createdAt: '2024-01-01',
        updatedAt: '2024-01-01',
      };
      const result = await service.deleteGroup('grp-del-admin', 'admin-user', true);
      expect(result).toBe(true);
    });
  });

  describe('addGroupToEvent', () => {
    it('should return null for non-existent group', async () => {
      const result = await service.addGroupToEvent('nonexistent', 'evt-2', 'user-1');
      expect(result).toBeNull();
    });

    it('should add eventId when not already in eventIds', async () => {
      mockGroups['grp-add-evt'] = {
        eventId: 'evt-1',
        eventIds: ['evt-1'],
        name: 'Add Event',
        createdBy: 'user-1',
        members: ['user-1'],
        payerUserId: 'user-1',
        createdAt: '2024-01-01',
        updatedAt: '2024-01-01',
      };
      await service.addGroupToEvent('grp-add-evt', 'evt-2', 'user-1');
      expect(mockGroups['grp-add-evt'].eventIds).toContain('evt-2');
    });

    it('should not duplicate eventId if already present', async () => {
      mockGroups['grp-dup-evt'] = {
        eventId: 'evt-1',
        eventIds: ['evt-1', 'evt-2'],
        name: 'Dup Event',
        createdBy: 'user-1',
        members: ['user-1'],
        payerUserId: 'user-1',
        createdAt: '2024-01-01',
        updatedAt: '2024-01-01',
      };
      await service.addGroupToEvent('grp-dup-evt', 'evt-2', 'user-1');
      const count = mockGroups['grp-dup-evt'].eventIds.filter((id: string) => id === 'evt-2').length;
      expect(count).toBe(1);
    });
  });

  describe('suggestGroups', () => {
    it('should return empty for user with no groups', async () => {
      const result = await service.suggestGroups('user-1', ['u1', 'u2']);
      expect(result).toEqual([]);
    });

    it('should skip groups with empty members', async () => {
      mockGroups['grp-empty'] = {
        eventId: 'evt-1',
        name: 'Empty',
        createdBy: 'user-1',
        members: [],
        payerUserId: 'user-1',
        createdAt: '2024-01-01',
        updatedAt: '2024-01-01',
      };
      const result = await service.suggestGroups('user-1', ['u1', 'u2']);
      expect(result).toEqual([]);
    });

    it('should return groups above similarity threshold', async () => {
      mockGroups['grp-sim-high'] = {
        eventId: 'evt-1',
        name: 'High Sim',
        createdBy: 'user-1',
        members: ['u1', 'u2', 'u3'],
        payerUserId: 'u1',
        createdAt: '2024-01-01',
        updatedAt: '2024-01-01',
      };
      mockGroups['grp-sim-low'] = {
        eventId: 'evt-2',
        name: 'Low Sim',
        createdBy: 'user-1',
        members: ['u9', 'u10'],
        payerUserId: 'u9',
        createdAt: '2024-01-01',
        updatedAt: '2024-01-01',
      };
      const result = await service.suggestGroups('user-1', ['u1', 'u2', 'u3']);
      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('High Sim');
    });

    it('should use custom threshold', async () => {
      mockGroups['grp-custom-th'] = {
        eventId: 'evt-1',
        name: 'Custom Threshold',
        createdBy: 'user-1',
        members: ['u1', 'u2', 'u3', 'u4'],
        payerUserId: 'u1',
        createdAt: '2024-01-01',
        updatedAt: '2024-01-01',
      };
      // 2 out of 4 = 50% overlap, default threshold 0.7 would exclude, 0.4 should include
      const resultLow = await service.suggestGroups('user-1', ['u1', 'u2'], 0.4);
      expect(resultLow).toHaveLength(1);
      const resultHigh = await service.suggestGroups('user-1', ['u1', 'u2'], 0.8);
      expect(resultHigh).toHaveLength(0);
    });
  });

  describe('getUserGroups', () => {
    it('should return empty when user is in no groups', async () => {
      const result = await service.getUserGroups('user-lonely');
      expect(result).toEqual([]);
    });

    it('should return groups where user is a member', async () => {
      mockGroups['grp-ug'] = {
        eventId: 'evt-1',
        name: 'User Group',
        createdBy: 'other-user',
        members: ['user-1', 'other-user'],
        payerUserId: 'user-1',
        createdAt: '2024-01-01',
        updatedAt: '2024-01-01',
      };
      const result = await service.getUserGroups('user-1');
      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('User Group');
    });
  });

  describe('addMember', () => {
    it('should return null for non-existent group', async () => {
      const result = await service.addMember('nonexistent', 'user-2', 'user-1');
      expect(result).toBeNull();
    });

    it('should throw if requester is not the creator', async () => {
      mockGroups['grp-add-noauth'] = {
        eventId: 'evt-1',
        name: 'NoAuth Add',
        createdBy: 'other-user',
        members: ['other-user'],
        payerUserId: 'other-user',
        createdAt: '2024-01-01',
        updatedAt: '2024-01-01',
      };
      await expect(service.addMember('grp-add-noauth', 'user-2', 'random-user'))
        .rejects.toThrow('Forbidden');
    });

    it('should return group unchanged if user already a member', async () => {
      mockGroups['grp-add-dup'] = {
        eventId: 'evt-1',
        name: 'Dup Add',
        createdBy: 'user-1',
        members: ['user-1', 'user-2'],
        payerUserId: 'user-1',
        createdAt: '2024-01-01',
        updatedAt: '2024-01-01',
      };
      const result = await service.addMember('grp-add-dup', 'user-2', 'user-1');
      expect(result!.members).toEqual(['user-1', 'user-2']);
    });

    it('should add new member successfully', async () => {
      mockGroups['grp-add-ok'] = {
        eventId: 'evt-1',
        name: 'Add OK',
        createdBy: 'user-1',
        members: ['user-1'],
        payerUserId: 'user-1',
        createdAt: '2024-01-01',
        updatedAt: '2024-01-01',
      };
      await service.addMember('grp-add-ok', 'user-2', 'user-1');
      expect(mockGroups['grp-add-ok'].members).toContain('user-2');
    });
  });

  describe('removeMember', () => {
    it('should return null for non-existent group', async () => {
      const result = await service.removeMember('nonexistent', 'user-2', 'user-1');
      expect(result).toBeNull();
    });

    it('should throw if requester is not the creator and not the member being removed', async () => {
      mockGroups['grp-rm-noauth'] = {
        eventId: 'evt-1',
        name: 'NoAuth Rm',
        createdBy: 'other-user',
        members: ['other-user', 'user-2'],
        payerUserId: 'other-user',
        createdAt: '2024-01-01',
        updatedAt: '2024-01-01',
      };
      await expect(service.removeMember('grp-rm-noauth', 'user-2', 'random-user'))
        .rejects.toThrow('Forbidden');
    });

    it('should allow member to remove themselves', async () => {
      mockGroups['grp-rm-self'] = {
        eventId: 'evt-1',
        name: 'Self Rm',
        createdBy: 'other-user',
        members: ['other-user', 'user-2'],
        payerUserId: 'other-user',
        createdAt: '2024-01-01',
        updatedAt: '2024-01-01',
      };
      await service.removeMember('grp-rm-self', 'user-2', 'user-2');
      expect(mockGroups['grp-rm-self'].members).not.toContain('user-2');
    });

    it('should allow creator to remove any member', async () => {
      mockGroups['grp-rm-creator'] = {
        eventId: 'evt-1',
        name: 'Creator Rm',
        createdBy: 'user-1',
        members: ['user-1', 'user-2'],
        payerUserId: 'user-1',
        createdAt: '2024-01-01',
        updatedAt: '2024-01-01',
      };
      await service.removeMember('grp-rm-creator', 'user-2', 'user-1');
      expect(mockGroups['grp-rm-creator'].members).not.toContain('user-2');
    });
  });
});
