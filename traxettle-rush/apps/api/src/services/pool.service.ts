import {
  Balance,
  ContributionLike,
  CreatePoolConfigDto,
  DrawLike,
  Expense,
  ExpenseFundingSource,
  Group,
  PoolAuditEntry,
  PoolConfig,
  PoolContribution,
  PoolCycle,
  PoolCycleCloseReason,
  PoolCycleSummary,
  PoolDrawState,
  PoolEntityRef,
  PoolExpenseFlag,
  PoolLedger,
  PoolLedgerEntry,
  PoolReconciliation,
  PoolRefusalDetails,
  PoolSpenderSummary,
  ReconcileResult,
  allowedFundingSources,
  buildPoolConfig,
  computeArrears,
  computeCycleTotals,
  computeFundingState,
  computeOverdraftState,
  entityKey,
  evaluateDraw,
  fromMinor,
  nextOverdraftLatch,
  parseEntityKey,
  reconcileCycle,
  resolveFundingModel,
  resolveFundingSource,
  splitForMembershipChange,
  toMinor,
} from '@traxettle/shared';
import { db } from '../config/firebase';
import { GroupService } from './group.service';

const CYCLES = 'poolCycles';
const CONTRIBUTIONS = 'poolContributions';
const SETTLEMENTS = 'settlements';

export class PoolError extends Error {
  constructor(
    public readonly statusCode: number,
    message: string,
    public readonly code?: string,
    public readonly data?: unknown,
  ) {
    super(message);
    this.name = 'PoolError';
  }
}

const nowIso = () => new Date().toISOString();

function auditEntry(action: PoolAuditEntry['action'], actorUserId: string, extra: Partial<PoolAuditEntry> = {}): PoolAuditEntry {
  const entry: PoolAuditEntry = {
    id: `aud-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    action,
    actorUserId,
    createdAt: nowIso(),
  };
  for (const [k, v] of Object.entries(extra)) if (v !== undefined && v !== null) (entry as any)[k] = v;
  return entry;
}

function appendAudit(trail: PoolAuditEntry[] | undefined, entry: PoolAuditEntry): PoolAuditEntry[] {
  const next = [...(Array.isArray(trail) ? trail : []), entry];
  return next.length > 100 ? next.slice(next.length - 100) : next;
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

/** The accounting period containing `start` for a recurrence (UTC). */
export function periodFor(recurrence: PoolConfig['recurrence'], start: Date): { startDate: string; endDate: string | null; label: string } {
  const y = start.getUTCFullYear();
  const m = start.getUTCMonth();
  if (recurrence === 'monthly') {
    return {
      startDate: new Date(Date.UTC(y, m, 1)).toISOString(),
      endDate: new Date(Date.UTC(y, m + 1, 1) - 1).toISOString(),
      label: `${MONTHS[m]} ${y}`,
    };
  }
  if (recurrence === 'quarterly') {
    const q = Math.floor(m / 3);
    return {
      startDate: new Date(Date.UTC(y, q * 3, 1)).toISOString(),
      endDate: new Date(Date.UTC(y, q * 3 + 3, 1) - 1).toISOString(),
      label: `Q${q + 1} ${y}`,
    };
  }
  return { startDate: start.toISOString(), endDate: null, label: 'Pool' };
}

type EventRecord = { id: string; data: Record<string, any> };

/**
 * The settlement minimiser (SettlementService.calculateSettlementPlan), passed
 * in to avoid a circular dependency between the pool and settlement services.
 */
export type SettlementPlanner = (
  balances: Balance[],
  eventId: string,
  currency: string,
  groups: Group[],
) => {
  settlements: Array<{
    fromEntityId: string;
    fromEntityType: 'user' | 'group';
    toEntityId: string;
    toEntityType: 'user' | 'group';
    fromUserId: string;
    toUserId: string;
    amount: number;
  }>;
};

export interface DrawPreparation {
  fundingSource: Exclude<ExpenseFundingSource, 'self'>;
  poolCycleId: string;
  poolDraw: PoolDrawState;
  poolFlags: PoolExpenseFlag[];
  /** Approved at creation: the caller must run finalizeApprovedDraw afterwards. */
  autoApproved: boolean;
}

export class PoolService {
  private groupService = new GroupService();

  // ── Loading ───────────────────────────────────────────────────────────

  async getEvent(eventId: string): Promise<EventRecord> {
    const snap = await db.collection('events').doc(eventId).get();
    if (!snap.exists) throw new PoolError(404, 'Event not found');
    return { id: eventId, data: snap.data() || {} };
  }

  requirePoolConfig(event: EventRecord): PoolConfig {
    const model = resolveFundingModel(event.data as any);
    if (model === 'peer_to_peer' || !event.data.poolConfig) {
      throw new PoolError(400, 'This event is not funded from a pool', 'POOL_NOT_ENABLED');
    }
    return event.data.poolConfig as PoolConfig;
  }

  isManager(event: EventRecord, config: PoolConfig, userId: string): boolean {
    return (
      config.custodianUserId === userId ||
      event.data.createdBy === userId ||
      (Array.isArray(event.data.admins) && event.data.admins.includes(userId))
    );
  }

  private requireManager(event: EventRecord, config: PoolConfig, userId: string) {
    if (!this.isManager(event, config, userId)) {
      throw new PoolError(403, 'Forbidden: Only the custodian or an event admin can do this');
    }
  }

  private async getGroups(eventId: string): Promise<Group[]> {
    return this.groupService.getEventGroups(eventId);
  }

  /** Map a user to the entity that represents them in this event (their group, if any). */
  private entityForUser(userId: string, groups: Group[]): PoolEntityRef {
    const group = groups.find((g) => (g.members || []).includes(userId));
    return group ? { entityType: 'group', entityId: group.id } : { entityType: 'user', entityId: userId };
  }

  private custodianKey(config: PoolConfig, groups: Group[]): string {
    if (config.funderMode === 'sponsor') return entityKey('user', config.custodianUserId);
    const ref = this.entityForUser(config.custodianUserId, groups);
    return entityKey(ref.entityType, ref.entityId);
  }

  /** Entities that share a cycle's spending. */
  async resolveRoster(eventId: string, config: PoolConfig, groups?: Group[]): Promise<PoolEntityRef[]> {
    if (config.funderMode === 'sponsor') return [{ entityType: 'user', entityId: config.custodianUserId }];
    const eventGroups = groups ?? (await this.getGroups(eventId));
    const participantsSnap = await db.collection('events').doc(eventId).collection('participants').get();
    const seen = new Set<string>();
    const roster: PoolEntityRef[] = [];
    for (const doc of participantsSnap.docs) {
      const p = doc.data() || {};
      if (p.status && p.status !== 'accepted') continue;
      const ref = this.entityForUser(doc.id, eventGroups);
      const key = entityKey(ref.entityType, ref.entityId);
      if (!seen.has(key)) {
        seen.add(key);
        roster.push(ref);
      }
    }
    return roster.sort((a, b) => entityKey(a.entityType, a.entityId).localeCompare(entityKey(b.entityType, b.entityId)));
  }

  private payerForEntity(ref: PoolEntityRef, groups: Group[]): string {
    if (ref.entityType === 'user') return ref.entityId;
    const group = groups.find((g) => g.id === ref.entityId);
    return group?.payerUserId || group?.representative || ref.entityId;
  }

  private mapCycle(id: string, d: Record<string, any>): PoolCycle {
    return {
      id,
      eventId: d.eventId,
      sequence: d.sequence || 1,
      label: d.label || 'Pool',
      startDate: d.startDate,
      endDate: d.endDate ?? null,
      status: d.status || 'open',
      currency: d.currency,
      openingBalanceMinor: d.openingBalanceMinor || 0,
      openingCredits: d.openingCredits || {},
      roster: Array.isArray(d.roster) ? d.roster : [],
      overdraftLatchedAt: d.overdraftLatchedAt ?? null,
      closeReason: d.closeReason ?? null,
      closedAt: d.closedAt ?? null,
      closedBy: d.closedBy ?? null,
      reconciliation: d.reconciliation ?? null,
      createdAt: d.createdAt,
      updatedAt: d.updatedAt,
    };
  }

  private mapContribution(id: string, d: Record<string, any>): PoolContribution {
    return {
      id,
      eventId: d.eventId,
      cycleId: d.cycleId,
      fromEntityId: d.fromEntityId,
      fromEntityType: d.fromEntityType || 'user',
      fromUserId: d.fromUserId,
      kind: d.kind || 'regular',
      expectedMinor: d.expectedMinor || 0,
      receivedMinor: d.receivedMinor || 0,
      claimedMinor: d.claimedMinor ?? null,
      currency: d.currency,
      status: d.status || 'pending',
      dueDate: d.dueDate ?? null,
      paymentReference: d.paymentReference ?? null,
      payerNote: d.payerNote ?? null,
      proofUrl: d.proofUrl ?? null,
      payerMarkedAt: d.payerMarkedAt ?? null,
      custodianConfirmedAt: d.custodianConfirmedAt ?? null,
      rejectionReason: d.rejectionReason ?? null,
      auditTrail: Array.isArray(d.auditTrail) ? d.auditTrail : [],
      createdBy: d.createdBy,
      createdAt: d.createdAt,
      updatedAt: d.updatedAt,
    };
  }

  async listCycles(eventId: string): Promise<PoolCycle[]> {
    const snap = await db.collection(CYCLES).where('eventId', '==', eventId).get();
    return snap.docs.map((d: any) => this.mapCycle(d.id, d.data())).sort((a: PoolCycle, b: PoolCycle) => a.sequence - b.sequence);
  }

  async getCycle(cycleId: string): Promise<PoolCycle | null> {
    const snap = await db.collection(CYCLES).doc(cycleId).get();
    return snap.exists ? this.mapCycle(cycleId, snap.data()!) : null;
  }

  /**
   * The cycle currently accepting activity (open or reconciling), else the
   * latest. Self-heals a cycle left `reconciling` after the event was moved
   * back to `active` — the event lifecycle is the source of truth.
   */
  async getCurrentCycle(eventId: string, event?: EventRecord): Promise<PoolCycle> {
    const cycles = await this.listCycles(eventId);
    if (cycles.length === 0) throw new PoolError(404, 'This pool has no cycles yet', 'POOL_NO_CYCLE');
    const live = [...cycles].reverse().find((c) => c.status !== 'closed');
    const current = live ?? cycles[cycles.length - 1];
    if (current.status === 'reconciling') {
      const ev = event ?? (await this.getEvent(eventId));
      if (ev.data.status === 'active') {
        await db.collection(CYCLES).doc(current.id).set({ status: 'open', updatedAt: nowIso() }, { merge: true });
        current.status = 'open';
      }
    }
    return current;
  }

  async listContributions(cycleId: string): Promise<PoolContribution[]> {
    const snap = await db.collection(CONTRIBUTIONS).where('cycleId', '==', cycleId).get();
    return snap.docs
      .map((d: any) => this.mapContribution(d.id, d.data()))
      .sort((a: PoolContribution, b: PoolContribution) => String(a.createdAt).localeCompare(String(b.createdAt)));
  }

  private async listCycleDraws(eventId: string, cycleId: string): Promise<Array<Record<string, any> & { id: string }>> {
    const snap = await db.collection('expenses').where('eventId', '==', eventId).get();
    return snap.docs
      .map((d: any) => ({ id: d.id, ...(d.data() || {}) }))
      .filter((e: any) => e.poolCycleId === cycleId && (e.fundingSource === 'pool' || e.fundingSource === 'pool_reimbursement'));
  }

  private toContributionLike(c: PoolContribution): ContributionLike {
    return { entityKey: entityKey(c.fromEntityType, c.fromEntityId), kind: c.kind, status: c.status, expectedMinor: c.expectedMinor, receivedMinor: c.receivedMinor };
  }

  private toDrawLike(e: Record<string, any>, currency: string, groups: Group[]): DrawLike {
    const splits = Array.isArray(e.splits) ? e.splits : [];
    const consumption = splits.length > 0
      ? splits.map((s: any) => {
          const ref = s.entityType === 'group' ? { entityType: 'group' as const, entityId: s.entityId } : this.entityForUser(s.entityId, groups);
          return { key: entityKey(ref.entityType, ref.entityId), weight: Math.max(0, Number(s.amount) || Number(s.ratio) || 0) };
        })
      : undefined;
    return {
      amountMinor: toMinor(Number(e.amount) || 0, currency),
      fundingSource: e.fundingSource,
      status: e.poolDraw?.status || 'pending',
      consumption,
    };
  }

  /** Live, derived view of a cycle. The balance is never stored — always recomputed. */
  async buildSummary(event: EventRecord, cycle: PoolCycle): Promise<PoolCycleSummary & { _draws: Array<Record<string, any> & { id: string }>; _contributions: PoolContribution[]; _groups: Group[] }> {
    const config = this.requirePoolConfig(event);
    const [contributions, draws, groups] = await Promise.all([
      this.listContributions(cycle.id),
      this.listCycleDraws(event.id, cycle.id),
      this.getGroups(event.id),
    ]);
    const totals = computeCycleTotals({
      openingBalanceMinor: cycle.openingBalanceMinor,
      contributions: contributions.map((c) => this.toContributionLike(c)),
      draws: draws.map((d) => this.toDrawLike(d, cycle.currency, groups)),
    });
    return {
      cycle,
      totals,
      overdraft: computeOverdraftState(config, cycle.openingBalanceMinor, totals, cycle.overdraftLatchedAt),
      funding: computeFundingState(config, cycle.openingBalanceMinor, totals),
      arrears: computeArrears(contributions.map((c) => this.toContributionLike(c))),
      _draws: draws,
      _contributions: contributions,
      _groups: groups,
    };
  }

  async getSummary(eventId: string, cycleId?: string): Promise<PoolCycleSummary> {
    const event = await this.getEvent(eventId);
    this.requirePoolConfig(event);
    const cycle = cycleId ? await this.getCycle(cycleId) : await this.getCurrentCycle(eventId, event);
    if (!cycle || cycle.eventId !== eventId) throw new PoolError(404, 'Cycle not found');
    const { _draws, _contributions, _groups, ...summary } = await this.buildSummary(event, cycle);
    return summary;
  }

  private assertCycleWritable(cycle: PoolCycle) {
    if (cycle.status === 'closed') throw new PoolError(409, 'This cycle is closed and can no longer change', 'POOL_CYCLE_CLOSED');
  }

  private assertEventEditable(event: EventRecord) {
    const status = event.data.status;
    if (status === 'payment' || status === 'settled' || status === 'closed') {
      throw new PoolError(403, `Forbidden: Cannot modify this event. The event is ${status}.`);
    }
  }

  /** Persist latch changes after any balance movement. */
  async refreshOverdraftLatch(eventId: string, cycleId: string): Promise<void> {
    const event = await this.getEvent(eventId);
    const cycle = await this.getCycle(cycleId);
    if (!cycle || cycle.status === 'closed') return;
    const summary = await this.buildSummary(event, cycle);
    const change = nextOverdraftLatch(summary.overdraft, Boolean(cycle.overdraftLatchedAt));
    if (change === 'latch') await db.collection(CYCLES).doc(cycleId).set({ overdraftLatchedAt: nowIso(), updatedAt: nowIso() }, { merge: true });
    if (change === 'release') await db.collection(CYCLES).doc(cycleId).set({ overdraftLatchedAt: null, updatedAt: nowIso() }, { merge: true });
  }

  // ── Setup ─────────────────────────────────────────────────────────────

  /** Validate a create-event pool request and build the config to store. */
  buildConfigForNewEvent(creatorId: string, dto: CreatePoolConfigDto): { fundingModel: 'pool' | 'hybrid'; poolConfig: PoolConfig } {
    const poolConfig = buildPoolConfig(
      dto.preset,
      dto.custodianUserId || creatorId,
      { targetAmountMinor: dto.targetAmountMinor ?? null, defaultContributionMinor: dto.defaultContributionMinor ?? null },
      dto.overrides || {},
    );
    if (poolConfig.funderMode === 'sponsor' && !(Number(poolConfig.targetAmountMinor) > 0)) {
      throw new PoolError(400, 'A sponsor budget needs a budget amount (pool.targetAmountMinor)');
    }
    if (poolConfig.requireFullFundingBeforeSpend && !(Number(poolConfig.targetAmountMinor) > 0)) {
      throw new PoolError(400, 'A target collection needs a target amount (pool.targetAmountMinor)');
    }
    return { fundingModel: dto.allowPeerExpenses ? 'hybrid' : 'pool', poolConfig };
  }

  /** Open cycle 1 for a freshly created pool event. */
  async openFirstCycle(eventId: string, actorId: string): Promise<PoolCycle> {
    const event = await this.getEvent(eventId);
    const config = this.requirePoolConfig(event);
    const groups = await this.getGroups(eventId);
    const roster = await this.resolveRoster(eventId, config, groups);
    const period = config.cycleMode === 'recurring' ? periodFor(config.recurrence, new Date()) : { startDate: nowIso(), endDate: event.data.endDate || null, label: event.data.name || 'Pool' };
    const cycle = await this.createCycle(event, {
      sequence: 1,
      label: period.label,
      startDate: period.startDate,
      endDate: period.endDate,
      openingBalanceMinor: 0,
      openingCredits: {},
      roster,
    });

    if (config.funderMode === 'sponsor') {
      // The sponsor funds the whole budget up front.
      const budget = Number(config.targetAmountMinor) || 0;
      await this.writeContribution(event, cycle, { entityType: 'user', entityId: config.custodianUserId }, config.custodianUserId, {
        kind: 'regular',
        expectedMinor: budget,
        receivedMinor: budget,
        status: 'confirmed',
        createdBy: actorId,
        custodianConfirmedAt: nowIso(),
        audit: [auditEntry('created', actorId, { amountMinor: budget, statusTo: 'confirmed', note: 'Sponsor budget' })],
      });
    } else if (Number(config.defaultContributionMinor) > 0) {
      for (const ref of roster) {
        await this.writeContribution(event, cycle, ref, this.payerForEntity(ref, groups), {
          kind: 'regular',
          expectedMinor: Number(config.defaultContributionMinor),
          createdBy: actorId,
        });
      }
    }
    return cycle;
  }

  private async createCycle(
    event: EventRecord,
    fields: Pick<PoolCycle, 'sequence' | 'label' | 'startDate' | 'endDate' | 'openingBalanceMinor' | 'openingCredits' | 'roster'>,
  ): Promise<PoolCycle> {
    const now = nowIso();
    const data = {
      eventId: event.id,
      ...fields,
      status: 'open',
      currency: event.data.currency,
      overdraftLatchedAt: null,
      closeReason: null,
      closedAt: null,
      closedBy: null,
      reconciliation: null,
      createdAt: now,
      updatedAt: now,
    };
    const ref = await db.collection(CYCLES).add(data);
    return this.mapCycle(ref.id, data);
  }

  private async writeContribution(
    event: EventRecord,
    cycle: PoolCycle,
    ref: PoolEntityRef,
    fromUserId: string,
    opts: {
      kind: PoolContribution['kind'];
      expectedMinor: number;
      receivedMinor?: number;
      status?: PoolContribution['status'];
      dueDate?: string | null;
      createdBy: string;
      custodianConfirmedAt?: string;
      audit?: PoolAuditEntry[];
    },
  ): Promise<PoolContribution> {
    const now = nowIso();
    const data = {
      eventId: event.id,
      cycleId: cycle.id,
      fromEntityId: ref.entityId,
      fromEntityType: ref.entityType,
      fromUserId,
      kind: opts.kind,
      expectedMinor: opts.expectedMinor,
      receivedMinor: opts.receivedMinor ?? 0,
      claimedMinor: null,
      currency: cycle.currency,
      status: opts.status ?? 'pending',
      dueDate: opts.dueDate ?? null,
      paymentReference: null,
      payerNote: null,
      proofUrl: null,
      payerMarkedAt: null,
      custodianConfirmedAt: opts.custodianConfirmedAt ?? null,
      rejectionReason: null,
      auditTrail: opts.audit ?? [auditEntry('created', opts.createdBy, { amountMinor: opts.expectedMinor, statusTo: opts.status ?? 'pending' })],
      createdBy: opts.createdBy,
      createdAt: now,
      updatedAt: now,
    };
    const docRef = await db.collection(CONTRIBUTIONS).add(data);
    return this.mapContribution(docRef.id, data);
  }

  // ── Contributions ─────────────────────────────────────────────────────

  /** Set (or update) the expected regular contribution for roster entities in the current cycle. */
  async setContributions(
    eventId: string,
    actorId: string,
    entries: Array<{ entityId: string; entityType: 'user' | 'group'; expectedMinor: number; dueDate?: string | null }>,
  ): Promise<PoolContribution[]> {
    const event = await this.getEvent(eventId);
    const config = this.requirePoolConfig(event);
    this.requireManager(event, config, actorId);
    this.assertEventEditable(event);
    const cycle = await this.getCurrentCycle(eventId, event);
    this.assertCycleWritable(cycle);
    const groups = await this.getGroups(eventId);
    const existing = (await this.listContributions(cycle.id)).filter((c) => c.kind === 'regular');

    const rosterKeys = new Set(cycle.roster.map((r) => entityKey(r.entityType, r.entityId)));
    const newRoster = [...cycle.roster];
    for (const entry of entries) {
      const key = entityKey(entry.entityType, entry.entityId);
      const current = existing.find((c) => entityKey(c.fromEntityType, c.fromEntityId) === key);
      if (current) {
        const status = current.status === 'waived'
          ? 'waived'
          : current.receivedMinor >= entry.expectedMinor && current.receivedMinor > 0
            ? 'confirmed'
            : current.receivedMinor > 0
              ? 'partial'
              : current.status === 'initiated' ? 'initiated' : 'pending';
        await db.collection(CONTRIBUTIONS).doc(current.id).set({
          expectedMinor: entry.expectedMinor,
          dueDate: entry.dueDate ?? current.dueDate ?? null,
          status,
          updatedAt: nowIso(),
          auditTrail: appendAudit(current.auditTrail, auditEntry('amount_changed', actorId, { amountMinor: entry.expectedMinor, statusFrom: current.status, statusTo: status })),
        }, { merge: true });
      } else {
        await this.writeContribution(event, cycle, entry, this.payerForEntity(entry, groups), {
          kind: 'regular',
          expectedMinor: entry.expectedMinor,
          dueDate: entry.dueDate ?? null,
          createdBy: actorId,
        });
      }
      if (!rosterKeys.has(key)) {
        rosterKeys.add(key);
        newRoster.push({ entityType: entry.entityType, entityId: entry.entityId });
      }
    }
    if (newRoster.length !== cycle.roster.length) {
      await db.collection(CYCLES).doc(cycle.id).set({ roster: newRoster, updatedAt: nowIso() }, { merge: true });
    }
    await this.refreshOverdraftLatch(eventId, cycle.id);
    return this.listContributions(cycle.id);
  }

  /** Ad-hoc money in — e.g. to unpause a pool or pay off carried arrears. */
  async addTopUp(eventId: string, actorId: string, input: { amountMinor: number; note?: string; entityId?: string; entityType?: 'user' | 'group' }): Promise<PoolContribution> {
    const event = await this.getEvent(eventId);
    const config = this.requirePoolConfig(event);
    this.assertEventEditable(event);
    const cycle = await this.getCurrentCycle(eventId, event);
    this.assertCycleWritable(cycle);
    const groups = await this.getGroups(eventId);
    const manager = this.isManager(event, config, actorId);
    const ref: PoolEntityRef = input.entityId && manager
      ? { entityId: input.entityId, entityType: input.entityType || 'user' }
      : this.entityForUser(actorId, groups);
    // The custodian recording money they hold needs no second confirmation.
    const selfConfirmed = actorId === config.custodianUserId && this.payerForEntity(ref, groups) === actorId;
    const contribution = await this.writeContribution(event, cycle, ref, this.payerForEntity(ref, groups), {
      kind: 'top_up',
      expectedMinor: input.amountMinor,
      receivedMinor: selfConfirmed ? input.amountMinor : 0,
      status: selfConfirmed ? 'confirmed' : 'pending',
      createdBy: actorId,
      custodianConfirmedAt: selfConfirmed ? nowIso() : undefined,
      audit: [auditEntry('created', actorId, { amountMinor: input.amountMinor, note: input.note, statusTo: selfConfirmed ? 'confirmed' : 'pending' })],
    });
    if (selfConfirmed) await this.refreshOverdraftLatch(eventId, cycle.id);
    return contribution;
  }

  private async loadContribution(contributionId: string): Promise<{ contribution: PoolContribution; event: EventRecord; config: PoolConfig; cycle: PoolCycle }> {
    const snap = await db.collection(CONTRIBUTIONS).doc(contributionId).get();
    if (!snap.exists) throw new PoolError(404, 'Contribution not found');
    const contribution = this.mapContribution(contributionId, snap.data()!);
    const event = await this.getEvent(contribution.eventId);
    const config = this.requirePoolConfig(event);
    const cycle = await this.getCycle(contribution.cycleId);
    if (!cycle) throw new PoolError(404, 'Cycle not found');
    return { contribution, event, config, cycle };
  }

  /**
   * Contributor says they paid (outside the app). When the contributor is the
   * custodian, the money is already in their hands: it's confirmed at once.
   */
  async markContributionPaid(
    contributionId: string,
    actorId: string,
    input: { amountMinor?: number; reference?: string; note?: string; proofUrl?: string },
  ): Promise<PoolContribution> {
    const { contribution, event, config, cycle } = await this.loadContribution(contributionId);
    this.assertEventEditable(event);
    this.assertCycleWritable(cycle);
    if (contribution.fromUserId !== actorId) throw new PoolError(403, 'Forbidden: Only the contributor can mark this as paid');
    if (contribution.status === 'confirmed' || contribution.status === 'waived') {
      throw new PoolError(409, `This contribution is already ${contribution.status}`);
    }
    const outstanding = Math.max(0, contribution.expectedMinor - contribution.receivedMinor);
    const claimed = input.amountMinor ?? outstanding;
    if (!(claimed > 0)) throw new PoolError(400, 'Amount must be greater than zero');
    const now = nowIso();
    await db.collection(CONTRIBUTIONS).doc(contributionId).set({
      status: 'initiated',
      claimedMinor: claimed,
      paymentReference: input.reference ?? null,
      payerNote: input.note ?? null,
      proofUrl: input.proofUrl ?? contribution.proofUrl ?? null,
      payerMarkedAt: now,
      rejectionReason: null,
      updatedAt: now,
      auditTrail: appendAudit(contribution.auditTrail, auditEntry('marked_paid', actorId, {
        amountMinor: claimed, referenceId: input.reference, note: input.note, proofUrl: input.proofUrl, statusFrom: contribution.status, statusTo: 'initiated',
      })),
    }, { merge: true });
    if (actorId === config.custodianUserId) {
      return this.confirmContribution(contributionId, actorId, { receivedMinor: claimed });
    }
    return (await this.loadContribution(contributionId)).contribution;
  }

  /** Custodian confirms money actually arrived. The only action that raises the balance. */
  async confirmContribution(contributionId: string, actorId: string, input: { receivedMinor?: number } = {}): Promise<PoolContribution> {
    const { contribution, event, config, cycle } = await this.loadContribution(contributionId);
    this.assertEventEditable(event);
    this.assertCycleWritable(cycle);
    if (config.custodianUserId !== actorId) throw new PoolError(403, 'Forbidden: Only the custodian can confirm receipt');
    if (contribution.status === 'confirmed' || contribution.status === 'waived') {
      throw new PoolError(409, `This contribution is already ${contribution.status}`);
    }
    const outstanding = Math.max(0, contribution.expectedMinor - contribution.receivedMinor);
    const amount = input.receivedMinor ?? contribution.claimedMinor ?? outstanding;
    if (!(amount > 0)) throw new PoolError(400, 'Received amount must be greater than zero');
    const received = contribution.receivedMinor + amount;
    const status = received >= contribution.expectedMinor ? 'confirmed' : 'partial';
    const now = nowIso();
    await db.collection(CONTRIBUTIONS).doc(contributionId).set({
      receivedMinor: received,
      status,
      claimedMinor: null,
      custodianConfirmedAt: now,
      updatedAt: now,
      auditTrail: appendAudit(contribution.auditTrail, auditEntry(status === 'confirmed' ? 'confirmed' : 'partially_confirmed', actorId, {
        amountMinor: amount, statusFrom: contribution.status, statusTo: status,
      })),
    }, { merge: true });
    await this.refreshOverdraftLatch(event.id, cycle.id);
    return (await this.loadContribution(contributionId)).contribution;
  }

  /** Custodian did not receive it: back to pending, with a reason (mirrors settlement rejection). */
  async rejectContribution(contributionId: string, actorId: string, reason?: string): Promise<PoolContribution> {
    const { contribution, event, config, cycle } = await this.loadContribution(contributionId);
    this.assertEventEditable(event);
    this.assertCycleWritable(cycle);
    if (config.custodianUserId !== actorId) throw new PoolError(403, 'Forbidden: Only the custodian can reject a contribution');
    if (contribution.status !== 'initiated') throw new PoolError(409, `Cannot reject: contribution is ${contribution.status}, expected initiated`);
    const rejectionReason = (reason || 'Payment not received').trim();
    const status = contribution.receivedMinor > 0 ? 'partial' : 'pending';
    await db.collection(CONTRIBUTIONS).doc(contributionId).set({
      status,
      claimedMinor: null,
      rejectionReason,
      updatedAt: nowIso(),
      auditTrail: appendAudit(contribution.auditTrail, auditEntry('rejected', actorId, { note: rejectionReason, statusFrom: 'initiated', statusTo: status })),
    }, { merge: true });
    return (await this.loadContribution(contributionId)).contribution;
  }

  /** Excuse a contribution for this cycle (it then carries no fair-share weight). */
  async waiveContribution(contributionId: string, actorId: string, reason?: string): Promise<PoolContribution> {
    const { contribution, event, config, cycle } = await this.loadContribution(contributionId);
    this.requireManager(event, config, actorId);
    this.assertEventEditable(event);
    this.assertCycleWritable(cycle);
    if (contribution.status === 'confirmed' || contribution.status === 'waived') {
      throw new PoolError(409, `This contribution is already ${contribution.status}`);
    }
    if (contribution.receivedMinor > 0) throw new PoolError(409, 'Money has already been received against this contribution');
    await db.collection(CONTRIBUTIONS).doc(contributionId).set({
      status: 'waived',
      claimedMinor: null,
      updatedAt: nowIso(),
      auditTrail: appendAudit(contribution.auditTrail, auditEntry('waived', actorId, { note: reason, statusFrom: contribution.status, statusTo: 'waived' })),
    }, { merge: true });
    await this.refreshOverdraftLatch(event.id, cycle.id);
    return (await this.loadContribution(contributionId)).contribution;
  }

  // ── Draws (pool-funded expenses) ──────────────────────────────────────

  private async canDraw(event: EventRecord, config: PoolConfig, userId: string, groups: Group[]): Promise<boolean> {
    if (this.isManager(event, config, userId)) return true;
    if (config.funderMode === 'contributors') {
      if (Array.isArray(event.data.participantIds) && event.data.participantIds.includes(userId)) return true;
      const p = await db.collection('events').doc(event.id).collection('participants').doc(userId).get();
      return p.exists;
    }
    if ((config.authorizedSpenders || []).includes(userId)) return true;
    return groups.some((g) => (config.authorizedSpenderGroups || []).includes(g.id) && (g.members || []).includes(userId));
  }

  /** The cap key (userId or authorising groupId) a spender is measured against. */
  private spenderKey(config: PoolConfig, userId: string, groups: Group[]): { id: string; type: 'user' | 'group' } {
    const group = groups.find((g) => (config.authorizedSpenderGroups || []).includes(g.id) && (g.members || []).includes(userId));
    return group ? { id: group.id, type: 'group' } : { id: userId, type: 'user' };
  }

  private refusal(decision: ReturnType<typeof evaluateDraw>, overdraft: PoolCycleSummary['overdraft'], amountMinor: number): PoolError {
    const details: PoolRefusalDetails = {
      code: decision.code!,
      balance: overdraft.balanceMinor,
      baseline: overdraft.baselineMinor,
      tolerance: overdraft.toleranceMinor,
      floor: overdraft.floorMinor,
      requested: amountMinor,
      projected: decision.projectedMinor,
      shortfall: decision.shortfallMinor,
      clearanceRequired: decision.clearanceRequiredMinor,
    };
    const message = decision.code === 'POOL_UNDERFUNDED'
      ? 'The pool has not reached its funding target yet'
      : decision.code === 'POOL_INSUFFICIENT_FUNDS'
        ? 'Not enough money in the pool for this expense'
        : 'Pool spending is paused';
    return new PoolError(409, message, decision.code, details);
  }

  /**
   * Validate a new pool-funded expense and decide its approval state.
   * Throws PoolError with structured details when the draw is refused.
   */
  async prepareDraw(
    eventId: string,
    actorId: string,
    input: { amount: number; currency: string; fundingSource: ExpenseFundingSource; alreadyIncurred?: boolean; attachments?: string[] },
  ): Promise<DrawPreparation> {
    const event = await this.getEvent(eventId);
    const config = this.requirePoolConfig(event);
    const model = resolveFundingModel(event.data as any);
    if (!allowedFundingSources(model).includes(input.fundingSource)) {
      throw new PoolError(400, `fundingSource "${input.fundingSource}" is not allowed in a ${model} event`);
    }
    if (input.fundingSource === 'self') throw new PoolError(400, 'Not a pool-funded expense');
    if (String(input.currency).toUpperCase() !== String(event.data.currency).toUpperCase()) {
      throw new PoolError(400, `Pool expenses must be in the pool currency (${event.data.currency})`);
    }
    const groups = await this.getGroups(eventId);
    if (!(await this.canDraw(event, config, actorId, groups))) {
      throw new PoolError(403, 'Forbidden: You are not authorised to spend from this pool');
    }

    const fundingSource = input.fundingSource;
    const amountMinor = toMinor(input.amount, event.data.currency);
    const hasReceipt = Array.isArray(input.attachments) && input.attachments.length > 0;
    if (fundingSource === 'pool_reimbursement' && config.claimReceiptRequired !== false && !hasReceipt) {
      throw new PoolError(400, 'A receipt is required to claim a reimbursement', 'POOL_RECEIPT_REQUIRED');
    }
    if (fundingSource === 'pool' && config.receiptRequiredAboveMinor !== null && config.receiptRequiredAboveMinor !== undefined
      && amountMinor > config.receiptRequiredAboveMinor && !hasReceipt) {
      throw new PoolError(400, 'A receipt is required for this pool expense', 'POOL_RECEIPT_REQUIRED');
    }

    const cycle = await this.getCurrentCycle(eventId, event);
    this.assertCycleWritable(cycle);
    const summary = await this.buildSummary(event, cycle);
    const alreadyIncurred = fundingSource === 'pool_reimbursement' ? true : Boolean(input.alreadyIncurred);
    const flags: PoolExpenseFlag[] = [];
    const manager = this.isManager(event, config, actorId);

    // Per-spender cap (sponsor budgets).
    let forcePending = false;
    const sk = this.spenderKey(config, actorId, groups);
    const cap = config.spenderCapsMinor?.[sk.id];
    if (typeof cap === 'number' && !manager) {
      const spent = this.spendFor(summary._draws, sk, groups, event.data.currency, ['approved', 'pending']);
      if (spent + amountMinor > cap) {
        if (!alreadyIncurred) {
          throw new PoolError(409, 'This would exceed your spending limit for this pool', 'POOL_SPENDER_CAP', { cap, spent, requested: amountMinor });
        }
        flags.push('exceeds_spender_cap');
        forcePending = true;
      }
    }

    const decision = evaluateDraw(summary.overdraft, amountMinor, {
      alreadyIncurred,
      funding: summary.funding,
      requireFullFunding: Boolean(config.requireFullFundingBeforeSpend),
    });
    if (!decision.allowed) throw this.refusal(decision, summary.overdraft, amountMinor);
    if (decision.flag) flags.push(decision.flag);

    const needsApproval =
      forcePending ||
      (!manager && (config.expenseApproval === 'always' ||
        (config.expenseApproval === 'above_threshold' && amountMinor > Number(config.approvalThresholdMinor ?? 0))));

    const now = nowIso();
    const poolDraw: PoolDrawState = needsApproval
      ? { status: 'pending', alreadyIncurred }
      : { status: 'approved', decidedBy: actorId, decidedAt: now, alreadyIncurred };
    return { fundingSource, poolCycleId: cycle.id, poolDraw, poolFlags: flags, autoApproved: !needsApproval };
  }

  private spendFor(
    draws: Array<Record<string, any>>,
    spender: { id: string; type: 'user' | 'group' },
    groups: Group[],
    currency: string,
    statuses: string[],
  ): number {
    const members = spender.type === 'group' ? (groups.find((g) => g.id === spender.id)?.members || []) : [spender.id];
    return draws
      .filter((d) => members.includes(d.paidBy) && statuses.includes(d.poolDraw?.status))
      .reduce((s, d) => s + toMinor(Number(d.amount) || 0, currency), 0);
  }

  /**
   * After a draw is approved: a reimbursement claim gets a settlement leg from
   * the custodian to the claimant (unless the custodian claimed it themselves).
   */
  async finalizeApprovedDraw(expense: Expense & { poolDraw?: PoolDrawState }, actorId: string): Promise<string | null> {
    const event = await this.getEvent(expense.eventId);
    const config = this.requirePoolConfig(event);
    if (resolveFundingSource(expense) === 'pool_reimbursement' && expense.poolDraw?.status === 'approved' && !(await this.legExists(expense.poolDraw.settlementId))) {
      if (expense.paidBy === config.custodianUserId) {
        await db.collection('expenses').doc(expense.id).set({ poolDraw: { ...expense.poolDraw, selfReimbursed: true } }, { merge: true });
      } else {
        const now = nowIso();
        const leg = await db.collection(SETTLEMENTS).add({
          eventId: expense.eventId,
          kind: 'pool_reimbursement',
          poolCycleId: expense.poolCycleId,
          expenseId: expense.id,
          fromEntityId: config.custodianUserId,
          fromEntityType: 'user',
          toEntityId: expense.paidBy,
          toEntityType: 'user',
          fromUserId: config.custodianUserId,
          toUserId: expense.paidBy,
          amount: expense.amount,
          currency: event.data.currency,
          status: 'pending',
          createdAt: now,
          auditTrail: [{
            id: `aud-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            action: 'created',
            actorUserId: actorId,
            note: `Reimbursement for "${expense.title}"`,
            statusFrom: 'none',
            statusTo: 'pending',
            createdAt: now,
          }],
        });
        await db.collection('expenses').doc(expense.id).set({ poolDraw: { ...expense.poolDraw, settlementId: leg.id } }, { merge: true });
        await this.refreshOverdraftLatch(expense.eventId, expense.poolCycleId!);
        return leg.id;
      }
    }
    if (expense.poolCycleId) await this.refreshOverdraftLatch(expense.eventId, expense.poolCycleId);
    return null;
  }

  /**
   * A claim can reference a leg that no longer exists: data written before
   * edits replaced poolDraw kept the id of the leg the edit removed.
   */
  private async legExists(legId?: string | null): Promise<boolean> {
    if (!legId) return false;
    return (await db.collection(SETTLEMENTS).doc(legId).get()).exists;
  }

  private async loadDraw(expenseId: string): Promise<{ expense: Record<string, any> & { id: string }; event: EventRecord; config: PoolConfig; cycle: PoolCycle }> {
    const snap = await db.collection('expenses').doc(expenseId).get();
    if (!snap.exists) throw new PoolError(404, 'Expense not found');
    const expense = { id: expenseId, ...(snap.data() || {}) } as Record<string, any> & { id: string };
    if (expense.fundingSource !== 'pool' && expense.fundingSource !== 'pool_reimbursement') {
      throw new PoolError(400, 'This expense is not funded from the pool');
    }
    const event = await this.getEvent(expense.eventId);
    const config = this.requirePoolConfig(event);
    const cycle = await this.getCycle(expense.poolCycleId);
    if (!cycle) throw new PoolError(404, 'Cycle not found');
    return { expense, event, config, cycle };
  }

  async approveDraw(expenseId: string, actorId: string): Promise<{ expense: Record<string, any>; settlementId: string | null }> {
    const { expense, event, config, cycle } = await this.loadDraw(expenseId);
    this.requireManager(event, config, actorId);
    this.assertEventEditable(event);
    this.assertCycleWritable(cycle);
    if (expense.poolDraw?.status !== 'pending') throw new PoolError(409, `Cannot approve: this draw is ${expense.poolDraw?.status}`);

    const summary = await this.buildSummary(event, cycle);
    const amountMinor = toMinor(Number(expense.amount) || 0, event.data.currency);
    const alreadyIncurred = expense.fundingSource === 'pool_reimbursement' || Boolean(expense.poolDraw?.alreadyIncurred);
    const decision = evaluateDraw(summary.overdraft, amountMinor, {
      alreadyIncurred,
      funding: summary.funding,
      requireFullFunding: Boolean(config.requireFullFundingBeforeSpend),
    });
    if (!decision.allowed) throw this.refusal(decision, summary.overdraft, amountMinor);

    const flags: PoolExpenseFlag[] = Array.isArray(expense.poolFlags) ? [...expense.poolFlags] : [];
    if (decision.flag && !flags.includes(decision.flag)) flags.push(decision.flag);
    const poolDraw: PoolDrawState = { ...expense.poolDraw, status: 'approved', decidedBy: actorId, decidedAt: nowIso() };
    await db.collection('expenses').doc(expenseId).set({ poolDraw, poolFlags: flags, updatedAt: nowIso() }, { merge: true });
    const settlementId = await this.finalizeApprovedDraw({ ...(expense as any), poolDraw, poolFlags: flags }, actorId);
    const updated = await db.collection('expenses').doc(expenseId).get();
    return { expense: { id: expenseId, ...(updated.data() || {}) }, settlementId };
  }

  async rejectDraw(expenseId: string, actorId: string, reason?: string): Promise<Record<string, any>> {
    const { expense, event, config, cycle } = await this.loadDraw(expenseId);
    this.requireManager(event, config, actorId);
    this.assertEventEditable(event);
    this.assertCycleWritable(cycle);
    if (expense.poolDraw?.status !== 'pending') throw new PoolError(409, `Cannot reject: this draw is ${expense.poolDraw?.status}`);
    const poolDraw: PoolDrawState = { ...expense.poolDraw, status: 'rejected', decidedBy: actorId, decidedAt: nowIso(), reason: (reason || 'Rejected').trim() };
    await db.collection('expenses').doc(expenseId).set({ poolDraw, updatedAt: nowIso() }, { merge: true });
    return { ...expense, poolDraw };
  }

  /** Nothing in a closed cycle may change (its reconciliation is final). */
  async assertDrawCycleWritable(expense: Record<string, any>): Promise<void> {
    if (!expense.poolCycleId) return;
    const cycle = await this.getCycle(expense.poolCycleId);
    if (cycle) this.assertCycleWritable(cycle);
  }

  /**
   * Guard edits/deletes of a pool draw. Returns the reimbursement leg (if any)
   * that must be removed because the approved amount is changing or going away.
   */
  async assertDrawMutable(expense: Record<string, any>): Promise<{ legToRemove: string | null; cycle: PoolCycle | null }> {
    if (expense.fundingSource !== 'pool' && expense.fundingSource !== 'pool_reimbursement') return { legToRemove: null, cycle: null };
    const cycle = expense.poolCycleId ? await this.getCycle(expense.poolCycleId) : null;
    if (cycle) this.assertCycleWritable(cycle);
    const legId = expense.poolDraw?.settlementId;
    if (!legId) return { legToRemove: null, cycle };
    const leg = await db.collection(SETTLEMENTS).doc(legId).get();
    if (leg.exists && leg.data()?.status !== 'pending') {
      throw new PoolError(409, 'This reimbursement is already being paid and can no longer change', 'POOL_REIMBURSEMENT_IN_PAYMENT');
    }
    return { legToRemove: leg.exists ? legId : null, cycle };
  }

  /**
   * Re-run the draw rules for an amount change on a pool expense. The old
   * deduction is released first, so the check is against the balance the new
   * amount would actually leave.
   */
  async prepareAmountChange(expense: Record<string, any>, actorId: string, newAmount: number, alreadyIncurred?: boolean): Promise<{ poolDraw: PoolDrawState; poolFlags: PoolExpenseFlag[]; autoApproved: boolean }> {
    const event = await this.getEvent(expense.eventId);
    const config = this.requirePoolConfig(event);
    const cycle = await this.getCycle(expense.poolCycleId);
    if (!cycle) throw new PoolError(404, 'Cycle not found');
    const summary = await this.buildSummary(event, cycle);
    const oldMinor = expense.poolDraw?.status === 'approved' ? toMinor(Number(expense.amount) || 0, event.data.currency) : 0;
    const totals = { ...summary.totals, balanceMinor: summary.totals.balanceMinor + oldMinor };
    if (expense.fundingSource === 'pool') totals.poolSpendMinor -= oldMinor;
    else totals.reimbursementsMinor -= oldMinor;
    const released = computeOverdraftState(config, cycle.openingBalanceMinor, totals, cycle.overdraftLatchedAt);

    const amountMinor = toMinor(newAmount, event.data.currency);
    const incurred = expense.fundingSource === 'pool_reimbursement' || Boolean(alreadyIncurred ?? expense.poolDraw?.alreadyIncurred);
    const decision = evaluateDraw(released, amountMinor, { alreadyIncurred: incurred, funding: summary.funding, requireFullFunding: Boolean(config.requireFullFundingBeforeSpend) });
    if (!decision.allowed) throw this.refusal(decision, released, amountMinor);
    const flags: PoolExpenseFlag[] = (Array.isArray(expense.poolFlags) ? expense.poolFlags : []).filter((f: PoolExpenseFlag) => f !== 'exceeds_tolerance' && f !== 'underfunded');
    if (decision.flag) flags.push(decision.flag);
    const manager = this.isManager(event, config, actorId);
    const needsApproval = !manager && (config.expenseApproval === 'always' ||
      (config.expenseApproval === 'above_threshold' && amountMinor > Number(config.approvalThresholdMinor ?? 0)));
    const poolDraw: PoolDrawState = needsApproval
      ? { status: 'pending', alreadyIncurred: incurred }
      : { status: 'approved', decidedBy: actorId, decidedAt: nowIso(), alreadyIncurred: incurred };
    return { poolDraw, poolFlags: flags, autoApproved: !needsApproval };
  }

  async removeLeg(legId: string | null): Promise<void> {
    if (legId) await db.collection(SETTLEMENTS).doc(legId).delete();
  }

  // ── Reporting ─────────────────────────────────────────────────────────

  async getLedger(eventId: string, cycleId?: string): Promise<PoolLedger> {
    const event = await this.getEvent(eventId);
    const config = this.requirePoolConfig(event);
    const cycle = cycleId ? await this.getCycle(cycleId) : await this.getCurrentCycle(eventId, event);
    if (!cycle || cycle.eventId !== eventId) throw new PoolError(404, 'Cycle not found');
    const built = await this.buildSummary(event, cycle);
    const { _draws, _contributions, _groups, ...summary } = built;
    const currency = cycle.currency;

    const legIds = _draws.map((d) => d.poolDraw?.settlementId).filter(Boolean) as string[];
    const legStatus = new Map<string, string>();
    await Promise.all(legIds.map(async (id) => {
      const leg = await db.collection(SETTLEMENTS).doc(id).get();
      if (leg.exists) legStatus.set(id, leg.data()?.status);
    }));

    const entries: PoolLedgerEntry[] = [];
    for (const c of _contributions) {
      if (c.receivedMinor <= 0 && c.status !== 'initiated') continue;
      entries.push({
        id: c.id,
        type: 'contribution',
        at: c.custodianConfirmedAt || c.payerMarkedAt || c.createdAt,
        title: c.kind === 'top_up' ? 'Top-up' : c.kind === 'overdraft_cover' ? 'Overdraft cover' : 'Contribution',
        amountMinor: c.receivedMinor > 0 ? c.receivedMinor : (c.claimedMinor || 0),
        status: c.status,
        actorUserId: c.fromUserId,
        entityId: c.fromEntityId,
        entityType: c.fromEntityType,
        contributionKind: c.kind,
        receiptUrls: c.proofUrl ? [c.proofUrl] : [],
        counted: c.receivedMinor > 0,
      });
    }
    for (const d of _draws) {
      entries.push({
        id: d.id,
        type: 'draw',
        at: d.createdAt,
        title: d.title,
        amountMinor: -toMinor(Number(d.amount) || 0, currency),
        status: d.poolDraw?.status || 'pending',
        actorUserId: d.paidBy,
        fundingSource: d.fundingSource,
        receiptUrls: Array.isArray(d.attachments) ? d.attachments : [],
        flags: Array.isArray(d.poolFlags) && d.poolFlags.length > 0 ? d.poolFlags : undefined,
        settlementStatus: d.poolDraw?.selfReimbursed ? 'completed' : (d.poolDraw?.settlementId ? legStatus.get(d.poolDraw.settlementId) ?? null : null),
        counted: d.poolDraw?.status === 'approved',
      });
    }
    entries.sort((a, b) => String(b.at).localeCompare(String(a.at)));

    const spenderMap = new Map<string, PoolSpenderSummary>();
    for (const d of _draws) {
      const sk = this.spenderKey(config, d.paidBy, _groups);
      const key = `${sk.type}:${sk.id}`;
      const row = spenderMap.get(key) || { spenderId: sk.id, spenderType: sk.type, spentMinor: 0, pendingMinor: 0, capMinor: config.spenderCapsMinor?.[sk.id] ?? null };
      const amt = toMinor(Number(d.amount) || 0, currency);
      if (d.poolDraw?.status === 'approved') row.spentMinor += amt;
      else if (d.poolDraw?.status === 'pending') row.pendingMinor += amt;
      spenderMap.set(key, row);
    }

    return {
      summary,
      contributions: _contributions,
      entries,
      spenders: [...spenderMap.values()].sort((a, b) => b.spentMinor - a.spentMinor),
      cycles: await this.listCycles(eventId),
    };
  }

  // ── Reconciliation & cycle lifecycle ──────────────────────────────────

  private reconcileInput(config: PoolConfig, cycle: PoolCycle, built: Awaited<ReturnType<PoolService['buildSummary']>>, opts: { forDissolution?: boolean; extraCover?: Array<{ entityKey: string; amountMinor: number }> }) {
    return {
      custodianEntityKey: this.custodianKey(config, built._groups),
      roster: cycle.roster,
      openingCredits: cycle.openingCredits,
      contributions: built._contributions.map((c) => this.toContributionLike(c)),
      draws: built._draws.map((d) => this.toDrawLike(d, cycle.currency, built._groups)),
      surplusPolicy: config.surplusPolicy,
      deficitPolicy: config.deficitPolicy,
      forDissolution: opts.forDissolution,
      extraCover: opts.extraCover,
    };
  }

  private normalizeCover(config: PoolConfig, groups: Group[], uncovered: number, cover?: Array<{ entityId: string; entityType: 'user' | 'group'; amountMinor: number }>) {
    if (uncovered <= 0) return [];
    if (!cover || cover.length === 0) return [{ entityKey: this.custodianKey(config, groups), amountMinor: uncovered }];
    const total = cover.reduce((s, c) => s + c.amountMinor, 0);
    if (total !== uncovered) {
      throw new PoolError(400, `Cover must total exactly the uncovered deficit (${uncovered})`, 'POOL_COVER_MISMATCH', { uncovered, provided: total });
    }
    return cover.map((c) => ({ entityKey: entityKey(c.entityType, c.entityId), amountMinor: c.amountMinor }));
  }

  /** Compute — without committing — what closing the current cycle would do. */
  async previewClose(
    eventId: string,
    actorId: string,
    opts: { forDissolution?: boolean; cover?: Array<{ entityId: string; entityType: 'user' | 'group'; amountMinor: number }> } = {},
  ): Promise<ReconcileResult & { cycleId: string; pendingDraws: number; coverNeededMinor: number }> {
    const event = await this.getEvent(eventId);
    const config = this.requirePoolConfig(event);
    this.requireManager(event, config, actorId);
    const cycle = await this.getCurrentCycle(eventId, event);
    const built = await this.buildSummary(event, cycle);
    const raw = reconcileCycle(this.reconcileInput(config, cycle, built, { forDissolution: opts.forDissolution }));
    const extraCover = this.normalizeCover(config, built._groups, raw.uncoveredDeficitMinor, opts.cover);
    const result = extraCover.length > 0 ? reconcileCycle(this.reconcileInput(config, cycle, built, { forDissolution: opts.forDissolution, extraCover })) : raw;
    return {
      ...result,
      cycleId: cycle.id,
      pendingDraws: built._draws.filter((d) => d.poolDraw?.status === 'pending').length,
      /** Shortfall nobody has been recorded as covering yet (before any default). */
      coverNeededMinor: raw.uncoveredDeficitMinor,
    };
  }

  private snapshot(result: ReconcileResult, cycle: PoolCycle, actorId: string, settlementIds: string[]): PoolReconciliation {
    return {
      cycleId: cycle.id,
      currency: cycle.currency,
      openingBalanceMinor: result.openingBalanceMinor,
      confirmedContributionsMinor: result.confirmedContributionsMinor,
      overdraftCoverMinor: result.overdraftCoverMinor,
      poolSpendMinor: result.poolSpendMinor,
      reimbursementsMinor: result.reimbursementsMinor,
      preCoverBalanceMinor: result.preCoverBalanceMinor,
      closingBalanceMinor: result.closingBalanceMinor,
      outcome: result.outcome,
      shareBasis: result.shareBasis,
      disposition: result.disposition,
      entityShares: result.entityShares,
      settlementIds,
      generatedAt: nowIso(),
      generatedBy: actorId,
    };
  }

  /** Record who fronted the money for a deficit, as overdraft_cover contributions. */
  private async recordCover(event: EventRecord, cycle: PoolCycle, groups: Group[], actorId: string, cover: Array<{ entityKey: string; amountMinor: number }>) {
    for (const c of cover) {
      const ref = parseEntityKey(c.entityKey);
      await this.writeContribution(event, cycle, ref, this.payerForEntity(ref, groups), {
        kind: 'overdraft_cover',
        expectedMinor: c.amountMinor,
        receivedMinor: c.amountMinor,
        status: 'confirmed',
        createdBy: actorId,
        custodianConfirmedAt: nowIso(),
        audit: [auditEntry('created', actorId, { amountMinor: c.amountMinor, statusTo: 'confirmed', note: 'Covered the pool shortfall at cycle close' })],
      });
    }
  }

  /** Write pool-side settlement legs (cycle refunds or member exits) via the shared minimiser. */
  private async writePoolLegs(
    event: EventRecord,
    cycle: PoolCycle,
    groups: Group[],
    balancesMinor: Record<string, number>,
    kind: 'pool_cycle' | 'pool_member_exit',
    actorId: string,
    planner: SettlementPlanner,
  ): Promise<string[]> {
    const balances = this.toBalances(balancesMinor, cycle.currency);
    if (balances.length === 0) return [];
    const plan = planner(balances, event.id, cycle.currency, groups);
    const ids: string[] = [];
    const now = nowIso();
    for (const s of plan.settlements) {
      const ref = await db.collection(SETTLEMENTS).add({
        eventId: event.id,
        kind,
        poolCycleId: cycle.id,
        fromEntityId: s.fromEntityId,
        fromEntityType: s.fromEntityType,
        toEntityId: s.toEntityId,
        toEntityType: s.toEntityType,
        fromUserId: s.fromUserId,
        toUserId: s.toUserId,
        amount: s.amount,
        currency: cycle.currency,
        status: 'pending',
        createdAt: now,
        auditTrail: [{ id: `aud-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, action: 'created', actorUserId: actorId, statusFrom: 'none', statusTo: 'pending', createdAt: now }],
      });
      ids.push(ref.id);
    }
    return ids;
  }

  toBalances(balancesMinor: Record<string, number>, currency: string): Balance[] {
    return Object.entries(balancesMinor)
      .filter(([, v]) => v !== 0)
      .map(([key, v]) => {
        const ref = parseEntityKey(key);
        return { entityId: ref.entityId, entityType: ref.entityType, amount: fromMinor(v, currency) };
      });
  }

  /**
   * Close the current cycle (scheduled, manual, or forced by a membership
   * change). Carry-forward pools roll the balance into a new cycle; leavers are
   * paid out; settle-policy pools pay out every net position.
   */
  async closeCycle(
    eventId: string,
    actorId: string,
    opts: {
      reason: Exclude<PoolCycleCloseReason, 'dissolution'>;
      cover?: Array<{ entityId: string; entityType: 'user' | 'group'; amountMinor: number }>;
      leavingUserIds?: string[];
      openNext?: boolean;
      skipAuth?: boolean;
    },
    planner: SettlementPlanner,
  ): Promise<{ closed: PoolCycle; next: PoolCycle | null; settlementIds: string[] }> {
    const event = await this.getEvent(eventId);
    const config = this.requirePoolConfig(event);
    if (!opts.skipAuth) this.requireManager(event, config, actorId);
    this.assertEventEditable(event);
    const cycle = await this.getCurrentCycle(eventId, event);
    if (cycle.status !== 'open') throw new PoolError(409, `Cannot close a ${cycle.status} cycle`, 'POOL_CYCLE_NOT_OPEN');
    const built = await this.buildSummary(event, cycle);
    if (built._draws.some((d) => d.poolDraw?.status === 'pending')) {
      throw new PoolError(409, 'Approve or reject pending pool expenses before closing the cycle', 'POOL_PENDING_DRAWS');
    }

    const raw = reconcileCycle(this.reconcileInput(config, cycle, built, {}));
    const cover = this.normalizeCover(config, built._groups, raw.uncoveredDeficitMinor, opts.cover);
    if (cover.length > 0) await this.recordCover(event, cycle, built._groups, actorId, cover);
    const refreshed = cover.length > 0 ? await this.buildSummary(event, cycle) : built;
    const result = reconcileCycle(this.reconcileInput(config, cycle, refreshed, {}));

    const groups = refreshed._groups;
    const custodianKey = this.custodianKey(config, groups);
    // A member leaving a group doesn't take the group with them: only
    // individual entities are squared up on exit.
    const leavingKeys = [...new Set((opts.leavingUserIds || [])
      .map((uid) => this.entityForUser(uid, groups))
      .filter((ref) => ref.entityType === 'user')
      .map((ref) => entityKey(ref.entityType, ref.entityId)))];

    let settlementIds: string[] = [];
    let carryCredits: Record<string, number> = {};
    let carryOpening = 0;
    if (result.disposition === 'carry_forward') {
      if (leavingKeys.length > 0) {
        const split = splitForMembershipChange(result, leavingKeys, custodianKey);
        settlementIds = await this.writePoolLegs(event, cycle, groups, split.exitBalances, 'pool_member_exit', actorId, planner);
        carryCredits = split.carryCredits;
        carryOpening = split.carryOpeningBalanceMinor;
      } else {
        for (const e of result.entityShares) if (e.netMinor !== 0) carryCredits[entityKey(e.entityType, e.entityId)] = e.netMinor;
        carryOpening = result.closingBalanceMinor;
      }
    } else {
      settlementIds = await this.writePoolLegs(event, cycle, groups, result.settlementBalances, 'pool_cycle', actorId, planner);
    }

    const now = nowIso();
    const reconciliation = this.snapshot(result, cycle, actorId, settlementIds);
    await db.collection(CYCLES).doc(cycle.id).set({
      status: 'closed',
      closeReason: opts.reason,
      closedAt: now,
      closedBy: actorId,
      overdraftLatchedAt: null,
      reconciliation,
      updatedAt: now,
    }, { merge: true });
    const closed = (await this.getCycle(cycle.id))!;

    let next: PoolCycle | null = null;
    const shouldOpenNext = opts.openNext ?? config.cycleMode === 'recurring';
    if (shouldOpenNext) {
      next = await this.openNextCycle(event, config, closed, opts.reason, carryOpening, carryCredits, leavingKeys, actorId);
    }
    return { closed, next, settlementIds };
  }

  private async openNextCycle(
    event: EventRecord,
    config: PoolConfig,
    previous: PoolCycle,
    reason: PoolCycleCloseReason,
    openingBalanceMinor: number,
    openingCredits: Record<string, number>,
    leavingKeys: string[],
    actorId: string,
  ): Promise<PoolCycle> {
    const groups = await this.getGroups(event.id);
    const leaving = new Set(leavingKeys);
    const roster = (await this.resolveRoster(event.id, config, groups)).filter((r) => !leaving.has(entityKey(r.entityType, r.entityId)));
    let period: { startDate: string; endDate: string | null; label: string };
    if (reason === 'membership_change') {
      // Same accounting period continues with the new roster.
      const from = new Date();
      period = {
        startDate: from.toISOString(),
        endDate: previous.endDate ?? null,
        label: `${previous.label.replace(/ \(from .*\)$/, '')} (from ${from.getUTCDate()} ${MONTHS[from.getUTCMonth()].slice(0, 3)})`,
      };
    } else if (previous.endDate && config.cycleMode === 'recurring') {
      period = periodFor(config.recurrence, new Date(Date.parse(previous.endDate) + 1));
    } else {
      period = periodFor(config.recurrence, new Date());
    }
    const next = await this.createCycle(event, {
      sequence: previous.sequence + 1,
      label: period.label,
      startDate: period.startDate,
      endDate: period.endDate,
      openingBalanceMinor,
      openingCredits,
      roster,
    });
    // Mid-period rollovers start with no new expectations: this period's money is already in.
    if (reason !== 'membership_change' && Number(config.defaultContributionMinor) > 0) {
      for (const ref of roster) {
        await this.writeContribution(event, next, ref, this.payerForEntity(ref, groups), {
          kind: 'regular',
          expectedMinor: Number(config.defaultContributionMinor),
          createdBy: actorId,
        });
      }
    }
    return next;
  }

  /** Move the current cycle into reconciliation ahead of a final settlement. */
  async beginDissolution(
    eventId: string,
    actorId: string,
    opts: { cover?: Array<{ entityId: string; entityType: 'user' | 'group'; amountMinor: number }> } = {},
  ): Promise<PoolCycle> {
    const event = await this.getEvent(eventId);
    this.requirePoolConfig(event);
    // The final settlement is generated by an event admin; check before writing anything.
    const isAdmin = event.data.createdBy === actorId || (Array.isArray(event.data.admins) && event.data.admins.includes(actorId));
    if (!isAdmin) throw new PoolError(403, 'Forbidden: Only event admins can settle up the pool');
    const config = event.data.poolConfig as PoolConfig;
    if (event.data.status !== 'active') throw new PoolError(409, 'The pool can only be settled up from an active event');
    const cycle = await this.getCurrentCycle(eventId, event);
    if (cycle.status !== 'open') throw new PoolError(409, `Cannot settle up a ${cycle.status} cycle`);
    const built = await this.buildSummary(event, cycle);
    if (built._draws.some((d) => d.poolDraw?.status === 'pending')) {
      throw new PoolError(409, 'Approve or reject pending pool expenses before settling up', 'POOL_PENDING_DRAWS');
    }
    // Settling with an approved claim that has no leg would close the event without paying the claimant back.
    for (const draw of built._draws) {
      if (draw.fundingSource === 'pool_reimbursement' && draw.poolDraw?.status === 'approved' && !draw.poolDraw.selfReimbursed) {
        await this.finalizeApprovedDraw(draw as Expense & { poolDraw?: PoolDrawState }, actorId);
      }
    }
    const raw = reconcileCycle(this.reconcileInput(config, cycle, built, { forDissolution: true }));
    const cover = this.normalizeCover(config, built._groups, raw.uncoveredDeficitMinor, opts.cover);
    if (cover.length > 0) await this.recordCover(event, cycle, built._groups, actorId, cover);
    await db.collection(CYCLES).doc(cycle.id).set({ status: 'reconciling', closeReason: 'dissolution', updatedAt: nowIso() }, { merge: true });
    return (await this.getCycle(cycle.id))!;
  }

  /**
   * Called before the generic "generate settlement" action: a pool-funded
   * event must reconcile its pool first, or the plan would ignore pool money.
   */
  async prepareForSettlement(eventId: string, actorId: string): Promise<void> {
    const event = await this.getEvent(eventId);
    if (resolveFundingModel(event.data as any) === 'peer_to_peer' || !event.data.poolConfig) return;
    const cycles = await this.listCycles(eventId);
    if (cycles.some((c) => c.status === 'reconciling')) return;
    await this.beginDissolution(eventId, actorId);
  }

  /**
   * Pool positions to merge into the event's final settlement plan. Only a
   * cycle in `reconciling` contributes; an active pool owes nobody anything yet.
   */
  async computeSettlementBalances(eventId: string): Promise<Balance[]> {
    const event = await this.getEvent(eventId);
    if (resolveFundingModel(event.data as any) === 'peer_to_peer' || !event.data.poolConfig) return [];
    const config = event.data.poolConfig as PoolConfig;
    const cycles = await this.listCycles(eventId);
    const cycle = [...cycles].reverse().find((c) => c.status === 'reconciling');
    if (!cycle) return [];
    const built = await this.buildSummary(event, cycle);
    const result = reconcileCycle(this.reconcileInput(config, cycle, built, { forDissolution: true }));
    return this.toBalances(result.settlementBalances, cycle.currency);
  }

  /** Once the event is settled, freeze the reconciling cycle with its final snapshot. */
  async finalizeOnSettled(eventId: string, settlementIds: string[] = []): Promise<void> {
    const event = await this.getEvent(eventId);
    if (resolveFundingModel(event.data as any) === 'peer_to_peer' || !event.data.poolConfig) return;
    const config = event.data.poolConfig as PoolConfig;
    const cycles = await this.listCycles(eventId);
    const cycle = [...cycles].reverse().find((c) => c.status === 'reconciling');
    if (!cycle) return;
    const built = await this.buildSummary(event, cycle);
    const result = reconcileCycle(this.reconcileInput(config, cycle, built, { forDissolution: true }));
    const now = nowIso();
    await db.collection(CYCLES).doc(cycle.id).set({
      status: 'closed',
      closeReason: 'dissolution',
      closedAt: now,
      closedBy: event.data.createdBy || null,
      overdraftLatchedAt: null,
      reconciliation: this.snapshot(result, cycle, event.data.createdBy || 'system', settlementIds),
      updatedAt: now,
    }, { merge: true });
  }

  // ── Membership & configuration ────────────────────────────────────────

  /** The custodian holds the money: they must hand over before leaving. */
  async assertCanLeave(eventId: string, userId: string): Promise<void> {
    const snap = await db.collection('events').doc(eventId).get();
    if (!snap.exists) return;
    const data = snap.data() || {};
    if (resolveFundingModel(data as any) === 'peer_to_peer') return;
    if (data.poolConfig?.custodianUserId === userId && data.status !== 'closed' && data.status !== 'settled') {
      throw new PoolError(409, 'The pool custodian cannot leave. Assign a new custodian first.', 'POOL_CUSTODIAN_LEAVING');
    }
  }

  /**
   * Keep the roster in step with the event's participants. Recurring
   * shared-living pools close the cycle so the leaver is squared up and
   * everyone else carries forward; other pools just adjust the roster.
   */
  async onMembershipChanged(
    eventId: string,
    actorId: string,
    change: { joinedUserIds?: string[]; leftUserIds?: string[] },
    planner: SettlementPlanner,
  ): Promise<{ action: 'none' | 'roster_updated' | 'cycle_rolled'; settlementIds?: string[] }> {
    const event = await this.getEvent(eventId);
    if (resolveFundingModel(event.data as any) === 'peer_to_peer' || !event.data.poolConfig) return { action: 'none' };
    const config = event.data.poolConfig as PoolConfig;
    if (config.funderMode === 'sponsor') return { action: 'none' };
    let cycle: PoolCycle;
    try {
      cycle = await this.getCurrentCycle(eventId, event);
    } catch {
      return { action: 'none' };
    }
    if (cycle.status !== 'open' || event.data.status !== 'active') return { action: 'none' };
    const left = change.leftUserIds || [];
    if (left.includes(config.custodianUserId)) {
      throw new PoolError(409, 'The custodian cannot leave the pool. Assign a new custodian first.', 'POOL_CUSTODIAN_LEAVING');
    }

    if (config.cycleMode === 'recurring' && config.membershipChangeClosesCycle) {
      const built = await this.buildSummary(event, cycle);
      const untouched =
        cycle.openingBalanceMinor === 0 &&
        Object.keys(cycle.openingCredits).length === 0 &&
        built._draws.length === 0 &&
        built._contributions.every((c) => c.receivedMinor === 0);
      if (untouched) {
        // Nothing to reconcile yet (e.g. flatmates still joining): just update the roster.
        await this.syncRoster(event, config, cycle, change.joinedUserIds || [], { replace: true });
        return { action: 'roster_updated' };
      }
      if (built._draws.some((d) => d.poolDraw?.status === 'pending')) {
        // Can't reconcile with undecided draws; fall back to a roster update.
        await this.syncRoster(event, config, cycle);
        return { action: 'roster_updated' };
      }
      const { settlementIds } = await this.closeCycle(eventId, actorId, { reason: 'membership_change', leavingUserIds: left, openNext: true, skipAuth: true }, planner);
      return { action: 'cycle_rolled', settlementIds };
    }

    await this.syncRoster(event, config, cycle, change.joinedUserIds || []);
    return { action: 'roster_updated' };
  }

  /**
   * Once money has moved, the roster only grows mid-cycle: someone who leaves
   * still shared the spending while they were here, so dropping them would
   * retroactively refund everything they put in. In an untouched cycle
   * (`replace`), leavers are simply dropped along with their unpaid dues.
   */
  private async syncRoster(event: EventRecord, config: PoolConfig, cycle: PoolCycle, joinedUserIds: string[] = [], opts: { replace?: boolean } = {}) {
    const groups = await this.getGroups(event.id);
    const current = await this.resolveRoster(event.id, config, groups);
    const byKey = new Map<string, PoolEntityRef>();
    for (const r of [...(opts.replace ? [] : cycle.roster), ...current]) byKey.set(entityKey(r.entityType, r.entityId), r);
    const roster = [...byKey.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([, r]) => r);
    await db.collection(CYCLES).doc(cycle.id).set({ roster, updatedAt: nowIso() }, { merge: true });
    if (opts.replace) {
      for (const c of await this.listContributions(cycle.id)) {
        if (c.kind === 'regular' && c.receivedMinor === 0 && !byKey.has(entityKey(c.fromEntityType, c.fromEntityId))) {
          await db.collection(CONTRIBUTIONS).doc(c.id).delete();
        }
      }
    }
    // New joiners of a pool with a default amount get an expected contribution.
    if (Number(config.defaultContributionMinor) > 0 && joinedUserIds.length > 0) {
      const existing = new Set((await this.listContributions(cycle.id)).filter((c) => c.kind === 'regular').map((c) => entityKey(c.fromEntityType, c.fromEntityId)));
      for (const uid of joinedUserIds) {
        const ref = this.entityForUser(uid, groups);
        const key = entityKey(ref.entityType, ref.entityId);
        if (existing.has(key)) continue;
        existing.add(key);
        await this.writeContribution(event, cycle, ref, this.payerForEntity(ref, groups), {
          kind: 'regular',
          expectedMinor: Number(config.defaultContributionMinor),
          createdBy: event.data.createdBy || uid,
        });
      }
    }
  }

  /** Adjust pool settings. Funding shape (funder/cycle mode) is fixed at creation. */
  async updateConfig(eventId: string, actorId: string, patch: Partial<PoolConfig>): Promise<PoolConfig> {
    const event = await this.getEvent(eventId);
    const config = this.requirePoolConfig(event);
    const isAdmin = event.data.createdBy === actorId || (Array.isArray(event.data.admins) && event.data.admins.includes(actorId));
    if (!isAdmin) throw new PoolError(403, 'Forbidden: Only event admins can change pool settings');
    this.assertEventEditable(event);
    const immutable: Array<keyof PoolConfig> = ['funderMode', 'cycleMode', 'preset'];
    for (const key of immutable) {
      if (patch[key] !== undefined && patch[key] !== config[key]) throw new PoolError(400, `${String(key)} cannot be changed after creation`);
    }
    if (patch.custodianUserId && patch.custodianUserId !== config.custodianUserId) {
      const participant = await db.collection('events').doc(eventId).collection('participants').doc(patch.custodianUserId).get();
      if (!participant.exists) throw new PoolError(400, 'The new custodian must be a participant of the event');
    }
    const next: PoolConfig = { ...config, ...patch, funderMode: config.funderMode, cycleMode: config.cycleMode, preset: config.preset };
    // update() replaces the whole map; a merge would keep removed keys such as a cleared spender cap.
    await db.collection('events').doc(eventId).update({ poolConfig: next, updatedAt: nowIso() });
    const cycle = await this.getCurrentCycle(eventId).catch(() => null);
    if (cycle) await this.refreshOverdraftLatch(eventId, cycle.id);
    return next;
  }

  /**
   * One-way conversion of a split-expenses event into a hybrid pool. Existing
   * expenses keep working unchanged as peer-to-peer expenses.
   */
  async convertToHybrid(eventId: string, actorId: string, dto: CreatePoolConfigDto): Promise<{ poolConfig: PoolConfig; cycle: PoolCycle }> {
    const event = await this.getEvent(eventId);
    const isAdmin = event.data.createdBy === actorId || (Array.isArray(event.data.admins) && event.data.admins.includes(actorId));
    if (!isAdmin) throw new PoolError(403, 'Forbidden: Only event admins can add a pool');
    if (resolveFundingModel(event.data as any) !== 'peer_to_peer') throw new PoolError(409, 'This event already has a pool');
    if (event.data.status !== 'active') throw new PoolError(409, 'A pool can only be added to an active event');
    const { poolConfig } = this.buildConfigForNewEvent(actorId, { ...dto, allowPeerExpenses: true });
    if (poolConfig.funderMode === 'sponsor') throw new PoolError(400, 'A sponsor budget cannot be added to a split-expenses event');
    await db.collection('events').doc(eventId).set({ fundingModel: 'hybrid', poolConfig, updatedAt: nowIso() }, { merge: true });
    const cycle = await this.openFirstCycle(eventId, actorId);
    return { poolConfig, cycle };
  }
}
