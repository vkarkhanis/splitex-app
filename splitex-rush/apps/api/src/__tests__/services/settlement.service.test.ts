import { SettlementService } from '../../services/settlement.service';

// Mock data stores
const mockExpenses: Record<string, any> = {};
const mockGroups: Record<string, any> = {};
const mockSettlements: Record<string, any> = {};
const mockEvents: Record<string, any> = {};
let docIdCounter = 0;

jest.mock('../../config/firebase', () => ({
  auth: { verifyIdToken: jest.fn() },
  db: {
    batch: jest.fn().mockImplementation(() => ({
      delete: jest.fn(),
      commit: jest.fn().mockResolvedValue(undefined),
    })),
    collection: jest.fn().mockImplementation((collectionPath: string) => {
      const getStore = () => {
        if (collectionPath === 'expenses') return mockExpenses;
        if (collectionPath === 'groups') return mockGroups;
        if (collectionPath === 'settlements') return mockSettlements;
        if (collectionPath === 'events') return mockEvents;
        return {};
      };

      return {
        doc: jest.fn().mockImplementation((docId: string) => ({
          get: jest.fn().mockImplementation(() => {
            const store = getStore();
            const data = store[docId];
            return Promise.resolve({ exists: !!data, data: () => data || null, id: docId });
          }),
          set: jest.fn().mockImplementation((data: any, opts?: any) => {
            const store = getStore();
            if (opts?.merge) {
              store[docId] = { ...(store[docId] || {}), ...data };
            } else {
              store[docId] = data;
            }
            return Promise.resolve();
          }),
        })),
        add: jest.fn().mockImplementation((data: any) => {
          const id = `mock-${collectionPath}-${++docIdCounter}`;
          const store = getStore();
          store[id] = data;
          return Promise.resolve({ id });
        }),
        where: jest.fn().mockImplementation((field: string, op: string, value: any) => ({
          get: jest.fn().mockImplementation(() => {
            const store = getStore();
            const docs = Object.entries(store)
              .filter(([, data]) => {
                if (op === '==') return data[field] === value;
                if (op === 'array-contains') return Array.isArray(data[field]) && data[field].includes(value);
                return false;
              })
              .map(([id, data]) => ({ id, data: () => data, exists: true, ref: { id } }));
            return Promise.resolve({ docs, empty: docs.length === 0 });
          }),
          where: jest.fn().mockImplementation(() => ({
            get: jest.fn().mockImplementation(() => {
              return Promise.resolve({ docs: [], empty: true });
            }),
          })),
        })),
      };
    }),
  },
}));

describe('SettlementService', () => {
  let service: SettlementService;

  beforeEach(() => {
    Object.keys(mockExpenses).forEach(k => delete mockExpenses[k]);
    Object.keys(mockGroups).forEach(k => delete mockGroups[k]);
    Object.keys(mockSettlements).forEach(k => delete mockSettlements[k]);
    Object.keys(mockEvents).forEach(k => delete mockEvents[k]);
    docIdCounter = 0;
    service = new SettlementService();
  });

  describe('calculateEntityBalances', () => {
    it('should return empty balances for event with no expenses', async () => {
      const balances = await service.calculateEntityBalances('evt-1');
      expect(balances).toEqual([]);
    });

    it('should calculate balances for individual users only', async () => {
      mockExpenses['exp-1'] = {
        eventId: 'evt-1',
        paidBy: 'user-A',
        amount: 300,
        isPrivate: false,
        splits: [
          { entityType: 'user', entityId: 'user-A', amount: 100 },
          { entityType: 'user', entityId: 'user-B', amount: 100 },
          { entityType: 'user', entityId: 'user-C', amount: 100 },
        ],
      };

      const balances = await service.calculateEntityBalances('evt-1');
      // user-A paid 300, owes 100 => net +200
      // user-B owes 100 => net -100
      // user-C owes 100 => net -100
      const balA = balances.find(b => b.entityId === 'user-A');
      const balB = balances.find(b => b.entityId === 'user-B');
      const balC = balances.find(b => b.entityId === 'user-C');

      expect(balA).toBeDefined();
      expect(balA!.amount).toBe(200);
      expect(balA!.entityType).toBe('user');
      expect(balB!.amount).toBe(-100);
      expect(balC!.amount).toBe(-100);
    });

    it('should treat groups as single entities', async () => {
      // Group with user-A and user-B
      mockGroups['grp-1'] = {
        eventId: 'evt-1',
        members: ['user-A', 'user-B'],
        payerUserId: 'user-A',
      };

      // user-A (in group) pays 300, split between group and user-C
      mockExpenses['exp-1'] = {
        eventId: 'evt-1',
        paidBy: 'user-A', // in grp-1
        amount: 300,
        isPrivate: false,
        splits: [
          { entityType: 'group', entityId: 'grp-1', amount: 150 },
          { entityType: 'user', entityId: 'user-C', amount: 150 },
        ],
      };

      const balances = await service.calculateEntityBalances('evt-1');
      // grp-1 paid 300 (via user-A), owes 150 => net +150
      // user-C owes 150 => net -150
      const balGrp = balances.find(b => b.entityId === 'grp-1');
      const balC = balances.find(b => b.entityId === 'user-C');

      expect(balGrp).toBeDefined();
      expect(balGrp!.amount).toBe(150);
      expect(balGrp!.entityType).toBe('group');
      expect(balC!.amount).toBe(-150);
    });

    it('should skip private expenses', async () => {
      mockExpenses['exp-1'] = {
        eventId: 'evt-1',
        paidBy: 'user-A',
        amount: 100,
        isPrivate: true,
        splits: [],
      };

      const balances = await service.calculateEntityBalances('evt-1');
      expect(balances).toEqual([]);
    });

    it('should resolve user splits to their group when user is in a group', async () => {
      mockGroups['grp-1'] = {
        eventId: 'evt-1',
        members: ['user-A', 'user-B'],
        payerUserId: 'user-A',
      };

      // Expense with user-level splits, but user-B is in grp-1
      mockExpenses['exp-1'] = {
        eventId: 'evt-1',
        paidBy: 'user-C',
        amount: 200,
        isPrivate: false,
        splits: [
          { entityType: 'user', entityId: 'user-B', amount: 100 }, // should resolve to grp-1
          { entityType: 'user', entityId: 'user-C', amount: 100 },
        ],
      };

      const balances = await service.calculateEntityBalances('evt-1');
      const balGrp = balances.find(b => b.entityId === 'grp-1');
      const balC = balances.find(b => b.entityId === 'user-C');

      // grp-1 owes 100 (via user-B split)
      expect(balGrp).toBeDefined();
      expect(balGrp!.amount).toBe(-100);
      // user-C paid 200, owes 100 => net +100
      expect(balC!.amount).toBe(100);
    });

    it('should handle multiple expenses correctly', async () => {
      mockExpenses['exp-1'] = {
        eventId: 'evt-1',
        paidBy: 'user-A',
        amount: 100,
        isPrivate: false,
        splits: [
          { entityType: 'user', entityId: 'user-A', amount: 50 },
          { entityType: 'user', entityId: 'user-B', amount: 50 },
        ],
      };
      mockExpenses['exp-2'] = {
        eventId: 'evt-1',
        paidBy: 'user-B',
        amount: 60,
        isPrivate: false,
        splits: [
          { entityType: 'user', entityId: 'user-A', amount: 30 },
          { entityType: 'user', entityId: 'user-B', amount: 30 },
        ],
      };

      const balances = await service.calculateEntityBalances('evt-1');
      // user-A: paid 100, owes 50+30=80 => net +20
      // user-B: paid 60, owes 50+30=80 => net -20
      const balA = balances.find(b => b.entityId === 'user-A');
      const balB = balances.find(b => b.entityId === 'user-B');

      expect(balA!.amount).toBe(20);
      expect(balB!.amount).toBe(-20);
    });

    it('should handle "on behalf of" expense — payer gets full credit, payer entity excluded from splits', async () => {
      // user-A pays 300 on behalf of user-B, split equally among user-B and user-C
      mockExpenses['exp-behalf-1'] = {
        eventId: 'evt-1',
        paidBy: 'user-A',
        paidOnBehalfOf: [{ entityId: 'user-B', entityType: 'user' }],
        amount: 300,
        isPrivate: false,
        splits: [
          { entityType: 'user', entityId: 'user-B', amount: 150 },
          { entityType: 'user', entityId: 'user-C', amount: 150 },
        ],
      };

      const balances = await service.calculateEntityBalances('evt-1');
      // user-A: paid 300, share=0 => net +300
      // user-B: owes 150 => net -150
      // user-C: owes 150 => net -150
      const balA = balances.find(b => b.entityId === 'user-A');
      const balB = balances.find(b => b.entityId === 'user-B');
      const balC = balances.find(b => b.entityId === 'user-C');

      expect(balA).toBeDefined();
      expect(balA!.amount).toBe(300);
      expect(balB!.amount).toBe(-150);
      expect(balC!.amount).toBe(-150);
    });

    it('should handle "on behalf of" with payer in a group — payer group gets credit, payer group excluded from splits', async () => {
      // user-A is in grp-1, pays on behalf of user-C
      mockGroups['grp-1'] = {
        eventId: 'evt-1',
        members: ['user-A', 'user-B'],
        payerUserId: 'user-A',
      };

      mockExpenses['exp-behalf-2'] = {
        eventId: 'evt-1',
        paidBy: 'user-A', // in grp-1
        paidOnBehalfOf: [{ entityId: 'user-C', entityType: 'user' }],
        amount: 200,
        isPrivate: false,
        splits: [
          { entityType: 'group', entityId: 'grp-1', amount: 100 }, // should be skipped (payer's entity)
          { entityType: 'user', entityId: 'user-C', amount: 100 },
        ],
      };

      const balances = await service.calculateEntityBalances('evt-1');
      // grp-1: paid 200 (via user-A), split of 100 skipped (payer's entity) => net +200
      // user-C: owes 100 => net -100
      // Note: grp-1's split is skipped because user-A (payer) is in grp-1
      const balGrp = balances.find(b => b.entityId === 'grp-1');
      const balC = balances.find(b => b.entityId === 'user-C');

      expect(balGrp).toBeDefined();
      expect(balGrp!.amount).toBe(200);
      expect(balC!.amount).toBe(-100);
      // Only 2 entities should have non-zero balances (grp-1 and user-C don't sum to zero
      // because the payer's split was excluded — this is correct for "on behalf of")
    });

    it('should handle "on behalf of" with normal expenses combined', async () => {
      // Normal expense: user-A pays 100 split equally with user-B
      mockExpenses['exp-normal'] = {
        eventId: 'evt-1',
        paidBy: 'user-A',
        amount: 100,
        isPrivate: false,
        splits: [
          { entityType: 'user', entityId: 'user-A', amount: 50 },
          { entityType: 'user', entityId: 'user-B', amount: 50 },
        ],
      };

      // On behalf of: user-A pays 200 on behalf of user-B, split among user-B and user-C
      mockExpenses['exp-behalf'] = {
        eventId: 'evt-1',
        paidBy: 'user-A',
        paidOnBehalfOf: [{ entityId: 'user-B', entityType: 'user' }],
        amount: 200,
        isPrivate: false,
        splits: [
          { entityType: 'user', entityId: 'user-B', amount: 100 },
          { entityType: 'user', entityId: 'user-C', amount: 100 },
        ],
      };

      const balances = await service.calculateEntityBalances('evt-1');
      // user-A: paid 100+200=300, owes 50 (normal) + 0 (behalf) = 50 => net +250
      // user-B: paid 0, owes 50 (normal) + 100 (behalf) = 150 => net -150
      // user-C: paid 0, owes 100 (behalf) => net -100
      const balA = balances.find(b => b.entityId === 'user-A');
      const balB = balances.find(b => b.entityId === 'user-B');
      const balC = balances.find(b => b.entityId === 'user-C');

      expect(balA!.amount).toBe(250);
      expect(balB!.amount).toBe(-150);
      expect(balC!.amount).toBe(-100);
    });

    it('should handle "on behalf of" with MULTIPLE entities — payer excluded, all others debited', async () => {
      // user-A pays 300 on behalf of user-B AND user-C, split among user-B, user-C, user-D
      mockExpenses['exp-multi-behalf'] = {
        eventId: 'evt-1',
        paidBy: 'user-A',
        paidOnBehalfOf: [
          { entityId: 'user-B', entityType: 'user' },
          { entityId: 'user-C', entityType: 'user' },
        ],
        amount: 300,
        isPrivate: false,
        splits: [
          { entityType: 'user', entityId: 'user-B', amount: 100 },
          { entityType: 'user', entityId: 'user-C', amount: 100 },
          { entityType: 'user', entityId: 'user-D', amount: 100 },
        ],
      };

      const balances = await service.calculateEntityBalances('evt-1');
      // user-A: paid 300, share=0 => net +300
      // user-B: owes 100 => net -100
      // user-C: owes 100 => net -100
      // user-D: owes 100 => net -100
      const balA = balances.find(b => b.entityId === 'user-A');
      const balB = balances.find(b => b.entityId === 'user-B');
      const balC = balances.find(b => b.entityId === 'user-C');
      const balD = balances.find(b => b.entityId === 'user-D');

      expect(balA!.amount).toBe(300);
      expect(balB!.amount).toBe(-100);
      expect(balC!.amount).toBe(-100);
      expect(balD!.amount).toBe(-100);
    });

    it('should handle "on behalf of" with multiple entities including a group', async () => {
      mockGroups['grp-1'] = {
        eventId: 'evt-1',
        members: ['user-D', 'user-E'],
        payerUserId: 'user-D',
      };

      // user-A pays 400 on behalf of user-B and grp-1, split among user-B, user-C, grp-1
      mockExpenses['exp-multi-behalf-grp'] = {
        eventId: 'evt-1',
        paidBy: 'user-A',
        paidOnBehalfOf: [
          { entityId: 'user-B', entityType: 'user' },
          { entityId: 'grp-1', entityType: 'group' },
        ],
        amount: 400,
        isPrivate: false,
        splits: [
          { entityType: 'user', entityId: 'user-B', amount: 150 },
          { entityType: 'user', entityId: 'user-C', amount: 100 },
          { entityType: 'group', entityId: 'grp-1', amount: 150 },
        ],
      };

      const balances = await service.calculateEntityBalances('evt-1');
      // user-A: paid 400, share=0 => net +400
      // user-B: owes 150 => net -150
      // user-C: owes 100 => net -100
      // grp-1: owes 150 => net -150
      const balA = balances.find(b => b.entityId === 'user-A');
      const balB = balances.find(b => b.entityId === 'user-B');
      const balC = balances.find(b => b.entityId === 'user-C');
      const balGrp = balances.find(b => b.entityId === 'grp-1');

      expect(balA!.amount).toBe(400);
      expect(balB!.amount).toBe(-150);
      expect(balC!.amount).toBe(-100);
      expect(balGrp!.amount).toBe(-150);
    });

    it('should handle empty paidOnBehalfOf array as normal expense (no exclusion)', async () => {
      mockExpenses['exp-empty-behalf'] = {
        eventId: 'evt-1',
        paidBy: 'user-A',
        paidOnBehalfOf: [],
        amount: 200,
        isPrivate: false,
        splits: [
          { entityType: 'user', entityId: 'user-A', amount: 100 },
          { entityType: 'user', entityId: 'user-B', amount: 100 },
        ],
      };

      const balances = await service.calculateEntityBalances('evt-1');
      // Normal expense: user-A paid 200, owes 100 => net +100
      // user-B: owes 100 => net -100
      const balA = balances.find(b => b.entityId === 'user-A');
      const balB = balances.find(b => b.entityId === 'user-B');

      expect(balA!.amount).toBe(100);
      expect(balB!.amount).toBe(-100);
    });
  });

  describe('calculateSettlementPlan', () => {
    it('should return empty plan for zero balances', () => {
      const plan = service.calculateSettlementPlan([], 'evt-1', 'USD');
      expect(plan.settlements).toEqual([]);
      expect(plan.totalTransactions).toBe(0);
      expect(plan.totalAmount).toBe(0);
    });

    it('should create single settlement for two entities', () => {
      const balances = [
        { entityId: 'user-A', entityType: 'user' as const, amount: 100 },
        { entityId: 'user-B', entityType: 'user' as const, amount: -100 },
      ];

      const plan = service.calculateSettlementPlan(balances, 'evt-1', 'USD');
      expect(plan.totalTransactions).toBe(1);
      expect(plan.totalAmount).toBe(100);
      expect(plan.settlements[0].fromEntityId).toBe('user-B');
      expect(plan.settlements[0].toEntityId).toBe('user-A');
      expect(plan.settlements[0].amount).toBe(100);
    });

    it('should minimize transactions with greedy algorithm', () => {
      const balances = [
        { entityId: 'user-A', entityType: 'user' as const, amount: 200 },
        { entityId: 'grp-1', entityType: 'group' as const, amount: -120 },
        { entityId: 'user-C', entityType: 'user' as const, amount: -80 },
      ];

      const plan = service.calculateSettlementPlan(balances, 'evt-1', 'INR');
      expect(plan.totalTransactions).toBe(2);
      expect(plan.totalAmount).toBe(200);
      expect(plan.settlements[0].currency).toBe('INR');
    });

    it('should handle group entities in settlements', () => {
      const balances = [
        { entityId: 'grp-1', entityType: 'group' as const, amount: 150 },
        { entityId: 'user-C', entityType: 'user' as const, amount: -150 },
      ];

      const plan = service.calculateSettlementPlan(balances, 'evt-1', 'USD');
      expect(plan.settlements[0].fromEntityId).toBe('user-C');
      expect(plan.settlements[0].fromEntityType).toBe('user');
      expect(plan.settlements[0].toEntityId).toBe('grp-1');
      expect(plan.settlements[0].toEntityType).toBe('group');
    });

    it('should handle complex multi-party settlement', () => {
      const balances = [
        { entityId: 'A', entityType: 'user' as const, amount: 300 },
        { entityId: 'B', entityType: 'user' as const, amount: 100 },
        { entityId: 'C', entityType: 'user' as const, amount: -200 },
        { entityId: 'D', entityType: 'group' as const, amount: -200 },
      ];

      const plan = service.calculateSettlementPlan(balances, 'evt-1', 'USD');
      // Total owed: 400, total debt: 400
      expect(plan.totalAmount).toBe(400);
      // Greedy: C(-200) -> A(300), D(-200) -> A(100)+B(100) = 3 transactions
      expect(plan.totalTransactions).toBeLessThanOrEqual(3);
    });
  });

  describe('generateSettlement', () => {
    it('should throw if event not found', async () => {
      await expect(service.generateSettlement('nonexistent', 'user-1'))
        .rejects.toThrow('Event not found');
    });

    it('should throw if user is not admin', async () => {
      mockEvents['evt-1'] = {
        createdBy: 'admin-1',
        admins: ['admin-1'],
        currency: 'USD',
      };

      await expect(service.generateSettlement('evt-1', 'random-user'))
        .rejects.toThrow('Forbidden');
    });

    it('should generate settlement plan for admin', async () => {
      mockEvents['evt-1'] = {
        createdBy: 'admin-1',
        admins: ['admin-1'],
        currency: 'USD',
      };

      mockExpenses['exp-1'] = {
        eventId: 'evt-1',
        paidBy: 'user-A',
        amount: 200,
        isPrivate: false,
        splits: [
          { entityType: 'user', entityId: 'user-A', amount: 100 },
          { entityType: 'user', entityId: 'user-B', amount: 100 },
        ],
      };

      const plan = await service.generateSettlement('evt-1', 'admin-1');
      expect(plan.eventId).toBe('evt-1');
      expect(plan.totalTransactions).toBe(1);
      expect(plan.settlements[0].amount).toBe(100);
      // Event should be in 'payment' mode (has pending transactions)
      expect(mockEvents['evt-1'].status).toBe('payment');
    });
  });

  describe('getEventSettlements', () => {
    it('should return empty for event with no settlements', async () => {
      const result = await service.getEventSettlements('evt-1');
      expect(result).toEqual([]);
    });

    it('should return settlements for event', async () => {
      mockSettlements['s-1'] = {
        eventId: 'evt-1',
        fromEntityId: 'user-B',
        fromEntityType: 'user',
        toEntityId: 'user-A',
        toEntityType: 'user',
        amount: 100,
        currency: 'USD',
        status: 'pending',
        createdAt: '2024-01-01',
      };

      const result = await service.getEventSettlements('evt-1');
      expect(result).toHaveLength(1);
      expect(result[0].amount).toBe(100);
    });
  });

  describe('entity-aware tile calculations (user scenarios)', () => {
    // Setup: madhura (individual), vkarkhanis + arnkarkhanis (in "Boyz" group)
    // These tests verify the exact scenarios from the user's requirements

    function setupBoyzGroup() {
      mockGroups['boyz-group'] = {
        eventId: 'evt-1',
        members: ['vkarkhanis', 'arnkarkhanis'],
        payerUserId: 'vkarkhanis',
      };
    }

    // Helper: compute visible expenses and 4 tiles for a given entity
    function computeTiles(
      expenses: any[],
      entityId: string,
      entityMembers: string[],
      isGroup: boolean
    ) {
      const isSharedWithEntity = (exp: any) => {
        if (exp.isPrivate) return false;
        return exp.splits?.some((s: any) => s.entityId === entityId);
      };
      const isEntityPrivate = (exp: any) => {
        if (!exp.isPrivate) return false;
        return entityMembers.includes(exp.paidBy);
      };

      const visible = expenses.filter(exp => isSharedWithEntity(exp) || isEntityPrivate(exp));
      const totalExpense = visible.reduce((sum: number, e: any) => sum + e.amount, 0);
      const totalShared = visible.filter((e: any) => !e.isPrivate).reduce((sum: number, e: any) => sum + e.amount, 0);
      const yourShared = visible.reduce((sum: number, exp: any) => {
        if (exp.isPrivate) return sum;
        const mySplit = exp.splits?.find((s: any) => s.entityId === entityId);
        return sum + (mySplit?.amount || 0);
      }, 0);
      const privateExpense = visible.filter((e: any) => e.isPrivate).reduce((sum: number, e: any) => sum + e.amount, 0);

      return { totalExpense, totalShared, yourShared, privateExpense, visibleCount: visible.length };
    }

    it('Scenario A: madhura adds 5000 shared equally between her and Boyz group', () => {
      setupBoyzGroup();
      const expenses = [{
        id: 'exp-a', eventId: 'evt-1', paidBy: 'madhura', amount: 5000, isPrivate: false,
        splits: [
          { entityType: 'user', entityId: 'madhura', amount: 2500 },
          { entityType: 'group', entityId: 'boyz-group', amount: 2500 },
        ],
      }];

      // madhura's view
      const madhura = computeTiles(expenses, 'madhura', ['madhura'], false);
      expect(madhura.totalExpense).toBe(5000);
      expect(madhura.totalShared).toBe(5000);
      expect(madhura.yourShared).toBe(2500);
      expect(madhura.privateExpense).toBe(0);

      // Boyz group view
      const boyz = computeTiles(expenses, 'boyz-group', ['vkarkhanis', 'arnkarkhanis'], true);
      expect(boyz.totalExpense).toBe(5000);
      expect(boyz.totalShared).toBe(5000);
      expect(boyz.yourShared).toBe(2500);
      expect(boyz.privateExpense).toBe(0);
    });

    it('Scenario B: + madhura adds private 1000', () => {
      setupBoyzGroup();
      const expenses = [
        {
          id: 'exp-a', eventId: 'evt-1', paidBy: 'madhura', amount: 5000, isPrivate: false,
          splits: [
            { entityType: 'user', entityId: 'madhura', amount: 2500 },
            { entityType: 'group', entityId: 'boyz-group', amount: 2500 },
          ],
        },
        { id: 'exp-b', eventId: 'evt-1', paidBy: 'madhura', amount: 1000, isPrivate: true, splits: [] },
      ];

      const madhura = computeTiles(expenses, 'madhura', ['madhura'], false);
      expect(madhura.totalExpense).toBe(6000);
      expect(madhura.totalShared).toBe(5000);
      expect(madhura.yourShared).toBe(2500);
      expect(madhura.privateExpense).toBe(1000);

      // Boyz should NOT see madhura's private expense
      const boyz = computeTiles(expenses, 'boyz-group', ['vkarkhanis', 'arnkarkhanis'], true);
      expect(boyz.totalExpense).toBe(5000);
      expect(boyz.totalShared).toBe(5000);
      expect(boyz.yourShared).toBe(2500);
      expect(boyz.privateExpense).toBe(0);
    });

    it('Scenario C: + vkarkhanis adds 10000 shared equally', () => {
      setupBoyzGroup();
      const expenses = [
        {
          id: 'exp-a', eventId: 'evt-1', paidBy: 'madhura', amount: 5000, isPrivate: false,
          splits: [
            { entityType: 'user', entityId: 'madhura', amount: 2500 },
            { entityType: 'group', entityId: 'boyz-group', amount: 2500 },
          ],
        },
        { id: 'exp-b', eventId: 'evt-1', paidBy: 'madhura', amount: 1000, isPrivate: true, splits: [] },
        {
          id: 'exp-c', eventId: 'evt-1', paidBy: 'vkarkhanis', amount: 10000, isPrivate: false,
          splits: [
            { entityType: 'group', entityId: 'boyz-group', amount: 5000 },
            { entityType: 'user', entityId: 'madhura', amount: 5000 },
          ],
        },
      ];

      const madhura = computeTiles(expenses, 'madhura', ['madhura'], false);
      expect(madhura.totalExpense).toBe(16000);
      expect(madhura.totalShared).toBe(15000);
      expect(madhura.yourShared).toBe(7500);
      expect(madhura.privateExpense).toBe(1000);

      const boyz = computeTiles(expenses, 'boyz-group', ['vkarkhanis', 'arnkarkhanis'], true);
      expect(boyz.totalExpense).toBe(15000);
      expect(boyz.totalShared).toBe(15000);
      expect(boyz.yourShared).toBe(7500);
      expect(boyz.privateExpense).toBe(0);
    });

    it('Scenario D: + arnkarkhanis adds private 2000', () => {
      setupBoyzGroup();
      const expenses = [
        {
          id: 'exp-a', eventId: 'evt-1', paidBy: 'madhura', amount: 5000, isPrivate: false,
          splits: [
            { entityType: 'user', entityId: 'madhura', amount: 2500 },
            { entityType: 'group', entityId: 'boyz-group', amount: 2500 },
          ],
        },
        { id: 'exp-b', eventId: 'evt-1', paidBy: 'madhura', amount: 1000, isPrivate: true, splits: [] },
        {
          id: 'exp-c', eventId: 'evt-1', paidBy: 'vkarkhanis', amount: 10000, isPrivate: false,
          splits: [
            { entityType: 'group', entityId: 'boyz-group', amount: 5000 },
            { entityType: 'user', entityId: 'madhura', amount: 5000 },
          ],
        },
        { id: 'exp-d', eventId: 'evt-1', paidBy: 'arnkarkhanis', amount: 2000, isPrivate: true, splits: [] },
      ];

      // madhura should NOT see arnkarkhanis's private expense
      const madhura = computeTiles(expenses, 'madhura', ['madhura'], false);
      expect(madhura.totalExpense).toBe(16000);
      expect(madhura.totalShared).toBe(15000);
      expect(madhura.yourShared).toBe(7500);
      expect(madhura.privateExpense).toBe(1000);

      // Boyz group SHOULD see arnkarkhanis's private expense (he's a member)
      const boyz = computeTiles(expenses, 'boyz-group', ['vkarkhanis', 'arnkarkhanis'], true);
      expect(boyz.totalExpense).toBe(17000);
      expect(boyz.totalShared).toBe(15000);
      expect(boyz.yourShared).toBe(7500);
      expect(boyz.privateExpense).toBe(2000);
    });

    it('Scenario E: + vkarkhanis adds 6000 custom split madhura=2000, Boyz=4000', () => {
      setupBoyzGroup();
      const expenses = [
        {
          id: 'exp-a', eventId: 'evt-1', paidBy: 'madhura', amount: 5000, isPrivate: false,
          splits: [
            { entityType: 'user', entityId: 'madhura', amount: 2500 },
            { entityType: 'group', entityId: 'boyz-group', amount: 2500 },
          ],
        },
        { id: 'exp-b', eventId: 'evt-1', paidBy: 'madhura', amount: 1000, isPrivate: true, splits: [] },
        {
          id: 'exp-c', eventId: 'evt-1', paidBy: 'vkarkhanis', amount: 10000, isPrivate: false,
          splits: [
            { entityType: 'group', entityId: 'boyz-group', amount: 5000 },
            { entityType: 'user', entityId: 'madhura', amount: 5000 },
          ],
        },
        { id: 'exp-d', eventId: 'evt-1', paidBy: 'arnkarkhanis', amount: 2000, isPrivate: true, splits: [] },
        {
          id: 'exp-e', eventId: 'evt-1', paidBy: 'vkarkhanis', amount: 6000, isPrivate: false,
          splits: [
            { entityType: 'user', entityId: 'madhura', amount: 2000 },
            { entityType: 'group', entityId: 'boyz-group', amount: 4000 },
          ],
        },
      ];

      const madhura = computeTiles(expenses, 'madhura', ['madhura'], false);
      expect(madhura.totalExpense).toBe(22000);
      expect(madhura.totalShared).toBe(21000);
      expect(madhura.yourShared).toBe(9500);
      expect(madhura.privateExpense).toBe(1000);

      const boyz = computeTiles(expenses, 'boyz-group', ['vkarkhanis', 'arnkarkhanis'], true);
      expect(boyz.totalExpense).toBe(23000);
      expect(boyz.totalShared).toBe(21000);
      expect(boyz.yourShared).toBe(11500);
      expect(boyz.privateExpense).toBe(2000);
    });

    it('should show 0s for user not involved in any expense', () => {
      setupBoyzGroup();
      const expenses = [{
        id: 'exp-a', eventId: 'evt-1', paidBy: 'madhura', amount: 5000, isPrivate: false,
        splits: [
          { entityType: 'user', entityId: 'madhura', amount: 2500 },
          { entityType: 'group', entityId: 'boyz-group', amount: 2500 },
        ],
      }];

      const outsider = computeTiles(expenses, 'outsider', ['outsider'], false);
      expect(outsider.totalExpense).toBe(0);
      expect(outsider.totalShared).toBe(0);
      expect(outsider.yourShared).toBe(0);
      expect(outsider.privateExpense).toBe(0);
      expect(outsider.visibleCount).toBe(0);
    });
  });

  describe('generateSettlement edge cases', () => {
    it('should set event to settled when no payments needed (all balanced)', async () => {
      mockEvents['evt-balanced'] = {
        createdBy: 'admin-1',
        admins: ['admin-1'],
        currency: 'USD',
      };

      // Single expense where payer is also the only split entity → net zero
      mockExpenses['exp-balanced'] = {
        eventId: 'evt-balanced',
        paidBy: 'user-A',
        amount: 100,
        isPrivate: false,
        splits: [
          { entityType: 'user', entityId: 'user-A', amount: 100 },
        ],
      };

      const plan = await service.generateSettlement('evt-balanced', 'admin-1');
      expect(plan.totalTransactions).toBe(0);
      expect(plan.settlements).toHaveLength(0);
      // No payments needed → directly settled
      expect(mockEvents['evt-balanced'].status).toBe('settled');
    });

    it('should resolve group payer userIds in settlements', async () => {
      mockEvents['evt-grp'] = {
        createdBy: 'admin-1',
        admins: ['admin-1'],
        currency: 'USD',
      };

      mockGroups['grp-1'] = {
        eventId: 'evt-grp',
        members: ['user-B', 'user-C'],
        payerUserId: 'user-B',
      };

      mockExpenses['exp-grp'] = {
        eventId: 'evt-grp',
        paidBy: 'user-A',
        amount: 200,
        isPrivate: false,
        splits: [
          { entityType: 'user', entityId: 'user-A', amount: 100 },
          { entityType: 'group', entityId: 'grp-1', amount: 100 },
        ],
      };

      const plan = await service.generateSettlement('evt-grp', 'admin-1');
      expect(plan.totalTransactions).toBe(1);
      // fromUserId should be the group's payer (user-B), toUserId should be user-A
      expect(plan.settlements[0].fromUserId).toBe('user-B');
      expect(plan.settlements[0].toUserId).toBe('user-A');
    });
  });

  describe('initiatePayment', () => {
    it('should throw if settlement not found', async () => {
      await expect(service.initiatePayment('nonexistent', 'user-1'))
        .rejects.toThrow('Settlement not found');
    });

    it('should throw if user is not the payer', async () => {
      mockSettlements['s-pay-1'] = {
        eventId: 'evt-1',
        fromUserId: 'user-A',
        toUserId: 'user-B',
        status: 'pending',
        amount: 100,
      };

      await expect(service.initiatePayment('s-pay-1', 'user-B'))
        .rejects.toThrow('Forbidden: Only the payer can initiate payment');
    });

    it('should throw if settlement is not pending', async () => {
      mockSettlements['s-pay-2'] = {
        eventId: 'evt-1',
        fromUserId: 'user-A',
        toUserId: 'user-B',
        status: 'initiated',
        amount: 100,
      };

      await expect(service.initiatePayment('s-pay-2', 'user-A'))
        .rejects.toThrow('Cannot initiate payment: transaction is already initiated');
    });

    it('should initiate payment successfully', async () => {
      mockEvents['evt-1'] = { status: 'payment' };
      mockSettlements['s-pay-3'] = {
        eventId: 'evt-1',
        fromUserId: 'user-A',
        toUserId: 'user-B',
        status: 'pending',
        amount: 100,
      };

      const result = await service.initiatePayment('s-pay-3', 'user-A');
      expect(result.status).toBe('initiated');
      expect(mockSettlements['s-pay-3'].status).toBe('initiated');
      expect(mockSettlements['s-pay-3'].paymentMethod).toBe('mock');
    });
  });

  describe('approvePayment', () => {
    it('should throw if settlement not found', async () => {
      await expect(service.approvePayment('nonexistent', 'user-1'))
        .rejects.toThrow('Settlement not found');
    });

    it('should throw if user is not the payee', async () => {
      mockSettlements['s-appr-1'] = {
        eventId: 'evt-1',
        fromUserId: 'user-A',
        toUserId: 'user-B',
        status: 'initiated',
        amount: 100,
      };

      await expect(service.approvePayment('s-appr-1', 'user-A'))
        .rejects.toThrow('Forbidden: Only the payee can approve payment');
    });

    it('should throw if settlement is not initiated', async () => {
      mockSettlements['s-appr-2'] = {
        eventId: 'evt-1',
        fromUserId: 'user-A',
        toUserId: 'user-B',
        status: 'pending',
        amount: 100,
      };

      await expect(service.approvePayment('s-appr-2', 'user-B'))
        .rejects.toThrow('Cannot approve payment: transaction is pending, expected initiated');
    });

    it('should approve payment and not auto-settle if other transactions remain', async () => {
      mockEvents['evt-1'] = { status: 'payment' };
      mockSettlements['s-appr-3'] = {
        eventId: 'evt-1',
        fromUserId: 'user-A',
        toUserId: 'user-B',
        status: 'initiated',
        amount: 100,
      };
      mockSettlements['s-appr-4'] = {
        eventId: 'evt-1',
        fromUserId: 'user-C',
        toUserId: 'user-B',
        status: 'pending',
        amount: 50,
      };

      const { settlement, allComplete } = await service.approvePayment('s-appr-3', 'user-B');
      expect(settlement.status).toBe('completed');
      expect(allComplete).toBe(false);
      // Event should still be in payment mode
      expect(mockEvents['evt-1'].status).toBe('payment');
    });

    it('should approve payment and auto-settle event when all transactions complete', async () => {
      mockEvents['evt-2'] = { status: 'payment' };
      mockSettlements['s-final-1'] = {
        eventId: 'evt-2',
        fromUserId: 'user-A',
        toUserId: 'user-B',
        status: 'completed',
        amount: 100,
      };
      mockSettlements['s-final-2'] = {
        eventId: 'evt-2',
        fromUserId: 'user-C',
        toUserId: 'user-B',
        status: 'initiated',
        amount: 50,
      };

      const { settlement, allComplete } = await service.approvePayment('s-final-2', 'user-B');
      expect(settlement.status).toBe('completed');
      expect(allComplete).toBe(true);
      // Event should be auto-settled
      expect(mockEvents['evt-2'].status).toBe('settled');
    });
  });

  describe('getPendingSettlementTotal', () => {
    it('should return 0 for no settlements', async () => {
      const total = await service.getPendingSettlementTotal('evt-1');
      expect(total).toBe(0);
    });

    it('should sum only pending settlements', async () => {
      mockSettlements['s-1'] = {
        eventId: 'evt-1',
        amount: 100,
        status: 'pending',
      };
      mockSettlements['s-2'] = {
        eventId: 'evt-1',
        amount: 50,
        status: 'completed',
      };
      mockSettlements['s-3'] = {
        eventId: 'evt-1',
        amount: 75,
        status: 'pending',
      };

      const total = await service.getPendingSettlementTotal('evt-1');
      expect(total).toBe(175);
    });
  });
});
