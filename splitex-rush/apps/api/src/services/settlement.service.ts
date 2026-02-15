import { Balance, Settlement, SettlementPlan, ExpenseSplit } from '@splitex/shared';
import { db } from '../config/firebase';
import { ExpenseService } from './expense.service';
import { GroupService } from './group.service';

export class SettlementService {
  private collection = 'settlements';
  private expenseService = new ExpenseService();
  private groupService = new GroupService();

  /**
   * Calculate entity-level balances for an event.
   * Groups are treated as single entities. Individual users not in any group
   * are treated as individual entities.
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
      // Skip private expenses from settlement
      if (expense.isPrivate) continue;

      // Determine who paid: resolve to entity level
      const payerGroupId = userToGroup.get(expense.paidBy);
      if (payerGroupId) {
        // Payer is in a group — credit goes to the group
        getOrInit(payerGroupId, 'group').amount += expense.amount;
      } else {
        // Payer is an individual
        getOrInit(expense.paidBy, 'user').amount += expense.amount;
      }

      // Process splits: debit each entity
      for (const split of expense.splits) {
        if (split.entityType === 'group') {
          getOrInit(split.entityId, 'group').amount -= split.amount;
        } else {
          // Check if this user is in a group
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
   * Greedy settlement algorithm: minimize number of transactions.
   * Positive balance = entity is owed money (creditor).
   * Negative balance = entity owes money (debtor).
   */
  calculateSettlementPlan(balances: Balance[], eventId: string, currency: string): SettlementPlan {
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
   */
  async generateSettlement(eventId: string, userId: string): Promise<SettlementPlan> {
    // Verify user is admin
    const eventDoc = await db.collection('events').doc(eventId).get();
    if (!eventDoc.exists) throw new Error('Event not found');

    const eventData = eventDoc.data()!;
    if (eventData.createdBy !== userId && !(eventData.admins || []).includes(userId)) {
      throw new Error('Forbidden: Only admins can generate settlements');
    }

    const balances = await this.calculateEntityBalances(eventId);
    const plan = this.calculateSettlementPlan(balances, eventId, eventData.currency);

    // Persist each settlement
    const now = new Date().toISOString();
    for (const settlement of plan.settlements) {
      await db.collection(this.collection).add({
        eventId: settlement.eventId,
        fromEntityId: settlement.fromEntityId,
        fromEntityType: settlement.fromEntityType,
        toEntityId: settlement.toEntityId,
        toEntityType: settlement.toEntityType,
        amount: settlement.amount,
        currency: settlement.currency,
        status: 'pending',
        createdAt: now,
      });
    }

    // Update event status to settled
    await db.collection('events').doc(eventId).set(
      { status: 'settled', updatedAt: now },
      { merge: true }
    );

    return plan;
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
        amount: data.amount,
        currency: data.currency,
        status: data.status,
        createdAt: data.createdAt,
        completedAt: data.completedAt,
      } as Settlement;
    });
  }

  /**
   * Get pending settlement total for an event.
   */
  async getPendingSettlementTotal(eventId: string): Promise<number> {
    const settlements = await this.getEventSettlements(eventId);
    return settlements
      .filter(s => s.status === 'pending')
      .reduce((sum, s) => sum + s.amount, 0);
  }
}
