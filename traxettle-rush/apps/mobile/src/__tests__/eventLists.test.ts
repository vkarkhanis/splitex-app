import { groupEventsForLists } from '../utils/eventLists';

const event = (id: string, status: string, createdAt: string) => ({ id, status, createdAt: new Date(createdAt) }) as any;

describe('groupEventsForLists', () => {
  it('keeps an event in settlement review listed with the in-progress ones, newest first', () => {
    const { inProgress, settled } = groupEventsForLists([
      event('a', 'active', '2026-10-01'),
      event('r', 'review', '2026-10-03'), // after Settle Now, while everyone approves
      event('p', 'payment', '2026-10-02'),
      event('s', 'settled', '2026-09-01'),
      event('c', 'closed', '2026-10-04'),
    ]);

    expect(inProgress.map((e) => e.id)).toEqual(['r', 'p', 'a']);
    expect(settled.map((e) => e.id)).toEqual(['s']);
  });
});
