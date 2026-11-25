/**
 * Editing and deleting events and expenses in the browser (gap 7 of the coverage map), and the
 * lock once payments start (gap 8): the controls disappear and the API refuses edits.
 * People, events, expenses and settlement plans are set up through the API; the edits, deletes
 * and the last approval are clicked.
 */
import { test, expect } from '@playwright/test';
import * as pool from '../helpers/pool';
import { apiRequestWithStatus } from '../helpers/api';
import { confirmDialog, expenseByTitle, openEvent, splitEvent, splitRow } from '../helpers/ui';

test.describe.configure({ timeout: 120_000 });

const shares = (expense: any) => Object.fromEntries(expense.splits.map((s: any) => [s.entityId, s.amount]));

/** An INR expense paid by `payer`, split as `split` ({ userId: amount }). */
async function addExpense(eventId: string, payer: string, title: string, split: Record<string, number>, splitType = 'custom') {
  const amount = Object.values(split).reduce((a, b) => a + b, 0);
  return pool.call('POST', '/api/expenses', payer, {
    eventId, title, amount, currency: 'INR', splitType,
    splits: Object.entries(split).map(([entityId, value]) => ({ entityType: 'user', entityId, amount: value })),
  });
}

test.describe('Editing and deleting', () => {
  test('an admin saves changes in the Edit event dialog; a member has no Edit button', async ({ page }) => {
    const p = await pool.cast('edit-event');
    const eventId = await splitEvent(p.anita, [p.ravi], 'Ooty plan', { description: 'Draft' });

    await openEvent(page, p.anita, eventId);
    await page.getByTestId('edit-event-btn').click();
    const dialog = page.getByTestId('edit-event-modal');
    await expect(page.getByTestId('edit-event-name')).toHaveValue('Ooty plan');
    await expect(page.getByTestId('edit-event-description')).toHaveValue('Draft');
    await expect(page.getByTestId('edit-event-type')).toHaveValue('trip');
    await expect(page.getByTestId('edit-event-currency')).toHaveValue('INR');
    await page.getByTestId('edit-event-name').fill('Ooty, final plan');
    await page.getByTestId('edit-event-description').fill('Two nights by the lake');
    await page.getByTestId('edit-event-type').selectOption('event');
    await page.getByTestId('edit-event-save').click();

    await expect(dialog).toHaveCount(0);
    await expect(page.getByRole('heading', { name: 'Ooty, final plan' })).toBeVisible();
    await expect(page.getByTestId('event-detail-page')).toContainText('Two nights by the lake');
    await expect(page.getByTestId('event-detail-page')).not.toContainText('Ooty plan');
    expect(await pool.event(eventId, p.anita)).toMatchObject({
      name: 'Ooty, final plan', description: 'Two nights by the lake', type: 'event', currency: 'INR', status: 'active',
    });

    await openEvent(page, p.ravi, eventId);
    await expect(page.getByRole('heading', { name: 'Ooty, final plan' })).toBeVisible();
    await expect(page.getByTestId('edit-event-btn')).toHaveCount(0);
    await expect(page.getByTestId('delete-event-btn')).toHaveCount(0);
  });

  // App bug: during settlement review the Edit button is shown, but the dialog always sends the
  // event's currency with the other fields, and PUT /api/events/:id refuses any `currency` while
  // the event is in review ("Cannot change currency or FX settings while settlement is under
  // review"), even when it hasn't changed. So no edit can be saved in review.
  test('an admin can rename an event while its settlement is in review', async ({ page }) => {
    const p = await pool.cast('edit-review');
    const eventId = await splitEvent(p.anita, [p.ravi], 'Munnar plan');
    await addExpense(eventId, p.anita, 'Tea estate tour', { [p.anita]: 500, [p.ravi]: 500 });
    await pool.call('POST', `/api/settlements/event/${eventId}/generate`, p.anita);

    await openEvent(page, p.anita, eventId);
    await expect(page.getByTestId('event-status-badge')).toHaveText('review');
    await page.getByTestId('edit-event-btn').click();
    await page.getByTestId('edit-event-name').fill('Munnar, final plan');
    await page.getByTestId('edit-event-save').click();
    await expect(page.getByTestId('edit-event-modal')).toHaveCount(0);
    await expect(page.getByRole('heading', { name: 'Munnar, final plan' })).toBeVisible();
    expect((await pool.event(eventId, p.anita)).name).toBe('Munnar, final plan');
  });

  test('an expense is edited on its own page: the form starts with the saved values and the change shows in the list', async ({ page }) => {
    const p = await pool.cast('edit-expense');
    const eventId = await splitEvent(p.anita, [p.ravi], 'Wayanad drive');
    const fuel = await addExpense(eventId, p.anita, 'Fuel', { [p.anita]: 400, [p.ravi]: 600 });

    await openEvent(page, p.anita, eventId);
    await page.getByTestId(`edit-expense-${fuel.id}`).click();
    await page.waitForURL(new RegExp(`/events/${eventId}/expenses/${fuel.id}/edit$`));
    await expect(page.getByTestId('edit-expense-page')).toBeVisible({ timeout: 15_000 });

    // Pre-filled with what was saved.
    await expect(page.getByTestId('expense-title-input')).toHaveValue('Fuel');
    await expect(page.getByTestId('expense-amount-input')).toHaveValue('1000');
    await expect(page.getByTestId('split-type-custom')).toBeChecked();
    await expect(splitRow(page, 'Anita').locator('input')).toHaveValue('400');
    await expect(splitRow(page, 'Ravi').locator('input')).toHaveValue('600');

    // A new amount must be split again before it can be saved.
    await page.getByTestId('expense-title-input').fill('Fuel and tolls');
    await page.getByTestId('expense-amount-input').fill('1200');
    await expect(page.getByTestId('split-mismatch-error')).toContainText('Difference: ₹200.00');
    await expect(page.getByTestId('edit-expense-submit')).toBeDisabled();
    await splitRow(page, 'Ravi').locator('input').fill('800');
    await expect(page.getByTestId('split-mismatch-error')).toHaveCount(0);
    await page.getByTestId('edit-expense-submit').click();

    await page.waitForURL(new RegExp(`/events/${eventId}$`), { timeout: 15_000 });
    const row = page.getByTestId(`expense-item-${fuel.id}`);
    await expect(row).toContainText('Fuel and tolls');
    await expect(row).toContainText('₹1200.00');
    await expect(page.getByTestId('summary-your-shared')).toContainText('₹400.00');
    const saved = await expenseByTitle(eventId, p.anita, 'Fuel and tolls');
    expect([saved.amount, shares(saved)]).toEqual([1200, { [p.anita]: 400, [p.ravi]: 800 }]);
  });

  test('deleting an expense asks first, then removes it from the list and the totals', async ({ page }) => {
    const p = await pool.cast('delete-expense');
    const eventId = await splitEvent(p.anita, [p.ravi], 'Chikmagalur weekend');
    const snacks = await addExpense(eventId, p.anita, 'Snacks', { [p.anita]: 150, [p.ravi]: 150 }, 'equal');
    const parking = await addExpense(eventId, p.anita, 'Parking', { [p.anita]: 100, [p.ravi]: 100 }, 'equal');

    await openEvent(page, p.anita, eventId);
    await expect(page.getByTestId('summary-total-expense')).toContainText('₹500.00');

    // Cancel keeps it.
    await page.getByTestId(`delete-expense-${snacks.id}`).click();
    const dialog = page.getByTestId('confirm-modal');
    await expect(dialog).toContainText('Delete Expense');
    await expect(dialog).toContainText('Are you sure you want to delete this expense? This action cannot be undone.');
    await page.getByTestId('confirm-modal-cancel').click();
    await expect(dialog).toHaveCount(0);
    await expect(page.getByTestId(`expense-item-${snacks.id}`)).toBeVisible();

    // Confirming deletes it.
    await page.getByTestId(`delete-expense-${snacks.id}`).click();
    await confirmDialog(page, 'Delete Expense');
    await expect(page.getByTestId(`expense-item-${snacks.id}`)).toHaveCount(0);
    await expect(page.getByTestId(`expense-item-${parking.id}`)).toBeVisible();
    await expect(page.getByTestId('tab-expenses')).toHaveText('Expenses (1)');
    await expect(page.getByTestId('summary-total-expense')).toContainText('₹200.00');
    expect((await apiRequestWithStatus('GET', `/api/expenses/${snacks.id}`, undefined, p.anita)).status).toBe(404);
  });

  test('deleting an event with a pending settlement shows the amount still owed, then deletes it', async ({ page }) => {
    const p = await pool.cast('delete-event');
    const eventId = await splitEvent(p.anita, [p.ravi], 'Goa villa');
    await addExpense(eventId, p.anita, 'Villa', { [p.anita]: 2000, [p.ravi]: 2000 }, 'equal');
    await pool.call('POST', `/api/settlements/event/${eventId}/generate`, p.anita);

    await openEvent(page, p.anita, eventId);
    await expect(page.getByTestId('event-status-badge')).toHaveText('review');
    await page.getByTestId('delete-event-btn').click();
    const dialog = page.getByTestId('delete-confirm-modal');
    await expect(dialog).toContainText('Are you sure you want to delete “Goa villa”?');
    await expect(page.getByTestId('delete-pending-settlement')).toContainText('Pending Settlement: ₹2000.00 INR');
    await expect(page.getByTestId('delete-pending-settlement')).toContainText('must be settled manually');
    await page.getByTestId('confirm-delete-btn').click();

    await page.waitForURL(/\/dashboard$/, { timeout: 15_000 });
    await expect(page.getByTestId('dashboard-page')).toBeVisible();
    await expect(page.getByTestId(`event-card-${eventId}`)).toHaveCount(0);
    expect((await apiRequestWithStatus('GET', `/api/events/${eventId}`, undefined, p.anita)).status).toBe(404);
  });

  test('once payments start the event is locked: no add, edit, delete or invite controls, and the API refuses edits', async ({ page }) => {
    const p = await pool.cast('lock');
    const eventId = await splitEvent(p.anita, [p.ravi], 'Varkala trip');
    const cliff = await addExpense(eventId, p.anita, 'Cliff cafe', { [p.anita]: 400, [p.ravi]: 400 }, 'equal');
    await pool.call('POST', `/api/settlements/event/${eventId}/generate`, p.anita);
    await pool.approveReview(eventId, p.ravi);

    // In review everything can still be changed.
    await openEvent(page, p.anita, eventId);
    for (const id of ['edit-event-btn', 'delete-event-btn', 'add-expense-btn', `edit-expense-${cliff.id}`, `delete-expense-${cliff.id}`]) {
      await expect(page.getByTestId(id)).toBeVisible();
    }

    // Anita's approval is the last one: payments start.
    await page.getByTestId('approve-settlement-btn').click();
    await expect(page.getByTestId('event-status-badge')).toHaveText('payment');
    await expect(page.getByText('Payments in Progress')).toBeVisible();
    for (const id of ['edit-event-btn', 'delete-event-btn', 'add-expense-btn', 'settle-btn', `edit-expense-${cliff.id}`, `delete-expense-${cliff.id}`]) {
      await expect(page.getByTestId(id)).toHaveCount(0);
    }
    await page.getByTestId('tab-participants').click();
    await expect(page.getByTestId(`participant-${p.ravi}`)).toBeVisible();
    for (const id of ['invite-btn', `remove-participant-${p.ravi}`, `promote-${p.ravi}`]) await expect(page.getByTestId(id)).toHaveCount(0);
    await page.getByTestId('tab-groups').click();
    await expect(page.getByTestId('groups-panel')).toBeVisible();
    await expect(page.getByTestId('create-group-btn')).toHaveCount(0);
    await page.getByTestId('tab-invitations').click();
    await expect(page.getByTestId('invitations-panel')).toBeVisible();
    await expect(page.getByTestId('send-invite-btn')).toHaveCount(0);

    // The API refuses the same changes.
    const refused = [
      await apiRequestWithStatus('PUT', `/api/events/${eventId}`, { name: 'Renamed' }, p.anita),
      await apiRequestWithStatus('DELETE', `/api/events/${eventId}`, undefined, p.anita),
      await apiRequestWithStatus('PUT', `/api/expenses/${cliff.id}`, { title: 'Renamed' }, p.anita),
      await apiRequestWithStatus('DELETE', `/api/expenses/${cliff.id}`, undefined, p.anita),
      await apiRequestWithStatus('POST', '/api/expenses', {
        eventId, title: 'Late snack', amount: 100, currency: 'INR', splitType: 'equal',
        splits: [{ entityType: 'user', entityId: p.anita, amount: 100 }],
      }, p.anita),
    ];
    expect(refused.map((r) => r.status)).toEqual([403, 403, 403, 403, 403]);
    expect(refused[0].body.error).toBe('Cannot modify event while payments are in progress');
    expect(refused[2].body.error).toContain('Payments are in progress');
    const after = await pool.event(eventId, p.anita);
    expect([after.name, after.status]).toEqual(['Varkala trip', 'payment']);
    expect((await expenseByTitle(eventId, p.anita, 'Cliff cafe')).amount).toBe(800);
  });
});
