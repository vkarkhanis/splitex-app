import type { Expense, Group } from '@traxettle/shared';
import { db } from '../config/firebase';

export class EventAccessError extends Error {
  constructor(public readonly statusCode: 403 | 404, message: string) {
    super(message);
    this.name = 'EventAccessError';
  }
}

/**
 * A user may see an event's data if they created it, administer it, or are a
 * participant. Older events may lack `participantIds`, so the participants
 * subcollection is checked as a fallback.
 */
export async function canAccessEvent(eventId: string, userId: string): Promise<boolean> {
  if (!eventId || !userId) return false;
  const snap = await db.collection('events').doc(eventId).get();
  if (!snap.exists) return false;
  const data = snap.data() || {};
  if (data.createdBy === userId) return true;
  if (Array.isArray(data.admins) && data.admins.includes(userId)) return true;
  if (Array.isArray(data.participantIds) && data.participantIds.includes(userId)) return true;
  const participant = await db.collection('events').doc(eventId).collection('participants').doc(userId).get();
  return participant.exists;
}

/** Throws EventAccessError(404) for a missing event, (403) for a non-member. */
export async function requireEventAccess(eventId: string, userId: string): Promise<void> {
  const snap = await db.collection('events').doc(eventId).get();
  if (!snap.exists) throw new EventAccessError(404, 'Event not found');
  if (!(await canAccessEvent(eventId, userId))) {
    throw new EventAccessError(403, 'Forbidden: You are not a participant of this event');
  }
}

/**
 * Private expenses are visible only to the creator's entity: the creator, or
 * fellow members of the event group the creator belongs to. This mirrors the
 * rule the web and mobile clients already apply.
 */
export function filterVisibleExpenses(expenses: Expense[], viewerId: string, groups: Group[]): Expense[] {
  const viewerGroup = groups.find((g) => (g.members || []).includes(viewerId));
  const viewerEntityMembers = new Set<string>(viewerGroup ? viewerGroup.members : [viewerId]);
  return expenses.filter((e) => !e.isPrivate || viewerEntityMembers.has(e.paidBy));
}
