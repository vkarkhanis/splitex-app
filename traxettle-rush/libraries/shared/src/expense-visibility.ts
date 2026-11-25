import { isPoolFundedExpense } from './pool';
import type { ExpenseFundingSource } from './pool';

/** Who is looking: their entity (themselves, or their group if they're in one) and its members. */
export interface ExpenseViewer {
  /** The viewer's user id, or their group's id when they're in a group. */
  entityId: string | null;
  /** The user ids that make up that entity: just the viewer, or every member of their group. */
  memberIds: string[];
}

/**
 * Whether an expense belongs in someone's list and totals on an event's screen. A group sees what
 * each of its members sees.
 * - Pool spends: everyone in the event (the pool is shared).
 * - Private expenses: only the entity that recorded them.
 * - Shared expenses: the entities it's split between, and the one who paid. Someone who paid "on
 *   behalf of" others isn't in the split, but the payment is still theirs.
 */
export function isExpenseVisibleTo(
  expense: {
    isPrivate?: boolean;
    paidBy: string;
    splits?: Array<{ entityId: string }> | null;
    fundingSource?: ExpenseFundingSource | null;
  },
  viewer: ExpenseViewer,
): boolean {
  if (isPoolFundedExpense(expense)) return true;
  if (expense.isPrivate) return viewer.memberIds.includes(expense.paidBy);
  if (viewer.memberIds.includes(expense.paidBy)) return true;
  return viewer.entityId !== null && (expense.splits || []).some((s) => s.entityId === viewer.entityId);
}
