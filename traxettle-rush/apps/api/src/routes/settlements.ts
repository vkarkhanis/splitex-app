import { Router } from 'express';
import { ApiResponse } from '@traxettle/shared';
import { SettlementService } from '../services/settlement.service';
import { requireAuth, type AuthenticatedRequest } from '../middleware/auth';
import { emitToEvent } from '../config/websocket';
import { notifyEventParticipants } from '../utils/notification-helper';
import { EntitlementService } from '../services/entitlement.service';

const router: Router = Router();
const settlementService = new SettlementService();
const entitlementService = new EntitlementService();

function isProdRuntime(): boolean {
  const env = (process.env.APP_ENV || process.env.RUNTIME_ENV || process.env.NODE_ENV || '').toLowerCase();
  return env === 'production';
}

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
    // Emit event:updated so dashboard tiles reflect the new status (payment or settled)
    const newStatus = (plan as any)?.settlements?.length > 0 ? 'payment' : 'settled';
    emitToEvent(req.params.eventId, 'event:updated', { event: { status: newStatus } });
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

// Initiate payment for a settlement transaction (payer only)
router.post('/:settlementId/pay', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const uid = req.user!.uid;
    let useRealGateway = req.body?.useRealGateway === true;
    if (!isProdRuntime() && useRealGateway) {
      const allowReal = String(process.env.PAYMENT_ALLOW_REAL_IN_NON_PROD || 'false') === 'true';
      const entitlement = await entitlementService.getEntitlement(uid);
      if (!allowReal || !entitlement.internalTester) {
        useRealGateway = false;
      }
    }
    const settlement = await settlementService.initiatePayment(req.params.settlementId, uid, { useRealGateway });
    emitToEvent(settlement.eventId, 'settlement:updated', { settlement });
    return res.json({ success: true, data: settlement } as ApiResponse);
  } catch (err: any) {
    console.error('POST /settlements/:settlementId/pay error:', err);
    if (err.message?.includes('Forbidden')) {
      return res.status(403).json({ success: false, error: err.message } as ApiResponse);
    }
    if (err.message?.includes('not found')) {
      return res.status(404).json({ success: false, error: err.message } as ApiResponse);
    }
    return res.status(400).json({ success: false, error: err.message } as ApiResponse);
  }
});

// Approve (confirm receipt of) payment for a settlement transaction (payee only)
router.post('/:settlementId/approve', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const uid = req.user!.uid;
    const { settlement, allComplete } = await settlementService.approvePayment(req.params.settlementId, uid);
    emitToEvent(settlement.eventId, 'settlement:updated', { settlement, allComplete });
    if (allComplete) {
      emitToEvent(settlement.eventId, 'event:updated', { status: 'settled' });
    }
    return res.json({ success: true, data: { settlement, allComplete } } as ApiResponse);
  } catch (err: any) {
    console.error('POST /settlements/:settlementId/approve error:', err);
    if (err.message?.includes('Forbidden')) {
      return res.status(403).json({ success: false, error: err.message } as ApiResponse);
    }
    if (err.message?.includes('not found')) {
      return res.status(404).json({ success: false, error: err.message } as ApiResponse);
    }
    return res.status(400).json({ success: false, error: err.message } as ApiResponse);
  }
});

// Retry payment for a settlement transaction (payer only)
router.post('/:settlementId/retry', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const uid = req.user!.uid;
    let useRealGateway = req.body?.useRealGateway === true;
    if (!isProdRuntime() && useRealGateway) {
      const allowReal = String(process.env.PAYMENT_ALLOW_REAL_IN_NON_PROD || 'false') === 'true';
      const entitlement = await entitlementService.getEntitlement(uid);
      if (!allowReal || !entitlement.internalTester) {
        useRealGateway = false;
      }
    }

    const settlement = await settlementService.retryPayment(req.params.settlementId, uid, { useRealGateway });
    emitToEvent(settlement.eventId, 'settlement:updated', { settlement });
    return res.json({ success: true, data: settlement } as ApiResponse);
  } catch (err: any) {
    console.error('POST /settlements/:settlementId/retry error:', err);
    if (err.message?.includes('Forbidden')) {
      return res.status(403).json({ success: false, error: err.message } as ApiResponse);
    }
    if (err.message?.includes('not found')) {
      return res.status(404).json({ success: false, error: err.message } as ApiResponse);
    }
    return res.status(400).json({ success: false, error: err.message } as ApiResponse);
  }
});

export { router as settlementRoutes };
