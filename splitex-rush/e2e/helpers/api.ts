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

export async function createTestEvent(token: string = 'mock-e2e-user') {
  return apiRequest('POST', '/api/events', {
    name: 'E2E Test Event',
    description: 'Created by E2E test',
    type: 'trip',
    startDate: new Date().toISOString(),
    currency: 'USD',
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
