import { Router } from 'express';
import { z } from 'zod';
import type { ApiResponse } from '@traxettle/shared';
import { requireAuth, type AuthenticatedRequest } from '../middleware/auth';
import { db } from '../config/firebase';
import { storeUpload, UploadError } from '../services/upload.service';
import { EventAccessError, requireEventAccess } from '../utils/event-access';

const router: Router = Router();

const uploadSchema = z.discriminatedUnion('scope', [
  z.object({
    scope: z.literal('expense_receipt'),
    eventId: z.string().min(1),
    base64: z.string().min(1),
    contentType: z.string().optional(),
    filename: z.string().max(200).optional(),
  }),
  z.object({
    scope: z.literal('pool_contribution_proof'),
    contributionId: z.string().min(1),
    base64: z.string().min(1),
    contentType: z.string().optional(),
    filename: z.string().max(200).optional(),
  }),
]);

/**
 * Upload a receipt (for an expense, before or after it exists) or a proof of
 * payment for a pool contribution. Returns a URL to store on the record.
 */
router.post('/', requireAuth, async (req: AuthenticatedRequest, res) => {
  const parsed = uploadSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ success: false, error: parsed.error.issues[0]?.message || 'Invalid upload request' } as ApiResponse);
  }
  const uid = req.user!.uid;
  const body = parsed.data;
  try {
    if (body.scope === 'expense_receipt') {
      await requireEventAccess(body.eventId, uid);
      const stored = await storeUpload(`events/${body.eventId}/receipts`, uid, body, { noun: 'receipt', allowPdf: true });
      return res.status(201).json({ success: true, data: stored } as ApiResponse);
    }

    const snap = await db.collection('poolContributions').doc(body.contributionId).get();
    if (!snap.exists) return res.status(404).json({ success: false, error: 'Contribution not found' } as ApiResponse);
    const contribution = snap.data() || {};
    const event = await db.collection('events').doc(contribution.eventId).get();
    const custodian = event.data()?.poolConfig?.custodianUserId;
    if (contribution.fromUserId !== uid && custodian !== uid) {
      return res.status(403).json({ success: false, error: 'Forbidden: Only the contributor or custodian can attach proof' } as ApiResponse);
    }
    const stored = await storeUpload(`pools/${contribution.eventId}/contributions/${body.contributionId}`, uid, body, { noun: 'proof', allowPdf: true });
    return res.status(201).json({ success: true, data: stored } as ApiResponse);
  } catch (err: any) {
    if (err instanceof UploadError || err instanceof EventAccessError) {
      return res.status(err.statusCode).json({ success: false, error: err.message } as ApiResponse);
    }
    console.error('POST /uploads error:', err);
    return res.status(500).json({ success: false, error: 'Failed to upload file' } as ApiResponse);
  }
});

export { router as uploadRoutes };
