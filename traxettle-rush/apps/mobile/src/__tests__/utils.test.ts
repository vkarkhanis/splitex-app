import { formatCurrency, formatDate } from '../utils';

describe('mobile utils', () => {
  it('formats currency values', () => {
    expect(formatCurrency(1234.5, 'USD')).toBe('$1,234.50');
    expect(formatCurrency(1000, 'INR')).toContain('1,000');
  });

  it('formats dates with local date output', () => {
    const date = new Date('2026-02-20T10:30:00.000Z');
    expect(formatDate(date)).toBe(date.toLocaleDateString());
  });
});
