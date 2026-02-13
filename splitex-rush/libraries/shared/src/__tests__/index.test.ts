import {
  UserRole,
  EventType,
  EventStatus,
  ExpenseType,
  SplitType,
  SettlementStatus,
  NotificationType,
  PaymentStatus,
} from '../index';

import type {
  User,
  UserPreferences,
  UserProfile,
  Event,
  EventParticipant,
  CreateEventDto,
  Group,
  CreateGroupDto,
  Expense,
  ExpenseSplit,
  CreateExpenseDto,
  Balance,
  Settlement,
  SettlementPlan,
  CreateSettlementDto,
  Notification,
  PaymentIntent,
  PaymentResult,
  PaymentMethod,
  ApiResponse,
  PaginatedResponse,
  TokenPair,
  ValidationError,
  LoginRequest,
  RegisterRequest,
} from '../index';

describe('Shared types - Enums', () => {
  it('UserRole should have ADMIN and MEMBER', () => {
    expect(UserRole.ADMIN).toBe('admin');
    expect(UserRole.MEMBER).toBe('member');
  });

  it('EventType should have TRIP and EVENT', () => {
    expect(EventType.TRIP).toBe('trip');
    expect(EventType.EVENT).toBe('event');
  });

  it('EventStatus should have ACTIVE, SETTLED, CLOSED', () => {
    expect(EventStatus.ACTIVE).toBe('active');
    expect(EventStatus.SETTLED).toBe('settled');
    expect(EventStatus.CLOSED).toBe('closed');
  });

  it('ExpenseType should have SHARED and PRIVATE', () => {
    expect(ExpenseType.SHARED).toBe('shared');
    expect(ExpenseType.PRIVATE).toBe('private');
  });

  it('SplitType should have EQUAL, RATIO, CUSTOM', () => {
    expect(SplitType.EQUAL).toBe('equal');
    expect(SplitType.RATIO).toBe('ratio');
    expect(SplitType.CUSTOM).toBe('custom');
  });

  it('SettlementStatus should have PENDING, PROCESSING, COMPLETED, FAILED', () => {
    expect(SettlementStatus.PENDING).toBe('pending');
    expect(SettlementStatus.PROCESSING).toBe('processing');
    expect(SettlementStatus.COMPLETED).toBe('completed');
    expect(SettlementStatus.FAILED).toBe('failed');
  });

  it('NotificationType should have all notification types', () => {
    expect(NotificationType.EXPENSE_ADDED).toBe('expense_added');
    expect(NotificationType.SETTLEMENT_REQUESTED).toBe('settlement_requested');
    expect(NotificationType.EVENT_CLOSED).toBe('event_closed');
    expect(NotificationType.INVITATION).toBe('invitation');
  });

  it('PaymentStatus should have PENDING, PROCESSING, SUCCEEDED, FAILED', () => {
    expect(PaymentStatus.PENDING).toBe('pending');
    expect(PaymentStatus.PROCESSING).toBe('processing');
    expect(PaymentStatus.SUCCEEDED).toBe('succeeded');
    expect(PaymentStatus.FAILED).toBe('failed');
  });
});

describe('Shared types - Type shape validation', () => {
  it('should create a valid User object', () => {
    const user: User = {
      id: 'user-1',
      email: 'test@example.com',
      phoneNumber: '+1234567890',
      displayName: 'Test User',
      photoURL: 'https://example.com/photo.jpg',
      authProviders: ['google'],
      preferences: {
        notifications: true,
        currency: 'USD',
        timezone: 'UTC'
      },
      createdAt: new Date(),
      updatedAt: new Date()
    };

    expect(user.id).toBe('user-1');
    expect(user.authProviders).toContain('google');
    expect(user.preferences.currency).toBe('USD');
  });

  it('should create a valid UserProfile object', () => {
    const profile: UserProfile = {
      userId: 'user-1',
      displayName: 'Test User',
      email: 'test@example.com',
      phoneNumber: '+1234567890',
      photoURL: 'https://example.com/photo.jpg',
      preferences: {
        notifications: true,
        currency: 'INR',
        timezone: 'Asia/Kolkata'
      }
    };

    expect(profile.userId).toBe('user-1');
    expect(profile.preferences.currency).toBe('INR');
  });

  it('should create a valid Event object', () => {
    const event: Event = {
      id: 'event-1',
      name: 'Goa Trip',
      description: 'Annual trip',
      type: 'trip',
      startDate: new Date(),
      endDate: new Date(),
      currency: 'INR',
      status: 'active',
      createdBy: 'user-1',
      admins: ['user-1'],
      createdAt: new Date(),
      updatedAt: new Date()
    };

    expect(event.id).toBe('event-1');
    expect(event.type).toBe('trip');
    expect(event.status).toBe('active');
  });

  it('should create a valid Expense with splits', () => {
    const expense: Expense = {
      id: 'expense-1',
      eventId: 'event-1',
      title: 'Hotel',
      description: 'Hotel booking',
      amount: 300,
      currency: 'USD',
      paidBy: 'user-1',
      isPrivate: false,
      splitType: 'equal',
      splits: [
        { entityType: 'user', entityId: 'user-1', amount: 100 },
        { entityType: 'user', entityId: 'user-2', amount: 100 },
        { entityType: 'group', entityId: 'group-1', amount: 100 }
      ],
      attachments: [],
      createdAt: new Date(),
      updatedAt: new Date()
    };

    expect(expense.splits).toHaveLength(3);
    expect(expense.splits[2].entityType).toBe('group');
    expect(expense.amount).toBe(300);
  });

  it('should create a valid Settlement object', () => {
    const settlement: Settlement = {
      id: 'settlement-1',
      eventId: 'event-1',
      fromEntityId: 'group-1',
      fromEntityType: 'group',
      toEntityId: 'user-1',
      toEntityType: 'user',
      amount: 216.67,
      currency: 'USD',
      status: 'pending',
      createdAt: new Date()
    };

    expect(settlement.fromEntityType).toBe('group');
    expect(settlement.toEntityType).toBe('user');
    expect(settlement.status).toBe('pending');
  });

  it('should create a valid ApiResponse', () => {
    const success: ApiResponse<{ name: string }> = {
      success: true,
      data: { name: 'test' }
    };

    const failure: ApiResponse = {
      success: false,
      error: 'Something went wrong'
    };

    expect(success.success).toBe(true);
    expect(success.data?.name).toBe('test');
    expect(failure.success).toBe(false);
    expect(failure.error).toBe('Something went wrong');
  });

  it('should create a valid TokenPair', () => {
    const tokens: TokenPair = {
      accessToken: 'access-token-xyz',
      refreshToken: 'refresh-token-abc',
      expiresIn: 3600
    };

    expect(tokens.accessToken).toBe('access-token-xyz');
    expect(tokens.expiresIn).toBe(3600);
  });

  it('should create a valid LoginRequest', () => {
    const loginPhone: LoginRequest = {
      identifier: '+1234567890',
      otp: '123456',
      provider: 'phone'
    };

    const loginGoogle: LoginRequest = {
      identifier: 'user@example.com',
      provider: 'google'
    };

    expect(loginPhone.provider).toBe('phone');
    expect(loginGoogle.provider).toBe('google');
  });

  it('should create a valid RegisterRequest', () => {
    const register: RegisterRequest = {
      email: 'new@example.com',
      phoneNumber: '+1234567890',
      displayName: 'New User',
      password: 'securepassword',
      provider: 'phone'
    };

    expect(register.email).toBe('new@example.com');
    expect(register.displayName).toBe('New User');
  });
});
