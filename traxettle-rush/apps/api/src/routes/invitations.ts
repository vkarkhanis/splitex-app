import { Router } from 'express';
import { ApiResponse, CreateInvitationDto } from '@traxettle/shared';
import { InvitationService } from '../services/invitation.service';
import { EventService } from '../services/event.service';
import { GroupService } from '../services/group.service';
import { EmailService } from '../services/email.service';
import { requireAuth, type AuthenticatedRequest } from '../middleware/auth';
import { emitToEvent } from '../config/websocket';
import { db } from '../config/firebase';

const router: Router = Router();
const invitationService = new InvitationService();
const eventService = new EventService();
const groupService = new GroupService();
const emailService = new EmailService();

function parseLimit(v: any): number | null {
  const n = Number.parseInt(String(v || ''), 10);
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.min(n, 200);
}

function isActiveInvitation(inv: any): boolean {
  if (!inv) return false;
  if (!inv.eventId) return false;
  // Hide invitations for closed, deleted, or missing events.
  if (!inv.eventStatus) return false;
  const status = String(inv.eventStatus);
  if (status === 'closed' || status === 'deleted') return false;
  // Hide expired pending invitations.
  if (inv.status === 'pending' && inv.expiresAt) {
    const ts = Date.parse(String(inv.expiresAt));
    if (!Number.isNaN(ts) && ts < Date.now()) return false;
  }
  return true;
}

// Get invitations for the current user
router.get('/my', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const uid = req.user!.uid;
    const email = req.user!.email;
    const invitations = await invitationService.getUserInvitations(uid, email);

    // Enrich with event name and inviter display name
    const enriched = await Promise.all(
      invitations.map(async (inv) => {
        let eventName: string | undefined;
        let eventStatus: string | undefined;
        let inviterName: string | undefined;
        try {
          const event = await eventService.getEvent(inv.eventId);
          eventName = event?.name;
          eventStatus = event?.status;
        } catch { /* non-fatal */ }
        try {
          const inviterDoc = await db.collection('users').doc(inv.invitedBy).get();
          if (inviterDoc.exists) {
            const d = inviterDoc.data();
            inviterName = d?.displayName || d?.email || undefined;
          }
        } catch { /* non-fatal */ }
        return { ...inv, eventName, eventStatus, inviterName };
      })
    );

    const filter = String(req.query.filter || 'all');
    const limit = parseLimit(req.query.limit);

    const sorted = [...enriched].sort((a: any, b: any) => {
      const at = a?.createdAt ? Date.parse(String(a.createdAt)) : 0;
      const bt = b?.createdAt ? Date.parse(String(b.createdAt)) : 0;
      if (at !== bt) return bt - at;
      return String(a?.id || '').localeCompare(String(b?.id || ''));
    });

    let out = sorted;
    if (filter === 'active') out = out.filter(isActiveInvitation);
    if (filter === 'history') out = out.filter((inv: any) => inv?.status && inv.status !== 'pending');
    if (limit) out = out.slice(0, limit);

    return res.json({ success: true, data: out } as ApiResponse);
  } catch (err) {
    console.error('GET /invitations/my error:', err);
    return res.status(500).json({ success: false, error: 'Failed to fetch invitations' } as ApiResponse);
  }
});

// Email invitation history to the current user (ignores notification preference)
router.post('/history-email', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const uid = req.user!.uid;
    const recipientEmail = req.user!.email;
    if (!recipientEmail) {
      return res.status(400).json({ success: false, error: 'No email found for this account' } as ApiResponse);
    }
    const invitations = await invitationService.getUserInvitations(uid, recipientEmail);
    const threeMonthsAgo = Date.now() - (1000 * 60 * 60 * 24 * 31 * 3);
    const history = invitations
      .filter((inv: any) => {
        const ts = inv?.respondedAt ? Date.parse(String(inv.respondedAt)) : (inv?.createdAt ? Date.parse(String(inv.createdAt)) : 0);
        return ts >= threeMonthsAgo;
      })
      .sort((a: any, b: any) => {
        const at = a?.respondedAt ? Date.parse(String(a.respondedAt)) : (a?.createdAt ? Date.parse(String(a.createdAt)) : 0);
        const bt = b?.respondedAt ? Date.parse(String(b.respondedAt)) : (b?.createdAt ? Date.parse(String(b.createdAt)) : 0);
        return bt - at;
      });

    const esc = (s: any) => String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const rows = await Promise.all(history.map(async (inv: any) => {
      let eventName = inv.eventId;
      try {
        const ev = await eventService.getEvent(inv.eventId);
        if (ev?.name) eventName = ev.name;
      } catch { /* ignore */ }
      const status = inv.status;
      const when = inv.respondedAt || inv.createdAt || '';
      return `<tr>
        <td>${esc(eventName)}</td>
        <td>${esc(status)}</td>
        <td>${esc(inv.role)}</td>
        <td>${esc(when)}</td>
      </tr>`;
    }));

    const subject = 'Your Traxettle invitation history';
    const html = `<!doctype html><html><body style="font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,Arial,sans-serif;margin:24px;color:#111">
      <h1 style="margin:0 0 6px;font-size:18px">Invitation history</h1>
      <div style="color:#666;font-size:12px;margin-bottom:14px">Count from the last 3 months: ${history.length}</div>
      <table style="width:100%;border-collapse:collapse;font-size:12px">
        <thead><tr>
          <th style="text-align:left;border:1px solid #e5e7eb;padding:8px;background:#f8fafc">Event</th>
          <th style="text-align:left;border:1px solid #e5e7eb;padding:8px;background:#f8fafc">Status</th>
          <th style="text-align:left;border:1px solid #e5e7eb;padding:8px;background:#f8fafc">Role</th>
          <th style="text-align:left;border:1px solid #e5e7eb;padding:8px;background:#f8fafc">When</th>
        </tr></thead>
        <tbody>${rows.join('') || '<tr><td colspan="4" style="border:1px solid #e5e7eb;padding:8px;color:#666">No invitation history in the last 3 months.</td></tr>'}</tbody>
      </table>
    </body></html>`;
    const text = `Invitation history from the last 3 months (count: ${history.length})\n\n` + history.map((inv: any) => {
      return `- ${inv.eventId} | ${inv.status} | ${inv.role} | ${inv.respondedAt || inv.createdAt || ''}`;
    }).join('\n');

    const result = await emailService.sendUserReportEmail({ recipientEmail, subject, html, text });
    if (!result.success) {
      return res.status(500).json({ success: false, error: result.error || 'Failed to send email' } as ApiResponse);
    }
    return res.json({ success: true, data: { sent: true } } as ApiResponse);
  } catch (err: any) {
    console.error('POST /invitations/history-email error:', err);
    return res.status(500).json({ success: false, error: 'Failed to send invitation history' } as ApiResponse);
  }
});

// Get invitations for an event
router.get('/event/:eventId', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const invitations = await invitationService.getEventInvitations(req.params.eventId);

    // Enrich with inviter display name
    const { db } = await import('../config/firebase');
    const enriched = await Promise.all(
      invitations.map(async (inv) => {
        let inviterName: string | undefined;
        try {
          const inviterDoc = await db.collection('users').doc(inv.invitedBy).get();
          if (inviterDoc.exists) {
            const d = inviterDoc.data();
            inviterName = d?.displayName || d?.email || undefined;
          }
        } catch { /* non-fatal */ }
        return { ...inv, inviterName };
      })
    );

    return res.json({ success: true, data: enriched } as ApiResponse);
  } catch (err) {
    console.error('GET /invitations/event/:eventId error:', err);
    return res.status(500).json({ success: false, error: 'Failed to fetch invitations' } as ApiResponse);
  }
});

// Get invitation by token (public - for accepting via link)
router.get('/token/:token', async (req, res) => {
  try {
    const invitation = await invitationService.getInvitationByToken(req.params.token);
    if (!invitation) {
      return res.status(404).json({ success: false, error: 'Invitation not found' } as ApiResponse);
    }

    // Enrich with event name and inviter display name
    let eventName: string | undefined;
    let inviterName: string | undefined;
    try {
      const event = await eventService.getEvent(invitation.eventId);
      eventName = event?.name;
    } catch { /* non-fatal */ }
    try {
      const { db } = await import('../config/firebase');
      const inviterDoc = await db.collection('users').doc(invitation.invitedBy).get();
      if (inviterDoc.exists) {
        const inviterData = inviterDoc.data();
        inviterName = inviterData?.displayName || inviterData?.email || undefined;
      }
    } catch { /* non-fatal */ }

    return res.json({
      success: true,
      data: { ...invitation, eventName, inviterName },
    } as ApiResponse);
  } catch (err) {
    console.error('GET /invitations/token/:token error:', err);
    return res.status(500).json({ success: false, error: 'Failed to fetch invitation' } as ApiResponse);
  }
});

// Get a single invitation by ID
router.get('/:invitationId', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const invitation = await invitationService.getInvitation(req.params.invitationId);
    if (!invitation) {
      return res.status(404).json({ success: false, error: 'Invitation not found' } as ApiResponse);
    }
    return res.json({ success: true, data: invitation } as ApiResponse);
  } catch (err) {
    console.error('GET /invitations/:id error:', err);
    return res.status(500).json({ success: false, error: 'Failed to fetch invitation' } as ApiResponse);
  }
});

// Create a new invitation
router.post('/', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const uid = req.user!.uid;
    const body = req.body as CreateInvitationDto;

    if (!body.eventId) {
      return res.status(400).json({
        success: false,
        error: 'eventId is required'
      } as ApiResponse);
    }

    if (!body.inviteeEmail && !body.inviteePhone && !body.inviteeUserId) {
      return res.status(400).json({
        success: false,
        error: 'At least one of inviteeEmail, inviteePhone, or inviteeUserId is required'
      } as ApiResponse);
    }

    // Check if user is admin of the event
    const isAdmin = await eventService.isAdmin(body.eventId, uid);
    if (!isAdmin) {
      return res.status(403).json({
        success: false,
        error: 'Only event admins can send invitations'
      } as ApiResponse);
    }

    // If groupId is provided, verify the group exists and belongs to this event
    if (body.groupId) {
      const group = await groupService.getGroup(body.groupId);
      if (!group || group.eventId !== body.eventId) {
        return res.status(400).json({
          success: false,
          error: 'Invalid groupId: group not found or does not belong to this event'
        } as ApiResponse);
      }
    }

    // Get event and inviter info for the email
    const event = await eventService.getEvent(body.eventId);
    const inviterName = req.user!.name || req.user!.email || 'A Traxettle user';
    const eventName = event?.name || 'an event';

    const invitation = await invitationService.createInvitation(uid, body, inviterName, eventName);
    emitToEvent(body.eventId, 'invitation:created', { invitation });
    return res.status(201).json({ success: true, data: invitation } as ApiResponse);
  } catch (err: any) {
    console.error('POST /invitations error:', err);
    return res.status(500).json({ success: false, error: err.message || 'Failed to create invitation' } as ApiResponse);
  }
});

// Accept an invitation
router.post('/:invitationId/accept', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const uid = req.user!.uid;
    const invitation = await invitationService.getInvitation(req.params.invitationId);
    if (!invitation) {
      return res.status(404).json({ success: false, error: 'Invitation not found' } as ApiResponse);
    }

    // Idempotency/self-heal:
    // If the invitation was accepted but adding the participant failed previously,
    // accepting again should ensure the user is added to the event.
    if (invitation.status === 'accepted') {
      if (invitation.inviteeUserId && invitation.inviteeUserId !== uid) {
        return res.status(400).json({ success: false, error: 'Invitation already accepted by another user' } as ApiResponse);
      }
      await eventService.addParticipant(invitation.eventId, uid, invitation.invitedBy, invitation.role);
      if (invitation.groupId) {
        try {
          await groupService.addMember(invitation.groupId, uid, invitation.invitedBy);
        } catch (groupErr: any) {
          console.error('Failed to add accepted invitee to group:', groupErr.message);
        }
      }
      emitToEvent(invitation.eventId, 'participant:added', { userId: uid });
      return res.json({ success: true, data: invitation } as ApiResponse);
    }

    if (invitation.status !== 'pending') {
      return res.status(400).json({ success: false, error: `Invitation has already been ${invitation.status}` } as ApiResponse);
    }

    const expiresAt = new Date(invitation.expiresAt);
    if (expiresAt < new Date()) {
      await db.collection('invitations').doc(req.params.invitationId).set({ status: 'expired' }, { merge: true });
      return res.status(400).json({ success: false, error: 'Invitation has expired' } as ApiResponse);
    }

    // Add participant first, then mark invitation accepted.
    await eventService.addParticipant(invitation.eventId, uid, invitation.invitedBy, invitation.role);

    if (invitation.groupId) {
      try {
        await groupService.addMember(invitation.groupId, uid, invitation.invitedBy);
      } catch (groupErr: any) {
        console.error('Failed to add accepted invitee to group:', groupErr.message);
      }
    }

    const now = new Date().toISOString();
    await db.collection('invitations').doc(req.params.invitationId).set(
      { status: 'accepted', respondedAt: now, inviteeUserId: uid },
      { merge: true },
    );
    const updated = await invitationService.getInvitation(req.params.invitationId);

    emitToEvent(invitation.eventId, 'invitation:accepted', { invitation: updated || invitation });
    emitToEvent(invitation.eventId, 'participant:added', { userId: uid });
    return res.json({ success: true, data: updated || invitation } as ApiResponse);
  } catch (err: any) {
    console.error('POST /invitations/:id/accept error:', err);
    if (err.message?.includes('expired') || err.message?.includes('already been')) {
      return res.status(400).json({ success: false, error: err.message } as ApiResponse);
    }
    return res.status(500).json({ success: false, error: 'Failed to accept invitation' } as ApiResponse);
  }
});

// Decline an invitation
router.post('/:invitationId/decline', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const uid = req.user!.uid;
    const invitation = await invitationService.declineInvitation(req.params.invitationId, uid);

    if (!invitation) {
      return res.status(404).json({ success: false, error: 'Invitation not found' } as ApiResponse);
    }

    emitToEvent(invitation.eventId, 'invitation:declined', { invitation });
    return res.json({ success: true, data: invitation } as ApiResponse);
  } catch (err: any) {
    console.error('POST /invitations/:id/decline error:', err);
    if (err.message?.includes('already been')) {
      return res.status(400).json({ success: false, error: err.message } as ApiResponse);
    }
    return res.status(500).json({ success: false, error: 'Failed to decline invitation' } as ApiResponse);
  }
});

// Revoke an invitation
router.delete('/:invitationId', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const uid = req.user!.uid;
    // Get invitation first to know the eventId for WS emit
    const invitation = await invitationService.getInvitation(req.params.invitationId);
    const revoked = await invitationService.revokeInvitation(req.params.invitationId, uid);

    if (!revoked) {
      return res.status(404).json({ success: false, error: 'Invitation not found' } as ApiResponse);
    }

    if (invitation?.eventId) {
      emitToEvent(invitation.eventId, 'invitation:revoked', { invitationId: req.params.invitationId });
    }
    return res.json({ success: true, data: { message: 'Invitation revoked successfully' } } as ApiResponse);
  } catch (err: any) {
    console.error('DELETE /invitations/:id error:', err);
    if (err.message?.includes('Forbidden')) {
      return res.status(403).json({ success: false, error: err.message } as ApiResponse);
    }
    if (err.message?.includes('Cannot revoke')) {
      return res.status(400).json({ success: false, error: err.message } as ApiResponse);
    }
    return res.status(500).json({ success: false, error: 'Failed to revoke invitation' } as ApiResponse);
  }
});

export { router as invitationRoutes };
