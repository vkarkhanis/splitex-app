import { Router } from 'express';
import { ApiResponse, CreateExpenseDto, UpdateExpenseDto } from '@traxettle/shared';
import { ExpenseService } from '../services/expense.service';
import { EventService } from '../services/event.service';
import { requireAuth, type AuthenticatedRequest } from '../middleware/auth';
import { emitToEvent } from '../config/websocket';
import { notifyEventParticipants } from '../utils/notification-helper';
import { requireActiveEvent, markStaleIfInReview } from '../utils/event-guards';

const router: Router = Router();
const expenseService = new ExpenseService();
const eventService = new EventService();

/** Check if user is an admin of the event that owns the expense */
async function isEventAdmin(expenseId: string, userId: string): Promise<boolean> {
  const expense = await expenseService.getExpense(expenseId);
  if (!expense) return false;
  const event = await eventService.getEvent(expense.eventId);
  if (!event) return false;
  return event.createdBy === userId || (event.admins || []).includes(userId);
}

// Get expenses for an event
router.get('/event/:eventId', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const expenses = await expenseService.getEventExpenses(req.params.eventId);
    return res.json({ success: true, data: expenses } as ApiResponse);
  } catch (err) {
    console.error('GET /expenses/event/:eventId error:', err);
    return res.status(500).json({ success: false, error: 'Failed to fetch expenses' } as ApiResponse);
  }
});

// Get a single expense by ID
router.get('/:expenseId', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const expense = await expenseService.getExpense(req.params.expenseId);
    if (!expense) {
      return res.status(404).json({ success: false, error: 'Expense not found' } as ApiResponse);
    }
    return res.json({ success: true, data: expense } as ApiResponse);
  } catch (err) {
    console.error('GET /expenses/:id error:', err);
    return res.status(500).json({ success: false, error: 'Failed to fetch expense' } as ApiResponse);
  }
});

// Create a new expense
router.post('/', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const uid = req.user!.uid;
    const body = req.body as CreateExpenseDto;

    if (!body.eventId || !body.title || body.amount === undefined || !body.currency || !body.splitType) {
      return res.status(400).json({
        success: false,
        error: 'eventId, title, amount, currency, and splitType are required'
      } as ApiResponse);
    }

    if (body.amount <= 0) {
      return res.status(400).json({
        success: false,
        error: 'Amount must be greater than zero'
      } as ApiResponse);
    }

    if (!['equal', 'ratio', 'custom'].includes(body.splitType)) {
      return res.status(400).json({
        success: false,
        error: 'splitType must be "equal", "ratio", or "custom"'
      } as ApiResponse);
    }

    if (!body.isPrivate && (!body.splits || body.splits.length === 0)) {
      return res.status(400).json({
        success: false,
        error: 'At least one split is required'
      } as ApiResponse);
    }

    await requireActiveEvent(body.eventId);
    const expense = await expenseService.createExpense(uid, body);
    await markStaleIfInReview(body.eventId);
    emitToEvent(body.eventId, 'expense:created', { expense });
    notifyEventParticipants(body.eventId, uid, 'expense_added', {
      Title: expense.title,
      Amount: `${expense.currency} ${expense.amount.toFixed(2)}`,
      'Split Type': expense.splitType,
      Private: expense.isPrivate ? 'Yes' : 'No',
    });
    return res.status(201).json({ success: true, data: expense } as ApiResponse);
  } catch (err: any) {
    console.error('POST /expenses error:', err);
    if (err.message?.includes('Split amounts')) {
      return res.status(400).json({ success: false, error: err.message } as ApiResponse);
    }
    return res.status(500).json({ success: false, error: 'Failed to create expense' } as ApiResponse);
  }
});

// Update an expense
router.put('/:expenseId', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const uid = req.user!.uid;
    const dto = req.body as UpdateExpenseDto;
    // Check event lock before allowing update
    const expenseToCheck = await expenseService.getExpense(req.params.expenseId);
    if (expenseToCheck) await requireActiveEvent(expenseToCheck.eventId);
    const admin = await isEventAdmin(req.params.expenseId, uid);
    const expense = await expenseService.updateExpense(req.params.expenseId, uid, dto, admin);

    if (!expense) {
      return res.status(404).json({ success: false, error: 'Expense not found' } as ApiResponse);
    }

    await markStaleIfInReview(expense.eventId);
    emitToEvent(expense.eventId, 'expense:updated', { expense });
    notifyEventParticipants(expense.eventId, uid, 'expense_updated', {
      Title: expense.title,
      Amount: `${expense.currency} ${expense.amount.toFixed(2)}`,
    });
    return res.json({ success: true, data: expense } as ApiResponse);
  } catch (err: any) {
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
    const deleted = await expenseService.deleteExpense(req.params.expenseId, uid, admin);

    if (!deleted) {
      return res.status(404).json({ success: false, error: 'Expense not found' } as ApiResponse);
    }

    if (expenseToDelete) {
      await markStaleIfInReview(expenseToDelete.eventId);
      emitToEvent(expenseToDelete.eventId, 'expense:deleted', { expenseId: req.params.expenseId });
      notifyEventParticipants(expenseToDelete.eventId, uid, 'expense_deleted', {
        Title: expenseToDelete.title,
        Amount: `${expenseToDelete.currency} ${expenseToDelete.amount.toFixed(2)}`,
      });
    }
    return res.json({ success: true, data: { message: 'Expense deleted successfully' } } as ApiResponse);
  } catch (err: any) {
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
    const balances = await expenseService.getEventBalances(req.params.eventId);
    return res.json({ success: true, data: balances } as ApiResponse);
  } catch (err) {
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
