export { isStrongPassword, PASSWORD_RULE_MESSAGE } from './passwordRules';
export * from './pool';
export * from './pool-math';
export * from './pool-ui';
import type {
  CreatePoolConfigDto,
  EventFundingModel,
  ExpenseFundingSource,
  PoolConfig,
  PoolDrawState,
  PoolExpenseFlag,
} from './pool';

// User Types
export interface User {
  id: string;
  email: string;
  phoneNumber: string;
  displayName: string;
  photoURL?: string;
  authProviders: ('email' | 'google' | 'microsoft' | 'phone')[];
  preferences: UserPreferences;
  createdAt: Date;
  updatedAt: Date;
}

export interface UserPreferences {
  notifications: boolean;
  currency: string;
  timezone: string;
}

export type PlanTier = 'free' | 'pro';
export type EntitlementStatus = 'active' | 'grace_period' | 'billing_retry' | 'expired' | 'revoked';
export type EntitlementSource = 'revenuecat' | 'manual_override' | 'system';

export interface UserCapabilities {
  multiCurrencySettlement: boolean;
}

/**
 * Pro that is paid up (or inside the store's grace period). The API applies this one rule to
 * every Pro limit; apps use it on profile data so they never offer what the API will refuse.
 * A lapsed subscription can still read `tier: 'pro'` with status `expired`.
 */
export function hasActivePro(entitlement: {
  tier?: string | null;
  entitlementStatus?: string | null;
}): boolean {
  if (entitlement.tier !== 'pro') return false;
  const status = entitlement.entitlementStatus || 'active';
  return status === 'active' || status === 'grace_period';
}

export type PaymentMethodType = 'upi' | 'bank' | 'paypal' | 'wise' | 'swift' | 'other';

export interface UserPaymentMethod {
  id: string;
  label: string;
  currency: string;
  type: PaymentMethodType;
  details: string;
  isActive: boolean;
  createdAt?: Date | string;
  updatedAt?: Date | string;
}

export interface UserProfile {
  userId: string;
  displayName: string;
  email: string;
  phoneNumber?: string;
  photoURL?: string;
  authProviders?: ('email' | 'google' | 'microsoft' | 'phone')[];
  hasPassword?: boolean;
  tier: PlanTier;
  entitlementStatus: EntitlementStatus;
  entitlementExpiresAt?: Date | string | null;
  entitlementSource?: EntitlementSource;
  internalTester?: boolean;
  capabilities: UserCapabilities;
  preferences: UserPreferences;
  paymentMethods?: UserPaymentMethod[];
}

// Event Types
export interface Event {
  id: string;
  name: string;
  description?: string;
  type: 'trip' | 'event';
  startDate: Date;
  endDate?: Date;
  currency: string;
  /** Currency in which settlements are made (defaults to event currency) */
  settlementCurrency?: string;
  /** How FX rates are determined: 'predefined' = set at event creation, 'eod' = latest EOD rate at settlement time */
  fxRateMode?: 'predefined' | 'eod';
  /** Predefined FX rates: key = "FROM_TO" (e.g. "USD_INR"), value = rate */
  predefinedFxRates?: Record<string, number>;
  status: 'active' | 'review' | 'payment' | 'settled' | 'closed';
  /** Per-entity approval status for settlement review phase */
  settlementApprovals?: Record<string, SettlementApproval>;
  /** True when expenses have been modified after settlement generation but before all approvals */
  settlementStale?: boolean;
  /** Absent ⇒ 'peer_to_peer'. Never written on peer-to-peer events. */
  fundingModel?: EventFundingModel;
  /** Present only when fundingModel is 'pool' or 'hybrid'. */
  poolConfig?: PoolConfig;
  createdBy: string;
  admins: string[];
  createdAt: Date;
  updatedAt: Date;
}

export interface EventParticipant {
  userId: string;
  displayName?: string;
  email?: string;
  groupId?: string;
  role: 'admin' | 'member';
  joinedAt: Date;
  invitedBy: string;
  status: 'pending' | 'accepted' | 'declined';
  /** The account was deleted; the record stays (anonymised) because expenses and payments refer to it. */
  deleted?: boolean;
}

/** Shown to other participants in place of a deleted account's name. */
export const DELETED_USER_NAME = 'Deleted user';

export interface SettlementApproval {
  approved: boolean;
  approvedAt?: string;
  entityType: 'user' | 'group';
  displayName?: string;
}

export interface CreateEventDto {
  name: string;
  description?: string;
  type: 'trip' | 'event';
  startDate: Date;
  endDate?: Date;
  currency: string;
  settlementCurrency?: string;
  fxRateMode?: 'predefined' | 'eod';
  predefinedFxRates?: Record<string, number>;
  /** Omit for today's split-expenses behaviour. */
  fundingModel?: EventFundingModel;
  pool?: CreatePoolConfigDto;
}

export interface ParticipantDto {
  userId: string;
  role?: 'admin' | 'member';
}

// Group Types
export interface Group {
  id: string;
  eventId: string;
  eventIds?: string[];
  name: string;
  description?: string;
  createdBy: string;
  members: string[];
  representative: string;
  payerUserId: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateGroupDto {
  eventId: string;
  name: string;
  description?: string;
  memberIds: string[];
  payerUserId: string;
  representative?: string;
}

// On Behalf Of: payer fronts money for one or more entities; payer's share = 0
export interface OnBehalfOfEntry {
  entityId: string;
  entityType: 'user' | 'group';
}

// Expense Types
export interface Expense {
  id: string;
  eventId: string;
  title: string;
  description?: string;
  amount: number;
  currency: string;
  paidBy: string;
  /** Entities the payer is fronting money for. When set, payer's own split = 0. */
  paidOnBehalfOf?: OnBehalfOfEntry[];
  isPrivate: boolean;
  splitType: 'equal' | 'ratio' | 'custom';
  splits: ExpenseSplit[];
  selectedEntities?: SplitEntity[];
  attachments: string[];
  /** Absent ⇒ 'self' (today's behaviour). */
  fundingSource?: ExpenseFundingSource;
  poolCycleId?: string;
  /** Approval state for pool-funded expenses. Only approved draws deduct. */
  poolDraw?: PoolDrawState;
  /** Limits this expense breached when it was recorded after the fact. */
  poolFlags?: PoolExpenseFlag[];
  createdAt: Date;
  updatedAt: Date;
}

export interface SplitEntity {
  entityType: 'user' | 'group';
  entityId: string;
  name?: string;
}

export interface ExpenseSplit {
  entityType: 'user' | 'group';
  entityId: string;
  amount: number;
  ratio?: number;
}

export interface CreateExpenseDto {
  eventId: string;
  title: string;
  description?: string;
  amount: number;
  currency: string;
  splitType: 'equal' | 'ratio' | 'custom';
  splits: ExpenseSplit[];
  selectedEntities?: SplitEntity[];
  attachments?: string[];
  isPrivate?: boolean;
  paidOnBehalfOf?: OnBehalfOfEntry[];
  /** Omit for 'self'. Pool events require 'pool' or 'pool_reimbursement'. */
  fundingSource?: ExpenseFundingSource;
  /**
   * Pool draws: true when the money has already been spent. Such draws are
   * always recorded (and flagged) even past the overdraft limit.
   */
  alreadyIncurred?: boolean;
}

// Settlement Types
export interface Balance {
  entityId: string;
  entityType: 'user' | 'group';
  amount: number;
}

export interface Settlement {
  id: string;
  eventId: string;
  fromEntityId: string;
  fromEntityType: 'user' | 'group';
  toEntityId: string;
  toEntityType: 'user' | 'group';
  /** The actual user who must pay (for groups, this is the group payer) */
  fromUserId: string;
  /** The actual user who receives payment (for groups, this is the group payer) */
  toUserId: string;
  /** Amount in the event's expense currency */
  amount: number;
  currency: string;
  /** Amount converted to settlement currency (if different from expense currency) */
  settlementAmount?: number;
  /** The settlement currency (if different from expense currency) */
  settlementCurrency?: string;
  /** FX rate used for conversion (expenseCurrency → settlementCurrency) */
  fxRate?: number;
  status: 'pending' | 'initiated' | 'failed' | 'completed';
  paymentMethod?: string;
  paymentId?: string;
  paymentReference?: string;
  payerNote?: string;
  proofUrl?: string;
  checkoutUrl?: string;
  failureReason?: string;
  rejectionReason?: string;
  retryCount?: number;
  payerMarkedAt?: Date;
  payeeConfirmedAt?: Date;
  rejectedAt?: Date;
  payeePaymentMethods?: UserPaymentMethod[];
  auditTrail?: SettlementAuditEntry[];
  /**
   * Absent ⇒ 'standard' (part of the event's settlement plan). Pool legs live
   * alongside the plan without driving the event lifecycle.
   */
  kind?: SettlementKind;
  poolCycleId?: string;
  /** pool_reimbursement: the expense being reimbursed. */
  expenseId?: string;
  initiatedAt?: Date;
  createdAt: Date;
  failedAt?: Date;
  completedAt?: Date;
}

export type SettlementKind = 'standard' | 'pool_reimbursement' | 'pool_cycle' | 'pool_member_exit';

/** Legs that belong to an active pool rather than the event's final settlement. */
export function isPoolSideLeg(settlement: { kind?: SettlementKind | null } | null | undefined): boolean {
  const kind = settlement?.kind ?? 'standard';
  return kind === 'pool_reimbursement' || kind === 'pool_cycle' || kind === 'pool_member_exit';
}

type PoolLegLike = Pick<Settlement, 'kind' | 'status' | 'fromUserId' | 'toUserId'>;

/** Pool payments waiting on a user: ones they must pay, and ones paid to them awaiting their confirmation. */
export function poolPaymentActions<T extends PoolLegLike>(
  settlements: T[],
  userId: string | null | undefined,
): { toPay: T[]; toConfirm: T[] } {
  const legs = userId ? settlements.filter((s) => isPoolSideLeg(s)) : [];
  return {
    toPay: legs.filter((s) => s.fromUserId === userId && (s.status === 'pending' || s.status === 'failed')),
    toConfirm: legs.filter((s) => s.toUserId === userId && s.status === 'initiated'),
  };
}

/**
 * Credit that ExchangeRate-API's free service (open.er-api.com, the API's end-of-day
 * rates) requires on every page that shows its rates.
 */
export const FX_RATES_ATTRIBUTION = {
  text: 'Rates By Exchange Rate API',
  url: 'https://www.exchangerate-api.com',
} as const;

/**
 * Whether any of these settlement legs shows a rate from the end-of-day provider, so the
 * page needs FX_RATES_ATTRIBUTION. Mirrors the API: a predefined event uses the group's own
 * rate for a pair it set (either direction) and the provider for any other pair.
 */
export function showsProviderFxRates(
  event: { fxRateMode?: 'predefined' | 'eod'; predefinedFxRates?: Record<string, number> } | null | undefined,
  legs: Array<Pick<Settlement, 'currency' | 'settlementCurrency' | 'fxRate'>>,
): boolean {
  return legs.some((leg) => {
    if (typeof leg.fxRate !== 'number' || !leg.settlementCurrency || leg.settlementCurrency === leg.currency) {
      return false;
    }
    if (event?.fxRateMode !== 'predefined') return true;
    const rates = event.predefinedFxRates ?? {};
    return !rates[`${leg.currency}_${leg.settlementCurrency}`] && !rates[`${leg.settlementCurrency}_${leg.currency}`];
  });
}

export interface SettlementAuditEntry {
  id: string;
  action: 'created' | 'marked_paid' | 'confirmed' | 'rejected' | 'retry_requested';
  actorUserId: string;
  note?: string;
  referenceId?: string;
  proofUrl?: string;
  statusFrom?: string;
  statusTo?: string;
  createdAt: string;
}

export interface SettlementPlan {
  eventId: string;
  settlements: Settlement[];
  totalTransactions: number;
  totalAmount: number;
}

export interface CreateSettlementDto {
  eventId: string;
  fromEntityId: string;
  fromEntityType: 'user' | 'group';
  toEntityId: string;
  toEntityType: 'user' | 'group';
  amount: number;
  currency: string;
}

// Notification Types
export interface Notification {
  id: string;
  userId: string;
  type: 'expense_added' | 'settlement_requested' | 'event_closed' | 'invitation';
  title: string;
  message: string;
  data?: Record<string, any>;
  read: boolean;
  createdAt: Date;
}

export interface NotificationData {
  [key: string]: any;
}

// Payment Types
export interface PaymentIntent {
  id: string;
  settlementId: string;
  amount: number;
  currency: string;
  status: 'pending' | 'processing' | 'succeeded' | 'failed';
  clientSecret?: string;
}

export interface PaymentResult {
  success: boolean;
  paymentId?: string;
  error?: string;
}

export interface UPIData {
  vpa: string;
  amount: number;
  currency: string;
}

export interface CardData {
  number: string;
  expMonth: number;
  expYear: number;
  cvc: string;
  name: string;
}

export interface PaymentMethod {
  id: string;
  type: 'card' | 'upi' | 'bank_account';
  details: CardData | UPIData | any;
  isDefault: boolean;
}

// Invitation Types
export interface Invitation {
  id: string;
  eventId: string;
  invitedBy: string;
  inviteeEmail?: string;
  inviteePhone?: string;
  inviteeUserId?: string;
  groupId?: string;
  role: 'admin' | 'member';
  status: 'pending' | 'accepted' | 'declined' | 'expired';
  token: string;
  message?: string;
  emailSent?: boolean;
  emailError?: string;
  createdAt: Date;
  expiresAt: Date;
  respondedAt?: Date;
}

export interface CreateInvitationDto {
  eventId: string;
  inviteeEmail?: string;
  inviteePhone?: string;
  inviteeUserId?: string;
  groupId?: string;
  role?: 'admin' | 'member';
  message?: string;
}

export interface UpdateEventDto {
  name?: string;
  description?: string;
  type?: 'trip' | 'event';
  startDate?: Date;
  endDate?: Date;
  currency?: string;
  settlementCurrency?: string;
  fxRateMode?: 'predefined' | 'eod';
  predefinedFxRates?: Record<string, number>;
  status?: 'active' | 'review' | 'payment' | 'settled' | 'closed';
  settlementApprovals?: Record<string, SettlementApproval>;
  settlementStale?: boolean;
}

export interface UpdateGroupDto {
  name?: string;
  description?: string;
  memberIds?: string[];
  payerUserId?: string;
  representative?: string;
}

export interface UpdateExpenseDto {
  title?: string;
  description?: string;
  amount?: number;
  currency?: string;
  splitType?: 'equal' | 'ratio' | 'custom';
  splits?: ExpenseSplit[];
  selectedEntities?: SplitEntity[];
  attachments?: string[];
  isPrivate?: boolean;
  paidOnBehalfOf?: OnBehalfOfEntry[] | null;
  /** Pool draws: see CreateExpenseDto.alreadyIncurred. */
  alreadyIncurred?: boolean;
}

export enum InvitationStatus {
  PENDING = 'pending',
  ACCEPTED = 'accepted',
  DECLINED = 'declined',
  EXPIRED = 'expired'
}

// Enums
export enum UserRole {
  ADMIN = 'admin',
  MEMBER = 'member'
}

export enum EventType {
  TRIP = 'trip',
  EVENT = 'event'
}

export enum EventStatus {
  ACTIVE = 'active',
  REVIEW = 'review',
  PAYMENT = 'payment',
  SETTLED = 'settled',
  CLOSED = 'closed'
}

export enum ExpenseType {
  SHARED = 'shared',
  PRIVATE = 'private'
}

export enum SplitType {
  EQUAL = 'equal',
  RATIO = 'ratio',
  CUSTOM = 'custom'
}

export enum SettlementStatus {
  PENDING = 'pending',
  INITIATED = 'initiated',
  FAILED = 'failed',
  COMPLETED = 'completed'
}

export enum NotificationType {
  EXPENSE_ADDED = 'expense_added',
  EXPENSE_UPDATED = 'expense_updated',
  EXPENSE_DELETED = 'expense_deleted',
  SETTLEMENT_REQUESTED = 'settlement_requested',
  SETTLEMENT_CALCULATED = 'settlement_calculated',
  EVENT_CLOSED = 'event_closed',
  EVENT_DELETED = 'event_deleted',
  GROUP_DELETED = 'group_deleted',
  INVITATION = 'invitation'
}

export enum PaymentStatus {
  PENDING = 'pending',
  PROCESSING = 'processing',
  SUCCEEDED = 'succeeded',
  FAILED = 'failed'
}

export enum FxRateMode {
  PREDEFINED = 'predefined',
  EOD = 'eod'
}

/** Supported currencies */
export const SUPPORTED_CURRENCIES = ['USD', 'EUR', 'GBP', 'INR', 'JPY', 'AUD', 'CAD'] as const;
export type SupportedCurrency = typeof SUPPORTED_CURRENCIES[number];

export interface FxRate {
  from: string;
  to: string;
  rate: number;
  date: string; // ISO date
  source: 'predefined' | 'eod';
}

/** Payment provider routing: determines which gateway to use based on settlement currency */
export enum PaymentProvider {
  RAZORPAY = 'razorpay',  // INR settlements in India
  BILLDESK = 'billdesk',  // INR settlements (pending approval)
  STRIPE = 'stripe',       // International transfers
}

// API Response Types
export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
  code?: string;
  feature?: string;
}

export interface PaginatedResponse<T> extends ApiResponse<T[]> {
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

// Token Types
export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

// Validation Types
export interface ValidationError {
  field: string;
  message: string;
}

export interface LoginRequest {
  identifier: string; // email or phone
  password?: string;
  otp?: string;
  provider?: 'google' | 'microsoft' | 'phone';
}

export interface RegisterRequest {
  email: string;
  phoneNumber: string;
  displayName: string;
  password?: string;
  provider?: 'google' | 'microsoft' | 'phone';
}
