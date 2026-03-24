import { Router } from 'express';
import { ApiResponse, CreateEventDto, UpdateEventDto } from '@traxettle/shared';
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

function parseLimit(v: any): number | null {
  const n = Number.parseInt(String(v || ''), 10);
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.min(n, 200);
}

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
    const filter = String(req.query.filter || 'all');
    const limit = parseLimit(req.query.limit);

    const sorted = [...(events || [])].sort((a: any, b: any) => {
      const at = a?.updatedAt ? Date.parse(String(a.updatedAt)) : (a?.createdAt ? Date.parse(String(a.createdAt)) : 0);
      const bt = b?.updatedAt ? Date.parse(String(b.updatedAt)) : (b?.createdAt ? Date.parse(String(b.createdAt)) : 0);
      if (at !== bt) return bt - at;
      return String(a?.id || '').localeCompare(String(b?.id || ''));
    });

    let out = sorted;
    if (filter === 'active') out = out.filter((e: any) => e?.status && e.status !== 'closed');
    if (filter === 'history') out = out.filter((e: any) => e?.status === 'closed');
    if (limit) out = out.slice(0, limit);

    return res.json({ success: true, data: out } as ApiResponse);
  } catch (err) {
    console.error('GET /events error:', err);
    return res.status(500).json({ success: false, error: 'Failed to fetch events' } as ApiResponse);
  }
});

// Email event history to the current user (ignores notification preference)
router.post('/history-email', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const uid = req.user!.uid;
    const recipientEmail = req.user!.email;
    if (!recipientEmail) {
      return res.status(400).json({ success: false, error: 'No email found for this account' } as ApiResponse);
    }
    const events = await eventService.getUserEvents(uid);
    const threeMonthsAgo = Date.now() - (1000 * 60 * 60 * 24 * 31 * 3);
    const history = (events || []).filter((e: any) => {
      if (e?.status !== 'closed') return false;
      const ts = e?.updatedAt ? Date.parse(String(e.updatedAt)) : (e?.createdAt ? Date.parse(String(e.createdAt)) : 0);
      return ts >= threeMonthsAgo;
    });
    history.sort((a: any, b: any) => {
      const at = a?.updatedAt ? Date.parse(String(a.updatedAt)) : 0;
      const bt = b?.updatedAt ? Date.parse(String(b.updatedAt)) : 0;
      return bt - at;
    });

    const esc = (s: any) => String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const rows = history.map((e: any) => {
      return `<tr>
        <td>${esc(e.name)}</td>
        <td>${esc(e.type)}</td>
        <td>${esc(e.currency)}</td>
        <td>${esc(e.startDate || '')}</td>
        <td>${esc(e.updatedAt || '')}</td>
      </tr>`;
    }).join('');

    const subject = 'Your Traxettle event history';
    const html = `<!doctype html><html><body style="font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,Arial,sans-serif;margin:24px;color:#111">
      <h1 style="margin:0 0 6px;font-size:18px">Event history (closed)</h1>
      <div style="color:#666;font-size:12px;margin-bottom:14px">Closed events from the last 3 months: ${history.length}</div>
      <table style="width:100%;border-collapse:collapse;font-size:12px">
        <thead><tr>
          <th style="text-align:left;border:1px solid #e5e7eb;padding:8px;background:#f8fafc">Event</th>
          <th style="text-align:left;border:1px solid #e5e7eb;padding:8px;background:#f8fafc">Type</th>
          <th style="text-align:left;border:1px solid #e5e7eb;padding:8px;background:#f8fafc">Currency</th>
          <th style="text-align:left;border:1px solid #e5e7eb;padding:8px;background:#f8fafc">Start</th>
          <th style="text-align:left;border:1px solid #e5e7eb;padding:8px;background:#f8fafc">Updated</th>
        </tr></thead>
        <tbody>${rows || '<tr><td colspan="5" style="border:1px solid #e5e7eb;padding:8px;color:#666">No closed events.</td></tr>'}</tbody>
      </table>
    </body></html>`;
    const text = `Event history (closed events from the last 3 months: ${history.length})\n\n` + history.map((e: any) => {
      return `- ${e.name} | ${e.type} | ${e.currency} | ${e.startDate || ''} | ${e.updatedAt || ''}`;
    }).join('\n');

    const result = await emailService.sendUserReportEmail({ recipientEmail, subject, html, text });
    if (!result.success) {
      return res.status(500).json({ success: false, error: result.error || 'Failed to send email' } as ApiResponse);
    }
    return res.json({ success: true, data: { sent: true } } as ApiResponse);
  } catch (err: any) {
    console.error('POST /events/history-email error:', err);
    return res.status(500).json({ success: false, error: 'Failed to send event history' } as ApiResponse);
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

    // During review, block currency/FX changes (would invalidate settlements)
    const currentEvent = await eventService.getEvent(req.params.eventId);
    if (currentEvent?.status === 'review') {
      if (dto.currency || dto.settlementCurrency || dto.fxRateMode || dto.predefinedFxRates) {
        return res.status(403).json({
          success: false,
          error: 'Cannot change currency or FX settings while settlement is under review. Regenerate settlement first.',
        } as ApiResponse);
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

// Update a participant's role (promote to admin / demote to member)
router.put('/:eventId/participants/:userId/role', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const requesterId = req.user!.uid;
    const { role } = req.body;

    if (!role || !['admin', 'member'].includes(role)) {
      return res.status(400).json({ success: false, error: 'role must be "admin" or "member"' } as ApiResponse);
    }

    await eventService.updateParticipantRole(req.params.eventId, req.params.userId, requesterId, role);
    const participants = await eventService.getParticipants(req.params.eventId);

    emitToEvent(req.params.eventId, 'participants:updated', { participants });
    return res.json({ success: true, data: { message: `Role updated to ${role}` } } as ApiResponse);
  } catch (err: any) {
    console.error('PUT /events/:id/participants/:userId/role error:', err);
    if (err.message?.includes('Forbidden') || err.message?.includes('Cannot change')) {
      return res.status(403).json({ success: false, error: err.message } as ApiResponse);
    }
    if (err.message?.includes('not found')) {
      return res.status(404).json({ success: false, error: err.message } as ApiResponse);
    }
    return res.status(500).json({ success: false, error: 'Failed to update participant role' } as ApiResponse);
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
