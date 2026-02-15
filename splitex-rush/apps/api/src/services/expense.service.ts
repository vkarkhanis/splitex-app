import { Expense, CreateExpenseDto, UpdateExpenseDto, ExpenseSplit } from '@splitex/shared';
import { db } from '../config/firebase';

export class ExpenseService {
  private collection = 'expenses';

  async createExpense(userId: string, dto: CreateExpenseDto): Promise<Expense> {
    const now = new Date().toISOString();

    // Validate splits sum to amount for custom splits (skip for private expenses)
    if (dto.splitType === 'custom' && !dto.isPrivate && dto.splits && dto.splits.length > 0) {
      const splitTotal = dto.splits.reduce((sum, s) => sum + s.amount, 0);
      if (Math.abs(splitTotal - dto.amount) > 0.01) {
        throw new Error('Split amounts must sum to the total expense amount');
      }
    }

    const expenseData = {
      eventId: dto.eventId,
      title: dto.title,
      description: dto.description || '',
      amount: dto.amount,
      currency: dto.currency,
      paidBy: userId,
      isPrivate: dto.isPrivate || false,
      splitType: dto.splitType,
      splits: dto.isPrivate ? [] : (dto.splits || []),
      attachments: dto.attachments || [],
      createdAt: now,
      updatedAt: now,
    };

    const docRef = await db.collection(this.collection).add(expenseData);

    return {
      id: docRef.id,
      ...expenseData,
      createdAt: new Date(now),
      updatedAt: new Date(now),
    } as Expense;
  }

  async getExpense(expenseId: string): Promise<Expense | null> {
    const doc = await db.collection(this.collection).doc(expenseId).get();
    if (!doc.exists) return null;

    const data = doc.data()!;
    return {
      id: doc.id,
      eventId: data.eventId,
      title: data.title,
      description: data.description,
      amount: data.amount,
      currency: data.currency,
      paidBy: data.paidBy,
      paidOnBehalfOf: data.paidOnBehalfOf,
      isPrivate: data.isPrivate || false,
      splitType: data.splitType,
      splits: data.splits || [],
      attachments: data.attachments || [],
      createdAt: data.createdAt,
      updatedAt: data.updatedAt,
    } as Expense;
  }

  async getEventExpenses(eventId: string): Promise<Expense[]> {
    const snap = await db.collection(this.collection)
      .where('eventId', '==', eventId)
      .get();

    if (snap.empty) return [];

    return snap.docs.map(doc => {
      const data = doc.data();
      return {
        id: doc.id,
        eventId: data.eventId,
        title: data.title,
        description: data.description,
        amount: data.amount,
        currency: data.currency,
        paidBy: data.paidBy,
        paidOnBehalfOf: data.paidOnBehalfOf,
        isPrivate: data.isPrivate || false,
        splitType: data.splitType,
        splits: data.splits || [],
        attachments: data.attachments || [],
        createdAt: data.createdAt,
        updatedAt: data.updatedAt,
      } as Expense;
    });
  }

  async updateExpense(expenseId: string, userId: string, dto: UpdateExpenseDto, isAdmin = false): Promise<Expense | null> {
    const expense = await this.getExpense(expenseId);
    if (!expense) return null;

    // Only the payer or an event admin can update
    if (expense.paidBy !== userId && !isAdmin) {
      throw new Error('Forbidden: Only the payer or an admin can update this expense');
    }

    // Validate splits if provided
    const amount = dto.amount !== undefined ? dto.amount : expense.amount;
    const splitType = dto.splitType !== undefined ? dto.splitType : expense.splitType;
    if (splitType === 'custom' && dto.splits) {
      const splitTotal = dto.splits.reduce((sum, s) => sum + s.amount, 0);
      if (Math.abs(splitTotal - amount) > 0.01) {
        throw new Error('Split amounts must sum to the total expense amount');
      }
    }

    const now = new Date().toISOString();
    const updates: Record<string, any> = { updatedAt: now };

    if (dto.title !== undefined) updates.title = dto.title;
    if (dto.description !== undefined) updates.description = dto.description;
    if (dto.amount !== undefined) updates.amount = dto.amount;
    if (dto.currency !== undefined) updates.currency = dto.currency;
    if (dto.splitType !== undefined) updates.splitType = dto.splitType;
    if (dto.splits !== undefined) updates.splits = dto.splits;
    if (dto.attachments !== undefined) updates.attachments = dto.attachments;
    if (dto.isPrivate !== undefined) updates.isPrivate = dto.isPrivate;

    await db.collection(this.collection).doc(expenseId).set(updates, { merge: true });

    return this.getExpense(expenseId);
  }

  async deleteExpense(expenseId: string, userId: string, isAdmin = false): Promise<boolean> {
    const expense = await this.getExpense(expenseId);
    if (!expense) return false;

    if (expense.paidBy !== userId && !isAdmin) {
      throw new Error('Forbidden: Only the payer or an admin can delete this expense');
    }

    await db.collection(this.collection).doc(expenseId).delete();
    return true;
  }

  calculateEqualSplits(amount: number, participantIds: string[]): ExpenseSplit[] {
    const perPerson = Math.round((amount / participantIds.length) * 100) / 100;
    const remainder = Math.round((amount - perPerson * participantIds.length) * 100) / 100;

    return participantIds.map((id, index) => ({
      entityType: 'user' as const,
      entityId: id,
      amount: index === 0 ? perPerson + remainder : perPerson,
    }));
  }

  calculateRatioSplits(amount: number, splits: { entityId: string; entityType: 'user' | 'group'; ratio: number }[]): ExpenseSplit[] {
    const totalRatio = splits.reduce((sum, s) => sum + s.ratio, 0);
    if (totalRatio === 0) throw new Error('Total ratio cannot be zero');

    return splits.map(s => ({
      entityType: s.entityType,
      entityId: s.entityId,
      amount: Math.round((amount * s.ratio / totalRatio) * 100) / 100,
      ratio: s.ratio,
    }));
  }

  async getEventBalances(eventId: string): Promise<Record<string, number>> {
    const expenses = await this.getEventExpenses(eventId);
    const balances: Record<string, number> = {};

    for (const expense of expenses) {
      // Payer gets credited
      balances[expense.paidBy] = (balances[expense.paidBy] || 0) + expense.amount;

      // Each split participant gets debited
      for (const split of expense.splits) {
        balances[split.entityId] = (balances[split.entityId] || 0) - split.amount;
      }
    }

    return balances;
  }
}
