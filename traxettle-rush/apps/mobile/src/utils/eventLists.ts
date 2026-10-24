import type { Event as TraxettleEvent } from '@traxettle/shared';

/**
 * Events still being worked on: spending (active), settlement waiting for everyone's approval
 * (review) and payments under way (payment). An event in review must stay listed, or nobody can
 * open it to approve the settlement.
 */
export const IN_PROGRESS_EVENT_STATUSES: ReadonlyArray<TraxettleEvent['status']> = ['active', 'review', 'payment'];

type Listable = Pick<TraxettleEvent, 'status' | 'createdAt'>;

const newestFirst = (a: Listable, b: Listable) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();

/** The Dashboard's and All Events' lists: in-progress events and settled ones, newest first. */
export function groupEventsForLists<T extends Listable>(events: T[]): { inProgress: T[]; settled: T[] } {
  return {
    inProgress: events.filter((e) => IN_PROGRESS_EVENT_STATUSES.includes(e.status)).sort(newestFirst),
    settled: events.filter((e) => e.status === 'settled').sort(newestFirst),
  };
}
