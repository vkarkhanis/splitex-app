/**
 * Date-only helpers for expenses.
 *
 * Expenses store a date-only value as a `YYYY-MM-DD` string. All parsing and
 * formatting here is timezone-safe: a `YYYY-MM-DD` string is interpreted in the
 * client's local timezone (not UTC) so the displayed day never shifts.
 */

const pad = (n: number): string => String(n).padStart(2, '0');

/** Format a JS Date to a local `YYYY-MM-DD` string (client timezone). */
export function toLocalISODate(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Today's date as a local `YYYY-MM-DD` string (client timezone). */
export function todayLocalISODate(): string {
  return toLocalISODate(new Date());
}

/**
 * Parse a date value into a local Date.
 * Accepts a date-only `YYYY-MM-DD` string (parsed as local midnight to avoid
 * UTC shifts), or any value the Date constructor understands (e.g. an ISO
 * datetime such as `createdAt`).
 */
export function parseLocalDate(value?: string | number | Date | null): Date | null {
  if (value === undefined || value === null || value === '') return null;
  if (value instanceof Date) return isNaN(value.getTime()) ? null : value;
  if (typeof value === 'string') {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
    if (m) {
      const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
      return isNaN(d.getTime()) ? null : d;
    }
  }
  const d = new Date(value);
  return isNaN(d.getTime()) ? null : d;
}

/**
 * Format an expense date for display, e.g. "Aug 27, 2026".
 * `date` is the preferred date-only value; `fallback` (e.g. createdAt) is used
 * for legacy expenses that have no explicit date.
 */
export function formatExpenseDate(
  date?: string | null,
  fallback?: string | number | Date | null,
): string {
  const d = parseLocalDate(date) ?? parseLocalDate(fallback);
  if (!d) return '';
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}
