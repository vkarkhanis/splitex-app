import { Router } from 'express';
import { ApiResponse, CreateInvitationDto } from '@splitex/shared';
import { InvitationService } from '../services/invitation.service';
import { EventService } from '../services/event.service';
import { GroupService } from '../services/group.service';
import { requireAuth, type AuthenticatedRequest } from '../middleware/auth';
import { emitToEvent } from '../config/websocket';

const router: Router = Router();
const invitationService = new InvitationService();
const eventService = new EventService();
const groupService = new GroupService();

// Get invitations for the current user
router.get('/my', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const uid = req.user!.uid;
    const email = req.user!.email;
    const invitations = await invitationService.getUserInvitations(uid, email);

    // Enrich with event name and inviter display name
    const { db } = await import('../config/firebase');
    const enriched = await Promise.all(
      invitations.map(async (inv) => {
        let eventName: string | undefined;
        let inviterName: string | undefined;
        try {
          const event = await eventService.getEvent(inv.eventId);
          eventName = event?.name;
        } catch { /* non-fatal */ }
        try {
          const inviterDoc = await db.collection('users').doc(inv.invitedBy).get();
          if (inviterDoc.exists) {
            const d = inviterDoc.data();
            inviterName = d?.displayName || d?.email || undefined;
          }
        } catch { /* non-fatal */ }
        return { ...inv, eventName, inviterName };
      })
    );

    return res.json({ success: true, data: enriched } as ApiResponse);
  } catch (err) {
    console.error('GET /invitations/my error:', err);
    return res.status(500).json({ success: false, error: 'Failed to fetch invitations' } as ApiResponse);
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
    const inviterName = req.user!.name || req.user!.email || 'A Splitex user';
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
    const invitation = await invitationService.acceptInvitation(req.params.invitationId, uid);

    if (!invitation) {
      return res.status(404).json({ success: false, error: 'Invitation not found' } as ApiResponse);
    }

    // Add user as participant to the event
    await eventService.addParticipant(invitation.eventId, uid, invitation.invitedBy, invitation.role);

    // If invitation has a groupId, add the user to that group
    if (invitation.groupId) {
      try {
        await groupService.addMember(invitation.groupId, uid, invitation.invitedBy);
      } catch (groupErr: any) {
        // Non-fatal: user is added to event even if group add fails
        console.error('Failed to add accepted invitee to group:', groupErr.message);
      }
    }

    emitToEvent(invitation.eventId, 'invitation:accepted', { invitation });
    emitToEvent(invitation.eventId, 'participant:added', { userId: uid });
    return res.json({ success: true, data: invitation } as ApiResponse);
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
