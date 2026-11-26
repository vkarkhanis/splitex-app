import { isExpenseVisibleTo } from '../expense-visibility';

const anita = { entityId: 'anita', memberIds: ['anita'] };
const ravi = { entityId: 'ravi', memberIds: ['ravi'] };
const family = { entityId: 'g-family', memberIds: ['priya', 'kiran'] };
const shared = (paidBy: string, splitWith: string[], extra = {}) => ({
  paidBy,
  isPrivate: false,
  splits: splitWith.map((entityId) => ({ entityId })),
  ...extra,
});

describe('isExpenseVisibleTo', () => {
  it('shows a shared expense to everyone it is split between', () => {
    const dinner = shared('anita', ['anita', 'ravi']);
    expect(isExpenseVisibleTo(dinner, anita)).toBe(true);
    expect(isExpenseVisibleTo(dinner, ravi)).toBe(true);
    expect(isExpenseVisibleTo(dinner, family)).toBe(false);
  });

  it('shows an "on behalf of" expense to the one who paid, though they are not in the split', () => {
    const tickets = shared('anita', ['ravi', 'g-family'], { paidOnBehalfOf: [{ entityId: 'ravi' }, { entityId: 'g-family' }] });
    expect(isExpenseVisibleTo(tickets, anita)).toBe(true);
    expect(isExpenseVisibleTo(tickets, ravi)).toBe(true);
    expect(isExpenseVisibleTo(tickets, family)).toBe(true);
  });

  it('treats a group as one: its members see what any of them paid', () => {
    const fuel = shared('kiran', ['ravi']);
    expect(isExpenseVisibleTo(fuel, family)).toBe(true);
    expect(isExpenseVisibleTo(fuel, anita)).toBe(false);
  });

  it('shows a private expense only to the entity that recorded it', () => {
    const souvenirs = { paidBy: 'ravi', isPrivate: true, splits: [] };
    expect(isExpenseVisibleTo(souvenirs, ravi)).toBe(true);
    expect(isExpenseVisibleTo(souvenirs, anita)).toBe(false);
    expect(isExpenseVisibleTo({ ...souvenirs, paidBy: 'priya' }, family)).toBe(true);
  });

  it('shows pool spends to everyone in the event', () => {
    const snacks = shared('ravi', [], { fundingSource: 'pool' as const });
    expect(isExpenseVisibleTo(snacks, anita)).toBe(true);
    expect(isExpenseVisibleTo(snacks, family)).toBe(true);
  });

  it('copes with missing splits and a viewer without an entity', () => {
    expect(isExpenseVisibleTo({ paidBy: 'anita', isPrivate: false, splits: null }, ravi)).toBe(false);
    expect(isExpenseVisibleTo(shared('anita', ['ravi']), { entityId: null, memberIds: [] })).toBe(false);
  });
});
