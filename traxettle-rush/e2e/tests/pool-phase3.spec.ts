/**
 * Money pooling Phase 3 in the browser (traxettle-app/docs/utility/MONEY_POOLING_PHASE3_PROPOSAL.md):
 * a spender list and an approver in a kitty, and a spend entered in another currency.
 * The event has a predefined USD→INR rate, so nothing depends on the live rates service.
 */
import { test, expect, Page } from '@playwright/test';
import { loginAsMockUser } from '../helpers/auth';
import * as pool from '../helpers/pool';

test.describe.configure({ timeout: 120_000 });

async function openPool(page: Page, userId: string, eventId: string) {
  await loginAsMockUser(page, userId);
  await page.goto(`/events/${eventId}`);
  await page.getByTestId('tab-pool').click();
  await expect(page.getByTestId('pool-tab')).toBeVisible({ timeout: 15_000 });
}

test('Phase 3: only chosen people spend, an approver decides, and a spend in dollars is recorded in rupees', async ({ page }) => {
  const p = await pool.cast('p3', { anitaPro: true });
  const event = await pool.call('POST', '/api/events', p.anita, {
    name: 'Goa trip', type: 'trip', startDate: '2026-12-01', currency: 'INR',
    fxRateMode: 'predefined', predefinedFxRates: { USD_INR: 83.5 },
    pool: { preset: 'trip_kitty', defaultContributionMinor: 200_000, overrides: { spendersMode: 'listed', expenseApproval: 'always' } },
  });
  const eventId = event.id as string;
  await pool.join(eventId, p.anita, p.ravi);
  await pool.join(eventId, p.anita, p.priya);
  for (const uid of [p.anita, p.ravi, p.priya]) await pool.payIn(eventId, p.anita, uid);

  // Anita lets Ravi spend and makes Priya an approver.
  await openPool(page, p.anita, eventId);
  const card = page.getByTestId('spender-permissions');
  await expect(card).toContainText('Who can spend and approve');
  await expect(page.getByTestId('spenders-mode')).toHaveValue('listed');
  await page.getByTestId(`spender-${p.ravi}`).check();
  await page.getByTestId(`approver-${p.priya}`).check();
  await page.getByTestId('save-spenders').click();
  await expect.poll(async () => (await pool.event(eventId, p.anita)).poolConfig).toMatchObject({
    authorizedSpenders: [p.ravi], approverUserIds: [p.priya], expenseApproval: 'always',
  });

  // Priya isn't on the list: she can only claim back her own money.
  await loginAsMockUser(page, p.priya);
  await page.goto(`/events/${eventId}/expenses/create`);
  await expect(page.getByTestId('paid-with-pool_reimbursement')).toBeVisible({ timeout: 15_000 });
  await expect(page.getByTestId('paid-with-pool_card')).toHaveCount(0);

  // Ravi pays a visa fee in dollars: the form shows the rupee amount at the event's rate.
  await loginAsMockUser(page, p.ravi);
  await page.goto(`/events/${eventId}/expenses/create`);
  await page.getByTestId('paid-with-pool_card').click();
  await page.getByTestId('spend-timing-paid').click();
  await page.getByTestId('expense-title-input').fill('Visa fee');
  await page.getByTestId('expense-amount-input').fill('10');
  await page.getByTestId('expense-currency-select').selectOption('USD');
  await expect(page.getByTestId('fx-preview')).toContainText("≈ ₹835.00 at 1 USD = 83.5 INR (the event's set rate)");
  await page.getByTestId('create-expense-submit').click();
  await page.waitForURL(new RegExp(`/events/${eventId}$`), { timeout: 15_000 });
  const visa = (await pool.ledger(eventId, p.anita)).entries.find((e: any) => e.title === 'Visa fee');
  expect(visa).toMatchObject({ amountMinor: -83_500, status: 'pending', originalAmount: 10, originalCurrency: 'USD' });

  // Priya, the approver, approves it from the kitty page.
  await openPool(page, p.priya, eventId);
  await expect(page.getByTestId(`approval-original-${visa.id}`)).toHaveText(' · entered as $10.00');
  await page.getByTestId(`approve-draw-${visa.id}`).click();
  await expect.poll(async () => (await pool.ledger(eventId, p.anita)).entries.find((e: any) => e.id === visa.id).status).toBe('approved');

  // The expense list shows both amounts.
  await page.getByTestId('tab-expenses').click();
  await expect(page.getByTestId(`expense-item-${visa.id}`)).toContainText('₹835.00');
  await expect(page.getByTestId(`expense-original-${visa.id}`)).toHaveText('$10.00');
});
