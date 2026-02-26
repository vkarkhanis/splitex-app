import { EventService } from '../services/event.service';
import { SettlementService } from '../services/settlement.service';

const eventService = new EventService();

/**
 * Check if an event is in a locked state (payment, settled, or closed).
 * 'review' is NOT locked — expenses can still be edited during review.
 * Returns the event status if locked, or null if the event allows edits.
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
 * Throws an error if the event does not allow edits.
 * Allows edits when event is 'active' or 'review'.
 * Blocks mutations when event is in payment, settled, or closed state.
 */
export async function requireEditableEvent(eventId: string): Promise<void> {
  const lockStatus = await getEventLockStatus(eventId);
  if (lockStatus) {
    const reason = lockStatus === 'payment'
      ? 'Payments are in progress.'
      : `The event is ${lockStatus}.`;
    throw new Error(`Forbidden: Cannot modify this event. ${reason} The event must be active or in review.`);
  }
}

/**
 * @deprecated Use requireEditableEvent instead. Kept for backward compatibility.
 */
export async function requireActiveEvent(eventId: string): Promise<void> {
  return requireEditableEvent(eventId);
}

/**
 * Mark the settlement as stale if the event is currently in 'review' status.
 * Call this after any expense/group mutation succeeds during the review phase.
 */
export async function markStaleIfInReview(eventId: string): Promise<void> {
  const event = await eventService.getEvent(eventId);
  if (!event || event.status !== 'review') return;

  const settlementService = new SettlementService();
  await settlementService.markSettlementStale(eventId);
}
