/**
 * Adding split expenses through the form (gaps 3, 4 and 5 of the coverage map): equal, ratio and
 * custom splits and the mismatch check, "on behalf of" (the payer's share is zero), and private
 * expenses (seen only by their owner, left out of everyone's balances). Each test makes its own
 * three people and event through the API; every expense under test is added in the browser.
 */
import { test, expect, Locator, Page } from '@playwright/test';
import * as pool from '../helpers/pool';
import { apiRequestWithStatus } from '../helpers/api';
import { balances, confirmDialog, expenseByTitle, expenses, openEvent, splitEvent, splitRow } from '../helpers/ui';

test.describe.configure({ timeout: 120_000 });

/** From the event page, opens Add Expense and fills the title and amount. */
async function startExpense(page: Page, eventId: string, title: string, amount: string) {
  await page.getByTestId('add-expense-btn').click();
  await page.waitForURL(new RegExp(`/events/${eventId}/expenses/create$`));
  await expect(page.getByTestId('create-expense-page')).toBeVisible();
  // The split rows appear once the event's people have loaded.
  await expect(page.locator('[data-testid^="split-row-"]').first()).toBeVisible({ timeout: 15_000 });
  await page.getByTestId('expense-title-input').fill(title);
  await page.getByTestId('expense-amount-input').fill(amount);
}

async function submitExpense(page: Page, eventId: string) {
  await page.getByTestId('create-expense-submit').click();
  await page.waitForURL(new RegExp(`/events/${eventId}$`), { timeout: 15_000 });
  await expect(page.getByTestId('event-detail-page')).toBeVisible({ timeout: 15_000 });
}

/** Opens an expense row to show its split details (the row itself is the toggle). */
const expand = (row: Locator) => row.locator(':scope > div').first().click({ position: { x: 8, y: 8 } });

const splitAmount = (page: Page, name: string) => splitRow(page, name).locator('[data-testid^="split-amount-"]');
const splitRatio = (page: Page, name: string) => splitRow(page, name).locator('[data-testid^="split-ratio-"]');

/** { entityId: amount } for an expense's splits. */
const shares = (expense: any) => Object.fromEntries(expense.splits.map((s: any) => [s.entityId, s.amount]));

test.describe('Split expenses through the form', () => {
  test('equal, ratio and custom splits each show the right shares, in the list and in the summary cards', async ({ page }) => {
    const p = await pool.cast('splits');
    const eventId = await splitEvent(p.anita, [p.ravi, p.priya], 'Hampi trip');
    await openEvent(page, p.anita, eventId);

    // Equal: ₹900 three ways.
    await startExpense(page, eventId, 'Dinner', '900');
    await expect(page.getByTestId('split-type-equal')).toBeChecked();
    for (const name of ['Anita', 'Ravi', 'Priya']) await expect(splitAmount(page, name)).toHaveValue('₹300.00');
    await submitExpense(page, eventId);

    // By ratio: ₹1,200 at 2:1:1.
    await startExpense(page, eventId, 'Hotel', '1200');
    await page.getByTestId('split-type-ratio').check();
    await splitRatio(page, 'Anita').fill('2');
    await expect(splitAmount(page, 'Anita')).toHaveValue('₹600.00');
    for (const name of ['Ravi', 'Priya']) await expect(splitAmount(page, name)).toHaveValue('₹300.00');
    await submitExpense(page, eventId);

    // Custom: ₹500 as 100 / 150 / 250.
    await startExpense(page, eventId, 'Taxi', '500');
    await page.getByTestId('split-type-custom').check();
    await splitAmount(page, 'Anita').fill('100');
    await splitAmount(page, 'Ravi').fill('150');
    await splitAmount(page, 'Priya').fill('250');
    await expect(page.getByTestId('split-mismatch-error')).toHaveCount(0);
    await submitExpense(page, eventId);

    // Stored as entered.
    const dinner = await expenseByTitle(eventId, p.anita, 'Dinner');
    const hotel = await expenseByTitle(eventId, p.anita, 'Hotel');
    const taxi = await expenseByTitle(eventId, p.anita, 'Taxi');
    expect([dinner.splitType, shares(dinner)]).toEqual(['equal', { [p.anita]: 300, [p.ravi]: 300, [p.priya]: 300 }]);
    expect([hotel.splitType, shares(hotel)]).toEqual(['ratio', { [p.anita]: 600, [p.ravi]: 300, [p.priya]: 300 }]);
    expect(hotel.splits.map((s: any) => s.ratio)).toEqual([2, 1, 1]);
    expect([taxi.splitType, shares(taxi)]).toEqual(['custom', { [p.anita]: 100, [p.ravi]: 150, [p.priya]: 250 }]);

    // Each row says how it was split; opening it shows everyone's share.
    await expect(page.getByTestId('tab-expenses')).toHaveText('Expenses (3)');
    const rows: Array<[any, string, string, string[]]> = [
      [dinner, '₹900.00', 'Equal split · 3 split(s)', ['33.3%', '₹300.00']],
      [hotel, '₹1200.00', 'Ratio split · 3 split(s)', ['₹600.00', '₹300.00']],
      [taxi, '₹500.00', 'Custom split · 3 split(s)', ['₹100.00', '₹150.00', '₹250.00']],
    ];
    for (const [expense, amount, kind, details] of rows) {
      const row = page.getByTestId(`expense-item-${expense.id}`);
      await expect(row).toContainText(amount);
      await expect(row).toContainText(`Paid by: Anita · ${kind}`);
      await expand(row);
      for (const text of details) await expect(row).toContainText(text);
    }

    // Anita's cards: everything is shared; her share is 300 + 600 + 100.
    await expect(page.getByTestId('summary-total-expense')).toContainText('₹2600.00');
    await expect(page.getByTestId('summary-total-shared')).toContainText('₹2600.00');
    await expect(page.getByTestId('summary-your-shared')).toContainText('₹1000.00');
    await expect(page.getByTestId('summary-private-expense')).toContainText('₹0.00');
    expect(await balances(eventId, p.anita)).toEqual({ [p.anita]: 1600, [p.ravi]: -750, [p.priya]: -850 });

    // Ravi's share is 300 + 300 + 150.
    await openEvent(page, p.ravi, eventId);
    await expect(page.getByTestId('summary-total-expense')).toContainText('₹2600.00');
    await expect(page.getByTestId('summary-your-shared')).toContainText('₹750.00');
  });

  test('custom splits that do not add up show the difference and keep the form from submitting', async ({ page }) => {
    const p = await pool.cast('mismatch');
    const eventId = await splitEvent(p.anita, [p.ravi, p.priya], 'Kodai trip');
    await openEvent(page, p.anita, eventId);

    await startExpense(page, eventId, 'Boat ride', '1000');
    await page.getByTestId('split-type-custom').check();
    await splitAmount(page, 'Anita').fill('300');
    await splitAmount(page, 'Ravi').fill('300');
    await splitAmount(page, 'Priya').fill('300');
    await expect(page.getByTestId('split-mismatch-error')).toHaveText(
      'Split amounts (₹900.00) do not match the total expense (₹1000.00). Difference: ₹100.00',
    );
    await expect(page.getByTestId('create-expense-submit')).toBeDisabled();

    // Too much is refused as well.
    await splitAmount(page, 'Priya').fill('600');
    await expect(page.getByTestId('split-mismatch-error')).toContainText('Difference: ₹200.00');
    await expect(page.getByTestId('create-expense-submit')).toBeDisabled();

    // Once they add up, it saves.
    await splitAmount(page, 'Priya').fill('400');
    await expect(page.getByTestId('split-mismatch-error')).toHaveCount(0);
    await expect(page.getByTestId('create-expense-submit')).toBeEnabled();
    await submitExpense(page, eventId);
    const boat = await expenseByTitle(eventId, p.anita, 'Boat ride');
    expect(shares(boat)).toEqual({ [p.anita]: 300, [p.ravi]: 300, [p.priya]: 400 });
  });

  test('paying on behalf of others: the payer has no share and is owed the full amount at settle-up', async ({ page }) => {
    const p = await pool.cast('behalf');
    const eventId = await splitEvent(p.anita, [p.ravi, p.priya], 'Sunburn festival');
    await openEvent(page, p.anita, eventId);

    // Anita buys Ravi's and Priya's tickets.
    await startExpense(page, eventId, 'Concert tickets', '1800');
    await page.getByTestId('expense-on-behalf-toggle').check();
    await expect(page.locator('[data-testid^="entity-checkbox-"]', { hasText: 'Anita' })).toContainText('(You — excluded)');
    await page.getByTestId(`on-behalf-entity-${p.ravi}`).locator('input').check();
    await page.getByTestId(`on-behalf-entity-${p.priya}`).locator('input').check();
    await expect(page.getByTestId(`on-behalf-entity-${p.anita}`)).toHaveCount(0);
    await expect(splitRow(page, 'Anita')).toHaveCount(0);
    for (const name of ['Ravi', 'Priya']) await expect(splitAmount(page, name)).toHaveValue('₹900.00');
    await submitExpense(page, eventId);

    const tickets = await expenseByTitle(eventId, p.anita, 'Concert tickets');
    expect(tickets.paidOnBehalfOf).toEqual([{ entityId: p.ravi, entityType: 'user' }, { entityId: p.priya, entityType: 'user' }]);
    expect(shares(tickets)).toEqual({ [p.ravi]: 900, [p.priya]: 900 });

    // Settling: Anita gets the whole ₹1,800 back, ₹900 from each.
    await page.getByTestId('settle-btn').click();
    await confirmDialog(page, 'Generate Settlement Plan');
    const review = page.getByTestId('settlement-review-section');
    await expect(review).toContainText('Total Settlement₹1800.00');
    const legs = await pool.settlements(eventId, p.anita);
    expect(legs.map((l) => [l.fromUserId, l.toUserId, l.amount]).sort()).toEqual([[p.priya, p.anita, 900], [p.ravi, p.anita, 900]].sort());
    for (const leg of legs) {
      const from = leg.fromUserId === p.ravi ? 'Ravi' : 'Priya';
      await expect(page.getByTestId(`settlement-review-txn-${leg.id}`)).toContainText(new RegExp(`${from}\\s*→\\s*Anita.*₹900\\.00`));
    }

    // Ravi sees what Anita paid for him, and his ₹900 share.
    await openEvent(page, p.ravi, eventId);
    const row = page.getByTestId(`expense-item-${tickets.id}`);
    await expect(row).toContainText('Paid by: Anita · On Behalf split · 2 split(s)');
    await expand(row);
    await expect(row).toContainText('On behalf of: Ravi, Priya');
    await expect(page.getByTestId('summary-your-shared')).toContainText('₹900.00');
  });

  // App bug: the event page lists a shared expense only if the viewer's entity is in its splits
  // (isSharedWithMyEntity in apps/web/src/app/events/[eventId]/page.tsx). An "on behalf of" payer is
  // never in the splits, so their own expense is missing from their list ("Expenses (0)"), they
  // can't edit or delete it there, and their Total Expense card leaves it out (₹0.00, not ₹1,800).
  test.fixme('the payer of an "on behalf of" expense sees it in their own list and Total Expense', async ({ page }) => {
    const p = await pool.cast('behalf-payer');
    const eventId = await splitEvent(p.anita, [p.ravi, p.priya], 'Sunburn festival');
    const tickets = await pool.call('POST', '/api/expenses', p.anita, {
      eventId, title: 'Concert tickets', amount: 1800, currency: 'INR', splitType: 'equal',
      splits: [p.ravi, p.priya].map((entityId) => ({ entityType: 'user', entityId, amount: 900 })),
      paidOnBehalfOf: [p.ravi, p.priya].map((entityId) => ({ entityType: 'user', entityId })),
    });
    await openEvent(page, p.anita, eventId);
    await expect(page.getByTestId('tab-expenses')).toHaveText('Expenses (1)');
    const row = page.getByTestId(`expense-item-${tickets.id}`);
    await expect(row).toContainText('Paid by: Anita · On Behalf split · 2 split(s)');
    await expect(page.getByTestId(`edit-expense-${tickets.id}`)).toBeVisible();
    await expect(page.getByTestId('summary-total-expense')).toContainText('₹1800.00');
    await expect(page.getByTestId('summary-your-shared')).toContainText('₹0.00');
  });

  test('a private expense is seen only by its owner and is left out of everyone else\'s totals and the balances', async ({ page }) => {
    const p = await pool.cast('private');
    const eventId = await splitEvent(p.anita, [p.ravi, p.priya], 'Pondicherry trip');
    await pool.call('POST', '/api/expenses', p.anita, {
      eventId, title: 'Groceries', amount: 600, currency: 'INR', splitType: 'equal',
      splits: [p.anita, p.ravi, p.priya].map((entityId) => ({ entityType: 'user', entityId, amount: 200 })),
    });

    // Ravi records his souvenirs as private: there's nothing to split.
    await openEvent(page, p.ravi, eventId);
    await startExpense(page, eventId, 'Souvenirs', '700');
    await page.getByTestId('expense-private-toggle').check();
    await expect(page.getByTestId('split-type-equal')).toHaveCount(0);
    await expect(page.getByTestId('expense-on-behalf-toggle')).toHaveCount(0);
    await expect(page.locator('[data-testid^="split-row-"]')).toHaveCount(0);
    await submitExpense(page, eventId);

    const souvenirs = (await expenses(eventId, p.ravi)).find((e) => e.title === 'Souvenirs');
    expect(souvenirs).toMatchObject({ isPrivate: true, splits: [], paidBy: p.ravi, amount: 700 });

    // Ravi sees it, marked Private, in his own totals.
    await expect(page.getByTestId('tab-expenses')).toHaveText('Expenses (2)');
    const row = page.getByTestId(`expense-item-${souvenirs.id}`);
    await expect(row).toContainText('Private');
    await expect(row).toContainText('₹700.00');
    await expect(page.getByTestId('summary-total-expense')).toContainText('₹1300.00');
    await expect(page.getByTestId('summary-total-shared')).toContainText('₹600.00');
    await expect(page.getByTestId('summary-your-shared')).toContainText('₹200.00');
    await expect(page.getByTestId('summary-private-expense')).toContainText('₹700.00');

    // Anita doesn't: not in her list, her totals, or what the API gives her.
    await openEvent(page, p.anita, eventId);
    await expect(page.getByTestId('tab-expenses')).toHaveText('Expenses (1)');
    await expect(page.getByTestId(`expense-item-${souvenirs.id}`)).toHaveCount(0);
    await expect(page.getByText('Souvenirs')).toHaveCount(0);
    await expect(page.getByTestId('summary-total-expense')).toContainText('₹600.00');
    await expect(page.getByTestId('summary-private-expense')).toContainText('₹0.00');
    expect((await expenses(eventId, p.anita)).map((e) => e.title)).toEqual(['Groceries']);
    expect((await apiRequestWithStatus('GET', `/api/expenses/${souvenirs.id}`, undefined, p.anita)).status).toBe(404);

    // Balances only count the groceries.
    expect(await balances(eventId, p.anita)).toEqual({ [p.anita]: 400, [p.ravi]: -200, [p.priya]: -200 });
  });
});
