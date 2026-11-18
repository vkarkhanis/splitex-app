import {
  ADVANCE_KIND_LABEL,
  AdvanceLike,
  Balance,
  ContributionLike,
  CreatePoolConfigDto,
  DrawLike,
  Expense,
  ExpenseFundingSource,
  Group,
  HoldingDrawLike,
  PoolAdvance,
  PoolAdvanceKind,
  PoolAuditEntry,
  PoolConfig,
  PoolContribution,
  PoolCycle,
  PoolCycleCloseReason,
  PoolCycleSummary,
  PoolDrawState,
  PoolEntityRef,
  PoolExpenseFlag,
  PoolFoldedItem,
  PoolHoldings,
  PoolLedger,
  PoolLedgerEntry,
  PoolPaidFrom,
  PoolReconciliation,
  PoolRefusalDetails,
  PoolSeparateLeg,
  PoolSpenderSummary,
  ReconcileResult,
  allowedFundingSources,
  buildPoolConfig,
  canApproveDraw,
  computeArrears,
  computeCycleTotals,
  computeFundingState,
  computeHoldings,
  computeOverdraftState,
  entityKey,
  evaluateDraw,
  formatMinor,
  fromMinor,
  isPoolSideLeg,
  nextOverdraftLatch,
  outstandingLoans,
  parseEntityKey,
  reconcileCycle,
  resolveFundingModel,
  resolveFundingSource,
  splitForMembershipChange,
  toMinor,
} from '@traxettle/shared';
import { db } from '../config/firebase';
import { GroupService } from './group.service';
import { foldablePoolLegs } from './pool-netting';

const CYCLES = 'poolCycles';
const CONTRIBUTIONS = 'poolContributions';
const ADVANCES = 'poolAdvances';
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
      ...(d.openingHeld && Object.keys(d.openingHeld).length > 0 ? { openingHeld: d.openingHeld } : {}),
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
      ...(d.gift === true ? { gift: true } : {}),
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

  private mapAdvance(id: string, d: Record<string, any>): PoolAdvance {
    return {
      id,
      eventId: d.eventId,
      cycleId: d.cycleId,
      kind: d.kind,
      fromUserId: d.fromUserId,
      toUserId: d.toUserId,
      amountMinor: d.amountMinor || 0,
      currency: d.currency,
      status: d.status || 'initiated',
      note: d.note ?? null,
      proofUrl: d.proofUrl ?? null,
      rejectionReason: d.rejectionReason ?? null,
      createdBy: d.createdBy,
      createdAt: d.createdAt,
      confirmedAt: d.confirmedAt ?? null,
      updatedAt: d.updatedAt,
      auditTrail: Array.isArray(d.auditTrail) ? d.auditTrail : [],
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

  /** Hand-overs (advances, returns, early repayments) recorded in a cycle. */
  async listAdvances(cycleId: string): Promise<PoolAdvance[]> {
    const snap = await db.collection(ADVANCES).where('cycleId', '==', cycleId).get();
    return snap.docs
      .map((d: any) => this.mapAdvance(d.id, d.data()))
      .sort((a: PoolAdvance, b: PoolAdvance) => String(a.createdAt).localeCompare(String(b.createdAt)));
  }

  private async listCycleDraws(eventId: string, cycleId: string): Promise<Array<Record<string, any> & { id: string }>> {
    const snap = await db.collection('expenses').where('eventId', '==', eventId).get();
    return snap.docs
      .map((d: any) => ({ id: d.id, ...(d.data() || {}) }))
      .filter((e: any) => e.poolCycleId === cycleId && (e.fundingSource === 'pool' || e.fundingSource === 'pool_reimbursement'));
  }

  private toContributionLike(c: PoolContribution): ContributionLike {
    return {
      entityKey: entityKey(c.fromEntityType, c.fromEntityId),
      kind: c.kind,
      status: c.status,
      expectedMinor: c.expectedMinor,
      receivedMinor: c.receivedMinor,
      ...(c.gift ? { gift: true } : {}),
    };
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

  /** The entity key a user is measured under in this event (their group's, if they're in one). */
  private userKey(userId: string, groups: Group[]): string {
    const ref = this.entityForUser(userId, groups);
    return entityKey(ref.entityType, ref.entityId);
  }

  private toAdvanceLike(a: PoolAdvance, groups: Group[]): AdvanceLike {
    return { kind: a.kind, status: a.status, fromKey: this.userKey(a.fromUserId, groups), toKey: this.userKey(a.toUserId, groups), amountMinor: a.amountMinor };
  }

  private toHoldingDrawLike(e: Record<string, any>, currency: string, groups: Group[]): HoldingDrawLike {
    return {
      payerKey: this.userKey(e.paidBy, groups),
      amountMinor: toMinor(Number(e.amount) || 0, currency),
      status: e.poolDraw?.status || 'pending',
      fundingSource: e.fundingSource,
      ...(e.poolDraw?.paidFrom ? { paidFrom: e.poolDraw.paidFrom } : {}),
    };
  }

  /** Confirmed early repayments (§10.6): money that has left the pool. */
  private confirmedRepaymentsMinor(advances: PoolAdvance[]): number {
    return advances.filter((a) => a.kind === 'repayment' && a.status === 'confirmed').reduce((s, a) => s + a.amountMinor, 0);
  }

  /** Live, derived view of a cycle. The balance is never stored — always recomputed. */
  async buildSummary(event: EventRecord, cycle: PoolCycle): Promise<PoolCycleSummary & {
    holdings: PoolHoldings;
    _draws: Array<Record<string, any> & { id: string }>;
    _contributions: PoolContribution[];
    _advances: PoolAdvance[];
    _groups: Group[];
  }> {
    const config = this.requirePoolConfig(event);
    const [contributions, draws, advances, groups] = await Promise.all([
      this.listContributions(cycle.id),
      this.listCycleDraws(event.id, cycle.id),
      this.listAdvances(cycle.id),
      this.getGroups(event.id),
    ]);
    const totals = computeCycleTotals({
      openingBalanceMinor: cycle.openingBalanceMinor,
      contributions: contributions.map((c) => this.toContributionLike(c)),
      draws: draws.map((d) => this.toDrawLike(d, cycle.currency, groups)),
      earlyRepaymentsMinor: this.confirmedRepaymentsMinor(advances),
    });
    const holdings = computeHoldings({
      custodianEntityKey: this.custodianKey(config, groups),
      balanceMinor: totals.balanceMinor,
      openingHeld: cycle.openingHeld,
      advances: advances.map((a) => this.toAdvanceLike(a, groups)),
      draws: draws.map((d) => this.toHoldingDrawLike(d, cycle.currency, groups)),
    });
    return {
      cycle,
      totals,
      overdraft: computeOverdraftState(config, cycle.openingBalanceMinor, totals, cycle.overdraftLatchedAt),
      funding: computeFundingState(config, cycle.openingBalanceMinor, totals),
      arrears: computeArrears(contributions.map((c) => this.toContributionLike(c))),
      holdings,
      _draws: draws,
      _contributions: contributions,
      _advances: advances,
      _groups: groups,
    };
  }

  async getSummary(eventId: string, cycleId?: string): Promise<PoolCycleSummary> {
    const event = await this.getEvent(eventId);
    this.requirePoolConfig(event);
    const cycle = cycleId ? await this.getCycle(cycleId) : await this.getCurrentCycle(eventId, event);
    if (!cycle || cycle.eventId !== eventId) throw new PoolError(404, 'Cycle not found');
    const { _draws, _contributions, _advances, _groups, ...summary } = await this.buildSummary(event, cycle);
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
    fields: Pick<PoolCycle, 'sequence' | 'label' | 'startDate' | 'endDate' | 'openingBalanceMinor' | 'openingCredits' | 'roster'> & { openingHeld?: Record<string, number> },
  ): Promise<PoolCycle> {
    const now = nowIso();
    const { openingHeld, ...rest } = fields;
    const data = {
      eventId: event.id,
      ...rest,
      // Stored only when someone carries held money in, so other cycles look exactly as before.
      ...(openingHeld && Object.keys(openingHeld).length > 0 ? { openingHeld } : {}),
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
      gift?: boolean;
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
      ...(opts.kind === 'top_up' && opts.gift ? { gift: true } : {}),
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

  /**
   * Ad-hoc money in — e.g. to unpause a pool or pay off carried arrears. It's a loan, paid back
   * at close, unless `gift` (design doc §10). The custodian confirming receipt accepts the loan.
   */
  async addTopUp(eventId: string, actorId: string, input: { amountMinor: number; note?: string; gift?: boolean; entityId?: string; entityType?: 'user' | 'group' }): Promise<PoolContribution> {
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
      gift: input.gift,
      expectedMinor: input.amountMinor,
      receivedMinor: selfConfirmed ? input.amountMinor : 0,
      status: selfConfirmed ? 'confirmed' : 'pending',
      createdBy: actorId,
      custodianConfirmedAt: selfConfirmed ? nowIso() : undefined,
      audit: [auditEntry('created', actorId, { amountMinor: input.amountMinor, note: input.gift ? [input.note, 'Gift'].filter(Boolean).join(' · ') : input.note, statusTo: selfConfirmed ? 'confirmed' : 'pending' })],
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

  // ── Hand-overs: advances, returns and early repayments (§9.3, §10.6) ──

  /** Money only changes hands while the event is active and its cycle is open. */
  private assertHandOverWritable(event: EventRecord, cycle: PoolCycle) {
    if (event.data.status !== 'active') {
      throw new PoolError(409, 'Money can only be handed over while the event is active', 'POOL_EVENT_NOT_ACTIVE');
    }
    if (cycle.status !== 'open') throw new PoolError(409, `Cannot hand over money in a ${cycle.status} cycle`, 'POOL_CYCLE_NOT_OPEN');
  }

  /**
   * Record money handed between the custodian and someone else.
   * - advance: the custodian gives a spender pool money. Refused while spending is paused or the
   *   pool is empty, and beyond what the custodian holds (less advances still waiting).
   * - return: a holder gives money back. Recorded by the holder (the custodian confirms) or by the
   *   custodian (confirmed at once: they're the one receiving it). At most what they hold.
   * - repayment: the custodian pays a lender back early, up to what they're still owed. Allowed
   *   even while spending is paused; the apps warn first (§10.6).
   * Anything not recorded by the receiver waits for them to confirm it.
   */
  async recordAdvance(
    eventId: string,
    actorId: string,
    input: { kind: PoolAdvanceKind; userId?: string; amountMinor: number; note?: string; proofUrl?: string },
  ): Promise<PoolAdvance> {
    const event = await this.getEvent(eventId);
    const config = this.requirePoolConfig(event);
    const cycle = await this.getCurrentCycle(eventId, event);
    this.assertHandOverWritable(event, cycle);
    if (!(input.amountMinor > 0)) throw new PoolError(400, 'Amount must be greater than zero');
    const built = await this.buildSummary(event, cycle);
    const groups = built._groups;
    const custodian = config.custodianUserId;
    const amount = input.amountMinor;

    let fromUserId: string;
    let toUserId: string;
    let status: 'initiated' | 'confirmed' = 'initiated';
    if (input.kind === 'advance') {
      if (actorId !== custodian) throw new PoolError(403, 'Forbidden: Only the custodian can hand out pool money');
      if (!input.userId) throw new PoolError(400, 'Choose who receives the money', 'POOL_RECIPIENT_REQUIRED');
      if (input.userId === custodian) throw new PoolError(400, 'The custodian already holds the pool money', 'POOL_RECIPIENT_INVALID');
      if (!(await this.canDraw(event, config, input.userId, groups))) {
        throw new PoolError(400, "That person can't spend from this pool", 'POOL_RECIPIENT_INVALID');
      }
      if (built.overdraft.latched || built.overdraft.balanceMinor <= 0) {
        throw new PoolError(409, "There's no pool money to hand out: spending is paused or the pool is empty", 'POOL_ADVANCE_NOT_AVAILABLE');
      }
      const availableMinor = built.holdings.withCustodianMinor - built.holdings.pendingOutMinor;
      if (amount > availableMinor) {
        throw new PoolError(409, 'That is more than you hold of the pool money', 'POOL_ADVANCE_EXCEEDS_CUSTODIAN', { availableMinor: Math.max(0, availableMinor) });
      }
      fromUserId = custodian;
      toUserId = input.userId;
    } else if (input.kind === 'return') {
      let holderId: string;
      if (actorId === custodian) {
        if (!input.userId || input.userId === custodian) throw new PoolError(400, 'Choose who returned the money', 'POOL_RECIPIENT_REQUIRED');
        holderId = input.userId;
        status = 'confirmed';
      } else {
        if (input.userId && input.userId !== actorId && input.userId !== custodian) {
          throw new PoolError(400, 'You can only return money you hold', 'POOL_RECIPIENT_INVALID');
        }
        holderId = actorId;
      }
      const holderKey = this.userKey(holderId, groups);
      const waiting = built._advances
        .filter((a) => a.kind === 'return' && a.status === 'initiated' && this.userKey(a.fromUserId, groups) === holderKey)
        .reduce((sum, a) => sum + a.amountMinor, 0);
      const heldMinor = (built.holdings.heldBy[holderKey] || 0) - waiting;
      if (amount > heldMinor) {
        throw new PoolError(409, 'That is more than they hold of the pool money', 'POOL_RETURN_EXCEEDS_HELD', { heldMinor: Math.max(0, heldMinor) });
      }
      fromUserId = holderId;
      toUserId = custodian;
    } else {
      if (actorId !== custodian) throw new PoolError(403, 'Forbidden: Only the custodian can pay money back early');
      if (!input.userId || input.userId === custodian) throw new PoolError(400, 'Choose who to pay back', 'POOL_RECIPIENT_REQUIRED');
      const outstandingMinor = outstandingLoans(built._contributions, built._advances, custodian).byUser[input.userId] || 0;
      if (amount > outstandingMinor) {
        throw new PoolError(409, 'That is more than they lent and are still owed', 'POOL_REPAYMENT_EXCEEDS_LOAN', { outstandingMinor });
      }
      fromUserId = custodian;
      toUserId = input.userId;
    }

    const now = nowIso();
    const data = {
      eventId,
      cycleId: cycle.id,
      kind: input.kind,
      fromUserId,
      toUserId,
      amountMinor: amount,
      currency: cycle.currency,
      status,
      note: input.note ?? null,
      proofUrl: input.proofUrl ?? null,
      rejectionReason: null,
      createdBy: actorId,
      createdAt: now,
      confirmedAt: status === 'confirmed' ? now : null,
      updatedAt: now,
      auditTrail: [auditEntry('created', actorId, { amountMinor: amount, note: input.note, proofUrl: input.proofUrl, statusTo: status })],
    };
    const ref = await db.collection(ADVANCES).add(data);
    return this.mapAdvance(ref.id, data);
  }

  private async loadAdvance(advanceId: string): Promise<{ advance: PoolAdvance; event: EventRecord; cycle: PoolCycle }> {
    const snap = await db.collection(ADVANCES).doc(advanceId).get();
    if (!snap.exists) throw new PoolError(404, 'Hand-over not found');
    const advance = this.mapAdvance(advanceId, snap.data()!);
    const event = await this.getEvent(advance.eventId);
    this.requirePoolConfig(event);
    const cycle = await this.getCycle(advance.cycleId);
    if (!cycle) throw new PoolError(404, 'Cycle not found');
    return { advance, event, cycle };
  }

  private async decideAdvance(
    advanceId: string,
    actorId: string,
    who: 'receiver' | 'recorder',
    statusTo: 'confirmed' | 'rejected' | 'cancelled',
    reason?: string,
  ): Promise<PoolAdvance> {
    const { advance, event, cycle } = await this.loadAdvance(advanceId);
    this.assertHandOverWritable(event, cycle);
    if (who === 'receiver' && advance.toUserId !== actorId) {
      throw new PoolError(403, 'Forbidden: Only the person receiving the money can confirm it or say it never arrived');
    }
    if (who === 'recorder' && advance.createdBy !== actorId) {
      throw new PoolError(403, 'Forbidden: Only the person who recorded it can cancel it');
    }
    if (advance.status !== 'initiated') throw new PoolError(409, `This hand-over is already ${advance.status}`, 'POOL_HANDOVER_DECIDED');
    const now = nowIso();
    const rejectionReason = statusTo === 'rejected' ? (reason || 'Not received').trim() : null;
    await db.collection(ADVANCES).doc(advanceId).set({
      status: statusTo,
      ...(statusTo === 'confirmed' ? { confirmedAt: now } : {}),
      ...(rejectionReason ? { rejectionReason } : {}),
      updatedAt: now,
      auditTrail: appendAudit(advance.auditTrail, auditEntry(statusTo, actorId, { note: rejectionReason ?? undefined, statusFrom: 'initiated', statusTo })),
    }, { merge: true });
    // A confirmed early repayment lowers the balance, which can pause spending.
    if (statusTo === 'confirmed' && advance.kind === 'repayment') await this.refreshOverdraftLatch(advance.eventId, advance.cycleId);
    return (await this.loadAdvance(advanceId)).advance;
  }

  /** The receiver confirms the money arrived. */
  confirmAdvance(advanceId: string, actorId: string): Promise<PoolAdvance> {
    return this.decideAdvance(advanceId, actorId, 'receiver', 'confirmed');
  }

  /** The receiver says it never arrived. Final: the giver records it again if needed. */
  rejectAdvance(advanceId: string, actorId: string, reason?: string): Promise<PoolAdvance> {
    return this.decideAdvance(advanceId, actorId, 'receiver', 'rejected', reason);
  }

  /** Whoever recorded it withdraws it before the receiver has answered. */
  cancelAdvance(advanceId: string, actorId: string): Promise<PoolAdvance> {
    return this.decideAdvance(advanceId, actorId, 'recorder', 'cancelled');
  }

  private assertNoUnconfirmedAdvances(advances: PoolAdvance[]): void {
    const waiting = advances.filter((a) => a.status === 'initiated');
    if (waiting.length > 0) {
      throw new PoolError(409, 'Confirm, reject or cancel the money handed over before closing', 'POOL_UNCONFIRMED_MOVEMENTS', { count: waiting.length });
    }
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
   * How someone other than the custodian paid a pool spend (§9.3): from pool money they hold, or
   * with the custodian's card/UPI. Optional, so older app builds keep working (decision D10).
   * `checkCardSwitch` is false when an edit keeps the method the spend already had: turning the
   * card switch off later doesn't block editing spends recorded before.
   */
  private validatePaidFrom(
    config: PoolConfig,
    payerId: string,
    fundingSource: ExpenseFundingSource,
    paidFrom: unknown,
    checkCardSwitch = true,
  ): PoolPaidFrom | undefined {
    if (paidFrom === undefined || paidFrom === null) return undefined;
    if (paidFrom !== 'advance' && paidFrom !== 'sponsor_card') {
      throw new PoolError(400, 'paidFrom must be "advance" or "sponsor_card"', 'POOL_PAID_FROM_INVALID');
    }
    if (fundingSource !== 'pool') throw new PoolError(400, 'Only pool spends say how they were paid', 'POOL_PAID_FROM_INVALID');
    if (payerId === config.custodianUserId) {
      throw new PoolError(400, "The custodian's own pool spends are paid from the pool directly", 'POOL_PAID_FROM_INVALID');
    }
    if (paidFrom === 'sponsor_card' && checkCardSwitch && config.allowSponsorCardSpends === false) {
      throw new PoolError(400, "This pool doesn't allow spends on the custodian's card or UPI", 'POOL_CARD_SPENDS_OFF');
    }
    return paidFrom;
  }

  /**
   * Validate a new pool-funded expense and decide its approval state.
   * Throws PoolError with structured details when the draw is refused.
   */
  async prepareDraw(
    eventId: string,
    actorId: string,
    input: { amount: number; currency: string; fundingSource: ExpenseFundingSource; alreadyIncurred?: boolean; paidFrom?: PoolPaidFrom; attachments?: string[] },
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
    const paidFrom = this.validatePaidFrom(config, actorId, fundingSource, input.paidFrom);
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
      (!canApproveDraw(actorId, actorId, config.custodianUserId, manager) && (config.expenseApproval === 'always' ||
        (config.expenseApproval === 'above_threshold' && amountMinor > Number(config.approvalThresholdMinor ?? 0))));

    const now = nowIso();
    const method = paidFrom ? { paidFrom } : {};
    const poolDraw: PoolDrawState = needsApproval
      ? { status: 'pending', alreadyIncurred, ...method }
      : { status: 'approved', decidedBy: actorId, decidedAt: now, alreadyIncurred, ...method };
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
    if (!canApproveDraw(actorId, expense.paidBy, config.custodianUserId, true)) {
      throw new PoolError(403, "You can't approve your own expense. Ask the custodian or another admin.", 'POOL_SELF_APPROVAL');
    }
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
    const settlementId = await this.ensureRepaymentLeg({ ...expense, poolDraw }, event, config, actorId);
    return { ...expense, poolDraw: settlementId ? { ...poolDraw, settlementId } : poolDraw };
  }

  /**
   * A pool spend already paid with the pool's money, then rejected: the spender owes it back (§9.2).
   * Not when it was paid from money they hold: that stays in what they hold instead (§9.3).
   */
  private owesRepayment(expense: Record<string, any>, config: PoolConfig): boolean {
    return expense.fundingSource === 'pool'
      && expense.poolDraw?.status === 'rejected'
      && expense.poolDraw?.alreadyIncurred === true
      && expense.poolDraw?.paidFrom !== 'advance'
      && expense.paidBy !== config.custodianUserId;
  }

  /**
   * Create the `pool_repayment` leg (spender → custodian) a rejected, already-paid pool spend
   * needs, unless it exists. Paid through the usual I've Paid → confirm flow under Pool payments.
   */
  private async ensureRepaymentLeg(expense: Record<string, any> & { id: string }, event: EventRecord, config: PoolConfig, actorId: string): Promise<string | null> {
    if (!this.owesRepayment(expense, config) || (await this.legExists(expense.poolDraw?.settlementId))) return null;
    const now = nowIso();
    const leg = await db.collection(SETTLEMENTS).add({
      eventId: expense.eventId,
      kind: 'pool_repayment',
      poolCycleId: expense.poolCycleId,
      expenseId: expense.id,
      fromEntityId: expense.paidBy,
      fromEntityType: 'user',
      toEntityId: config.custodianUserId,
      toEntityType: 'user',
      fromUserId: expense.paidBy,
      toUserId: config.custodianUserId,
      amount: expense.amount,
      currency: event.data.currency,
      status: 'pending',
      createdAt: now,
      auditTrail: [{
        id: `aud-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        action: 'created',
        actorUserId: actorId,
        note: `Pool money spent on "${expense.title}", not approved`,
        statusFrom: 'none',
        statusTo: 'pending',
        createdAt: now,
      }],
    });
    await db.collection('expenses').doc(expense.id).set({ poolDraw: { ...expense.poolDraw, settlementId: leg.id } }, { merge: true });
    return leg.id;
  }

  /** Nothing in a closed cycle may change (its reconciliation is final). */
  async assertDrawCycleWritable(expense: Record<string, any>): Promise<void> {
    if (!expense.poolCycleId) return;
    const cycle = await this.getCycle(expense.poolCycleId);
    if (cycle) this.assertCycleWritable(cycle);
  }

  /**
   * Guard edits/deletes of a pool draw. Returns the reimbursement or repayment leg (if any)
   * that must be removed because the amount is changing or the expense is going away.
   * An amount change sends a rejected spend back for approval; only a manager may delete one
   * the spender still owes for, so a spender can't erase their own debt.
   */
  async assertDrawMutable(expense: Record<string, any>, opts: { deletingBy?: string } = {}): Promise<{ legToRemove: string | null; cycle: PoolCycle | null }> {
    if (expense.fundingSource !== 'pool' && expense.fundingSource !== 'pool_reimbursement') return { legToRemove: null, cycle: null };
    const cycle = expense.poolCycleId ? await this.getCycle(expense.poolCycleId) : null;
    if (cycle) this.assertCycleWritable(cycle);
    const legId = expense.poolDraw?.settlementId;
    if (!legId) return { legToRemove: null, cycle };
    const leg = await db.collection(SETTLEMENTS).doc(legId).get();
    const repayment = leg.exists && leg.data()?.kind === 'pool_repayment';
    // A leg folded into the final plan (`netted`, §11) can still change during Review: removing it
    // marks the plan stale, and re-running the plan folds whatever is left.
    if (leg.exists && leg.data()?.status !== 'pending' && leg.data()?.status !== 'netted') {
      throw repayment
        ? new PoolError(409, 'This repayment is already being paid and can no longer change', 'POOL_REPAYMENT_IN_PAYMENT')
        : new PoolError(409, 'This reimbursement is already being paid and can no longer change', 'POOL_REIMBURSEMENT_IN_PAYMENT');
    }
    if (repayment && opts.deletingBy) {
      const event = await this.getEvent(expense.eventId);
      if (!this.isManager(event, this.requirePoolConfig(event), opts.deletingBy)) {
        throw new PoolError(403, 'This spend was not approved, so it is owed back to the custodian. Only the custodian or an admin can delete it.', 'POOL_REPAYMENT_OWED');
      }
    }
    return { legToRemove: leg.exists ? legId : null, cycle };
  }

  /**
   * Re-run the draw rules for an amount change on a pool expense, or a change in how it was paid.
   * The old deduction is released first, so the check is against the balance the new amount would
   * actually leave. The payment method stays as it was unless a new one is sent.
   */
  async prepareAmountChange(
    expense: Record<string, any>,
    actorId: string,
    newAmount: number,
    alreadyIncurred?: boolean,
    paidFrom?: PoolPaidFrom,
  ): Promise<{ poolDraw: PoolDrawState; poolFlags: PoolExpenseFlag[]; autoApproved: boolean }> {
    const event = await this.getEvent(expense.eventId);
    const config = this.requirePoolConfig(event);
    const previous: PoolPaidFrom | undefined = expense.poolDraw?.paidFrom;
    const method = paidFrom === undefined || paidFrom === previous
      ? this.validatePaidFrom(config, expense.paidBy, expense.fundingSource, previous, false)
      : this.validatePaidFrom(config, expense.paidBy, expense.fundingSource, paidFrom);
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
    const approver = canApproveDraw(actorId, expense.paidBy, config.custodianUserId, this.isManager(event, config, actorId));
    const needsApproval = !approver && (config.expenseApproval === 'always' ||
      (config.expenseApproval === 'above_threshold' && amountMinor > Number(config.approvalThresholdMinor ?? 0)));
    const kept = method ? { paidFrom: method } : {};
    const poolDraw: PoolDrawState = needsApproval
      ? { status: 'pending', alreadyIncurred: incurred, ...kept }
      : { status: 'approved', decidedBy: actorId, decidedAt: nowIso(), alreadyIncurred: incurred, ...kept };
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
    const { _draws, _contributions, _advances, _groups, ...summary } = built;
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
        ...(d.fundingSource === 'pool' ? { alreadyIncurred: d.poolDraw?.alreadyIncurred === true } : {}),
        ...(d.poolDraw?.paidFrom ? { paidFrom: d.poolDraw.paidFrom } : {}),
        settlementStatus: d.poolDraw?.selfReimbursed ? 'completed' : (d.poolDraw?.settlementId ? legStatus.get(d.poolDraw.settlementId) ?? null : null),
        counted: d.poolDraw?.status === 'approved',
      });
    }
    for (const a of _advances) {
      if (a.status !== 'initiated' && a.status !== 'confirmed') continue;
      entries.push({
        id: a.id,
        type: 'advance',
        at: a.confirmedAt || a.createdAt,
        title: ADVANCE_KIND_LABEL[a.kind],
        // Advances and returns move money between holders; only an early repayment leaves the pool.
        amountMinor: a.kind === 'repayment' ? -a.amountMinor : a.amountMinor,
        status: a.status,
        actorUserId: a.fromUserId,
        advanceKind: a.kind,
        fromUserId: a.fromUserId,
        toUserId: a.toUserId,
        receiptUrls: a.proofUrl ? [a.proofUrl] : [],
        counted: a.kind === 'repayment' && a.status === 'confirmed',
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

    // What each spender holds (§9.3), shown on their row; holders who haven't spent yet get a row too.
    const heldBy = { ...built.holdings.heldBy };
    for (const row of spenderMap.values()) {
      const key = row.spenderType === 'group' ? entityKey('group', row.spenderId) : this.userKey(row.spenderId, _groups);
      if (heldBy[key]) {
        row.heldMinor = heldBy[key];
        delete heldBy[key];
      }
    }
    for (const [key, heldMinor] of Object.entries(heldBy)) {
      const ref = parseEntityKey(key);
      spenderMap.set(key, { spenderId: ref.entityId, spenderType: ref.entityType, spentMinor: 0, pendingMinor: 0, capMinor: config.spenderCapsMinor?.[ref.entityId] ?? null, heldMinor });
    }

    return {
      summary,
      contributions: _contributions,
      entries,
      spenders: [...spenderMap.values()].sort((a, b) => b.spentMinor - a.spentMinor),
      cycles: await this.listCycles(eventId),
      advances: _advances,
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
      repayments: built._advances
        .filter((a) => a.kind === 'repayment' && a.status === 'confirmed')
        .map((a) => ({ entityKey: this.userKey(a.toUserId, built._groups), amountMinor: a.amountMinor })),
      held: built.holdings.heldBy,
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
  ): Promise<ReconcileResult & {
    cycleId: string;
    pendingDraws: number;
    coverNeededMinor: number;
    folded: PoolFoldedItem[];
    separate: PoolSeparateLeg[];
  }> {
    const event = await this.getEvent(eventId);
    const config = this.requirePoolConfig(event);
    this.requireManager(event, config, actorId);
    const cycle = await this.getCurrentCycle(eventId, event);
    const built = await this.buildSummary(event, cycle);
    const raw = reconcileCycle(this.reconcileInput(config, cycle, built, { forDissolution: opts.forDissolution }));
    const extraCover = this.normalizeCover(config, built._groups, raw.uncoveredDeficitMinor, opts.cover);
    const result = extraCover.length > 0 ? reconcileCycle(this.reconcileInput(config, cycle, built, { forDissolution: opts.forDissolution, extraCover })) : raw;
    const settleUp = opts.forDissolution ? await this.settleUpPoolPayments(event, config, cycle, built) : { folded: [], separate: [] };
    return {
      ...result,
      cycleId: cycle.id,
      pendingDraws: built._draws.filter((d) => d.poolDraw?.status === 'pending').length,
      /** Shortfall nobody has been recorded as covering yet (before any default). */
      coverNeededMinor: raw.uncoveredDeficitMinor,
      ...settleUp,
    };
  }

  /**
   * For the settle-up preview (§11.4 step 5): which pool payments the final plan will include, and
   * which stay separate. Folded: this cycle's repayments and claims nobody has started paying, plus
   * those settle-up will create (approved claims and rejected card spends without a leg yet).
   * Separate: every other open pool payment (already being paid, or from an earlier cycle).
   */
  private async settleUpPoolPayments(
    event: EventRecord,
    config: PoolConfig,
    cycle: PoolCycle,
    built: Awaited<ReturnType<PoolService['buildSummary']>>,
  ): Promise<{ folded: PoolFoldedItem[]; separate: PoolSeparateLeg[] }> {
    const snap = await db.collection(SETTLEMENTS).where('eventId', '==', event.id).get();
    const legs = snap.docs.map((d: any) => ({ id: d.id, ...(d.data() || {}) })) as Array<Record<string, any> & { id: string }>;
    const byId = new Map(legs.map((l) => [l.id, l]));
    const titleOf = new Map(built._draws.map((d) => [d.id, String(d.title || '')]));
    const currency = cycle.currency;
    const folded: PoolFoldedItem[] = [];
    const foldedIds = new Set<string>();
    for (const leg of foldablePoolLegs(legs, cycle.id)) {
      foldedIds.add(leg.id);
      folded.push({
        settlementId: leg.id, expenseId: leg.expenseId ?? null, kind: leg.kind,
        fromUserId: leg.fromUserId, toUserId: leg.toUserId, amountMinor: toMinor(Number(leg.amount) || 0, currency),
        title: titleOf.get(leg.expenseId) || '',
      });
    }
    for (const d of built._draws) {
      const legId = d.poolDraw?.settlementId;
      if (legId && byId.has(legId)) continue;
      const amountMinor = toMinor(Number(d.amount) || 0, currency);
      if (d.fundingSource === 'pool_reimbursement' && d.poolDraw?.status === 'approved' && !d.poolDraw.selfReimbursed && d.paidBy !== config.custodianUserId) {
        folded.push({ settlementId: null, expenseId: d.id, kind: 'pool_reimbursement', fromUserId: config.custodianUserId, toUserId: d.paidBy, amountMinor, title: String(d.title || '') });
      } else if (this.owesRepayment(d, config)) {
        folded.push({ settlementId: null, expenseId: d.id, kind: 'pool_repayment', fromUserId: d.paidBy, toUserId: config.custodianUserId, amountMinor, title: String(d.title || '') });
      }
    }
    const separate: PoolSeparateLeg[] = legs
      .filter((l) => isPoolSideLeg({ kind: l.kind }) && !foldedIds.has(l.id) && !['completed', 'terminated', 'netted'].includes(l.status))
      .map((l) => ({
        settlementId: l.id, kind: l.kind, status: l.status, expenseId: l.expenseId ?? null,
        fromUserId: l.fromUserId, toUserId: l.toUserId, amountMinor: toMinor(Number(l.amount) || 0, currency),
      }));
    return { folded, separate };
  }

  private snapshot(result: ReconcileResult, cycle: PoolCycle, actorId: string, settlementIds: string[], nettedLegIds: string[] = []): PoolReconciliation {
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
      ...(result.earlyRepaymentsMinor > 0 ? { earlyRepaymentsMinor: result.earlyRepaymentsMinor } : {}),
      ...(Object.keys(result.heldBy).length > 0 ? { heldBy: result.heldBy } : {}),
      ...(nettedLegIds.length > 0 ? { nettedLegIds } : {}),
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
   * Money someone says they've added must be confirmed (or rejected) before the pool closes:
   * a lender is paid back only what the custodian confirmed receiving (§10).
   */
  private assertNoUnconfirmedTopUps(contributions: PoolContribution[]): void {
    const waiting = contributions.filter((c) => c.kind === 'top_up' && c.status === 'initiated');
    if (waiting.length > 0) {
      throw new PoolError(409, 'Confirm or reject the money people have added to the pool before closing it', 'POOL_UNCONFIRMED_TOP_UPS', { count: waiting.length });
    }
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
    this.assertNoUnconfirmedTopUps(built._contributions);
    this.assertNoUnconfirmedAdvances(built._advances);

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
    // Money spenders hold carries into the next cycle; a settling close collects it (§9.3).
    let carryHeld: Record<string, number> = {};
    if (result.disposition === 'carry_forward') {
      if (leavingKeys.length > 0) {
        const split = splitForMembershipChange(result, leavingKeys, custodianKey);
        settlementIds = await this.writePoolLegs(event, cycle, groups, split.exitBalances, 'pool_member_exit', actorId, planner);
        carryCredits = split.carryCredits;
        carryOpening = split.carryOpeningBalanceMinor;
        carryHeld = split.carryHeld;
      } else {
        for (const e of result.entityShares) if (e.netMinor !== 0) carryCredits[entityKey(e.entityType, e.entityId)] = e.netMinor;
        carryOpening = result.closingBalanceMinor;
        carryHeld = result.heldBy;
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
      next = await this.openNextCycle(event, config, closed, opts.reason, carryOpening, carryCredits, leavingKeys, actorId, carryHeld);
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
    openingHeld: Record<string, number> = {},
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
      openingHeld,
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
    this.assertNoUnconfirmedTopUps(built._contributions);
    this.assertNoUnconfirmedAdvances(built._advances);
    // Settling with an approved claim (or a rejected, already-paid spend) that has no leg would
    // close the event without the money being paid back.
    for (const draw of built._draws) {
      if (draw.fundingSource === 'pool_reimbursement' && draw.poolDraw?.status === 'approved' && !draw.poolDraw.selfReimbursed) {
        await this.finalizeApprovedDraw(draw as Expense & { poolDraw?: PoolDrawState }, actorId);
      } else if (this.owesRepayment(draw, config)) {
        await this.ensureRepaymentLeg(draw, event, config, actorId);
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

  /** The cycle being settled up, if any (§11: its repayments and claims fold into the plan). */
  async reconcilingCycleId(eventId: string): Promise<string | null> {
    const cycles = await this.listCycles(eventId);
    return [...cycles].reverse().find((c) => c.status === 'reconciling')?.id ?? null;
  }

  /**
   * Once the event is settled, freeze the reconciling cycle with its final snapshot, including the
   * pool payments folded into the plan, so Cycle history can explain the figures.
   */
  async finalizeOnSettled(eventId: string, settlementIds: string[] = [], nettedLegIds: string[] = []): Promise<void> {
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
      reconciliation: this.snapshot(result, cycle, event.data.createdBy || 'system', settlementIds, nettedLegIds),
      updatedAt: now,
    }, { merge: true });
  }

  // ── Membership & configuration ────────────────────────────────────────

  /** A recurring pool that squares a leaver up by closing the cycle when membership changes. */
  private squaresUpLeavers(config: PoolConfig): boolean {
    return config.funderMode === 'contributors' && config.cycleMode === 'recurring' && Boolean(config.membershipChangeClosesCycle);
  }

  /** Nothing waits for a decision, so the cycle can be closed now. */
  private canCloseNow(built: Awaited<ReturnType<PoolService['buildSummary']>>): boolean {
    return !built._draws.some((d) => d.poolDraw?.status === 'pending')
      && !built._contributions.some((c) => c.kind === 'top_up' && c.status === 'initiated')
      && !built._advances.some((a) => a.status === 'initiated');
  }

  /**
   * The custodian holds the money: they must hand over before leaving. Someone holding pool money,
   * owed money for spends beyond it, or waiting on a hand-over, settles that first (decision D7),
   * unless the pool squares them up itself by closing the cycle now.
   */
  async assertCanLeave(eventId: string, userId: string): Promise<void> {
    const snap = await db.collection('events').doc(eventId).get();
    if (!snap.exists) return;
    const data = snap.data() || {};
    if (resolveFundingModel(data as any) === 'peer_to_peer') return;
    if (data.poolConfig?.custodianUserId === userId && data.status !== 'closed' && data.status !== 'settled') {
      throw new PoolError(409, 'The pool custodian cannot leave. Assign a new custodian first.', 'POOL_CUSTODIAN_LEAVING');
    }
    if (!data.poolConfig || data.status !== 'active') return;
    const event: EventRecord = { id: eventId, data };
    const config = data.poolConfig as PoolConfig;
    const cycle = await this.getCurrentCycle(eventId, event).catch(() => null);
    if (!cycle || cycle.status !== 'open') return;
    const built = await this.buildSummary(event, cycle);
    const ref = this.entityForUser(userId, built._groups);
    // Leaving a group doesn't take the group's money with them.
    const heldMinor = ref.entityType === 'user' ? built.holdings.heldBy[entityKey('user', userId)] || 0 : 0;
    const waiting = built._advances.some((a) => a.status === 'initiated' && (a.fromUserId === userId || a.toUserId === userId));
    if (heldMinor === 0 && !waiting) return;
    if (this.squaresUpLeavers(config) && this.canCloseNow(built)) return;
    const currency = cycle.currency;
    const message = waiting
      ? 'Money handed over to or by this person is waiting for confirmation. Confirm, reject or cancel it first.'
      : heldMinor > 0
        ? `This person still holds ${formatMinor(heldMinor, currency)} of pool money. It needs to be returned first.`
        : `The pool owes this person ${formatMinor(-heldMinor, currency)} for spends beyond the money they held. Give them that amount first.`;
    throw new PoolError(409, message, 'POOL_HOLDER_LEAVING', { heldMinor, waiting });
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
      if (!this.canCloseNow(built)) {
        // Can't reconcile with undecided draws, top-ups or hand-overs; fall back to a roster update.
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
      // Held money and pending hand-overs are with or owed by the current custodian (decision D8).
      const cycle = await this.getCurrentCycle(eventId, event).catch(() => null);
      if (cycle && cycle.status !== 'closed') {
        const built = await this.buildSummary(event, cycle);
        if (Object.keys(built.holdings.heldBy).length > 0 || built._advances.some((a) => a.status === 'initiated')) {
          throw new PoolError(409, 'Spenders still hold pool money, or a hand-over is waiting. Settle that before changing the custodian.', 'POOL_CUSTODIAN_CHANGE_BLOCKED');
        }
      }
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
