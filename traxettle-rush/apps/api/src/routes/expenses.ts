import { Router, type Response } from 'express';
import {
  ApiResponse,
  CreateExpenseDto,
  UpdateExpenseDto,
  allowedFundingSources,
  isPoolFundedExpense,
  resolveFundingModel,
} from '@traxettle/shared';
import type { ExpenseFundingSource } from '@traxettle/shared';
import { ExpenseService } from '../services/expense.service';
import { EventService } from '../services/event.service';
import { GroupService } from '../services/group.service';
import { PoolError, PoolService } from '../services/pool.service';
import { requireAuth, type AuthenticatedRequest } from '../middleware/auth';
import { emitToEvent, emitToUser } from '../config/websocket';
import { notifyEventParticipants } from '../utils/notification-helper';
import { requireActiveEvent, markStaleIfInReview } from '../utils/event-guards';
import { EventAccessError, filterVisibleExpenses, requireEventAccess } from '../utils/event-access';

const router: Router = Router();
const expenseService = new ExpenseService();
const eventService = new EventService();
const groupService = new GroupService();
const poolService = new PoolService();

const FUNDING_SOURCES: ExpenseFundingSource[] = ['self', 'pool', 'pool_reimbursement'];

/** Check if user is an admin of the event that owns the expense */
async function isEventAdmin(expenseId: string, userId: string): Promise<boolean> {
  const expense = await expenseService.getExpense(expenseId);
  if (!expense) return false;
  const event = await eventService.getEvent(expense.eventId);
  if (!event) return false;
  return event.createdBy === userId || (event.admins || []).includes(userId);
}

/** Map pool and access errors to their HTTP responses. Returns null if unhandled. */
function poolOrAccessError(res: Response, err: unknown) {
  if (err instanceof PoolError) {
    return res.status(err.statusCode).json({ success: false, error: err.message, code: err.code, data: err.data } as ApiResponse);
  }
  if (err instanceof EventAccessError) {
    return res.status(err.statusCode).json({ success: false, error: err.message } as ApiResponse);
  }
  return null;
}

function alertCustodianIfFlagged(eventId: string, expense: any) {
  const flags: string[] = Array.isArray(expense?.poolFlags) ? expense.poolFlags : [];
  if (flags.length === 0) return;
  eventService.getEvent(eventId).then((event) => {
    const custodian = event?.poolConfig?.custodianUserId;
    if (custodian) emitToUser(custodian, 'pool:alert', { eventId, expenseId: expense.id, flags, title: expense.title });
  }).catch(() => undefined);
}

// Get expenses for an event (participants only; others' private expenses are hidden)
router.get('/event/:eventId', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const uid = req.user!.uid;
    await requireEventAccess(req.params.eventId, uid);
    const [expenses, groups] = await Promise.all([
      expenseService.getEventExpenses(req.params.eventId),
      groupService.getEventGroups(req.params.eventId),
    ]);
    return res.json({ success: true, data: filterVisibleExpenses(expenses, uid, groups) } as ApiResponse);
  } catch (err) {
    if (err instanceof EventAccessError) return poolOrAccessError(res, err);
    console.error('GET /expenses/event/:eventId error:', err);
    return res.status(500).json({ success: false, error: 'Failed to fetch expenses' } as ApiResponse);
  }
});

// Get a single expense by ID
router.get('/:expenseId', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const uid = req.user!.uid;
    const expense = await expenseService.getExpense(req.params.expenseId);
    if (!expense) {
      return res.status(404).json({ success: false, error: 'Expense not found' } as ApiResponse);
    }
    await requireEventAccess(expense.eventId, uid);
    if (expense.isPrivate) {
      const groups = await groupService.getEventGroups(expense.eventId);
      if (filterVisibleExpenses([expense], uid, groups).length === 0) {
        // Don't reveal that someone else's private expense exists.
        return res.status(404).json({ success: false, error: 'Expense not found' } as ApiResponse);
      }
    }
    return res.json({ success: true, data: expense } as ApiResponse);
  } catch (err) {
    if (err instanceof EventAccessError) return poolOrAccessError(res, err);
    console.error('GET /expenses/:id error:', err);
    return res.status(500).json({ success: false, error: 'Failed to fetch expense' } as ApiResponse);
  }
});

// Create a new expense
router.post('/', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const uid = req.user!.uid;
    const body = req.body as CreateExpenseDto;
    const fundingSource: ExpenseFundingSource = body.fundingSource ?? 'self';
    const isPoolDraw = fundingSource === 'pool' || fundingSource === 'pool_reimbursement';

    if (!body.eventId || !body.title || body.amount === undefined || !body.currency || (!isPoolDraw && !body.splitType)) {
      return res.status(400).json({
        success: false,
        error: 'eventId, title, amount, currency, and splitType are required'
      } as ApiResponse);
    }

    if (body.amount <= 0 || (isPoolDraw && (typeof body.amount !== 'number' || !Number.isFinite(body.amount)))) {
      return res.status(400).json({
        success: false,
        error: 'Amount must be greater than zero'
      } as ApiResponse);
    }

    if (!FUNDING_SOURCES.includes(fundingSource)) {
      return res.status(400).json({ success: false, error: 'fundingSource must be "self", "pool", or "pool_reimbursement"' } as ApiResponse);
    }

    if ((!isPoolDraw || body.splitType) && !['equal', 'ratio', 'custom'].includes(body.splitType)) {
      return res.status(400).json({
        success: false,
        error: 'splitType must be "equal", "ratio", or "custom"'
      } as ApiResponse);
    }

    // Pool draws need no splits: the pool pays, nobody owes anybody.
    if (!isPoolDraw && !body.isPrivate && (!body.splits || body.splits.length === 0)) {
      return res.status(400).json({
        success: false,
        error: 'At least one split is required'
      } as ApiResponse);
    }

    await requireEventAccess(body.eventId, uid);
    await requireActiveEvent(body.eventId);

    const event = await eventService.getEvent(body.eventId);
    const model = resolveFundingModel(event);
    if (!allowedFundingSources(model).includes(fundingSource)) {
      return res.status(400).json({
        success: false,
        error: model === 'pool'
          ? 'This event is funded from a pool: pay with pool funds or claim a reimbursement'
          : `fundingSource "${fundingSource}" is not available in this event`,
        code: 'FUNDING_SOURCE_NOT_ALLOWED',
      } as ApiResponse);
    }

    const prep = isPoolDraw
      ? await poolService.prepareDraw(body.eventId, uid, {
          amount: body.amount,
          currency: body.currency,
          fundingSource,
          alreadyIncurred: body.alreadyIncurred,
          attachments: body.attachments,
        })
      : null;

    const created = await expenseService.createExpense(uid, body, prep ? {
      fundingSource: prep.fundingSource,
      poolCycleId: prep.poolCycleId,
      poolDraw: prep.poolDraw,
      poolFlags: prep.poolFlags,
    } : undefined);
    if (prep?.autoApproved) await poolService.finalizeApprovedDraw(created, uid);
    const expense = prep ? (await expenseService.getExpense(created.id)) || created : created;

    await markStaleIfInReview(body.eventId);
    emitToEvent(body.eventId, 'expense:created', { expense });
    if (prep) {
      emitToEvent(body.eventId, 'pool:updated', { reason: 'draw_recorded', expenseId: expense.id });
      alertCustodianIfFlagged(body.eventId, expense);
    }
    notifyEventParticipants(body.eventId, uid, 'expense_added', {
      Title: expense.title,
      Amount: `${expense.currency} ${expense.amount.toFixed(2)}`,
      ...(prep
        ? { 'Paid with': fundingSource === 'pool' ? 'Pool funds' : 'Own money (reimbursement claim)' }
        : { 'Split Type': expense.splitType, Private: expense.isPrivate ? 'Yes' : 'No' }),
    });
    return res.status(201).json({ success: true, data: expense } as ApiResponse);
  } catch (err: any) {
    const handled = poolOrAccessError(res, err);
    if (handled) return handled;
    console.error('POST /expenses error:', err);
    if (err.message?.includes('Split amounts')) {
      return res.status(400).json({ success: false, error: err.message } as ApiResponse);
    }
    if (err.message?.startsWith('Forbidden')) {
      return res.status(403).json({ success: false, error: err.message } as ApiResponse);
    }
    return res.status(500).json({ success: false, error: 'Failed to create expense' } as ApiResponse);
  }
});

// Update an expense
router.put('/:expenseId', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const uid = req.user!.uid;
    const dto = req.body as UpdateExpenseDto & { fundingSource?: ExpenseFundingSource };
    // Check event lock before allowing update
    const expenseToCheck = await expenseService.getExpense(req.params.expenseId);
    if (expenseToCheck) await requireActiveEvent(expenseToCheck.eventId);
    const admin = await isEventAdmin(req.params.expenseId, uid);

    let poolUpdate: Parameters<typeof expenseService.updateExpense>[4];
    let legToRemove: string | null = null;
    if (expenseToCheck && isPoolFundedExpense(expenseToCheck)) {
      if (expenseToCheck.paidBy !== uid && !admin) {
        throw new Error('Forbidden: Only the payer or an admin can update this expense');
      }
      if (dto.fundingSource !== undefined && dto.fundingSource !== expenseToCheck.fundingSource) {
        return res.status(400).json({ success: false, error: 'How an expense was paid cannot be changed. Delete it and add it again.' } as ApiResponse);
      }
      if (dto.currency !== undefined && dto.currency !== expenseToCheck.currency) {
        return res.status(400).json({ success: false, error: 'Pool expenses must stay in the pool currency' } as ApiResponse);
      }
      await poolService.assertDrawCycleWritable(expenseToCheck);
      if (dto.amount !== undefined && dto.amount !== expenseToCheck.amount) {
        if (typeof dto.amount !== 'number' || !Number.isFinite(dto.amount) || dto.amount <= 0) {
          return res.status(400).json({ success: false, error: 'Amount must be greater than zero' } as ApiResponse);
        }
        ({ legToRemove } = await poolService.assertDrawMutable(expenseToCheck));
        const prep = await poolService.prepareAmountChange(expenseToCheck, uid, dto.amount, dto.alreadyIncurred);
        poolUpdate = { poolDraw: prep.poolDraw, poolFlags: prep.poolFlags };
      }
    }

    const expense = await expenseService.updateExpense(req.params.expenseId, uid, dto, admin, poolUpdate);

    if (!expense) {
      return res.status(404).json({ success: false, error: 'Expense not found' } as ApiResponse);
    }

    let result = expense;
    if (isPoolFundedExpense(expense)) {
      await poolService.removeLeg(legToRemove);
      if (poolUpdate?.poolDraw.status === 'approved') await poolService.finalizeApprovedDraw(expense, uid);
      else if (expense.poolCycleId) await poolService.refreshOverdraftLatch(expense.eventId, expense.poolCycleId);
      result = (await expenseService.getExpense(expense.id)) || expense;
      emitToEvent(expense.eventId, 'pool:updated', { reason: 'draw_updated', expenseId: expense.id });
      alertCustodianIfFlagged(expense.eventId, result);
    }

    await markStaleIfInReview(expense.eventId);
    emitToEvent(expense.eventId, 'expense:updated', { expense: result });
    notifyEventParticipants(expense.eventId, uid, 'expense_updated', {
      Title: result.title,
      Amount: `${result.currency} ${result.amount.toFixed(2)}`,
    });
    return res.json({ success: true, data: result } as ApiResponse);
  } catch (err: any) {
    const handled = poolOrAccessError(res, err);
    if (handled) return handled;
    console.error('PUT /expenses/:id error:', err);
    if (err.message?.includes('Forbidden')) {
      return res.status(403).json({ success: false, error: err.message } as ApiResponse);
    }
    if (err.message?.includes('Split amounts')) {
      return res.status(400).json({ success: false, error: err.message } as ApiResponse);
    }
    return res.status(500).json({ success: false, error: 'Failed to update expense' } as ApiResponse);
  }
});

// Delete an expense
router.delete('/:expenseId', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const uid = req.user!.uid;
    const expenseToDelete = await expenseService.getExpense(req.params.expenseId);
    if (expenseToDelete) await requireActiveEvent(expenseToDelete.eventId);
    const admin = await isEventAdmin(req.params.expenseId, uid);

    let legToRemove: string | null = null;
    if (expenseToDelete && isPoolFundedExpense(expenseToDelete)) {
      if (expenseToDelete.paidBy !== uid && !admin) {
        throw new Error('Forbidden: Only the payer or an admin can delete this expense');
      }
      ({ legToRemove } = await poolService.assertDrawMutable(expenseToDelete));
    }

    const deleted = await expenseService.deleteExpense(req.params.expenseId, uid, admin);

    if (!deleted) {
      return res.status(404).json({ success: false, error: 'Expense not found' } as ApiResponse);
    }

    if (expenseToDelete) {
      if (isPoolFundedExpense(expenseToDelete)) {
        await poolService.removeLeg(legToRemove);
        if (expenseToDelete.poolCycleId) await poolService.refreshOverdraftLatch(expenseToDelete.eventId, expenseToDelete.poolCycleId);
        emitToEvent(expenseToDelete.eventId, 'pool:updated', { reason: 'draw_deleted', expenseId: req.params.expenseId });
      }
      await markStaleIfInReview(expenseToDelete.eventId);
      emitToEvent(expenseToDelete.eventId, 'expense:deleted', { expenseId: req.params.expenseId });
      notifyEventParticipants(expenseToDelete.eventId, uid, 'expense_deleted', {
        Title: expenseToDelete.title,
        Amount: `${expenseToDelete.currency} ${expenseToDelete.amount.toFixed(2)}`,
      });
    }
    return res.json({ success: true, data: { message: 'Expense deleted successfully' } } as ApiResponse);
  } catch (err: any) {
    const handled = poolOrAccessError(res, err);
    if (handled) return handled;
    console.error('DELETE /expenses/:id error:', err);
    if (err.message?.includes('Forbidden')) {
      return res.status(403).json({ success: false, error: err.message } as ApiResponse);
    }
    return res.status(500).json({ success: false, error: 'Failed to delete expense' } as ApiResponse);
  }
});

// Get balances for an event
router.get('/event/:eventId/balances', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    await requireEventAccess(req.params.eventId, req.user!.uid);
    const balances = await expenseService.getEventBalances(req.params.eventId);
    return res.json({ success: true, data: balances } as ApiResponse);
  } catch (err) {
    if (err instanceof EventAccessError) return poolOrAccessError(res, err);
    console.error('GET /expenses/event/:eventId/balances error:', err);
    return res.status(500).json({ success: false, error: 'Failed to calculate balances' } as ApiResponse);
  }
});

// Calculate equal splits helper
router.post('/calculate-splits', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const { amount, participantIds, splitType, ratios } = req.body;

    if (!amount || !participantIds || participantIds.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'amount and participantIds are required'
      } as ApiResponse);
    }

    let splits;
    if (splitType === 'ratio' && ratios) {
      splits = expenseService.calculateRatioSplits(amount, ratios);
    } else {
      splits = expenseService.calculateEqualSplits(amount, participantIds);
    }

    return res.json({ success: true, data: splits } as ApiResponse);
  } catch (err: any) {
    console.error('POST /expenses/calculate-splits error:', err);
    return res.status(400).json({ success: false, error: err.message || 'Failed to calculate splits' } as ApiResponse);
  }
});

export { router as expenseRoutes };
