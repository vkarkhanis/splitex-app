import { EventService } from '../services/event.service';

const eventService = new EventService();

/**
 * Check if an event is in a locked state (settled or closed).
 * Returns the event status if locked, or null if the event is active.
 */
export async function getEventLockStatus(eventId: string): Promise<'settled' | 'closed' | null> {
  const event = await eventService.getEvent(eventId);
  if (!event) return null;
  if (event.status === 'settled' || event.status === 'closed') {
    return event.status;
  }
  return null;
}

/**
 * Throws an error if the event is settled or closed.
 * Use this guard before any mutation on expenses, groups, or invitations.
 */
export async function requireActiveEvent(eventId: string): Promise<void> {
  const lockStatus = await getEventLockStatus(eventId);
  if (lockStatus) {
    throw new Error(`Forbidden: Cannot modify a ${lockStatus} event. The event must be active.`);
  }
}
