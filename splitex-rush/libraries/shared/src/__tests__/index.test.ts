import {
  UserRole,
  EventType,
  EventStatus,
  ExpenseType,
  SplitType,
  SettlementStatus,
  NotificationType,
  PaymentStatus,
  InvitationStatus,
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
  Invitation,
  CreateInvitationDto,
  UpdateEventDto,
  UpdateGroupDto,
  UpdateExpenseDto,
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

  it('EventStatus should have ACTIVE, PAYMENT, SETTLED, CLOSED', () => {
    expect(EventStatus.ACTIVE).toBe('active');
    expect(EventStatus.PAYMENT).toBe('payment');
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

  it('SettlementStatus should have PENDING, INITIATED, COMPLETED', () => {
    expect(SettlementStatus.PENDING).toBe('pending');
    expect(SettlementStatus.INITIATED).toBe('initiated');
    expect(SettlementStatus.COMPLETED).toBe('completed');
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

  it('InvitationStatus should have PENDING, ACCEPTED, DECLINED, EXPIRED', () => {
    expect(InvitationStatus.PENDING).toBe('pending');
    expect(InvitationStatus.ACCEPTED).toBe('accepted');
    expect(InvitationStatus.DECLINED).toBe('declined');
    expect(InvitationStatus.EXPIRED).toBe('expired');
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
      fromUserId: 'user-charlie',
      toUserId: 'user-1',
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

  it('should create a valid Invitation object', () => {
    const invitation: Invitation = {
      id: 'inv-1',
      eventId: 'event-1',
      invitedBy: 'user-1',
      inviteeEmail: 'friend@example.com',
      groupId: 'group-1',
      role: 'member',
      status: 'pending',
      token: 'abc123token',
      message: 'Join our trip!',
      emailSent: true,
      createdAt: new Date(),
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    };

    expect(invitation.id).toBe('inv-1');
    expect(invitation.status).toBe('pending');
    expect(invitation.token).toBe('abc123token');
    expect(invitation.inviteeEmail).toBe('friend@example.com');
    expect(invitation.groupId).toBe('group-1');
    expect(invitation.emailSent).toBe(true);
  });

  it('should create an Invitation without groupId (independent invitee)', () => {
    const invitation: Invitation = {
      id: 'inv-2',
      eventId: 'event-1',
      invitedBy: 'user-1',
      inviteeUserId: 'user-2',
      role: 'member',
      status: 'pending',
      token: 'xyz789token',
      createdAt: new Date(),
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    };

    expect(invitation.groupId).toBeUndefined();
    expect(invitation.emailSent).toBeUndefined();
    expect(invitation.emailError).toBeUndefined();
  });

  it('should create a valid CreateInvitationDto', () => {
    const dto: CreateInvitationDto = {
      eventId: 'event-1',
      inviteeEmail: 'friend@example.com',
      role: 'admin',
      message: 'Please join',
    };

    expect(dto.eventId).toBe('event-1');
    expect(dto.role).toBe('admin');
  });

  it('should create a CreateInvitationDto with groupId', () => {
    const dto: CreateInvitationDto = {
      eventId: 'event-1',
      inviteeEmail: 'friend@example.com',
      groupId: 'group-1',
      role: 'member',
    };

    expect(dto.groupId).toBe('group-1');
  });

  it('should create a valid UpdateEventDto', () => {
    const dto: UpdateEventDto = {
      name: 'Updated Name',
      status: 'settled',
    };

    expect(dto.name).toBe('Updated Name');
    expect(dto.status).toBe('settled');
  });

  it('should create a valid UpdateGroupDto', () => {
    const dto: UpdateGroupDto = {
      name: 'New Group Name',
      memberIds: ['u1', 'u2', 'u3'],
    };

    expect(dto.name).toBe('New Group Name');
    expect(dto.memberIds).toHaveLength(3);
  });

  it('should create a valid UpdateExpenseDto', () => {
    const dto: UpdateExpenseDto = {
      title: 'Updated Expense',
      amount: 150,
      splitType: 'custom',
    };

    expect(dto.title).toBe('Updated Expense');
    expect(dto.amount).toBe(150);
    expect(dto.splitType).toBe('custom');
  });

  it('should create a valid Group object', () => {
    const group: Group = {
      id: 'group-1',
      eventId: 'event-1',
      name: 'Family',
      description: 'My family',
      createdBy: 'user-1',
      members: ['user-1', 'user-2'],
      representative: 'user-1',
      payerUserId: 'user-1',
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    expect(group.id).toBe('group-1');
    expect(group.members).toHaveLength(2);
    expect(group.payerUserId).toBe('user-1');
  });

  it('should create a valid CreateGroupDto', () => {
    const dto: CreateGroupDto = {
      eventId: 'event-1',
      name: 'Couple',
      memberIds: ['u1', 'u2'],
      payerUserId: 'u1',
    };

    expect(dto.name).toBe('Couple');
    expect(dto.memberIds).toEqual(['u1', 'u2']);
  });

  it('should create a valid EventParticipant', () => {
    const participant: EventParticipant = {
      userId: 'user-1',
      role: 'admin',
      joinedAt: new Date(),
      invitedBy: 'user-1',
      status: 'accepted',
    };

    expect(participant.role).toBe('admin');
    expect(participant.status).toBe('accepted');
  });
});
