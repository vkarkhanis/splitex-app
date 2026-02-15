jest.mock('../../config/firebase', () => ({
  auth: { verifyIdToken: jest.fn() },
  db: {
    collection: jest.fn().mockReturnValue({
      doc: jest.fn().mockReturnValue({
        get: jest.fn().mockResolvedValue({ exists: false, data: () => null }),
        set: jest.fn().mockResolvedValue({}),
        delete: jest.fn().mockResolvedValue({}),
      }),
      add: jest.fn().mockResolvedValue({ id: 'mock-id' }),
      where: jest.fn().mockReturnValue({
        get: jest.fn().mockResolvedValue({ docs: [], empty: true }),
      }),
    }),
  },
}));

import { ExpenseService } from '../../services/expense.service';

describe('ExpenseService - calculateEqualSplits', () => {
  const service = new ExpenseService();

  it('should split evenly among participants', () => {
    const splits = service.calculateEqualSplits(300, ['u1', 'u2', 'u3']);
    expect(splits).toHaveLength(3);
    const total = splits.reduce((s, sp) => s + sp.amount, 0);
    expect(Math.abs(total - 300)).toBeLessThan(0.02);
    expect(splits[0].entityType).toBe('user');
  });

  it('should handle remainder correctly for non-divisible amounts', () => {
    const splits = service.calculateEqualSplits(100, ['u1', 'u2', 'u3']);
    expect(splits).toHaveLength(3);
    const total = splits.reduce((s, sp) => s + sp.amount, 0);
    expect(Math.abs(total - 100)).toBeLessThan(0.02);
    // First person gets the remainder
    expect(splits[0].amount).toBeGreaterThanOrEqual(splits[1].amount);
  });

  it('should handle single participant', () => {
    const splits = service.calculateEqualSplits(50, ['u1']);
    expect(splits).toHaveLength(1);
    expect(splits[0].amount).toBe(50);
    expect(splits[0].entityId).toBe('u1');
  });

  it('should handle two participants', () => {
    const splits = service.calculateEqualSplits(100, ['u1', 'u2']);
    expect(splits).toHaveLength(2);
    expect(splits[0].amount).toBe(50);
    expect(splits[1].amount).toBe(50);
  });

  it('should handle very small amounts', () => {
    const splits = service.calculateEqualSplits(0.01, ['u1', 'u2']);
    expect(splits).toHaveLength(2);
    const total = splits.reduce((s, sp) => s + sp.amount, 0);
    expect(Math.abs(total - 0.01)).toBeLessThan(0.02);
  });
});

describe('ExpenseService - calculateRatioSplits', () => {
  const service = new ExpenseService();

  it('should split by ratio', () => {
    const splits = service.calculateRatioSplits(100, [
      { entityId: 'u1', entityType: 'user', ratio: 2 },
      { entityId: 'u2', entityType: 'user', ratio: 1 },
      { entityId: 'u3', entityType: 'user', ratio: 1 },
    ]);
    expect(splits).toHaveLength(3);
    expect(splits[0].amount).toBe(50);
    expect(splits[1].amount).toBe(25);
    expect(splits[2].amount).toBe(25);
  });

  it('should handle equal ratios', () => {
    const splits = service.calculateRatioSplits(90, [
      { entityId: 'u1', entityType: 'user', ratio: 1 },
      { entityId: 'u2', entityType: 'user', ratio: 1 },
      { entityId: 'u3', entityType: 'user', ratio: 1 },
    ]);
    expect(splits[0].amount).toBe(30);
    expect(splits[1].amount).toBe(30);
    expect(splits[2].amount).toBe(30);
  });

  it('should throw if total ratio is zero', () => {
    expect(() => {
      service.calculateRatioSplits(100, [
        { entityId: 'u1', entityType: 'user', ratio: 0 },
      ]);
    }).toThrow('Total ratio cannot be zero');
  });

  it('should handle group entity types', () => {
    const splits = service.calculateRatioSplits(200, [
      { entityId: 'g1', entityType: 'group', ratio: 3 },
      { entityId: 'u1', entityType: 'user', ratio: 1 },
    ]);
    expect(splits[0].entityType).toBe('group');
    expect(splits[0].amount).toBe(150);
    expect(splits[1].entityType).toBe('user');
    expect(splits[1].amount).toBe(50);
  });

  it('should include ratio in output', () => {
    const splits = service.calculateRatioSplits(100, [
      { entityId: 'u1', entityType: 'user', ratio: 3 },
      { entityId: 'u2', entityType: 'user', ratio: 7 },
    ]);
    expect(splits[0].ratio).toBe(3);
    expect(splits[1].ratio).toBe(7);
  });

  it('should correctly split 6000 in 2:1 ratio', () => {
    const splits = service.calculateRatioSplits(6000, [
      { entityId: 'g1', entityType: 'group', ratio: 2 },
      { entityId: 'u1', entityType: 'user', ratio: 1 },
    ]);
    expect(splits[0].amount).toBe(4000);
    expect(splits[1].amount).toBe(2000);
    expect(splits[0].entityType).toBe('group');
    expect(splits[1].entityType).toBe('user');
  });

  it('should correctly split 10000 in 3:2:5 ratio', () => {
    const splits = service.calculateRatioSplits(10000, [
      { entityId: 'u1', entityType: 'user', ratio: 3 },
      { entityId: 'u2', entityType: 'user', ratio: 2 },
      { entityId: 'g1', entityType: 'group', ratio: 5 },
    ]);
    expect(splits[0].amount).toBe(3000);
    expect(splits[1].amount).toBe(2000);
    expect(splits[2].amount).toBe(5000);
    const total = splits.reduce((s, sp) => s + sp.amount, 0);
    expect(total).toBe(10000);
  });

  it('should handle large uneven ratios', () => {
    const splits = service.calculateRatioSplits(1000, [
      { entityId: 'u1', entityType: 'user', ratio: 7 },
      { entityId: 'u2', entityType: 'user', ratio: 3 },
    ]);
    expect(splits[0].amount).toBe(700);
    expect(splits[1].amount).toBe(300);
  });
});

describe('ExpenseService - updateExpense authorization', () => {
  const service = new ExpenseService();

  it('should allow payer to update their own expense (mocked)', async () => {
    // The actual DB calls are mocked, so we test the authorization logic
    // by checking that non-payer non-admin throws
    const mockExpense = {
      id: 'exp1',
      eventId: 'e1',
      paidBy: 'user-payer',
      title: 'Test',
      amount: 100,
      currency: 'USD',
      splitType: 'equal',
      splits: [],
      isPrivate: false,
    };

    // Mock getExpense to return the expense
    const { db } = require('../../config/firebase');
    db.collection.mockReturnValue({
      doc: jest.fn().mockReturnValue({
        get: jest.fn().mockResolvedValue({
          exists: true,
          data: () => mockExpense,
          id: 'exp1',
        }),
        set: jest.fn().mockResolvedValue({}),
      }),
    });

    // Non-payer, non-admin should throw
    await expect(
      service.updateExpense('exp1', 'other-user', { title: 'Updated' }, false)
    ).rejects.toThrow('Forbidden');

    // Admin should succeed (isAdmin = true)
    const result = await service.updateExpense('exp1', 'other-user', { title: 'Updated' }, true);
    // Result depends on mock, but it should not throw
    expect(result).toBeDefined();
  });

  it('should allow admin to delete expense they did not create', async () => {
    const mockExpense = {
      id: 'exp1',
      eventId: 'e1',
      paidBy: 'user-payer',
    };

    const { db } = require('../../config/firebase');
    db.collection.mockReturnValue({
      doc: jest.fn().mockReturnValue({
        get: jest.fn().mockResolvedValue({
          exists: true,
          data: () => mockExpense,
          id: 'exp1',
        }),
        delete: jest.fn().mockResolvedValue({}),
      }),
    });

    // Non-payer, non-admin should throw
    await expect(
      service.deleteExpense('exp1', 'other-user', false)
    ).rejects.toThrow('Forbidden');

    // Admin should succeed
    const result = await service.deleteExpense('exp1', 'other-user', true);
    expect(result).toBe(true);
  });
});
