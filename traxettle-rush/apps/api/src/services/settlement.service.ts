import { Balance, Settlement, SettlementPlan, ExpenseSplit, Group, SettlementApproval } from '@traxettle/shared';
import { db } from '../config/firebase';
import { ExpenseService } from './expense.service';
import { GroupService } from './group.service';
import { FxRateService } from './fx-rate.service';
import { PaymentService } from './payment.service';
import { EventService } from './event.service';

export class SettlementService {
  private collection = 'settlements';
  private expenseService = new ExpenseService();
  private groupService = new GroupService();
  private fxRateService = new FxRateService();
  private paymentService = new PaymentService();
  private eventService = new EventService();

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
    // Otherwise, enter 'review' mode with approvals
    if (plan.settlements.length === 0) {
      await db.collection('events').doc(eventId).set(
        { status: 'settled', updatedAt: now, settlementApprovals: {}, settlementStale: false },
        { merge: true }
      );
    } else {
      // Build approvals map: every participant entity needs to approve
      const approvals = await this.buildApprovalsMap(eventId, groups);
      await db.collection('events').doc(eventId).set(
        { status: 'review', updatedAt: now, settlementApprovals: approvals, settlementStale: false },
        { merge: true }
      );
    }

    return plan;
  }

  /**
   * Build the initial approvals map for all participant entities.
   * Individual users (not in any group) get their own entry.
   * Groups get an entry keyed by groupId.
   */
  private async buildApprovalsMap(
    eventId: string,
    groups: Group[],
  ): Promise<Record<string, SettlementApproval>> {
    const participants = await this.eventService.getParticipants(eventId);
    const approvals: Record<string, SettlementApproval> = {};

    // Set of userIds that belong to a group
    const usersInGroups = new Set<string>();
    for (const group of groups) {
      for (const memberId of group.members) {
        usersInGroups.add(memberId);
      }
      approvals[group.id] = {
        approved: false,
        entityType: 'group',
        displayName: group.name,
      };
    }

    // Individual users not in any group
    for (const p of participants) {
      if (!usersInGroups.has(p.userId) && p.status === 'accepted') {
        approvals[p.userId] = {
          approved: false,
          entityType: 'user',
          displayName: p.displayName || p.email || p.userId,
        };
      }
    }

    return approvals;
  }

  /**
   * Approve the settlement review for a specific entity.
   * For groups: only the representative (main member), payerUserId, or event admin can approve.
   * When all entities have approved, transition event to 'payment' status.
   */
  async approveSettlementReview(
    eventId: string,
    userId: string,
  ): Promise<{ approvals: Record<string, SettlementApproval>; allApproved: boolean }> {
    const eventDoc = await db.collection('events').doc(eventId).get();
    if (!eventDoc.exists) throw new Error('Event not found');

    const eventData = eventDoc.data()!;
    if (eventData.status !== 'review') {
      throw new Error('Event is not in review status');
    }
    if (eventData.settlementStale) {
      throw new Error('Settlement is stale. Please regenerate before approving.');
    }

    const approvals: Record<string, SettlementApproval> = eventData.settlementApprovals || {};
    const groups = await this.groupService.getEventGroups(eventId);
    const isEventAdmin = eventData.createdBy === userId || (eventData.admins || []).includes(userId);

    // Determine which entity this user can approve for
    const entityId = this.resolveApprovalEntity(userId, groups, approvals, isEventAdmin);
    if (!entityId) {
      throw new Error('Forbidden: You are not authorized to approve for any pending entity');
    }

    if (approvals[entityId]?.approved) {
      throw new Error('This entity has already approved the settlement');
    }

    approvals[entityId] = {
      ...approvals[entityId],
      approved: true,
      approvedAt: new Date().toISOString(),
    };

    const allApproved = Object.values(approvals).every(a => a.approved);
    const now = new Date().toISOString();

    if (allApproved) {
      // Transition to payment
      await db.collection('events').doc(eventId).set(
        { status: 'payment', settlementApprovals: approvals, updatedAt: now },
        { merge: true }
      );
    } else {
      await db.collection('events').doc(eventId).set(
        { settlementApprovals: approvals, updatedAt: now },
        { merge: true }
      );
    }

    return { approvals, allApproved };
  }

  /**
   * Resolve which approval entity a user can approve for.
   * Returns the entityId (userId or groupId) or null if not authorized.
   *
   * Rules:
   * - Individual users can only approve for themselves.
   * - Group members who are the representative or payerUserId can approve for their group.
   * - No one can approve on behalf of another individual user or an unrelated group.
   */
  private resolveApprovalEntity(
    userId: string,
    groups: Group[],
    approvals: Record<string, SettlementApproval>,
    _isEventAdmin: boolean,
  ): string | null {
    // Check if user has their own individual approval pending
    if (approvals[userId] && !approvals[userId].approved) {
      return userId;
    }

    // Check if user can approve for a group they belong to (representative or payerUserId only)
    for (const group of groups) {
      if (approvals[group.id] && !approvals[group.id].approved) {
        const isRepOrPayer = group.representative === userId || group.payerUserId === userId;
        if (isRepOrPayer) {
          return group.id;
        }
      }
    }

    return null;
  }

  /**
   * Regenerate settlement after expense edits during review.
   * Recalculates the plan and resets approvals ONLY for affected entities
   * (amount changed, new payee/payer added or removed).
   * Only admins or group representatives can trigger this.
   */
  async regenerateSettlement(
    eventId: string,
    userId: string,
  ): Promise<SettlementPlan> {
    const eventDoc = await db.collection('events').doc(eventId).get();
    if (!eventDoc.exists) throw new Error('Event not found');

    const eventData = eventDoc.data()!;
    if (eventData.status !== 'review') {
      throw new Error('Can only regenerate settlement during review phase');
    }

    // Verify authorization: admin or group representative
    const isAdmin = eventData.createdBy === userId || (eventData.admins || []).includes(userId);
    const groups = await this.groupService.getEventGroups(eventId);
    const isGroupRep = groups.some(g => g.representative === userId || g.payerUserId === userId);
    if (!isAdmin && !isGroupRep) {
      throw new Error('Forbidden: Only admins or group representatives can regenerate settlements');
    }

    // Snapshot old settlements for comparison
    const oldSettlements = await this.getEventSettlements(eventId);
    const oldSettlementMap = new Map<string, number>(); // entityId -> net amount
    for (const s of oldSettlements) {
      // Track net amounts per entity
      oldSettlementMap.set(s.fromEntityId, (oldSettlementMap.get(s.fromEntityId) || 0) - s.amount);
      oldSettlementMap.set(s.toEntityId, (oldSettlementMap.get(s.toEntityId) || 0) + s.amount);
    }
    const oldEntityIds = new Set([...oldSettlementMap.keys()]);

    // Clear existing settlements
    const existingSnap = await db.collection(this.collection).where('eventId', '==', eventId).get();
    if (!existingSnap.empty) {
      const batch = db.batch();
      existingSnap.docs.forEach(doc => batch.delete(doc.ref));
      await batch.commit();
    }

    // Recalculate
    const balances = await this.calculateEntityBalances(eventId);
    const plan = this.calculateSettlementPlan(balances, eventId, eventData.currency, groups);

    // FX conversion
    const expenseCurrency = eventData.currency as string;
    const settlementCurrency = (eventData.settlementCurrency || eventData.currency) as string;
    const fxRateMode = (eventData.fxRateMode || 'eod') as 'predefined' | 'eod';
    const predefinedFxRates = eventData.predefinedFxRates as Record<string, number> | undefined;

    if (settlementCurrency !== expenseCurrency) {
      const rateInfo = await this.fxRateService.getRate(
        expenseCurrency, settlementCurrency, predefinedFxRates, fxRateMode
      );
      for (const settlement of plan.settlements) {
        settlement.settlementAmount = this.fxRateService.convert(settlement.amount, rateInfo.rate);
        settlement.settlementCurrency = settlementCurrency;
        settlement.fxRate = rateInfo.rate;
      }
    }

    const now = new Date().toISOString();

    // Persist new settlements
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
      if (settlement.settlementAmount !== undefined) {
        docData.settlementAmount = settlement.settlementAmount;
        docData.settlementCurrency = settlement.settlementCurrency;
        docData.fxRate = settlement.fxRate;
      }
      const docRef = await db.collection(this.collection).add(docData);
      settlement.id = docRef.id;
    }

    // Determine affected entities: amount changed, added, or removed
    const newSettlementMap = new Map<string, number>();
    for (const s of plan.settlements) {
      newSettlementMap.set(s.fromEntityId, (newSettlementMap.get(s.fromEntityId) || 0) - s.amount);
      newSettlementMap.set(s.toEntityId, (newSettlementMap.get(s.toEntityId) || 0) + s.amount);
    }
    const newEntityIds = new Set([...newSettlementMap.keys()]);

    const affectedEntities = new Set<string>();
    // New entities or amount changed
    for (const [entityId, newAmt] of newSettlementMap) {
      const oldAmt = oldSettlementMap.get(entityId) || 0;
      if (Math.abs(newAmt - oldAmt) > 0.01) {
        affectedEntities.add(entityId);
      }
    }
    // Removed entities
    for (const entityId of oldEntityIds) {
      if (!newEntityIds.has(entityId)) {
        affectedEntities.add(entityId);
      }
    }

    // Update approvals: reset only affected entities, keep existing approvals for unaffected
    const oldApprovals: Record<string, SettlementApproval> = eventData.settlementApprovals || {};
    const newApprovals = await this.buildApprovalsMap(eventId, groups);

    for (const [entityId, approval] of Object.entries(newApprovals)) {
      if (!affectedEntities.has(entityId) && oldApprovals[entityId]?.approved) {
        // Preserve the old approval for unaffected entities
        newApprovals[entityId] = oldApprovals[entityId];
      }
    }

    if (plan.settlements.length === 0) {
      await db.collection('events').doc(eventId).set(
        { status: 'settled', updatedAt: now, settlementApprovals: {}, settlementStale: false },
        { merge: true }
      );
    } else {
      // Check if all still approved after reset
      const allApproved = Object.values(newApprovals).every(a => a.approved);
      const newStatus = allApproved ? 'payment' : 'review';
      await db.collection('events').doc(eventId).set(
        { status: newStatus, updatedAt: now, settlementApprovals: newApprovals, settlementStale: false },
        { merge: true }
      );
    }

    return plan;
  }

  /**
   * Mark settlement as stale when expenses are modified during review phase.
   * This signals that the settlement needs regeneration before approvals can continue.
   */
  async markSettlementStale(eventId: string): Promise<void> {
    const eventDoc = await db.collection('events').doc(eventId).get();
    if (!eventDoc.exists) return;
    const eventData = eventDoc.data()!;
    if (eventData.status !== 'review') return;

    await db.collection('events').doc(eventId).set(
      { settlementStale: true, updatedAt: new Date().toISOString() },
      { merge: true }
    );
  }

  /**
   * Initiate payment for a settlement transaction (mock payment).
   * Only the fromUserId (payer) can initiate.
   */
  async initiatePayment(
    settlementId: string,
    userId: string,
    options: { useRealGateway?: boolean } = {},
  ): Promise<Settlement> {
    const doc = await db.collection(this.collection).doc(settlementId).get();
    if (!doc.exists) throw new Error('Settlement not found');

    const data = doc.data()!;
    if (data.fromUserId !== userId) {
      throw new Error('Forbidden: Only the payer can initiate payment');
    }
    if (data.status !== 'pending' && data.status !== 'failed') {
      throw new Error(`Cannot initiate payment: transaction is already ${data.status}`);
    }

    const now = new Date().toISOString();
    const settlementCurrency = (data.settlementCurrency || data.currency || 'USD') as string;
    const settlementAmount =
      typeof data.settlementAmount === 'number'
        ? data.settlementAmount
        : data.amount;
    const provider = this.fxRateService.getPaymentProvider(settlementCurrency);
    const payment = await this.paymentService.startPayment(
      provider,
      {
        settlementId,
        amount: settlementAmount,
        currency: settlementCurrency,
        description: `Traxettle settlement ${settlementId}`,
      },
      options,
    );

    await db.collection(this.collection).doc(settlementId).set(
      {
        status: 'initiated',
        initiatedAt: now,
        failedAt: null,
        failureReason: null,
        paymentMethod: payment.provider,
        paymentId: payment.providerPaymentId,
        retryCount: data.status === 'failed'
          ? ((typeof data.retryCount === 'number' ? data.retryCount : 0) + 1)
          : (typeof data.retryCount === 'number' ? data.retryCount : 0),
        ...(payment.checkoutUrl ? { checkoutUrl: payment.checkoutUrl } : {}),
      },
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

    return ({
      id: settlementId,
      ...data,
      status: 'initiated',
      paymentMethod: payment.provider,
      paymentId: payment.providerPaymentId,
      retryCount: data.status === 'failed'
        ? ((typeof data.retryCount === 'number' ? data.retryCount : 0) + 1)
        : (typeof data.retryCount === 'number' ? data.retryCount : 0),
      ...(payment.checkoutUrl ? { checkoutUrl: payment.checkoutUrl } : {}),
      initiatedAt: new Date(now),
    } as unknown) as Settlement;
  }

  /**
   * Retry a payment after a failed/cancelled attempt.
   * Payer can re-initiate while the transaction is initiated/failed/pending.
   */
  async retryPayment(
    settlementId: string,
    userId: string,
    options: { useRealGateway?: boolean } = {},
  ): Promise<Settlement> {
    const doc = await db.collection(this.collection).doc(settlementId).get();
    if (!doc.exists) throw new Error('Settlement not found');

    const data = doc.data()!;
    if (data.fromUserId !== userId) {
      throw new Error('Forbidden: Only the payer can retry payment');
    }
    if (data.status === 'completed') {
      throw new Error('Cannot retry payment: transaction is already completed');
    }
    if (data.status === 'pending') {
      return this.initiatePayment(settlementId, userId, options);
    }
    if (data.status !== 'initiated' && data.status !== 'failed') {
      throw new Error(`Cannot retry payment: transaction is ${data.status}`);
    }

    const now = new Date().toISOString();
    await db.collection(this.collection).doc(settlementId).set(
      {
        status: 'failed',
        failedAt: now,
        failureReason: 'retry_requested_by_payer',
      },
      { merge: true },
    );

    try {
      return await this.initiatePayment(settlementId, userId, options);
    } catch (error: any) {
      await db.collection(this.collection).doc(settlementId).set(
        {
          status: 'failed',
          failedAt: new Date().toISOString(),
          failureReason: error?.message || 'payment_retry_failed',
        },
        { merge: true },
      );
      throw error;
    }
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
        checkoutUrl: data.checkoutUrl,
        failureReason: data.failureReason,
        retryCount: data.retryCount,
        initiatedAt: data.initiatedAt,
        failedAt: data.failedAt,
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
