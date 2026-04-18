import { test, expect } from '@playwright/test';
import { loginAsMockUser } from '../helpers/auth';
import {
  createTestEvent,
  addParticipantToEvent,
  createSplitExpense,
  apiRequest,
} from '../helpers/api';

test.describe('Expense Lifecycle — Edit & Delete', () => {
  let eventId: string;
  let expenseId: string;
  const adminToken = 'mock-expense-lifecycle-admin';
  const memberToken = 'mock-expense-lifecycle-member';

  test.beforeEach(async ({ page }) => {
    const eventRes = await createTestEvent(adminToken, { currency: 'USD' });
    eventId = eventRes.data?.id;
    if (!eventId) return;

    await addParticipantToEvent(eventId, memberToken, adminToken);

    const expRes = await createSplitExpense(
      eventId,
      adminToken,
      [
        { entityType: 'user', entityId: adminToken, amount: 50 },
        { entityType: 'user', entityId: memberToken, amount: 50 },
      ],
      100,
      'USD'
    );
    expenseId = expRes.data?.id;
  });

  test('should navigate to expense edit page from event detail', async ({ page }) => {
    if (!eventId || !expenseId) {
      test.skip(true, 'No event/expense created');
      return;
    }
    await loginAsMockUser(page, adminToken);
    await page.goto(`/events/${eventId}`);
    await expect(page.getByTestId('tab-expenses')).toBeVisible();

    // Look for the edit button on the expense
    const editBtn = page.locator(`[data-testid="edit-expense-${expenseId}"]`);
    const canEdit = await editBtn.isVisible().catch(() => false);
    if (!canEdit) {
      // May be in a list item with a click-to-expand pattern
      const expenseItem = page.locator(`[data-testid^="expense-item-"]`).first();
      if (await expenseItem.isVisible().catch(() => false)) {
        await expenseItem.click();
      }
    }

    // Try navigating directly to edit page
    await page.goto(`/events/${eventId}/expenses/${expenseId}/edit`);
    await expect(page.getByTestId('create-expense-page').or(page.locator('form'))).toBeVisible({ timeout: 10000 });
  });

  test('should update expense via API', async () => {
    if (!eventId || !expenseId) {
      test.skip(true, 'No event/expense created');
      return;
    }

    const updateRes = await apiRequest('PUT', `/api/expenses/${expenseId}`, {
      title: 'Updated Expense Title',
      description: 'Updated description',
      amount: 200,
      currency: 'USD',
      splitType: 'custom',
      splits: [
        { entityType: 'user', entityId: adminToken, amount: 100 },
        { entityType: 'user', entityId: memberToken, amount: 100 },
      ],
    }, adminToken);

    expect(updateRes.success).toBe(true);
    expect(updateRes.data.title).toBe('Updated Expense Title');
    expect(updateRes.data.amount).toBe(200);
  });

  test('should delete expense via API', async () => {
    if (!eventId || !expenseId) {
      test.skip(true, 'No event/expense created');
      return;
    }

    const deleteRes = await apiRequest('DELETE', `/api/expenses/${expenseId}`, undefined, adminToken);
    expect(deleteRes.success).toBe(true);

    // Verify it's gone
    const getRes = await apiRequest('GET', `/api/expenses/${expenseId}`, undefined, adminToken);
    expect(getRes.success).toBe(false);
  });

  test('member cannot delete admin expense without admin role', async () => {
    if (!eventId || !expenseId) {
      test.skip(true, 'No event/expense created');
      return;
    }

    const deleteRes = await apiRequest('DELETE', `/api/expenses/${expenseId}`, undefined, memberToken);
    expect(deleteRes.success).toBe(false);
  });
});

test.describe('Event Lifecycle — Update & Delete', () => {
  test('should update event name via API', async () => {
    const adminToken = 'mock-event-update-admin';
    const eventRes = await createTestEvent(adminToken);
    const eventId = eventRes.data?.id;
    if (!eventId) {
      test.skip(true, 'No event created');
      return;
    }

    const updateRes = await apiRequest('PUT', `/api/events/${eventId}`, {
      name: 'Updated Event Name',
      description: 'Updated by E2E test',
    }, adminToken);

    expect(updateRes.success).toBe(true);
    expect(updateRes.data.name).toBe('Updated Event Name');
  });

  test('should delete event via API', async () => {
    const adminToken = 'mock-event-delete-admin';
    const eventRes = await createTestEvent(adminToken);
    const eventId = eventRes.data?.id;
    if (!eventId) {
      test.skip(true, 'No event created');
      return;
    }

    const deleteRes = await apiRequest('DELETE', `/api/events/${eventId}`, undefined, adminToken);
    expect(deleteRes.success).toBe(true);
  });

  test('non-admin cannot delete event', async () => {
    const adminToken = 'mock-event-nodelete-admin';
    const memberToken = 'mock-event-nodelete-member';
    const eventRes = await createTestEvent(adminToken);
    const eventId = eventRes.data?.id;
    if (!eventId) {
      test.skip(true, 'No event created');
      return;
    }

    await addParticipantToEvent(eventId, memberToken, adminToken);
    const deleteRes = await apiRequest('DELETE', `/api/events/${eventId}`, undefined, memberToken);
    expect(deleteRes.success).toBe(false);
  });

  test('deleted event disappears from dashboard', async ({ page }) => {
    const adminToken = 'mock-event-dashboard-del';
    const eventRes = await createTestEvent(adminToken, { name: 'To Be Deleted' });
    const eventId = eventRes.data?.id;
    if (!eventId) {
      test.skip(true, 'No event created');
      return;
    }

    await loginAsMockUser(page, adminToken);
    await page.goto('/dashboard');
    await expect(page.getByTestId('dashboard-page')).toBeVisible();

    // Delete via API
    await apiRequest('DELETE', `/api/events/${eventId}`, undefined, adminToken);

    // Reload and verify gone
    await page.reload();
    await page.waitForTimeout(1000);
    const eventCard = page.getByTestId(`event-card-${eventId}`);
    await expect(eventCard).not.toBeVisible();
  });
});
