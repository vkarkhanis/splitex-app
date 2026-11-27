import type { Expense } from '@traxettle/shared';

type Orderable = Pick<Expense, 'id' | 'date' | 'createdAt'>;

/**
 * Milliseconds since the epoch for an ISO string, Date, epoch number or Firestore Timestamp.
 * NaN when the value is missing or unreadable.
 */
function toMillis(value: unknown): number {
  if (value == null) return NaN;
  if (typeof value === 'number') return value;
  if (typeof value === 'string') return Date.parse(value);
  if (value instanceof Date) return value.getTime();
  if (typeof value === 'object') {
    const v = value as { toMillis?: () => number; seconds?: number; _seconds?: number };
    if (typeof v.toMillis === 'function') return v.toMillis();
    const seconds = typeof v.seconds === 'number' ? v.seconds : v._seconds;
    if (typeof seconds === 'number') return seconds * 1000;
  }
  return NaN;
}

/**
 * The day the expense happened (YYYY-MM-DD). Expenses saved before the `date` field existed
 * fall back to the day they were recorded, the same fallback the apps use to display them.
 * '' when neither is readable, which sorts after every real day.
 */
function expenseDay(e: Orderable): string {
  if (typeof e.date === 'string' && /^\d{4}-\d{2}-\d{2}/.test(e.date)) return e.date.slice(0, 10);
  const ms = toMillis(e.createdAt);
  return Number.isFinite(ms) ? new Date(ms).toISOString().slice(0, 10) : '';
}

/**
 * Newest first: by the day the expense happened, then by when it was recorded, then by id so
 * that equal entries still come back in the same order every time.
 */
export function compareExpensesNewestFirst(a: Orderable, b: Orderable): number {
  const aDay = expenseDay(a);
  const bDay = expenseDay(b);
  if (aDay !== bDay) return aDay < bDay ? 1 : -1;

  const aMs = toMillis(a.createdAt);
  const bMs = toMillis(b.createdAt);
  const aKnown = Number.isFinite(aMs);
  const bKnown = Number.isFinite(bMs);
  if (aKnown !== bKnown) return aKnown ? -1 : 1;
  if (aKnown && aMs !== bMs) return bMs - aMs;

  if (a.id === b.id) return 0;
  return a.id < b.id ? -1 : 1;
}

/**
 * A copy of `expenses` in the order the expense list shows them. Firestore returns an
 * unordered query in document-id order, and ids are random, so the list must be sorted here.
 */
export function sortExpensesNewestFirst<T extends Orderable>(expenses: T[]): T[] {
  return [...expenses].sort(compareExpensesNewestFirst);
}
