import { Router } from 'express';
import { ApiResponse } from '@traxettle/shared';
import { SettlementService } from '../services/settlement.service';
import { requireAuth, type AuthenticatedRequest } from '../middleware/auth';
import { emitToEvent } from '../config/websocket';
import { notifyEventParticipants } from '../utils/notification-helper';
import { EntitlementService } from '../services/entitlement.service';
import { db, storage, firebaseApp } from '../config/firebase';

const router: Router = Router();
const settlementService = new SettlementService();
const entitlementService = new EntitlementService();

function isProdRuntime(): boolean {
  const env = (process.env.APP_ENV || process.env.RUNTIME_ENV || process.env.NODE_ENV || '').toLowerCase();
  return env === 'production';
}

function buildEmulatorObjectUrl(bucketName: string, objectPath: string): string | null {
  const emulatorHost = process.env.STORAGE_EMULATOR_HOST;
  if (!emulatorHost) return null;
  const encodedPath = encodeURIComponent(objectPath);
  return `http://${emulatorHost}/v0/b/${bucketName}/o/${encodedPath}?alt=media`;
}

function resolveBucketName(): string | undefined {
  const fromEnv = process.env.FIREBASE_STORAGE_BUCKET;
  if (fromEnv) return fromEnv;
  const fromApp = firebaseApp?.options?.storageBucket;
  if (typeof fromApp === 'string' && fromApp.trim()) return fromApp;
  const projectId = process.env.FIREBASE_PROJECT_ID || (firebaseApp?.options?.projectId as string | undefined);
  return projectId ? `${projectId}.appspot.com` : undefined;
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
    // Emit event:updated so dashboard tiles reflect the new status (review or settled)
    const newStatus = (plan as any)?.settlements?.length > 0 ? 'review' : 'settled';
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

// Approve settlement review for a participant entity
router.post('/event/:eventId/approve-settlement', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const uid = req.user!.uid;
    const { approvals, allApproved } = await settlementService.approveSettlementReview(req.params.eventId, uid);
    emitToEvent(req.params.eventId, 'settlement:updated', { approvals, allApproved });
    if (allApproved) {
      emitToEvent(req.params.eventId, 'event:updated', { event: { status: 'payment' } });
      notifyEventParticipants(req.params.eventId, uid, 'settlement_generated', {
        'Status': 'All participants approved. Payments can now proceed.',
      });
    }
    return res.json({ success: true, data: { approvals, allApproved } } as ApiResponse);
  } catch (err: any) {
    console.error('POST /settlements/event/:eventId/approve-settlement error:', err);
    if (err.message?.includes('Forbidden') || err.message?.includes('not authorized')) {
      return res.status(403).json({ success: false, error: err.message } as ApiResponse);
    }
    if (err.message?.includes('not found')) {
      return res.status(404).json({ success: false, error: err.message } as ApiResponse);
    }
    return res.status(400).json({ success: false, error: err.message } as ApiResponse);
  }
});

// Regenerate settlement after expense edits during review
router.post('/event/:eventId/regenerate', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const uid = req.user!.uid;
    const plan = await settlementService.regenerateSettlement(req.params.eventId, uid);
    emitToEvent(req.params.eventId, 'settlement:generated', { plan });
    emitToEvent(req.params.eventId, 'event:updated', { event: { status: 'review' } });
    notifyEventParticipants(req.params.eventId, uid, 'settlement_generated', {
      'Settlements': `Settlement regenerated — ${(plan as any)?.settlements?.length || 0} payment(s) recalculated`,
    });
    return res.status(201).json({ success: true, data: plan } as ApiResponse);
  } catch (err: any) {
    console.error('POST /settlements/event/:eventId/regenerate error:', err);
    if (err.message?.includes('Forbidden')) {
      return res.status(403).json({ success: false, error: err.message } as ApiResponse);
    }
    if (err.message?.includes('not found')) {
      return res.status(404).json({ success: false, error: err.message } as ApiResponse);
    }
    return res.status(400).json({ success: false, error: err.message } as ApiResponse);
  }
});

// Upload settlement payment proof (payer only)
router.post('/:settlementId/upload-proof', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const uid = req.user!.uid;
    const settlementId = req.params.settlementId;
    const settlementDoc = await db.collection('settlements').doc(settlementId).get();
    if (!settlementDoc.exists) {
      return res.status(404).json({ success: false, error: 'Settlement not found' } as ApiResponse);
    }
    const settlement = settlementDoc.data() || {};
    if (settlement.fromUserId !== uid) {
      return res.status(403).json({ success: false, error: 'Forbidden: Only payer can upload payment proof' } as ApiResponse);
    }

    const filename = typeof req.body?.filename === 'string' ? req.body.filename : `proof-${Date.now()}.jpg`;
    const contentType = typeof req.body?.contentType === 'string' ? req.body.contentType : 'image/jpeg';
    const base64Raw = typeof req.body?.base64 === 'string' ? req.body.base64 : '';
    const base64 = base64Raw.replace(/^data:[^;]+;base64,/, '');
    if (!base64) {
      return res.status(400).json({ success: false, error: 'base64 is required' } as ApiResponse);
    }

    const buffer = Buffer.from(base64, 'base64');
    const allowedTypes = new Set(['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/heic', 'image/heif']);
    if (!allowedTypes.has(contentType.toLowerCase())) {
      return res.status(400).json({ success: false, error: 'Unsupported proof file type. Allowed: JPG, PNG, WEBP, HEIC' } as ApiResponse);
    }

    const maxBytes = 5 * 1024 * 1024;
    if (!buffer.length || buffer.length > maxBytes) {
      return res.status(400).json({ success: false, error: 'Invalid proof size (max 5MB)' } as ApiResponse);
    }

    const safeName = filename.replace(/[^a-zA-Z0-9._-]/g, '_');
    const filePath = `settlements/${settlementId}/proofs/${uid}-${Date.now()}-${safeName}`;
    const bucketName = resolveBucketName();
    const bucket = bucketName ? storage.bucket(bucketName) : storage.bucket();
    const file = bucket.file(filePath);
    await file.save(buffer, {
      metadata: { contentType },
      resumable: false,
    } as any);

    let proofUrl: string;
    try {
      const [signedUrl] = await file.getSignedUrl({
        action: 'read',
        expires: new Date('2099-01-01'),
      } as any);
      proofUrl = signedUrl;
    } catch (err) {
      const fallback = buildEmulatorObjectUrl(bucket.name, filePath);
      if (!fallback) throw err;
      proofUrl = fallback;
    }

    return res.json({
      success: true,
      data: { proofUrl, filePath, contentType, size: buffer.length },
    } as ApiResponse);
  } catch (err: any) {
    console.error('POST /settlements/:settlementId/upload-proof error:', err);
    return res.status(500).json({ success: false, error: 'Failed to upload proof' } as ApiResponse);
  }
});

// Mark payment as done for a settlement transaction (payer only)
// The actual money transfer happens externally (UPI/bank/wire/etc), and the
// payee confirms receipt.
router.post('/:settlementId/pay', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const uid = req.user!.uid;
    const referenceId = typeof req.body?.referenceId === 'string' ? req.body.referenceId.trim() : '';
    const proofUrl = typeof req.body?.proofUrl === 'string' ? req.body.proofUrl.trim() : '';
    if (!referenceId) {
      return res.status(400).json({ success: false, error: 'referenceId is required' } as ApiResponse);
    }
    let useRealGateway = req.body?.useRealGateway === true;
    if (!isProdRuntime() && useRealGateway) {
      const allowReal = String(process.env.PAYMENT_ALLOW_REAL_IN_NON_PROD || 'false') === 'true';
      const entitlement = await entitlementService.getEntitlement(uid);
      if (!allowReal || !entitlement.internalTester) {
        useRealGateway = false;
      }
    }
    const settlement = await settlementService.initiatePayment(req.params.settlementId, uid, {
      useRealGateway,
      paymentMode: typeof req.body?.paymentMode === 'string' ? req.body.paymentMode : undefined,
      referenceId,
      proofUrl: proofUrl || undefined,
      note: typeof req.body?.note === 'string' ? req.body.note : undefined,
    });
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

// Payee-only shortcut: directly mark transaction as paid/completed
router.post('/:settlementId/mark-paid-by-payee', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const uid = req.user!.uid;
    const { settlement, allComplete } = await settlementService.markPaidByPayee(
      req.params.settlementId,
      uid,
      typeof req.body?.note === 'string' ? req.body.note : undefined,
    );
    emitToEvent(settlement.eventId, 'settlement:updated', { settlement, allComplete });
    if (allComplete) {
      emitToEvent(settlement.eventId, 'event:updated', { status: 'settled' });
    }
    return res.json({ success: true, data: { settlement, allComplete } } as ApiResponse);
  } catch (err: any) {
    console.error('POST /settlements/:settlementId/mark-paid-by-payee error:', err);
    if (err.message?.includes('Forbidden')) {
      return res.status(403).json({ success: false, error: err.message } as ApiResponse);
    }
    if (err.message?.includes('not found')) {
      return res.status(404).json({ success: false, error: err.message } as ApiResponse);
    }
    return res.status(400).json({ success: false, error: err.message } as ApiResponse);
  }
});

// Reject payment confirmation for a settlement transaction (payee only)
router.post('/:settlementId/reject', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const uid = req.user!.uid;
    const settlement = await settlementService.rejectPayment(
      req.params.settlementId,
      uid,
      typeof req.body?.reason === 'string' ? req.body.reason : undefined,
    );
    emitToEvent(settlement.eventId, 'settlement:updated', { settlement });
    return res.json({ success: true, data: settlement } as ApiResponse);
  } catch (err: any) {
    console.error('POST /settlements/:settlementId/reject error:', err);
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
