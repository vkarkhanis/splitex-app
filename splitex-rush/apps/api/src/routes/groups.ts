import { Router } from 'express';
import { ApiResponse, CreateGroupDto, UpdateGroupDto } from '@splitex/shared';
import { GroupService } from '../services/group.service';
import { requireAuth, type AuthenticatedRequest } from '../middleware/auth';
import { emitToEvent } from '../config/websocket';
import { notifyEventParticipants } from '../utils/notification-helper';
import { requireActiveEvent } from '../utils/event-guards';

const router: Router = Router();
const groupService = new GroupService();

// Get all groups for the current user (for reuse suggestions) — MUST be before /:groupId
router.get('/my', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const uid = req.user!.uid;
    const groups = await groupService.getUserGroups(uid);
    return res.json({ success: true, data: groups } as ApiResponse);
  } catch (err) {
    console.error('GET /groups/my error:', err);
    return res.status(500).json({ success: false, error: 'Failed to fetch user groups' } as ApiResponse);
  }
});

// Suggest groups based on member overlap (70% threshold) — MUST be before /:groupId
router.post('/suggest', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const uid = req.user!.uid;
    const { memberIds, threshold } = req.body;

    if (!memberIds || !Array.isArray(memberIds) || memberIds.length === 0) {
      return res.status(400).json({ success: false, error: 'memberIds array is required' } as ApiResponse);
    }

    const suggestions = await groupService.suggestGroups(uid, memberIds, threshold || 0.7);
    return res.json({ success: true, data: suggestions } as ApiResponse);
  } catch (err) {
    console.error('POST /groups/suggest error:', err);
    return res.status(500).json({ success: false, error: 'Failed to suggest groups' } as ApiResponse);
  }
});

// Get groups for an event
router.get('/event/:eventId', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const groups = await groupService.getEventGroups(req.params.eventId);
    return res.json({ success: true, data: groups } as ApiResponse);
  } catch (err) {
    console.error('GET /groups/event/:eventId error:', err);
    return res.status(500).json({ success: false, error: 'Failed to fetch groups' } as ApiResponse);
  }
});

// Get a single group by ID
router.get('/:groupId', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const group = await groupService.getGroup(req.params.groupId);
    if (!group) {
      return res.status(404).json({ success: false, error: 'Group not found' } as ApiResponse);
    }
    return res.json({ success: true, data: group } as ApiResponse);
  } catch (err) {
    console.error('GET /groups/:id error:', err);
    return res.status(500).json({ success: false, error: 'Failed to fetch group' } as ApiResponse);
  }
});

// Create a new group
router.post('/', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const uid = req.user!.uid;
    const body = req.body as CreateGroupDto;

    if (!body.eventId || !body.name || !body.memberIds || body.memberIds.length === 0 || !body.payerUserId) {
      return res.status(400).json({
        success: false,
        error: 'eventId, name, memberIds (non-empty), and payerUserId are required'
      } as ApiResponse);
    }

    await requireActiveEvent(body.eventId);
    const group = await groupService.createGroup(uid, body);
    emitToEvent(body.eventId, 'group:created', { group });
    notifyEventParticipants(body.eventId, uid, 'group_created', {
      'Group Name': group.name,
      Members: `${group.members.length} member(s)`,
    });
    return res.status(201).json({ success: true, data: group } as ApiResponse);
  } catch (err) {
    console.error('POST /groups error:', err);
    return res.status(500).json({ success: false, error: 'Failed to create group' } as ApiResponse);
  }
});

// Update a group
router.put('/:groupId', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const uid = req.user!.uid;
    const dto = req.body as UpdateGroupDto;
    // Check event lock before allowing update
    const groupToCheck = await groupService.getGroup(req.params.groupId);
    if (groupToCheck) await requireActiveEvent(groupToCheck.eventId);
    const group = await groupService.updateGroup(req.params.groupId, uid, dto);

    if (!group) {
      return res.status(404).json({ success: false, error: 'Group not found' } as ApiResponse);
    }

    emitToEvent(group.eventId, 'group:updated', { group });
    notifyEventParticipants(group.eventId, uid, 'group_updated', {
      'Group Name': group.name,
      Members: `${group.members.length} member(s)`,
    });
    return res.json({ success: true, data: group } as ApiResponse);
  } catch (err: any) {
    console.error('PUT /groups/:id error:', err);
    if (err.message?.includes('Forbidden')) {
      return res.status(403).json({ success: false, error: err.message } as ApiResponse);
    }
    return res.status(500).json({ success: false, error: 'Failed to update group' } as ApiResponse);
  }
});

// Delete a group
router.delete('/:groupId', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const uid = req.user!.uid;
    // Get group before deletion to know the eventId for WS emit
    const groupToDelete = await groupService.getGroup(req.params.groupId);
    if (groupToDelete) await requireActiveEvent(groupToDelete.eventId);
    const deleted = await groupService.deleteGroup(req.params.groupId, uid);

    if (!deleted) {
      return res.status(404).json({ success: false, error: 'Group not found' } as ApiResponse);
    }

    if (groupToDelete?.eventId) {
      emitToEvent(groupToDelete.eventId, 'group:deleted', { groupId: req.params.groupId });
      notifyEventParticipants(groupToDelete.eventId, uid, 'group_deleted', {
        'Group Name': groupToDelete.name,
      });
    }
    return res.json({ success: true, data: { message: 'Group deleted successfully' } } as ApiResponse);
  } catch (err: any) {
    console.error('DELETE /groups/:id error:', err);
    if (err.message?.includes('Forbidden')) {
      return res.status(403).json({ success: false, error: err.message } as ApiResponse);
    }
    return res.status(500).json({ success: false, error: 'Failed to delete group' } as ApiResponse);
  }
});

// Add a member to a group
router.post('/:groupId/members', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const requesterId = req.user!.uid;
    const { userId } = req.body;

    if (!userId) {
      return res.status(400).json({ success: false, error: 'userId is required' } as ApiResponse);
    }

    const group = await groupService.addMember(req.params.groupId, userId, requesterId);
    if (!group) {
      return res.status(404).json({ success: false, error: 'Group not found' } as ApiResponse);
    }

    emitToEvent(group.eventId, 'group:updated', { group });
    return res.json({ success: true, data: group } as ApiResponse);
  } catch (err: any) {
    console.error('POST /groups/:id/members error:', err);
    if (err.message?.includes('Forbidden')) {
      return res.status(403).json({ success: false, error: err.message } as ApiResponse);
    }
    return res.status(500).json({ success: false, error: 'Failed to add member' } as ApiResponse);
  }
});

// Remove a member from a group
router.delete('/:groupId/members/:userId', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const requesterId = req.user!.uid;
    const group = await groupService.removeMember(req.params.groupId, req.params.userId, requesterId);

    if (!group) {
      return res.status(404).json({ success: false, error: 'Group not found' } as ApiResponse);
    }

    emitToEvent(group.eventId, 'group:updated', { group });
    return res.json({ success: true, data: group } as ApiResponse);
  } catch (err: any) {
    console.error('DELETE /groups/:id/members/:userId error:', err);
    if (err.message?.includes('Forbidden')) {
      return res.status(403).json({ success: false, error: err.message } as ApiResponse);
    }
    return res.status(500).json({ success: false, error: 'Failed to remove member' } as ApiResponse);
  }
});

// Add an existing group to an event (reuse)
router.post('/:groupId/add-to-event', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const uid = req.user!.uid;
    const { eventId } = req.body;

    if (!eventId) {
      return res.status(400).json({ success: false, error: 'eventId is required' } as ApiResponse);
    }

    const group = await groupService.addGroupToEvent(req.params.groupId, eventId, uid);
    if (!group) {
      return res.status(404).json({ success: false, error: 'Group not found' } as ApiResponse);
    }

    return res.json({ success: true, data: group } as ApiResponse);
  } catch (err: any) {
    console.error('POST /groups/:id/add-to-event error:', err);
    return res.status(500).json({ success: false, error: 'Failed to add group to event' } as ApiResponse);
  }
});

// Transfer representative role
router.put('/:groupId/transfer-representative', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const uid = req.user!.uid;
    const { newRepresentative } = req.body;

    if (!newRepresentative) {
      return res.status(400).json({ success: false, error: 'newRepresentative userId is required' } as ApiResponse);
    }

    const group = await groupService.updateGroup(req.params.groupId, uid, { representative: newRepresentative });
    if (!group) {
      return res.status(404).json({ success: false, error: 'Group not found' } as ApiResponse);
    }

    return res.json({ success: true, data: group } as ApiResponse);
  } catch (err: any) {
    console.error('PUT /groups/:id/transfer-representative error:', err);
    if (err.message?.includes('Forbidden') || err.message?.includes('Representative must be')) {
      return res.status(403).json({ success: false, error: err.message } as ApiResponse);
    }
    return res.status(500).json({ success: false, error: 'Failed to transfer representative' } as ApiResponse);
  }
});

export { router as groupRoutes };
