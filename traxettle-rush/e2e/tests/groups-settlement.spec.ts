/**
 * A group as one entity, end to end in the browser (gap 14 of the coverage map): created in the
 * Create Group dialog with a chosen payer, offered as one entity on the expense form, settled as
 * one entity; its representative approves the plan and its payer pays.
 */
import { test, expect } from '@playwright/test';
import * as pool from '../helpers/pool';
import { confirmDialog, expenseByTitle, openEvent, splitEvent, splitRow } from '../helpers/ui';

test.describe.configure({ timeout: 120_000 });

test('a couple as one group: made in the dialog, split as one entity; its representative approves and its payer pays', async ({ page }) => {
  const p = await pool.cast('group');
  const eventId = await splitEvent(p.anita, [p.ravi, p.priya], 'Kabini safari');

  // Anita groups Ravi and Priya. Ravi is ticked first, so he represents the group; Priya pays for it.
  await openEvent(page, p.anita, eventId);
  await page.getByTestId('tab-groups').click();
  await page.getByTestId('create-group-btn').click();
  await page.getByTestId('group-name-input').fill('Ravi & Priya');
  await page.getByTestId('group-description-input').fill('Couple');
  await expect(page.getByTestId('create-group-submit')).toBeDisabled();
  await page.getByTestId(`group-member-checkbox-${p.ravi}`).check();
  await page.getByTestId(`group-member-checkbox-${p.priya}`).check();
  await expect(page.getByTestId('group-payer-input').locator('option')).toHaveText(['Select payer...', 'Ravi', 'Priya']);
  await page.getByTestId('group-payer-input').selectOption(p.priya);
  await page.getByTestId('create-group-submit').click();
  await expect(page.getByTestId('create-group-modal')).toHaveCount(0);

  const [group] = await pool.call<any[]>('GET', `/api/groups/event/${eventId}`, p.anita);
  expect(group).toMatchObject({ name: 'Ravi & Priya', members: [p.ravi, p.priya], payerUserId: p.priya, representative: p.ravi });
  await expect(page.getByTestId('tab-groups')).toHaveText('Groups (1)');
  await expect(page.getByTestId(`group-item-${group.id}`)).toContainText('Members: Ravi, Priya · Payer: Priya · Couple');

  // The expense form offers the group as one entity; its members aren't listed on their own.
  await page.getByTestId('tab-expenses').click();
  await page.getByTestId('add-expense-btn').click();
  const entities = page.locator('[data-testid^="entity-checkbox-"]');
  await expect(entities).toHaveCount(2);
  await expect(entities.nth(0)).toContainText('Group');
  await expect(entities.nth(0)).toContainText('Ravi & Priya');
  await expect(entities.nth(0)).toContainText('(2 members)');
  await expect(entities.nth(1)).toContainText('Anita');
  await page.getByTestId('expense-title-input').fill('Safari jeep');
  await page.getByTestId('expense-amount-input').fill('3000');
  await expect(splitRow(page, 'Ravi & Priya').locator('input')).toHaveValue('₹1500.00');
  await expect(splitRow(page, 'Anita').locator('input')).toHaveValue('₹1500.00');
  await page.getByTestId('create-expense-submit').click();
  await page.waitForURL(new RegExp(`/events/${eventId}$`), { timeout: 15_000 });

  const jeep = await expenseByTitle(eventId, p.anita, 'Safari jeep');
  expect(jeep.splits.map((s: any) => [s.entityType, s.entityId, s.amount])).toEqual([['group', group.id, 1500], ['user', p.anita, 1500]]);
  const row = page.getByTestId(`expense-item-${jeep.id}`);
  await row.locator(':scope > div').first().click({ position: { x: 8, y: 8 } });
  await expect(row).toContainText('Ravi & Priya(group)');

  // Settling: the group owes Anita, and needs one approval for the two of them.
  await page.getByTestId('settle-btn').click();
  await confirmDialog(page, 'Generate Settlement Plan');
  const [leg] = await pool.settlements(eventId, p.anita);
  expect(leg).toMatchObject({ fromEntityType: 'group', fromEntityId: group.id, fromUserId: p.priya, toUserId: p.anita, amount: 1500 });
  const review = page.getByTestId('settlement-review-section');
  await expect(review).toContainText('0/2 approved');
  await expect(page.getByTestId(`settlement-approval-${group.id}`)).toContainText('Ravi & Priya');
  await expect(page.getByTestId(`settlement-review-txn-${leg.id}`)).toContainText(/Ravi & Priya\s*→\s*Anita/);
  await page.getByTestId('approve-settlement-btn').click();
  await expect(review).toContainText('1/2 approved');

  // Ravi, the representative, approves for the group.
  await openEvent(page, p.ravi, eventId);
  await page.getByTestId('approve-settlement-btn').click();
  await expect(page.getByTestId('event-status-badge')).toHaveText('payment');
  expect((await pool.event(eventId, p.anita)).settlementApprovals[group.id].approved).toBe(true);

  // Only Priya, the group's payer, can pay; Ravi sees who will.
  const card = page.getByTestId(`settlement-txn-${leg.id}`);
  await expect(card).toContainText('Payer: Priya');
  await expect(card).toContainText('Pending');
  await expect(page.getByTestId(`pay-btn-${leg.id}`)).toHaveCount(0);

  await openEvent(page, p.priya, eventId);
  await page.getByTestId(`pay-btn-${leg.id}`).click();
  await page.getByTestId('settlement-pay-reference').fill('UPI-KABINI');
  await page.getByTestId('settlement-pay-submit').click();
  await expect(card).toContainText('Marked paid — awaiting payee confirmation');

  // Anita confirms: settled.
  await openEvent(page, p.anita, eventId);
  await page.getByTestId(`approve-btn-${leg.id}`).click();
  await expect(card).toContainText('Payment confirmed ✓');
  await expect(page.getByTestId('event-status-badge')).toHaveText('settled');
  expect((await pool.settlements(eventId, p.anita))[0]).toMatchObject({ status: 'completed', paymentReference: 'UPI-KABINI' });
});
