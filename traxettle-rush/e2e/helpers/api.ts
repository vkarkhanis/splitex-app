/**
 * Shared API helper for E2E tests - makes direct API calls to seed/verify data.
 */

const API_BASE = 'http://localhost:3001';

export async function apiRequest(
  method: string,
  path: string,
  body?: any,
  token: string = 'mock-e2e-user'
): Promise<any> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
  };

  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  return res.json();
}

export async function apiRequestWithStatus(
  method: string,
  path: string,
  body?: any,
  token: string = 'mock-e2e-user'
): Promise<{ status: number; body: any }> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
  };

  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  return {
    status: res.status,
    body: await res.json(),
  };
}

interface CreateTestEventOptions {
  name?: string;
  currency?: string;
  settlementCurrency?: string;
  fxRateMode?: 'eod' | 'predefined';
  predefinedFxRates?: Record<string, number>;
}

export async function createTestEvent(
  token: string = 'mock-e2e-user',
  options: CreateTestEventOptions = {}
) {
  const startDate = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

  return apiRequest('POST', '/api/events', {
    name: options.name || `E2E Test Event ${Date.now()}`,
    description: 'Created by E2E test',
    type: 'trip',
    startDate,
    currency: options.currency || 'USD',
    ...(options.settlementCurrency ? { settlementCurrency: options.settlementCurrency } : {}),
    ...(options.fxRateMode ? { fxRateMode: options.fxRateMode } : {}),
    ...(options.predefinedFxRates ? { predefinedFxRates: options.predefinedFxRates } : {}),
  }, token);
}

export async function createTestExpense(eventId: string, token: string = 'mock-e2e-user') {
  return apiRequest('POST', '/api/expenses', {
    eventId,
    title: 'E2E Test Expense',
    description: 'Created by E2E test',
    amount: 100,
    currency: 'USD',
    splitType: 'equal',
    splits: [
      { entityType: 'user', entityId: token, amount: 50 },
      { entityType: 'user', entityId: 'mock-e2e-user-2', amount: 50 },
    ],
  }, token);
}

export async function createTestGroup(eventId: string, token: string = 'mock-e2e-user') {
  return apiRequest('POST', '/api/groups', {
    eventId,
    name: 'E2E Test Group',
    description: 'Created by E2E test',
    memberIds: [token, 'mock-e2e-user-2'],
    payerUserId: token,
  }, token);
}

export async function createTestInvitation(eventId: string, email: string = 'e2e-invitee@test.com', token: string = 'mock-e2e-user') {
  return apiRequest('POST', '/api/invitations', {
    eventId,
    inviteeEmail: email,
    role: 'member',
    message: 'E2E test invitation',
  }, token);
}

export async function getInvitationByToken(invitationToken: string): Promise<any> {
  const res = await fetch(`${API_BASE}/api/invitations/token/${invitationToken}`);
  return res.json();
}

export async function getEventInvitations(eventId: string, token: string = 'mock-e2e-user') {
  return apiRequest('GET', `/api/invitations/event/${eventId}`, undefined, token);
}

export async function acceptInvitation(invitationId: string, token: string) {
  return apiRequest('POST', `/api/invitations/${invitationId}/accept`, undefined, token);
}

export async function declineInvitation(invitationId: string, token: string) {
  return apiRequest('POST', `/api/invitations/${invitationId}/decline`, undefined, token);
}

export async function addParticipantToEvent(eventId: string, userId: string, token: string = 'mock-e2e-user') {
  return apiRequest('POST', `/api/events/${eventId}/participants`, { userId, role: 'member' }, token);
}

export async function createSplitExpense(
  eventId: string,
  payerToken: string,
  splits: Array<{ entityType: 'user' | 'group'; entityId: string; amount: number }>,
  amount: number = 100,
  currency: string = 'USD',
) {
  return apiRequest('POST', '/api/expenses', {
    eventId,
    title: `Settlement Expense ${Date.now()}`,
    description: 'Settlement flow E2E expense',
    amount,
    currency,
    splitType: 'custom',
    isPrivate: false,
    splits,
  }, payerToken);
}

export async function generateSettlement(eventId: string, token: string) {
  return apiRequest('POST', `/api/settlements/event/${eventId}/generate`, {}, token);
}

export async function getEventSettlements(eventId: string, token: string) {
  return apiRequest('GET', `/api/settlements/event/${eventId}`, undefined, token);
}

export async function paySettlement(settlementId: string, token: string, useRealGateway: boolean = false) {
  return apiRequest('POST', `/api/settlements/${settlementId}/pay`, { useRealGateway }, token);
}

export async function retrySettlement(settlementId: string, token: string, useRealGateway: boolean = false) {
  return apiRequest('POST', `/api/settlements/${settlementId}/retry`, { useRealGateway }, token);
}

export async function approveSettlement(settlementId: string, token: string) {
  return apiRequest('POST', `/api/settlements/${settlementId}/approve`, {}, token);
}

export async function switchTier(
  token: string,
  tier: 'free' | 'pro',
  userId?: string
) {
  return apiRequestWithStatus('POST', '/api/internal/entitlements/switch', {
    tier,
    ...(userId ? { userId } : {}),
  }, token);
}
