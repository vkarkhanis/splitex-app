import { Router } from 'express';
import { ApiResponse } from '@splitex/shared';
import { SettlementService } from '../services/settlement.service';
import { requireAuth, type AuthenticatedRequest } from '../middleware/auth';
import { emitToEvent } from '../config/websocket';
import { notifyEventParticipants } from '../utils/notification-helper';

const router: Router = Router();
const settlementService = new SettlementService();

// Get entity balances for an event (preview before settlement)
router.get('/event/:eventId/balances', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const balances = await settlementService.calculateEntityBalances(req.params.eventId);
    return res.json({ success: true, data: balances } as ApiResponse);
  } catch (err: any) {
    console.error('GET /settlements/event/:eventId/balances error:', err);
    return res.status(500).json({ success: false, error: 'Failed to calculate balances' } as ApiResponse);
  }
});

// Get existing settlements for an event
router.get('/event/:eventId', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const settlements = await settlementService.getEventSettlements(req.params.eventId);
    return res.json({ success: true, data: settlements } as ApiResponse);
  } catch (err: any) {
    console.error('GET /settlements/event/:eventId error:', err);
    return res.status(500).json({ success: false, error: 'Failed to fetch settlements' } as ApiResponse);
  }
});

// Get pending settlement total for an event
router.get('/event/:eventId/pending-total', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const total = await settlementService.getPendingSettlementTotal(req.params.eventId);
    return res.json({ success: true, data: { pendingTotal: total } } as ApiResponse);
  } catch (err: any) {
    console.error('GET /settlements/event/:eventId/pending-total error:', err);
    return res.status(500).json({ success: false, error: 'Failed to get pending total' } as ApiResponse);
  }
});

// Generate settlement plan (admin only)
router.post('/event/:eventId/generate', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const uid = req.user!.uid;
    const plan = await settlementService.generateSettlement(req.params.eventId, uid);
    emitToEvent(req.params.eventId, 'settlement:generated', { plan });
    notifyEventParticipants(req.params.eventId, uid, 'settlement_generated', {
      'Settlements': `${(plan as any)?.settlements?.length || 0} payment(s) calculated`,
    });
    return res.status(201).json({ success: true, data: plan } as ApiResponse);
  } catch (err: any) {
    console.error('POST /settlements/event/:eventId/generate error:', err);
    if (err.message?.includes('Forbidden')) {
      return res.status(403).json({ success: false, error: err.message } as ApiResponse);
    }
    if (err.message?.includes('not found')) {
      return res.status(404).json({ success: false, error: err.message } as ApiResponse);
    }
    return res.status(500).json({ success: false, error: 'Failed to generate settlement' } as ApiResponse);
  }
});

export { router as settlementRoutes };
