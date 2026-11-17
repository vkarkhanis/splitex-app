/**
 * Netting pool payments into the final settlement (design doc §11).
 *
 * At settle-up, repayments for rejected spends (`pool_repayment`) and unpaid claims
 * (`pool_reimbursement`) of the cycle being settled are folded into the event's balances, so the
 * fewest-payments plan covers them instead of each being paid on its own. Only rows nobody has
 * started paying are folded (`pending` or `failed`); one already `initiated` stays separate.
 * Rows from earlier cycles (`pool_cycle`) and leaving settlements (`pool_member_exit`) never fold.
 */
import type { Balance, Group } from '@traxettle/shared';

export const FOLDABLE_POOL_LEG_KINDS = ['pool_repayment', 'pool_reimbursement'] as const;

export type FoldableLeg = Record<string, any> & {
  id: string;
  kind: (typeof FOLDABLE_POOL_LEG_KINDS)[number];
  poolCycleId: string;
  fromUserId: string;
  toUserId: string;
  amount: number;
  status: string;
};

/** The legs of a cycle that settle-up folds into the final plan. */
export function foldablePoolLegs(legs: Array<Record<string, any> & { id: string }>, cycleId: string): FoldableLeg[] {
  return legs.filter((l): l is FoldableLeg =>
    (FOLDABLE_POOL_LEG_KINDS as readonly string[]).includes(l.kind)
    && l.poolCycleId === cycleId
    && (l.status === 'pending' || l.status === 'failed'),
  );
}

/** A user counts under their event group, if they're in one: the plan is per group (§11.5). */
function entityOf(userId: string, groups: Group[]): { entityId: string; entityType: 'user' | 'group' } {
  const group = groups.find((g) => (g.members || []).includes(userId));
  return group ? { entityId: group.id, entityType: 'group' } : { entityId: userId, entityType: 'user' };
}

/**
 * Turn folded legs into balances: the payer's entity owes the amount (−), the payee's entity is
 * owed it (+). Amounts are in the event currency, like every other balance in the plan.
 */
export function foldLegsIntoBalances(legs: Array<Pick<FoldableLeg, 'fromUserId' | 'toUserId' | 'amount'>>, groups: Group[]): Balance[] {
  const byKey = new Map<string, Balance>();
  const add = (userId: string, amount: number) => {
    const ref = entityOf(userId, groups);
    const key = `${ref.entityType}:${ref.entityId}`;
    const prev = byKey.get(key);
    byKey.set(key, { ...ref, amount: (prev?.amount || 0) + amount });
  };
  for (const leg of legs) {
    const amount = Number(leg.amount) || 0;
    if (amount <= 0 || leg.fromUserId === leg.toUserId) continue;
    add(leg.fromUserId, -amount);
    add(leg.toUserId, amount);
  }
  return [...byKey.values()]
    .map((b) => ({ ...b, amount: Math.round(b.amount * 100) / 100 }))
    .filter((b) => Math.abs(b.amount) > 0.001);
}
