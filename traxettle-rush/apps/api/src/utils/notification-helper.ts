import { db } from '../config/firebase';
import { EmailService } from '../services/email.service';
import { EventService } from '../services/event.service';
import type { NotificationEmailData } from '../services/email.service';

const emailService = new EmailService();
const eventService = new EventService();

type InvitationDoc = {
  eventId?: string;
  inviteeEmail?: string | null;
  inviteeUserId?: string | null;
  status?: string;
  expiresAt?: string;
};

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

async function getUserEmail(userId: string): Promise<string | undefined> {
  try {
    const userDoc = await db.collection('users').doc(userId).get();
    if (userDoc.exists) {
      const data = userDoc.data();
      return typeof data?.email === 'string' ? data.email : undefined;
    }
  } catch { /* ignore */ }
  return undefined;
}

/**
 * Send notification emails to all participants of an event (excluding the actor).
 * This is fire-and-forget — it does not block the API response.
 *
 * Also emails pending invitees by email so invited-but-not-installed users keep
 * getting updates without needing to accept the invite first.
 */
export async function notifyEventParticipants(
  eventId: string,
  actorUserId: string,
  type: NotificationEmailData['type'],
  details: Record<string, string>,
): Promise<void> {
  try {
    const [event, participants, actorName, actorEmail] = await Promise.all([
      eventService.getEvent(eventId),
      eventService.getParticipants(eventId),
      getUserDisplayName(actorUserId),
      getUserEmail(actorUserId),
    ]);

    if (!event) return;

    const participantRecipients = participants.map(p => ({
      userId: p.userId,
      email: p.email,
    }));

    emailService.sendBulkNotifications(participantRecipients, actorUserId, {
      eventName: event.name,
      eventId,
      actorName,
      type,
      details,
    });

    // Pending invitees (email-based) should also receive updates until they accept/decline.
    // This supports "payee doesn't have Traxettle installed yet" scenarios.
    const invitationsSnap = await db
      .collection('invitations')
      .where('eventId', '==', eventId)
      .where('status', '==', 'pending')
      .get();

    if (!invitationsSnap.empty) {
      const now = Date.now();
      const participantEmailSet = new Set(
        participantRecipients
          .map((r) => (typeof r.email === 'string' ? r.email.toLowerCase() : ''))
          .filter(Boolean),
      );

      const inviteeEmails = invitationsSnap.docs
        .map((d) => d.data() as InvitationDoc)
        .filter((inv) => {
          const email = typeof inv.inviteeEmail === 'string' ? inv.inviteeEmail : '';
          if (!email) return false;
          if (actorEmail && email.toLowerCase() === actorEmail.toLowerCase()) return false;
          if (participantEmailSet.has(email.toLowerCase())) return false;
          if (typeof inv.expiresAt === 'string') {
            const ts = Date.parse(inv.expiresAt);
            if (!Number.isNaN(ts) && ts < now) return false;
          }
          return true;
        })
        .map((inv) => (inv.inviteeEmail as string).trim())
        .filter(Boolean);

      const deduped = Array.from(new Set(inviteeEmails.map((e) => e.toLowerCase()))).map((e) => inviteeEmails.find((x) => x.toLowerCase() === e)!).filter(Boolean);

      if (deduped.length > 0) {
        // Fire-and-forget external notifications (no preference doc exists yet).
        Promise.allSettled(
          deduped.map((email) =>
            emailService.sendNotificationEmail({
              recipientEmail: email,
              eventName: event.name,
              eventId,
              actorName,
              type,
              details,
            }),
          ),
        ).catch(() => { /* ignore */ });
      }
    }
  } catch (err) {
    console.warn(`📧 Failed to send ${type} notifications for event ${eventId}:`, err);
  }
}
