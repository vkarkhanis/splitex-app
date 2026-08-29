import {
  toLocalISODate,
  todayLocalISODate,
  parseLocalDate,
  formatExpenseDate,
} from '../utils/date';

describe('date utils', () => {
  describe('toLocalISODate', () => {
    it('formats a Date to local YYYY-MM-DD with zero padding', () => {
      expect(toLocalISODate(new Date(2026, 0, 5))).toBe('2026-01-05');
      expect(toLocalISODate(new Date(2026, 11, 31))).toBe('2026-12-31');
    });
  });

  describe('todayLocalISODate', () => {
    it('returns today in local timezone as YYYY-MM-DD', () => {
      const now = new Date();
      const expected = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
      expect(todayLocalISODate()).toBe(expected);
    });
  });

  describe('parseLocalDate', () => {
    it('parses a YYYY-MM-DD string as a local date (no UTC shift)', () => {
      const d = parseLocalDate('2026-08-27')!;
      expect(d.getFullYear()).toBe(2026);
      expect(d.getMonth()).toBe(7); // August (0-based)
      expect(d.getDate()).toBe(27);
    });

    it('returns null for empty/nullish values', () => {
      expect(parseLocalDate('')).toBeNull();
      expect(parseLocalDate(null)).toBeNull();
      expect(parseLocalDate(undefined)).toBeNull();
    });

    it('parses ISO datetime strings (e.g. createdAt)', () => {
      const d = parseLocalDate('2026-08-27T10:30:00.000Z')!;
      expect(d).toBeInstanceOf(Date);
      expect(isNaN(d.getTime())).toBe(false);
    });

    it('returns null for invalid input', () => {
      expect(parseLocalDate('not-a-date')).toBeNull();
    });
  });

  describe('formatExpenseDate', () => {
    it('formats a date-only string', () => {
      expect(formatExpenseDate('2026-08-27')).toBe('Aug 27, 2026');
    });

    it('falls back to createdAt when date is missing', () => {
      expect(formatExpenseDate(undefined, '2026-08-27T00:00:00')).toBe('Aug 27, 2026');
      expect(formatExpenseDate(null, '2026-08-27')).toBe('Aug 27, 2026');
    });

    it('returns empty string when nothing is provided', () => {
      expect(formatExpenseDate()).toBe('');
      expect(formatExpenseDate(null, null)).toBe('');
    });

    it('does not shift the day for a date-only value regardless of timezone', () => {
      // 1st of month must never render as the previous month/day
      expect(formatExpenseDate('2026-03-01')).toBe('Mar 1, 2026');
    });
  });
});
