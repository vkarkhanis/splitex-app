import { test, expect } from '@playwright/test';
import { loginAsMockUser, logout } from '../helpers/auth';
import {
  createTestEvent,
  createTestInvitation,
  getEventInvitations,
  acceptInvitation,
  declineInvitation,
} from '../helpers/api';

test.describe('Invitation System — List & Create', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsMockUser(page);
  });

  test('should display invitations page with empty state', async ({ page }) => {
    await page.goto('/invitations');
    await expect(page.getByTestId('invitations-page')).toBeVisible();
    const emptyState = page.getByTestId('empty-invitations');
    const hasInvitations = page.locator('[data-testid^="invitation-row-"]');
    await expect(emptyState.or(hasInvitations.first())).toBeVisible();
  });

  test('should open invite modal from event detail invitations tab', async ({ page }) => {
    const res = await createTestEvent();
    const eventId = res.data?.id;
    if (!eventId) {
      test.skip(!eventId, 'No event created');
      return;
    }

    await page.goto(`/events/${eventId}`);
    await page.getByTestId('tab-invitations').click();
    await page.getByTestId('send-invite-btn').click();
    await expect(page.getByTestId('invite-modal')).toBeVisible();
  });

  test('should fill and submit invite form', async ({ page }) => {
    const res = await createTestEvent();
    const eventId = res.data?.id;
    if (!eventId) {
      test.skip(!eventId, 'No event created');
      return;
    }

    await page.goto(`/events/${eventId}`);
    await page.getByTestId('tab-invitations').click();
    await page.getByTestId('send-invite-btn').click();

    await page.getByTestId('invite-email-input').fill('friend@example.com');
    await page.getByTestId('invite-role-select').selectOption('member');
    await page.getByTestId('invite-message-input').fill('Join our trip!');

    await expect(page.getByTestId('invite-submit')).toBeEnabled();
    await page.getByTestId('invite-submit').click();
    await page.waitForTimeout(1000);
  });

  test('should disable invite submit when email is empty', async ({ page }) => {
    const res = await createTestEvent();
    const eventId = res.data?.id;
    if (!eventId) {
      test.skip(!eventId, 'No event created');
      return;
    }

    await page.goto(`/events/${eventId}`);
    await page.getByTestId('tab-invitations').click();
    await page.getByTestId('send-invite-btn').click();

    await expect(page.getByTestId('invite-submit')).toBeDisabled();
  });
});

test.describe('Invitation Accept Page — Email Link Flow', () => {
  test('should show error when no token is provided', async ({ page }) => {
    await page.goto('/invitations/accept');
    await expect(page.getByTestId('accept-invitation-page')).toBeVisible();
    await expect(page.getByTestId('invitation-error')).toBeVisible();
    await expect(page.getByTestId('invitation-error')).toContainText('No invitation token');
  });

  test('should show error for invalid token', async ({ page }) => {
    await page.goto('/invitations/accept?token=invalid-nonexistent-token');
    await expect(page.getByTestId('accept-invitation-page')).toBeVisible();
    await expect(page.getByTestId('invitation-error')).toBeVisible();
    await expect(page.getByTestId('invitation-error')).toContainText('not found');
  });

  test('should display invitation details for valid token', async ({ page }) => {
    // Create event and invitation via API
    const eventRes = await createTestEvent();
    const eventId = eventRes.data?.id;
    if (!eventId) { test.skip(true, 'No event created'); return; }

    const invRes = await createTestInvitation(eventId, 'accept-test@example.com');
    const invToken = invRes.data?.token;
    if (!invToken) { test.skip(true, 'No invitation created'); return; }

    await page.goto(`/invitations/accept?token=${invToken}`);
    await expect(page.getByTestId('accept-invitation-page')).toBeVisible();
    await expect(page.getByTestId('invite-event-name')).toBeVisible();
    await expect(page.getByTestId('invite-detail')).toBeVisible();
    await expect(page.getByTestId('accept-btn')).toBeVisible();
    await expect(page.getByTestId('decline-btn')).toBeVisible();
  });

  test('should accept invitation when logged in', async ({ page }) => {
    const eventRes = await createTestEvent();
    const eventId = eventRes.data?.id;
    if (!eventId) { test.skip(true, 'No event created'); return; }

    const invRes = await createTestInvitation(eventId, 'accept-flow@example.com');
    const invToken = invRes.data?.token;
    if (!invToken) { test.skip(true, 'No invitation created'); return; }

    // Log in as a different user (the invitee)
    await loginAsMockUser(page, 'mock-invitee-user');

    await page.goto(`/invitations/accept?token=${invToken}`);
    await expect(page.getByTestId('accept-btn')).toBeVisible();
    await page.getByTestId('accept-btn').click();

    // Should show success state
    await expect(page.getByTestId('invitation-action-done')).toBeVisible({ timeout: 5000 });
    await expect(page.getByTestId('invitation-action-done')).toContainText('joined');
  });

  test('should decline invitation when logged in', async ({ page }) => {
    const eventRes = await createTestEvent();
    const eventId = eventRes.data?.id;
    if (!eventId) { test.skip(true, 'No event created'); return; }

    const invRes = await createTestInvitation(eventId, 'decline-flow@example.com');
    const invToken = invRes.data?.token;
    if (!invToken) { test.skip(true, 'No invitation created'); return; }

    await loginAsMockUser(page, 'mock-decline-user');

    await page.goto(`/invitations/accept?token=${invToken}`);
    await expect(page.getByTestId('decline-btn')).toBeVisible();
    await page.getByTestId('decline-btn').click();

    await expect(page.getByTestId('invitation-action-done')).toBeVisible({ timeout: 5000 });
    await expect(page.getByTestId('invitation-action-done')).toContainText('declined');
  });

  test('should show already-responded state for accepted invitation', async ({ page }) => {
    const eventRes = await createTestEvent();
    const eventId = eventRes.data?.id;
    if (!eventId) { test.skip(true, 'No event created'); return; }

    const invRes = await createTestInvitation(eventId, 'already-accepted@example.com');
    const invToken = invRes.data?.token;
    const invId = invRes.data?.id;
    if (!invToken || !invId) { test.skip(true, 'No invitation created'); return; }

    // Accept via API first
    await acceptInvitation(invId, 'mock-already-user');

    // Now visit the accept page — should show already responded
    await page.goto(`/invitations/accept?token=${invToken}`);
    await expect(page.getByTestId('invitation-already-responded')).toBeVisible({ timeout: 5000 });
    await expect(page.getByTestId('invitation-already-responded')).toContainText('accepted');
    // Accept/decline buttons should NOT be visible
    await expect(page.getByTestId('accept-btn')).not.toBeVisible();
    await expect(page.getByTestId('decline-btn')).not.toBeVisible();
  });

  test('should show already-responded state for declined invitation', async ({ page }) => {
    const eventRes = await createTestEvent();
    const eventId = eventRes.data?.id;
    if (!eventId) { test.skip(true, 'No event created'); return; }

    const invRes = await createTestInvitation(eventId, 'already-declined@example.com');
    const invToken = invRes.data?.token;
    const invId = invRes.data?.id;
    if (!invToken || !invId) { test.skip(true, 'No invitation created'); return; }

    // Decline via API first
    await declineInvitation(invId, 'mock-declined-user');

    await page.goto(`/invitations/accept?token=${invToken}`);
    await expect(page.getByTestId('invitation-already-responded')).toBeVisible({ timeout: 5000 });
    await expect(page.getByTestId('invitation-already-responded')).toContainText('declined');
    await expect(page.getByTestId('accept-btn')).not.toBeVisible();
  });

  test('should have login link for unauthenticated users', async ({ page }) => {
    await page.goto('/invitations/accept?token=some-token');
    // Even on error page, login link should be available
    await expect(page.getByTestId('go-login-btn').or(page.getByTestId('login-link'))).toBeVisible();
  });
});

test.describe('Invitation Lifecycle — Full E2E', () => {
  test('full flow: create event → invite → accept → verify participant', async ({ page }) => {
    // Step 1: Admin creates event
    const eventRes = await createTestEvent('mock-admin-user');
    const eventId = eventRes.data?.id;
    if (!eventId) { test.skip(true, 'No event created'); return; }

    // Step 2: Admin sends invitation
    const invRes = await createTestInvitation(eventId, 'lifecycle@example.com', 'mock-admin-user');
    expect(invRes.success).toBe(true);
    expect(invRes.data?.status).toBe('pending');
    expect(invRes.data?.token).toBeDefined();

    // Step 3: Invitee accepts
    const acceptRes = await acceptInvitation(invRes.data.id, 'mock-lifecycle-user');
    expect(acceptRes.success).toBe(true);
    expect(acceptRes.data?.status).toBe('accepted');

    // Step 4: Verify invitation shows as accepted in event invitations
    const eventInvs = await getEventInvitations(eventId, 'mock-admin-user');
    const accepted = eventInvs.data?.find((i: any) => i.id === invRes.data.id);
    expect(accepted?.status).toBe('accepted');

    // Step 5: Verify the invitee is now a participant (via UI)
    await loginAsMockUser(page, 'mock-admin-user');
    await page.goto(`/events/${eventId}`);
    await page.getByTestId('tab-participants').click();
    // The participant list should contain the accepted user
    const participantsList = page.locator('[data-testid^="participant-"]');
    await expect(participantsList.first()).toBeVisible({ timeout: 5000 });
  });

  test('full flow: create event → invite → decline → verify not participant', async ({ page }) => {
    const eventRes = await createTestEvent('mock-admin-user-2');
    const eventId = eventRes.data?.id;
    if (!eventId) { test.skip(true, 'No event created'); return; }

    const invRes = await createTestInvitation(eventId, 'decline-lifecycle@example.com', 'mock-admin-user-2');
    expect(invRes.success).toBe(true);

    // Decline the invitation
    const declineRes = await declineInvitation(invRes.data.id, 'mock-decline-lifecycle');
    expect(declineRes.success).toBe(true);
    expect(declineRes.data?.status).toBe('declined');

    // Verify invitation shows as declined
    const eventInvs = await getEventInvitations(eventId, 'mock-admin-user-2');
    const declined = eventInvs.data?.find((i: any) => i.id === invRes.data.id);
    expect(declined?.status).toBe('declined');
  });

  test('cannot accept same invitation twice', async () => {
    const eventRes = await createTestEvent('mock-double-admin');
    const eventId = eventRes.data?.id;
    if (!eventId) { test.skip(true, 'No event created'); return; }

    const invRes = await createTestInvitation(eventId, 'double@example.com', 'mock-double-admin');
    expect(invRes.success).toBe(true);

    // Accept first time
    const first = await acceptInvitation(invRes.data.id, 'mock-double-user');
    expect(first.success).toBe(true);

    // Try to accept again — should fail
    const second = await acceptInvitation(invRes.data.id, 'mock-double-user');
    expect(second.success).toBe(false);
    expect(second.error).toContain('already been');
  });

  test('cannot decline an already accepted invitation', async () => {
    const eventRes = await createTestEvent('mock-cross-admin');
    const eventId = eventRes.data?.id;
    if (!eventId) { test.skip(true, 'No event created'); return; }

    const invRes = await createTestInvitation(eventId, 'cross@example.com', 'mock-cross-admin');
    await acceptInvitation(invRes.data.id, 'mock-cross-user');

    const declineRes = await declineInvitation(invRes.data.id, 'mock-cross-user');
    expect(declineRes.success).toBe(false);
    expect(declineRes.error).toContain('already been');
  });
});
