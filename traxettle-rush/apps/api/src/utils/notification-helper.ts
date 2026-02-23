import { db } from '../config/firebase';
import { EmailService } from '../services/email.service';
import { EventService } from '../services/event.service';
import type { NotificationEmailData } from '../services/email.service';

const emailService = new EmailService();
const eventService = new EventService();

/**
 * Resolve a userId to a display name by looking up the users collection.
 */
export async function getUserDisplayName(userId: string): Promise<string> {
  try {
    const userDoc = await db.collection('users').doc(userId).get();
    if (userDoc.exists) {
      const data = userDoc.data();
      return data?.displayName || data?.email || userId;
    }
  } catch { /* fallback */ }
  return userId;
}

/**
 * Send notification emails to all participants of an event (excluding the actor).
 * This is fire-and-forget — it does not block the API response.
 */
export async function notifyEventParticipants(
  eventId: string,
  actorUserId: string,
  type: NotificationEmailData['type'],
  details: Record<string, string>,
): Promise<void> {
  try {
    const [event, participants, actorName] = await Promise.all([
      eventService.getEvent(eventId),
      eventService.getParticipants(eventId),
      getUserDisplayName(actorUserId),
    ]);

    if (!event) return;

    const recipients = participants.map(p => ({
      userId: p.userId,
      email: p.email,
    }));

    emailService.sendBulkNotifications(recipients, actorUserId, {
      eventName: event.name,
      eventId,
      actorName,
      type,
      details,
    });
  } catch (err) {
    console.warn(`📧 Failed to send ${type} notifications for event ${eventId}:`, err);
  }
}
