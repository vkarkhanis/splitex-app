import { Balance, Settlement, SettlementPlan, ExpenseSplit, Group } from '@splitex/shared';
import { db } from '../config/firebase';
import { ExpenseService } from './expense.service';
import { GroupService } from './group.service';
import { FxRateService } from './fx-rate.service';

export class SettlementService {
  private collection = 'settlements';
  private expenseService = new ExpenseService();
  private groupService = new GroupService();
  private fxRateService = new FxRateService();

  /**
   * Calculate entity-level balances for an event.
   * Groups are treated as single entities. Individual users not in any group
   * are treated as individual entities.
   * Only shared (non-private) expenses are included in settlement.
   *
   * "On behalf of" logic:
   * When paidOnBehalfOf[] has entries, the payer fronted money for other entities.
   * - The payer gets CREDITED the full expense amount (they paid out of pocket).
   * - The payer's own entity is NOT debited — their share is zero.
   * - All other split entities are debited normally (the full expense is split among them).
   * This means the payer will be owed the full amount by the split entities.
   */
  async calculateEntityBalances(eventId: string): Promise<Balance[]> {
    const expenses = await this.expenseService.getEventExpenses(eventId);
    const groups = await this.groupService.getEventGroups(eventId);

    // Build a map: userId -> groupId (if user is in a group for this event)
    const userToGroup = new Map<string, string>();
    for (const group of groups) {
      for (const memberId of group.members) {
        userToGroup.set(memberId, group.id);
      }
    }

    // Calculate balances at entity level (group or individual user)
    const balanceMap = new Map<string, { amount: number; entityType: 'user' | 'group' }>();

    const getOrInit = (entityId: string, entityType: 'user' | 'group') => {
      if (!balanceMap.has(entityId)) {
        balanceMap.set(entityId, { amount: 0, entityType });
      }
      return balanceMap.get(entityId)!;
    };

    for (const expense of expenses) {
      // Skip private expenses — they are personal records only
      if (expense.isPrivate) continue;

      // Determine who paid: resolve to entity level
      // Credit always goes to the actual payer (they spent the money)
      const payerGroupId = userToGroup.get(expense.paidBy);
      if (payerGroupId) {
        getOrInit(payerGroupId, 'group').amount += expense.amount;
      } else {
        getOrInit(expense.paidBy, 'user').amount += expense.amount;
      }

      // Process splits: debit each entity
      // For "on behalf of" expenses, the payer's entity should NOT be debited
      // (their share is zero). The frontend excludes them from splits, but we
      // add a safety check here.
      const payerEntityId = payerGroupId || expense.paidBy;
      const hasOnBehalfOf = Array.isArray(expense.paidOnBehalfOf) && expense.paidOnBehalfOf.length > 0;

      for (const split of expense.splits) {
        // Safety: skip if this split is for the payer's own entity on an "on behalf of" expense
        if (hasOnBehalfOf) {
          const splitResolvedEntity = split.entityType === 'group'
            ? split.entityId
            : (userToGroup.get(split.entityId) || split.entityId);
          if (splitResolvedEntity === payerEntityId) continue;
        }

        if (split.entityType === 'group') {
          getOrInit(split.entityId, 'group').amount -= split.amount;
        } else {
          const splitUserGroup = userToGroup.get(split.entityId);
          if (splitUserGroup) {
            getOrInit(splitUserGroup, 'group').amount -= split.amount;
          } else {
            getOrInit(split.entityId, 'user').amount -= split.amount;
          }
        }
      }
    }

    // Convert to Balance array, filter out zero balances
    const balances: Balance[] = [];
    for (const [entityId, { amount, entityType }] of balanceMap) {
      if (Math.abs(amount) > 0.01) {
        balances.push({ entityId, entityType, amount: Math.round(amount * 100) / 100 });
      }
    }

    return balances;
  }

  /**
   * Resolve the actual payer userId for an entity.
   * For groups, this is the group's designated payerUserId.
   * For individuals, this is the entityId itself.
   */
  private resolvePayerUserId(entityId: string, entityType: 'user' | 'group', groups: Group[]): string {
    if (entityType === 'user') return entityId;
    const group = groups.find(g => g.id === entityId);
    return group?.payerUserId || entityId;
  }

  /**
   * Greedy settlement algorithm: minimize number of transactions.
   * Positive balance = entity is owed money (creditor).
   * Negative balance = entity owes money (debtor).
   */
  calculateSettlementPlan(
    balances: Balance[],
    eventId: string,
    currency: string,
    groups: Group[] = [],
  ): SettlementPlan {
    const creditors: (Balance & { remaining: number })[] = [];
    const debtors: (Balance & { remaining: number })[] = [];

    for (const b of balances) {
      if (b.amount > 0.01) {
        creditors.push({ ...b, remaining: b.amount });
      } else if (b.amount < -0.01) {
        debtors.push({ ...b, remaining: Math.abs(b.amount) });
      }
    }

    // Sort descending by amount for greedy optimization
    creditors.sort((a, b) => b.remaining - a.remaining);
    debtors.sort((a, b) => b.remaining - a.remaining);

    const settlements: Settlement[] = [];
    let i = 0;
    let j = 0;

    while (i < debtors.length && j < creditors.length) {
      const debtor = debtors[i];
      const creditor = creditors[j];

      const settlementAmount = Math.round(Math.min(debtor.remaining, creditor.remaining) * 100) / 100;

      if (settlementAmount > 0.01) {
        settlements.push({
          id: `settlement-${settlements.length + 1}`,
          eventId,
          fromEntityId: debtor.entityId,
          fromEntityType: debtor.entityType,
          toEntityId: creditor.entityId,
          toEntityType: creditor.entityType,
          fromUserId: this.resolvePayerUserId(debtor.entityId, debtor.entityType, groups),
          toUserId: this.resolvePayerUserId(creditor.entityId, creditor.entityType, groups),
          amount: settlementAmount,
          currency,
          status: 'pending',
          createdAt: new Date(),
        });
      }

      debtor.remaining = Math.round((debtor.remaining - settlementAmount) * 100) / 100;
      creditor.remaining = Math.round((creditor.remaining - settlementAmount) * 100) / 100;

      if (debtor.remaining < 0.01) i++;
      if (creditor.remaining < 0.01) j++;
    }

    const totalAmount = settlements.reduce((sum, s) => sum + s.amount, 0);

    return {
      eventId,
      settlements,
      totalTransactions: settlements.length,
      totalAmount: Math.round(totalAmount * 100) / 100,
    };
  }

  /**
   * Generate and persist settlement plan for an event.
   * Sets event status to 'payment' (or 'settled' if no payments needed).
   */
  async generateSettlement(eventId: string, userId: string): Promise<SettlementPlan> {
    // Verify user is admin
    const eventDoc = await db.collection('events').doc(eventId).get();
    if (!eventDoc.exists) throw new Error('Event not found');

    const eventData = eventDoc.data()!;
    if (eventData.createdBy !== userId && !(eventData.admins || []).includes(userId)) {
      throw new Error('Forbidden: Only admins can generate settlements');
    }

    // Clear any existing settlements for this event
    const existingSnap = await db.collection(this.collection).where('eventId', '==', eventId).get();
    if (!existingSnap.empty) {
      const batch = db.batch();
      existingSnap.docs.forEach(doc => batch.delete(doc.ref));
      await batch.commit();
    }

    const balances = await this.calculateEntityBalances(eventId);
    const groups = await this.groupService.getEventGroups(eventId);
    const plan = this.calculateSettlementPlan(balances, eventId, eventData.currency, groups);

    // FX conversion: if settlementCurrency differs from event currency, convert amounts
    const expenseCurrency = eventData.currency as string;
    const settlementCurrency = (eventData.settlementCurrency || eventData.currency) as string;
    const fxRateMode = (eventData.fxRateMode || 'eod') as 'predefined' | 'eod';
    const predefinedFxRates = eventData.predefinedFxRates as Record<string, number> | undefined;
    let fxRate: number | undefined;

    if (settlementCurrency !== expenseCurrency) {
      const rateInfo = await this.fxRateService.getRate(
        expenseCurrency, settlementCurrency, predefinedFxRates, fxRateMode
      );
      fxRate = rateInfo.rate;

      // Add settlement amounts to each transaction
      for (const settlement of plan.settlements) {
        settlement.settlementAmount = this.fxRateService.convert(settlement.amount, fxRate);
        settlement.settlementCurrency = settlementCurrency;
        settlement.fxRate = fxRate;
      }
    }

    const now = new Date().toISOString();

    // Persist each settlement transaction
    for (const settlement of plan.settlements) {
      const docData: Record<string, any> = {
        eventId: settlement.eventId,
        fromEntityId: settlement.fromEntityId,
        fromEntityType: settlement.fromEntityType,
        toEntityId: settlement.toEntityId,
        toEntityType: settlement.toEntityType,
        fromUserId: settlement.fromUserId,
        toUserId: settlement.toUserId,
        amount: settlement.amount,
        currency: settlement.currency,
        status: 'pending',
        createdAt: now,
      };

      // Include FX fields if settlement currency differs
      if (settlement.settlementAmount !== undefined) {
        docData.settlementAmount = settlement.settlementAmount;
        docData.settlementCurrency = settlement.settlementCurrency;
        docData.fxRate = settlement.fxRate;
      }

      const docRef = await db.collection(this.collection).add(docData);
      // Update the in-memory settlement with the real Firestore ID
      settlement.id = docRef.id;
    }

    // If no payments needed (everyone is even), go directly to 'settled'
    // Otherwise, enter 'payment' mode
    const newStatus = plan.settlements.length === 0 ? 'settled' : 'payment';
    await db.collection('events').doc(eventId).set(
      { status: newStatus, updatedAt: now },
      { merge: true }
    );

    return plan;
  }

  /**
   * Initiate payment for a settlement transaction (mock payment).
   * Only the fromUserId (payer) can initiate.
   */
  async initiatePayment(settlementId: string, userId: string): Promise<Settlement> {
    const doc = await db.collection(this.collection).doc(settlementId).get();
    if (!doc.exists) throw new Error('Settlement not found');

    const data = doc.data()!;
    if (data.fromUserId !== userId) {
      throw new Error('Forbidden: Only the payer can initiate payment');
    }
    if (data.status !== 'pending') {
      throw new Error(`Cannot initiate payment: transaction is already ${data.status}`);
    }

    const now = new Date().toISOString();
    await db.collection(this.collection).doc(settlementId).set(
      { status: 'initiated', initiatedAt: now, paymentMethod: 'mock', paymentId: `mock-pay-${Date.now()}` },
      { merge: true }
    );

    // Lock the event: ensure it's in 'payment' mode (should already be)
    if (data.eventId) {
      const eventDoc = await db.collection('events').doc(data.eventId).get();
      if (eventDoc.exists && eventDoc.data()?.status === 'active') {
        await db.collection('events').doc(data.eventId).set(
          { status: 'payment', updatedAt: now },
          { merge: true }
        );
      }
    }

    return {
      id: settlementId,
      ...data,
      status: 'initiated',
      initiatedAt: new Date(now),
    } as Settlement;
  }

  /**
   * Approve (confirm receipt of) a payment for a settlement transaction.
   * Only the toUserId (payee) can approve.
   * When all transactions for the event are completed, auto-mark event as 'settled'.
   */
  async approvePayment(settlementId: string, userId: string): Promise<{ settlement: Settlement; allComplete: boolean }> {
    const doc = await db.collection(this.collection).doc(settlementId).get();
    if (!doc.exists) throw new Error('Settlement not found');

    const data = doc.data()!;
    if (data.toUserId !== userId) {
      throw new Error('Forbidden: Only the payee can approve payment');
    }
    if (data.status !== 'initiated') {
      throw new Error(`Cannot approve payment: transaction is ${data.status}, expected initiated`);
    }

    const now = new Date().toISOString();
    await db.collection(this.collection).doc(settlementId).set(
      { status: 'completed', completedAt: now },
      { merge: true }
    );

    // Check if all settlements for this event are now completed
    const allSettlements = await this.getEventSettlements(data.eventId);
    const allComplete = allSettlements.every(s =>
      s.id === settlementId ? true : s.status === 'completed'
    );

    // If all complete, mark event as 'settled'
    if (allComplete) {
      await db.collection('events').doc(data.eventId).set(
        { status: 'settled', updatedAt: now },
        { merge: true }
      );
    }

    return {
      settlement: {
        id: settlementId,
        ...data,
        status: 'completed',
        completedAt: new Date(now),
      } as Settlement,
      allComplete,
    };
  }

  /**
   * Get existing settlement plan for an event.
   */
  async getEventSettlements(eventId: string): Promise<Settlement[]> {
    const snap = await db.collection(this.collection)
      .where('eventId', '==', eventId)
      .get();

    if (snap.empty) return [];

    return snap.docs.map(doc => {
      const data = doc.data();
      return {
        id: doc.id,
        eventId: data.eventId,
        fromEntityId: data.fromEntityId,
        fromEntityType: data.fromEntityType,
        toEntityId: data.toEntityId,
        toEntityType: data.toEntityType,
        fromUserId: data.fromUserId || '',
        toUserId: data.toUserId || '',
        amount: data.amount,
        currency: data.currency,
        settlementAmount: data.settlementAmount,
        settlementCurrency: data.settlementCurrency,
        fxRate: data.fxRate,
        status: data.status,
        paymentMethod: data.paymentMethod,
        paymentId: data.paymentId,
        initiatedAt: data.initiatedAt,
        createdAt: data.createdAt,
        completedAt: data.completedAt,
      } as Settlement;
    });
  }

  /**
   * Get pending (not yet completed) settlement total for an event.
   */
  async getPendingSettlementTotal(eventId: string): Promise<number> {
    const settlements = await this.getEventSettlements(eventId);
    return settlements
      .filter(s => s.status !== 'completed')
      .reduce((sum, s) => sum + s.amount, 0);
  }
}
