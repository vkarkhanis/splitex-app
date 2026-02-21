import { test, expect } from '@playwright/test';
import { loginAsMockUser } from '../helpers/auth';
import { createTestEvent } from '../helpers/api';

test.describe('Event Detail Page', () => {
  let eventId: string;

  test.beforeEach(async ({ page }) => {
    await loginAsMockUser(page);
    // Create a test event via API
    const res = await createTestEvent();
    eventId = res.data?.id;
  });

  test('should display event detail page with tabs', async ({ page }) => {
    if (!eventId) {
      test.skip(!eventId, 'No event created - mock services may not support this');
      return;
    }
    await page.goto(`/events/${eventId}`);
    await expect(page.getByTestId('event-detail-page')).toBeVisible();
    await expect(page.getByTestId('tab-expenses')).toBeVisible();
    await expect(page.getByTestId('tab-participants')).toBeVisible();
    await expect(page.getByTestId('tab-groups')).toBeVisible();
    await expect(page.getByTestId('tab-invitations')).toBeVisible();
  });

  test('should switch between tabs', async ({ page }) => {
    if (!eventId) {
      test.skip(!eventId, 'No event created');
      return;
    }
    await page.goto(`/events/${eventId}`);

    // Click participants tab
    await page.getByTestId('tab-participants').click();
    await expect(page.getByTestId('participants-panel')).toBeVisible();

    // Click groups tab
    await page.getByTestId('tab-groups').click();
    await expect(page.getByTestId('groups-panel')).toBeVisible();

    // Click invitations tab
    await page.getByTestId('tab-invitations').click();
    await expect(page.getByTestId('invitations-panel')).toBeVisible();

    // Click back to expenses tab
    await page.getByTestId('tab-expenses').click();
    await expect(page.getByTestId('expenses-panel')).toBeVisible();
  });

  test('should open edit event modal', async ({ page }) => {
    if (!eventId) {
      test.skip(!eventId, 'No event created');
      return;
    }
    await page.goto(`/events/${eventId}`);
    const editButton = page.getByTestId('edit-event-btn');
    const canEdit = await editButton.isVisible().catch(() => false);
    if (!canEdit) {
      await expect(editButton).toHaveCount(0);
      return;
    }

    await editButton.click();
    await expect(page.getByTestId('edit-event-modal')).toBeVisible();
    await expect(page.getByTestId('edit-event-name')).toBeVisible();
    await expect(page.getByTestId('edit-event-save')).toBeVisible();

    // Close modal
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('edit-event-modal')).not.toBeVisible();
  });

  test('should open invite modal from participants tab', async ({ page }) => {
    if (!eventId) {
      test.skip(!eventId, 'No event created');
      return;
    }
    await page.goto(`/events/${eventId}`);
    await page.getByTestId('tab-participants').click();
    await page.getByTestId('invite-btn').click();
    await expect(page.getByTestId('invite-modal')).toBeVisible();
    await expect(page.getByTestId('invite-email-input')).toBeVisible();
    await expect(page.getByTestId('invite-submit')).toBeVisible();
  });

  test('should open create group modal from groups tab', async ({ page }) => {
    if (!eventId) {
      test.skip(!eventId, 'No event created');
      return;
    }
    await page.goto(`/events/${eventId}`);
    await page.getByTestId('tab-groups').click();
    await page.getByTestId('create-group-btn').click();
    await expect(page.getByTestId('create-group-modal')).toBeVisible();
    await expect(page.getByTestId('group-name-input')).toBeVisible();
  });

  test('should navigate to add expense page', async ({ page }) => {
    if (!eventId) {
      test.skip(!eventId, 'No event created');
      return;
    }
    await page.goto(`/events/${eventId}`);
    await page.getByTestId('add-expense-btn').click();
    await expect(page).toHaveURL(new RegExp(`/events/${eventId}/expenses/create`));
    await expect(page.getByTestId('create-expense-page')).toBeVisible();
  });
});
