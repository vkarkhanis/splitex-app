import { Router, type Response } from 'express';
import type { ZodSchema } from 'zod';
import type { ApiResponse } from '@traxettle/shared';
import { requireAuth, type AuthenticatedRequest } from '../middleware/auth';
import { db } from '../config/firebase';
import { emitToEvent } from '../config/websocket';
import { PoolError, PoolService } from '../services/pool.service';
import { SettlementService } from '../services/settlement.service';
import { EventAccessError, requireEventAccess } from '../utils/event-access';
import {
  closePreviewSchema,
  closeSchema,
  confirmSchema,
  dissolveSchema,
  markPaidSchema,
  poolConfigPatchSchema,
  poolCreateSchema,
  reasonSchema,
  setContributionsSchema,
  topUpSchema,
} from '../validation/pool.schemas';

const router: Router = Router();
const poolService = new PoolService();
const settlementService = new SettlementService();
const planner = settlementService.calculateSettlementPlan.bind(settlementService);

function parse<T>(schema: ZodSchema<T>, body: unknown, res: Response): T | null {
  const result = schema.safeParse(body ?? {});
  if (result.success) return result.data;
  const issue = result.error.issues[0];
  res.status(400).json({
    success: false,
    error: issue ? `${issue.path.join('.') || 'body'}: ${issue.message}` : 'Invalid request',
    code: 'VALIDATION_ERROR',
  } as ApiResponse);
  return null;
}

function fail(res: Response, err: any, label: string) {
  if (err instanceof PoolError) {
    return res.status(err.statusCode).json({ success: false, error: err.message, code: err.code, data: err.data } as ApiResponse);
  }
  if (err instanceof EventAccessError) {
    return res.status(err.statusCode).json({ success: false, error: err.message } as ApiResponse);
  }
  if (typeof err?.message === 'string' && err.message.startsWith('Forbidden')) {
    return res.status(403).json({ success: false, error: err.message } as ApiResponse);
  }
  console.error(`${label} error:`, err);
  return res.status(500).json({ success: false, error: 'Pool request failed' } as ApiResponse);
}

async function eventIdOfContribution(id: string): Promise<string> {
  const snap = await db.collection('poolContributions').doc(id).get();
  if (!snap.exists) throw new PoolError(404, 'Contribution not found');
  return snap.data()!.eventId;
}

async function eventIdOfExpense(id: string): Promise<string> {
  const snap = await db.collection('expenses').doc(id).get();
  if (!snap.exists) throw new PoolError(404, 'Expense not found');
  return snap.data()!.eventId;
}

const announce = (eventId: string, reason: string, extra: Record<string, unknown> = {}) =>
  emitToEvent(eventId, 'pool:updated', { reason, ...extra });

// ── Reading ─────────────────────────────────────────────────────────────

router.get('/event/:eventId/summary', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    await requireEventAccess(req.params.eventId, req.user!.uid);
    const cycleId = typeof req.query.cycleId === 'string' ? req.query.cycleId : undefined;
    return res.json({ success: true, data: await poolService.getSummary(req.params.eventId, cycleId) } as ApiResponse);
  } catch (err) {
    return fail(res, err, 'GET /pools/event/:eventId/summary');
  }
});

router.get('/event/:eventId/ledger', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    await requireEventAccess(req.params.eventId, req.user!.uid);
    const cycleId = typeof req.query.cycleId === 'string' ? req.query.cycleId : undefined;
    return res.json({ success: true, data: await poolService.getLedger(req.params.eventId, cycleId) } as ApiResponse);
  } catch (err) {
    return fail(res, err, 'GET /pools/event/:eventId/ledger');
  }
});

router.get('/event/:eventId/cycles', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    await requireEventAccess(req.params.eventId, req.user!.uid);
    return res.json({ success: true, data: await poolService.listCycles(req.params.eventId) } as ApiResponse);
  } catch (err) {
    return fail(res, err, 'GET /pools/event/:eventId/cycles');
  }
});

// ── Configuration ───────────────────────────────────────────────────────

router.put('/event/:eventId/config', requireAuth, async (req: AuthenticatedRequest, res) => {
  const body = parse(poolConfigPatchSchema, req.body, res);
  if (!body) return;
  try {
    await requireEventAccess(req.params.eventId, req.user!.uid);
    const config = await poolService.updateConfig(req.params.eventId, req.user!.uid, body);
    announce(req.params.eventId, 'config');
    return res.json({ success: true, data: config } as ApiResponse);
  } catch (err) {
    return fail(res, err, 'PUT /pools/event/:eventId/config');
  }
});

/** Add a pool to an existing split-expenses event (becomes hybrid). */
router.post('/event/:eventId/convert', requireAuth, async (req: AuthenticatedRequest, res) => {
  const body = parse(poolCreateSchema, req.body, res);
  if (!body) return;
  try {
    await requireEventAccess(req.params.eventId, req.user!.uid);
    const result = await poolService.convertToHybrid(req.params.eventId, req.user!.uid, body);
    emitToEvent(req.params.eventId, 'event:updated', { fundingModel: 'hybrid' });
    announce(req.params.eventId, 'converted');
    return res.status(201).json({ success: true, data: result } as ApiResponse);
  } catch (err) {
    return fail(res, err, 'POST /pools/event/:eventId/convert');
  }
});

// ── Contributions ───────────────────────────────────────────────────────

router.put('/event/:eventId/contributions', requireAuth, async (req: AuthenticatedRequest, res) => {
  const body = parse(setContributionsSchema, req.body, res);
  if (!body) return;
  try {
    await requireEventAccess(req.params.eventId, req.user!.uid);
    const contributions = await poolService.setContributions(req.params.eventId, req.user!.uid, body.contributions);
    announce(req.params.eventId, 'contributions');
    return res.json({ success: true, data: contributions } as ApiResponse);
  } catch (err) {
    return fail(res, err, 'PUT /pools/event/:eventId/contributions');
  }
});

router.post('/event/:eventId/top-ups', requireAuth, async (req: AuthenticatedRequest, res) => {
  const body = parse(topUpSchema, req.body, res);
  if (!body) return;
  try {
    await requireEventAccess(req.params.eventId, req.user!.uid);
    const contribution = await poolService.addTopUp(req.params.eventId, req.user!.uid, body);
    announce(req.params.eventId, 'top_up');
    return res.status(201).json({ success: true, data: contribution } as ApiResponse);
  } catch (err) {
    return fail(res, err, 'POST /pools/event/:eventId/top-ups');
  }
});

const contributionAction = (
  path: string,
  schema: ZodSchema<any>,
  run: (id: string, uid: string, body: any) => Promise<unknown>,
) =>
  router.post(`/contributions/:contributionId/${path}`, requireAuth, async (req: AuthenticatedRequest, res) => {
    const body = parse(schema, req.body, res);
    if (!body) return;
    try {
      const eventId = await eventIdOfContribution(req.params.contributionId);
      await requireEventAccess(eventId, req.user!.uid);
      const data = await run(req.params.contributionId, req.user!.uid, body);
      announce(eventId, `contribution_${path}`, { contributionId: req.params.contributionId });
      return res.json({ success: true, data } as ApiResponse);
    } catch (err) {
      return fail(res, err, `POST /pools/contributions/:id/${path}`);
    }
  });

contributionAction('mark-paid', markPaidSchema, (id, uid, b) => poolService.markContributionPaid(id, uid, b));
contributionAction('confirm', confirmSchema, (id, uid, b) => poolService.confirmContribution(id, uid, b));
contributionAction('reject', reasonSchema, (id, uid, b) => poolService.rejectContribution(id, uid, b.reason));
contributionAction('waive', reasonSchema, (id, uid, b) => poolService.waiveContribution(id, uid, b.reason));

// ── Draw approvals ──────────────────────────────────────────────────────

router.post('/expenses/:expenseId/approve', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const eventId = await eventIdOfExpense(req.params.expenseId);
    await requireEventAccess(eventId, req.user!.uid);
    const result = await poolService.approveDraw(req.params.expenseId, req.user!.uid);
    emitToEvent(eventId, 'expense:updated', { expense: result.expense });
    if (result.settlementId) emitToEvent(eventId, 'settlement:updated', { settlementId: result.settlementId });
    announce(eventId, 'draw_approved', { expenseId: req.params.expenseId });
    return res.json({ success: true, data: result } as ApiResponse);
  } catch (err) {
    return fail(res, err, 'POST /pools/expenses/:id/approve');
  }
});

router.post('/expenses/:expenseId/reject', requireAuth, async (req: AuthenticatedRequest, res) => {
  const body = parse(reasonSchema, req.body, res);
  if (!body) return;
  try {
    const eventId = await eventIdOfExpense(req.params.expenseId);
    await requireEventAccess(eventId, req.user!.uid);
    const expense = await poolService.rejectDraw(req.params.expenseId, req.user!.uid, body.reason);
    emitToEvent(eventId, 'expense:updated', { expense });
    announce(eventId, 'draw_rejected', { expenseId: req.params.expenseId });
    return res.json({ success: true, data: expense } as ApiResponse);
  } catch (err) {
    return fail(res, err, 'POST /pools/expenses/:id/reject');
  }
});

// ── Cycle close & settle-up ─────────────────────────────────────────────

router.post('/event/:eventId/close-preview', requireAuth, async (req: AuthenticatedRequest, res) => {
  const body = parse(closePreviewSchema, req.body, res);
  if (!body) return;
  try {
    await requireEventAccess(req.params.eventId, req.user!.uid);
    const preview = await poolService.previewClose(req.params.eventId, req.user!.uid, body);
    return res.json({ success: true, data: preview } as ApiResponse);
  } catch (err) {
    return fail(res, err, 'POST /pools/event/:eventId/close-preview');
  }
});

router.post('/event/:eventId/close', requireAuth, async (req: AuthenticatedRequest, res) => {
  const body = parse(closeSchema, req.body, res);
  if (!body) return;
  try {
    await requireEventAccess(req.params.eventId, req.user!.uid);
    const result = await poolService.closeCycle(req.params.eventId, req.user!.uid, { reason: 'scheduled', cover: body.cover, openNext: body.openNext }, planner);
    if (result.settlementIds.length > 0) emitToEvent(req.params.eventId, 'settlement:updated', { settlementIds: result.settlementIds });
    announce(req.params.eventId, 'cycle_closed', { cycleId: result.closed.id });
    return res.json({ success: true, data: result } as ApiResponse);
  } catch (err) {
    return fail(res, err, 'POST /pools/event/:eventId/close');
  }
});

/**
 * Final settle-up: reconcile the pool and generate ONE settlement plan that
 * covers pool positions and any peer-to-peer expenses (hybrid). The event then
 * follows the existing review → payment → settled lifecycle.
 */
router.post('/event/:eventId/dissolve', requireAuth, async (req: AuthenticatedRequest, res) => {
  const body = parse(dissolveSchema, req.body, res);
  if (!body) return;
  try {
    await requireEventAccess(req.params.eventId, req.user!.uid);
    const cycle = await poolService.beginDissolution(req.params.eventId, req.user!.uid, body);
    const plan = await settlementService.generateSettlement(req.params.eventId, req.user!.uid);
    emitToEvent(req.params.eventId, 'settlement:generated', { plan });
    emitToEvent(req.params.eventId, 'event:updated', {});
    announce(req.params.eventId, 'dissolving', { cycleId: cycle.id });
    return res.json({ success: true, data: { cycle, plan } } as ApiResponse);
  } catch (err) {
    return fail(res, err, 'POST /pools/event/:eventId/dissolve');
  }
});

export { router as poolRoutes };
