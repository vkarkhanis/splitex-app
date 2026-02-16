// User Types
export interface User {
  id: string;
  email: string;
  phoneNumber: string;
  displayName: string;
  photoURL?: string;
  authProviders: ('google' | 'microsoft' | 'phone')[];
  preferences: UserPreferences;
  createdAt: Date;
  updatedAt: Date;
}

export interface UserPreferences {
  notifications: boolean;
  currency: string;
  timezone: string;
}

export interface UserProfile {
  userId: string;
  displayName: string;
  email: string;
  phoneNumber?: string;
  photoURL?: string;
  preferences: UserPreferences;
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
  status: 'active' | 'payment' | 'settled' | 'closed';
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
}

export interface CreateEventDto {
  name: string;
  description?: string;
  type: 'trip' | 'event';
  startDate: Date;
  endDate?: Date;
  currency: string;
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

// Expense Types
export interface Expense {
  id: string;
  eventId: string;
  title: string;
  description?: string;
  amount: number;
  currency: string;
  paidBy: string;
  paidOnBehalfOf?: string;
  paidOnBehalfOfType?: 'user' | 'group';
  isPrivate: boolean;
  splitType: 'equal' | 'ratio' | 'custom';
  splits: ExpenseSplit[];
  selectedEntities?: SplitEntity[];
  attachments: string[];
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
  paidOnBehalfOf?: string;
  paidOnBehalfOfType?: 'user' | 'group';
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
  amount: number;
  currency: string;
  status: 'pending' | 'initiated' | 'completed';
  paymentMethod?: string;
  paymentId?: string;
  initiatedAt?: Date;
  createdAt: Date;
  completedAt?: Date;
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
  status?: 'active' | 'payment' | 'settled' | 'closed';
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
  paidOnBehalfOf?: string;
  paidOnBehalfOfType?: 'user' | 'group';
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

// API Response Types
export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
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
