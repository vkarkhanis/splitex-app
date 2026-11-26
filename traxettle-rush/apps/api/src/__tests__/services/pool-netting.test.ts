import { foldablePoolLegs, foldLegsIntoBalances } from '../../services/pool-netting';

describe('foldablePoolLegs', () => {
  const leg = (id: string, extra: Record<string, any>) => ({ id, kind: 'pool_repayment', poolCycleId: 'c1', status: 'pending', fromUserId: 'r', toUserId: 'a', amount: 10, ...extra });

  it("takes this cycle's repayments and claims nobody has started paying", () => {
    const legs = [
      leg('a', {}),
      leg('b', { kind: 'pool_reimbursement', status: 'failed' }),
      leg('c', { status: 'initiated' }),
      leg('d', { status: 'completed' }),
      leg('e', { status: 'netted' }),
      leg('f', { poolCycleId: 'c0' }),
      leg('g', { kind: 'pool_cycle' }),
      leg('h', { kind: 'pool_member_exit' }),
      leg('i', { kind: undefined }),
    ];
    expect(foldablePoolLegs(legs, 'c1').map((l) => l.id)).toEqual(['a', 'b']);
  });
});

describe('foldLegsIntoBalances', () => {
  const groups = [{ id: 'fam', members: ['ravi', 'meera'] }] as any[];

  it('debits the payer and credits the payee', () => {
    expect(foldLegsIntoBalances([{ fromUserId: 'priya', toUserId: 'anita', amount: 600 }], [])).toEqual([
      { entityId: 'priya', entityType: 'user', amount: -600 },
      { entityId: 'anita', entityType: 'user', amount: 600 },
    ]);
  });

  it("folds a group member's payment into the group's balance, and sums per entity", () => {
    const balances = foldLegsIntoBalances([
      { fromUserId: 'ravi', toUserId: 'anita', amount: 600 },
      { fromUserId: 'meera', toUserId: 'anita', amount: 150.5 },
      { fromUserId: 'anita', toUserId: 'priya', amount: 100 },
    ], groups);
    expect(balances).toEqual([
      { entityId: 'fam', entityType: 'group', amount: -750.5 },
      { entityId: 'anita', entityType: 'user', amount: 650.5 },
      { entityId: 'priya', entityType: 'user', amount: 100 },
    ]);
  });

  it('ignores empty, negative and self payments, and drops entities that net to zero', () => {
    expect(foldLegsIntoBalances([
      { fromUserId: 'a', toUserId: 'b', amount: 0 },
      { fromUserId: 'a', toUserId: 'b', amount: -5 },
      { fromUserId: 'a', toUserId: 'a', amount: 5 },
      { fromUserId: 'a', toUserId: 'b', amount: 7 },
      { fromUserId: 'b', toUserId: 'a', amount: 7 },
    ], [])).toEqual([]);
  });
});
