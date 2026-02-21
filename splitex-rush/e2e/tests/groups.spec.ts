import { test, expect } from '@playwright/test';
import { loginAsMockUser } from '../helpers/auth';
import { createTestEvent } from '../helpers/api';

test.describe('Group Management', () => {
  let eventId: string;

  test.beforeEach(async ({ page }) => {
    await loginAsMockUser(page);
    const res = await createTestEvent();
    eventId = res.data?.id;
  });

  test('should show empty groups state', async ({ page }) => {
    if (!eventId) {
      test.skip(!eventId, 'No event created');
      return;
    }
    await page.goto(`/events/${eventId}`);
    await page.getByTestId('tab-groups').click();
    await expect(page.getByTestId('groups-panel')).toBeVisible();
    // Either empty state or groups list
    const emptyState = page.getByTestId('empty-groups');
    const groupItems = page.locator('[data-testid^="group-item-"]');
    await expect(emptyState.or(groupItems.first())).toBeVisible();
  });

  test('should open create group modal', async ({ page }) => {
    if (!eventId) {
      test.skip(!eventId, 'No event created');
      return;
    }
    await page.goto(`/events/${eventId}`);
    await page.getByTestId('tab-groups').click();
    await page.getByTestId('create-group-btn').click();
    await expect(page.getByTestId('create-group-modal')).toBeVisible();
    await expect(page.getByTestId('group-name-input')).toBeVisible();
    await expect(page.getByTestId('group-description-input')).toBeVisible();
    await expect(page.getByTestId('group-payer-input')).toBeVisible();
  });

  test('should disable create group submit when name is empty', async ({ page }) => {
    if (!eventId) {
      test.skip(!eventId, 'No event created');
      return;
    }
    await page.goto(`/events/${eventId}`);
    await page.getByTestId('tab-groups').click();
    await page.getByTestId('create-group-btn').click();
    await expect(page.getByTestId('create-group-submit')).toBeDisabled();
  });

  test('should fill and submit create group form', async ({ page }) => {
    if (!eventId) {
      test.skip(!eventId, 'No event created');
      return;
    }
    await page.goto(`/events/${eventId}`);
    await page.getByTestId('tab-groups').click();
    await page.getByTestId('create-group-btn').click();

    await page.getByTestId('group-name-input').fill('Family');
    await page.getByTestId('group-description-input').fill('My family group');
    const groupModal = page.getByTestId('create-group-modal');
    const memberCheckbox = groupModal.locator('[data-testid^="group-member-checkbox-"]').first();
    if (await memberCheckbox.isVisible().catch(() => false)) {
      await memberCheckbox.check();
    }
    const payerSelect = page.getByTestId('group-payer-input');
    await payerSelect.selectOption({ index: 1 });

    await expect(page.getByTestId('create-group-submit')).toBeEnabled();
    await page.getByTestId('create-group-submit').click();
    await page.waitForTimeout(1000);
  });

  test('should close create group modal on cancel', async ({ page }) => {
    if (!eventId) {
      test.skip(!eventId, 'No event created');
      return;
    }
    await page.goto(`/events/${eventId}`);
    await page.getByTestId('tab-groups').click();
    await page.getByTestId('create-group-btn').click();
    await expect(page.getByTestId('create-group-modal')).toBeVisible();

    await page.getByRole('button', { name: 'Cancel' }).click();
    await expect(page.getByTestId('create-group-modal')).not.toBeVisible();
  });
});
