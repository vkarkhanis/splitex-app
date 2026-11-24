/**
 * Money pooling Phase 3 in the browser (traxettle-app/docs/utility/MONEY_POOLING_PHASE3_PROPOSAL.md):
 * a spender list and an approver in a kitty, and a spend entered in another currency; a split
 * expense entered in another currency (gap 15 of the coverage map), and what an approver who
 * isn't an admin can't do. The events have a predefined USD→INR rate, so nothing depends on the
 * live rates service.
 */
import { test, expect, Page } from '@playwright/test';
import { loginAsMockUser } from '../helpers/auth';
import * as pool from '../helpers/pool';
import { balances, expenseByTitle, openEvent, splitEvent, splitRow } from '../helpers/ui';

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

// Phase 3 D: a split expense (not a pool spend) entered in another currency is stored, split and
// balanced in the event's currency at the event's set rate.
test('Phase 3: a split expense entered in dollars is shared out in rupees at the event\'s set rate', async ({ page }) => {
  const p = await pool.cast('p3d', { anitaPro: true });
  const eventId = await splitEvent(p.anita, [p.ravi, p.priya], 'Bali trip', { fxRateMode: 'predefined', predefinedFxRates: { USD_INR: 83.5 } });

  // Anita (Pro) books scuba lessons in dollars, split unevenly.
  await openEvent(page, p.anita, eventId);
  await page.getByTestId('add-expense-btn').click();
  await expect(page.locator('[data-testid^="split-row-"]').first()).toBeVisible({ timeout: 15_000 });
  await expect(page.getByTestId('expense-currency-select')).toBeEnabled();
  await page.getByTestId('expense-title-input').fill('Scuba lessons');
  await page.getByTestId('expense-amount-input').fill('30');
  await page.getByTestId('expense-currency-select').selectOption('USD');
  await expect(page.getByTestId('fx-preview')).toContainText("≈ ₹2,505.00 at 1 USD = 83.5 INR (the event's set rate). It's recorded in INR.");
  await page.getByTestId('split-type-custom').check();
  const amountFor = (name: string) => splitRow(page, name).locator('[data-testid^="split-amount-"]');
  await amountFor('Anita').fill('5');
  await amountFor('Ravi').fill('10');
  await amountFor('Priya').fill('15');
  await expect(page.getByTestId('split-mismatch-error')).toHaveCount(0);
  await page.getByTestId('create-expense-submit').click();
  await page.waitForURL(new RegExp(`/events/${eventId}$`), { timeout: 15_000 });

  // Stored in rupees, with what was entered beside it; each share converted at 83.5.
  const scuba = await expenseByTitle(eventId, p.anita, 'Scuba lessons');
  expect(scuba).toMatchObject({ amount: 2505, currency: 'INR', originalAmount: 30, originalCurrency: 'USD', fxRate: 83.5, fxRateSource: 'predefined' });
  expect(Object.fromEntries(scuba.splits.map((s: any) => [s.entityId, s.amount]))).toEqual({ [p.anita]: 417.5, [p.ravi]: 835, [p.priya]: 1252.5 });

  // The list shows both amounts, the shares are in rupees, and so are the cards and balances.
  const row = page.getByTestId(`expense-item-${scuba.id}`);
  await expect(row).toContainText('₹2505.00');
  await expect(page.getByTestId(`expense-original-${scuba.id}`)).toHaveText('$30.00');
  await row.locator(':scope > div').first().click({ position: { x: 8, y: 8 } });
  for (const share of ['₹417.50', '₹835.00', '₹1252.50']) await expect(row).toContainText(share);
  await expect(page.getByTestId('summary-total-expense')).toContainText('₹2505.00');
  await expect(page.getByTestId('summary-your-shared')).toContainText('₹417.50');
  expect(await balances(eventId, p.anita)).toEqual({ [p.anita]: 2087.5, [p.ravi]: -835, [p.priya]: -1252.5 });
});

// Phase 3 B: approvers decide other people's spends and nothing else.
test('Phase 3: an approver who isn\'t an admin approves a spend but has no Settle up, Close month or settings', async ({ page }) => {
  const p = await pool.cast('p3b', { anitaPro: true });
  const eventId = await pool.createPool(p.anita, 'Flat 7C', { preset: 'household', defaultContributionMinor: 500_000, overrides: { expenseApproval: 'always' } });
  await pool.join(eventId, p.anita, p.ravi);
  await pool.join(eventId, p.anita, p.priya);
  for (const uid of [p.anita, p.ravi, p.priya]) await pool.payIn(eventId, p.anita, uid);
  await pool.call('PUT', `/api/pools/event/${eventId}/config`, p.anita, { approverUserIds: [p.priya] });
  const wifi = await pool.spend(eventId, p.ravi, 'Wi-Fi bill', 1_200, { paidFrom: 'sponsor_card', alreadyIncurred: true });
  expect(wifi.poolDraw.status).toBe('pending');

  // Priya can approve Ravi's spend, but none of the admin's controls are there for her.
  await openPool(page, p.priya, eventId);
  await expect(page.getByTestId('pool-pending-approvals')).toContainText('Wi-Fi bill');
  await expect(page.getByTestId(`approve-draw-${wifi.id}`)).toBeEnabled();
  await expect(page.getByTestId('pool-add-money')).toBeVisible();
  for (const id of ['pool-settle-up', 'pool-close-cycle', 'pool-set-amounts', 'save-spenders']) {
    await expect(page.getByTestId(id)).toHaveCount(0);
  }
  await expect(page.getByTestId('approval-mode')).toBeDisabled();
  await page.getByTestId('tab-expenses').click();
  await expect(page.getByTestId('add-expense-btn')).toBeVisible();
  await expect(page.getByTestId('settle-pool-btn')).toHaveCount(0);
  await expect(page.getByTestId('settle-btn')).toHaveCount(0);

  await page.getByTestId('tab-pool').click();
  await page.getByTestId(`approve-draw-${wifi.id}`).click();
  await expect(page.getByTestId('pool-pending-approvals')).toHaveCount(0);
  await expect.poll(async () => (await pool.ledger(eventId, p.anita)).entries.find((e: any) => e.id === wifi.id).status).toBe('approved');

  // Anita, the admin, has them.
  await openPool(page, p.anita, eventId);
  await expect(page.getByTestId('pool-settle-up')).toBeVisible();
  await expect(page.getByTestId('pool-close-cycle')).toBeVisible();
  await expect(page.getByTestId('save-spenders')).toBeVisible();
});
