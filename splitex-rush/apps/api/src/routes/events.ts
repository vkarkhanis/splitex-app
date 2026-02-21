import { Router } from 'express';
import { ApiResponse, CreateEventDto, UpdateEventDto } from '@splitex/shared';
import { EventService } from '../services/event.service';
import { requireAuth, type AuthenticatedRequest } from '../middleware/auth';
import { emitToEvent } from '../config/websocket';
import { notifyEventParticipants, getUserDisplayName } from '../utils/notification-helper';
import { EmailService } from '../services/email.service';
import { getEventLockStatus, requireActiveEvent } from '../utils/event-guards';
import { db } from '../config/firebase';
import { EntitlementService } from '../services/entitlement.service';

const emailService = new EmailService();

const router: Router = Router();
const eventService = new EventService();
const entitlementService = new EntitlementService();

function requiresProForFx(body: CreateEventDto | UpdateEventDto): boolean {
  const hasSettlementCurrency = typeof body.settlementCurrency === 'string' && body.settlementCurrency.trim().length > 0;
  const isDifferentCurrency = hasSettlementCurrency && typeof body.currency === 'string'
    ? body.settlementCurrency !== body.currency
    : hasSettlementCurrency;

  return Boolean(
    isDifferentCurrency ||
    body.fxRateMode !== undefined ||
    body.predefinedFxRates !== undefined,
  );
}

// Get all events for the authenticated user
router.get('/', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const uid = req.user!.uid;
    const events = await eventService.getUserEvents(uid);
    return res.json({ success: true, data: events } as ApiResponse);
  } catch (err) {
    console.error('GET /events error:', err);
    return res.status(500).json({ success: false, error: 'Failed to fetch events' } as ApiResponse);
  }
});

// Get a single event by ID
router.get('/:eventId', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const event = await eventService.getEvent(req.params.eventId);
    if (!event) {
      return res.status(404).json({ success: false, error: 'Event not found' } as ApiResponse);
    }
    return res.json({ success: true, data: event } as ApiResponse);
  } catch (err) {
    console.error('GET /events/:id error:', err);
    return res.status(500).json({ success: false, error: 'Failed to fetch event' } as ApiResponse);
  }
});

// Create a new event
router.post('/', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const uid = req.user!.uid;
    const body = req.body as CreateEventDto;

    if (!body.name || !body.type || !body.startDate || !body.currency) {
      return res.status(400).json({
        success: false,
        error: 'Name, type, startDate, and currency are required'
      } as ApiResponse);
    }

    if (!['trip', 'event'].includes(body.type)) {
      return res.status(400).json({
        success: false,
        error: 'Type must be "trip" or "event"'
      } as ApiResponse);
    }

    if (requiresProForFx(body)) {
      try {
        await entitlementService.assertCapability(uid, 'multiCurrencySettlement');
      } catch {
        return res.status(403).json({
          success: false,
          error: 'Multi-currency settlement requires Pro',
          code: 'FEATURE_REQUIRES_PRO',
          feature: 'multi_currency_settlement',
        } as ApiResponse);
      }
    }

    // Free-tier limit: max 3 active or closed events/trips.
    // Missing tier defaults to free until billing/subscription state is available.
    const userDoc = await db.collection('users').doc(uid).get();
    const userTier = (userDoc.exists ? (userDoc.data()?.tier as string | undefined) : undefined) || 'free';
    const isMockUser = uid.startsWith('mock-');
    if (userTier !== 'pro' && !isMockUser) {
      const existingEvents = await eventService.getUserEvents(uid);
      const activeOrClosedCount = existingEvents.filter(
        (evt) => evt.status === 'active' || evt.status === 'closed'
      ).length;
      if (activeOrClosedCount >= 3) {
        return res.status(403).json({
          success: false,
          error: 'Free users can have at most 3 active or closed events/trips'
        } as ApiResponse);
      }
    }

    const event = await eventService.createEvent(uid, body);
    return res.status(201).json({ success: true, data: event } as ApiResponse);
  } catch (err) {
    console.error('POST /events error:', err);
    return res.status(500).json({ success: false, error: 'Failed to create event' } as ApiResponse);
  }
});

// Update an event
router.put('/:eventId', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const uid = req.user!.uid;
    const dto = req.body as UpdateEventDto;

    // Enforce status-based restrictions on event updates
    const lockStatus = await getEventLockStatus(req.params.eventId);
    if (lockStatus === 'closed') {
      return res.status(403).json({ success: false, error: 'Cannot modify a closed event' } as ApiResponse);
    }
    if (lockStatus === 'payment') {
      // In payment mode, no edits allowed at all (settlements handle status transitions)
      return res.status(403).json({ success: false, error: 'Cannot modify event while payments are in progress' } as ApiResponse);
    }
    if (lockStatus === 'settled') {
      // Only allow status change to 'closed', nothing else
      const onlyClosing = dto.status === 'closed' && Object.keys(dto).filter(k => k !== 'status').length === 0;
      if (!onlyClosing) {
        return res.status(403).json({ success: false, error: 'Event is settled. You can only close it.' } as ApiResponse);
      }
    }

    if (requiresProForFx(dto)) {
      try {
        await entitlementService.assertCapability(uid, 'multiCurrencySettlement');
      } catch {
        return res.status(403).json({
          success: false,
          error: 'Multi-currency settlement requires Pro',
          code: 'FEATURE_REQUIRES_PRO',
          feature: 'multi_currency_settlement',
        } as ApiResponse);
      }
    }

    const event = await eventService.updateEvent(req.params.eventId, uid, dto);

    if (!event) {
      return res.status(404).json({ success: false, error: 'Event not found' } as ApiResponse);
    }

    emitToEvent(req.params.eventId, 'event:updated', { event });
    notifyEventParticipants(req.params.eventId, uid, 'event_updated', {
      Name: event.name,
      Status: event.status,
      Currency: event.currency,
    });
    return res.json({ success: true, data: event } as ApiResponse);
  } catch (err: any) {
    console.error('PUT /events/:id error:', err);
    if (err.message?.includes('Forbidden')) {
      return res.status(403).json({ success: false, error: err.message } as ApiResponse);
    }
    return res.status(500).json({ success: false, error: 'Failed to update event' } as ApiResponse);
  }
});

// Delete an event
router.delete('/:eventId', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const uid = req.user!.uid;

    // Prevent deletion of settled or closed events
    const lockStatus = await getEventLockStatus(req.params.eventId);
    if (lockStatus) {
      return res.status(403).json({
        success: false,
        error: `Cannot delete a ${lockStatus} event. ${lockStatus === 'settled' ? 'You may close it instead.' : ''}`
      } as ApiResponse);
    }

    // Get event and participants BEFORE deletion for notification emails
    const eventToDelete = await eventService.getEvent(req.params.eventId);
    const participantsBefore = await eventService.getParticipants(req.params.eventId);
    const actorName = await getUserDisplayName(uid);

    const deleted = await eventService.deleteEvent(req.params.eventId, uid);

    if (!deleted) {
      return res.status(404).json({ success: false, error: 'Event not found' } as ApiResponse);
    }

    emitToEvent(req.params.eventId, 'event:deleted', { eventId: req.params.eventId });

    // Send deletion notification emails (fire-and-forget)
    if (eventToDelete) {
      const recipients = participantsBefore.map(p => ({ userId: p.userId, email: p.email }));
      emailService.sendBulkNotifications(recipients, uid, {
        eventName: eventToDelete.name,
        eventId: req.params.eventId,
        actorName,
        type: 'event_deleted',
        details: { 'Event Name': eventToDelete.name },
      });
    }
    return res.json({ success: true, data: { message: 'Event deleted successfully' } } as ApiResponse);
  } catch (err: any) {
    console.error('DELETE /events/:id error:', err);
    if (err.message?.includes('Forbidden')) {
      return res.status(403).json({ success: false, error: err.message } as ApiResponse);
    }
    return res.status(500).json({ success: false, error: 'Failed to delete event' } as ApiResponse);
  }
});

// Get event participants
router.get('/:eventId/participants', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const participants = await eventService.getParticipants(req.params.eventId);
    return res.json({ success: true, data: participants } as ApiResponse);
  } catch (err) {
    console.error('GET /events/:id/participants error:', err);
    return res.status(500).json({ success: false, error: 'Failed to fetch participants' } as ApiResponse);
  }
});

// Add a participant to an event
router.post('/:eventId/participants', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const uid = req.user!.uid;
    const { userId, role } = req.body;

    if (!userId) {
      return res.status(400).json({ success: false, error: 'userId is required' } as ApiResponse);
    }

    const isAdmin = await eventService.isAdmin(req.params.eventId, uid);
    if (!isAdmin) {
      return res.status(403).json({ success: false, error: 'Only admins can add participants' } as ApiResponse);
    }

    await requireActiveEvent(req.params.eventId);
    const participant = await eventService.addParticipant(req.params.eventId, userId, uid, role || 'member');
    return res.status(201).json({ success: true, data: participant } as ApiResponse);
  } catch (err) {
    console.error('POST /events/:id/participants error:', err);
    return res.status(500).json({ success: false, error: 'Failed to add participant' } as ApiResponse);
  }
});

// Remove a participant from an event
router.delete('/:eventId/participants/:userId', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const requesterId = req.user!.uid;
    const removed = await eventService.removeParticipant(req.params.eventId, req.params.userId, requesterId);

    if (!removed) {
      return res.status(404).json({ success: false, error: 'Participant not found' } as ApiResponse);
    }

    return res.json({ success: true, data: { message: 'Participant removed successfully' } } as ApiResponse);
  } catch (err: any) {
    console.error('DELETE /events/:id/participants/:userId error:', err);
    if (err.message?.includes('Forbidden') || err.message?.includes('Cannot remove')) {
      return res.status(403).json({ success: false, error: err.message } as ApiResponse);
    }
    return res.status(500).json({ success: false, error: 'Failed to remove participant' } as ApiResponse);
  }
});

// Backfill participantIds for an event (migration helper)
router.post('/:eventId/backfill-participants', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const uid = req.user!.uid;
    const isAdmin = await eventService.isAdmin(req.params.eventId, uid);
    if (!isAdmin) {
      return res.status(403).json({ success: false, error: 'Only admins can trigger backfill' } as ApiResponse);
    }

    const ids = await eventService.backfillParticipantIds(req.params.eventId);
    return res.json({ success: true, data: { participantIds: ids, count: ids.length } } as ApiResponse);
  } catch (err: any) {
    console.error('POST /events/:id/backfill-participants error:', err);
    return res.status(500).json({ success: false, error: 'Failed to backfill participants' } as ApiResponse);
  }
});

export { router as eventRoutes };
