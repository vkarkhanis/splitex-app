import { EventService } from '../services/event.service';

const eventService = new EventService();

/**
 * Check if an event is in a locked state (payment, settled, or closed).
 * Returns the event status if locked, or null if the event is active.
 */
export async function getEventLockStatus(eventId: string): Promise<'payment' | 'settled' | 'closed' | null> {
  const event = await eventService.getEvent(eventId);
  if (!event) return null;
  if (event.status === 'payment' || event.status === 'settled' || event.status === 'closed') {
    return event.status;
  }
  return null;
}

/**
 * Throws an error if the event is not active.
 * Use this guard before any mutation on expenses, groups, or invitations.
 * Blocks mutations when event is in payment, settled, or closed state.
 */
export async function requireActiveEvent(eventId: string): Promise<void> {
  const lockStatus = await getEventLockStatus(eventId);
  if (lockStatus) {
    const reason = lockStatus === 'payment'
      ? 'Payments are in progress.'
      : `The event is ${lockStatus}.`;
    throw new Error(`Forbidden: Cannot modify this event. ${reason} The event must be active.`);
  }
}
