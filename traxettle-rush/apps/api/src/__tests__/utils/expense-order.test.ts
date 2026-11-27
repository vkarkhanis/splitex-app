import { compareExpensesNewestFirst, sortExpensesNewestFirst } from '../../utils/expense-order';

type Row = { id: string; date?: string; createdAt: any };

const ids = (rows: Row[]) => rows.map((r) => r.id);

describe('sortExpensesNewestFirst', () => {
  it('puts the newest expense date first, whatever order the rows arrive in', () => {
    const rows: Row[] = [
      { id: 'b', date: '2026-11-02', createdAt: '2026-11-20T10:00:00.000Z' },
      { id: 'a', date: '2026-11-05', createdAt: '2026-11-01T10:00:00.000Z' },
      { id: 'c', date: '2026-10-30', createdAt: '2026-11-25T10:00:00.000Z' },
    ];
    expect(ids(sortExpensesNewestFirst(rows))).toEqual(['a', 'b', 'c']);
  });

  it('orders expenses on the same date by when they were recorded, newest first', () => {
    const rows: Row[] = [
      { id: 'x', date: '2026-11-05', createdAt: '2026-11-05T08:00:00.000Z' },
      { id: 'y', date: '2026-11-05', createdAt: '2026-11-05T20:00:00.000Z' },
      { id: 'z', date: '2026-11-05', createdAt: '2026-11-05T12:00:00.000Z' },
    ];
    expect(ids(sortExpensesNewestFirst(rows))).toEqual(['y', 'z', 'x']);
  });

  it('uses the recorded day for legacy expenses that have no date', () => {
    const rows: Row[] = [
      { id: 'dated-old', date: '2026-06-01', createdAt: '2026-11-01T00:00:00.000Z' },
      { id: 'legacy', createdAt: '2026-07-15T09:00:00.000Z' },
      { id: 'dated-new', date: '2026-08-01', createdAt: '2026-08-01T00:00:00.000Z' },
    ];
    expect(ids(sortExpensesNewestFirst(rows))).toEqual(['dated-new', 'legacy', 'dated-old']);
  });

  it('reads Date objects and Firestore Timestamps as well as ISO strings', () => {
    const rows: Row[] = [
      { id: 'iso', date: '2026-11-05', createdAt: '2026-11-05T10:00:00.000Z' },
      { id: 'ts', date: '2026-11-05', createdAt: { toMillis: () => Date.parse('2026-11-05T12:00:00.000Z') } },
      { id: 'raw-ts', date: '2026-11-05', createdAt: { _seconds: Date.parse('2026-11-05T11:00:00.000Z') / 1000 } },
      { id: 'date', date: '2026-11-05', createdAt: new Date('2026-11-05T09:00:00.000Z') },
    ];
    expect(ids(sortExpensesNewestFirst(rows))).toEqual(['ts', 'raw-ts', 'iso', 'date']);
  });

  it('breaks full ties by id, so the order is the same on every request', () => {
    const at = '2026-11-05T10:00:00.000Z';
    const rows: Row[] = [
      { id: 'q9', date: '2026-11-05', createdAt: at },
      { id: 'a1', date: '2026-11-05', createdAt: at },
      { id: 'm5', date: '2026-11-05', createdAt: at },
    ];
    expect(ids(sortExpensesNewestFirst(rows))).toEqual(['a1', 'm5', 'q9']);
    expect(ids(sortExpensesNewestFirst([...rows].reverse()))).toEqual(['a1', 'm5', 'q9']);
  });

  it('puts rows with no readable date or time last instead of throwing', () => {
    const rows: Row[] = [
      { id: 'broken', createdAt: undefined },
      { id: 'ok', date: '2026-01-01', createdAt: '2026-01-01T00:00:00.000Z' },
      { id: 'no-time', date: '2026-01-01', createdAt: 'not a date' },
    ];
    expect(ids(sortExpensesNewestFirst(rows))).toEqual(['ok', 'no-time', 'broken']);
  });

  it('returns a new array and leaves the input alone', () => {
    const rows: Row[] = [
      { id: 'old', date: '2026-01-01', createdAt: '2026-01-01T00:00:00.000Z' },
      { id: 'new', date: '2026-02-01', createdAt: '2026-02-01T00:00:00.000Z' },
    ];
    const sorted = sortExpensesNewestFirst(rows);
    expect(sorted).not.toBe(rows);
    expect(ids(rows)).toEqual(['old', 'new']);
  });

  it('compares an expense with itself as equal', () => {
    const row: Row = { id: 'same', date: '2026-01-01', createdAt: '2026-01-01T00:00:00.000Z' };
    expect(compareExpensesNewestFirst(row, row)).toBe(0);
  });
});
