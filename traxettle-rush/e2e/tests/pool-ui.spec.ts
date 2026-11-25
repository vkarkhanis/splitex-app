/**
 * Money pooling done in the browser rather than seeded (gaps 9, 10 and 11 of the coverage map):
 * a Kitty created through the create-event form; dues marked paid with a reference and proof,
 * confirmed in part and waived, and money added as a gift and as a loan; and a reimbursement
 * claim with a receipt uploaded through the receipt field, approved, paid and confirmed.
 * Only the people, the pool events and the custodian's own dues are set up through the API.
 */
import { test, expect, Page } from '@playwright/test';
import * as pool from '../helpers/pool';
import { futureDate, openEvent, PNG_1PX, signIn } from '../helpers/ui';

test.describe.configure({ timeout: 120_000 });

async function openPool(page: Page, userId: string, eventId: string) {
  await openEvent(page, userId, eventId);
  await page.getByTestId('tab-pool').click();
  await expect(page.getByTestId('pool-tab')).toBeVisible({ timeout: 15_000 });
}

/** The regular dues (or a top-up) of one person, from the ledger. */
async function contributionOf(eventId: string, custodian: string, userId: string, kind = 'regular') {
  const { contributions } = await pool.ledger(eventId, custodian);
  return contributions.find((c: any) => c.fromUserId === userId && c.kind === kind);
}

test.describe('Money pooling through the UI', () => {
  test('a Kitty created through the form opens on its Pool tab with dues set and only chosen people spending', async ({ page }) => {
    const p = await pool.cast('kitty-form', { anitaPro: true });
    await signIn(page, p.anita);
    await page.goto('/events/create');
    await page.getByTestId('event-name-input').fill('Gokarna kitty');
    await page.getByTestId('event-type-select').selectOption('trip');
    await page.getByTestId('event-currency-select').selectOption('INR');
    await page.getByTestId('event-start-date-input').fill(futureDate());

    await page.getByTestId('funding-pool').click();
    await page.getByTestId('funder-contributors').click();
    await expect(page.getByTestId('funder-contributors')).toHaveAttribute('aria-checked', 'true');
    await page.getByTestId('preset-trip_kitty').click();
    await expect(page.getByTestId('preset-trip_kitty')).toHaveAttribute('aria-checked', 'true');
    await expect(page.getByTestId('funding-step')).toContainText('leftovers are refunded in proportion');
    await page.getByTestId('pool-per-person-input').fill('2500');
    await page.getByTestId('funding-advanced').click();
    await page.getByTestId('pool-spenders-mode').selectOption('listed');
    await expect(page.getByTestId('funding-step')).toContainText("Choose them on the pool's page after inviting people.");
    await page.getByTestId('create-event-submit').click();

    await page.waitForURL(/\/events\/(?!create$)[^/]+$/, { timeout: 15_000 });
    const eventId = new URL(page.url()).pathname.split('/').pop()!;
    const event = await pool.event(eventId, p.anita);
    expect(event.fundingModel).toBe('pool');
    expect(event.poolConfig).toMatchObject({
      preset: 'trip_kitty', funderMode: 'contributors', custodianUserId: p.anita, spendersMode: 'listed', defaultContributionMinor: 250_000,
    });

    // The event opens on its Kitty tab: Anita holds it, her dues are set, and only chosen people spend.
    await expect(page.getByTestId('tab-pool')).toHaveText('Kitty');
    await expect(page.getByTestId('pool-tab')).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId('pool-title')).toContainText('Kitty');
    await expect(page.getByTestId('pool-tab')).toContainText('held by You');
    const dues = await contributionOf(eventId, p.anita, p.anita);
    expect(dues).toMatchObject({ expectedMinor: 250_000, receivedMinor: 0, status: 'pending' });
    await expect(page.getByTestId('pool-contributions')).toContainText('₹0.00 of ₹2,500.00 received');
    await expect(page.getByTestId(`contribution-${dues.id}`)).toContainText('Not paid');
    await expect(page.getByTestId(`mark-paid-${dues.id}`)).toBeVisible();
    await expect(page.getByTestId('spenders-mode')).toHaveValue('listed');
    await expect(page.getByTestId('spender-permissions')).toContainText('Others can still claim back money they spent, with approval.');
  });

  test('dues marked paid with a reference and proof, confirmed in part or waived, and money added as a gift and as a loan', async ({ page }) => {
    const p = await pool.cast('dues', { anitaPro: true });
    const eventId = await pool.createPool(p.anita, 'Spiti kitty', { preset: 'trip_kitty', defaultContributionMinor: 200_000 });
    await pool.join(eventId, p.anita, p.ravi);
    await pool.join(eventId, p.anita, p.priya);
    await pool.payIn(eventId, p.anita, p.anita);
    await pool.spend(eventId, p.anita, 'Fuel', 1_000);
    const raviDues = await contributionOf(eventId, p.anita, p.ravi);
    const priyaDues = await contributionOf(eventId, p.anita, p.priya);

    // Ravi says he sent his ₹2,000, with a UPI reference and a screenshot.
    await openPool(page, p.ravi, eventId);
    await page.getByTestId(`mark-paid-${raviDues.id}`).click();
    const markPaid = page.getByTestId('pool-mark-paid-modal');
    await expect(page.getByTestId('mark-paid-amount')).toHaveValue('2000');
    await page.getByTestId('mark-paid-reference').fill('UPI-RAVI-1');
    await page.getByTestId('mark-paid-proof').setInputFiles(PNG_1PX);
    await expect(markPaid).toContainText('Proof attached ✓');
    await page.getByTestId('mark-paid-submit').click();
    await expect(markPaid).toHaveCount(0);
    const raviRow = page.getByTestId(`contribution-${raviDues.id}`);
    await expect(raviRow).toContainText('Awaiting confirmation');
    await expect(raviRow).toContainText('says they sent ₹2,000.00 · ref UPI-RAVI-1 · proof');
    expect(await contributionOf(eventId, p.anita, p.ravi)).toMatchObject({
      status: 'initiated', claimedMinor: 200_000, paymentReference: 'UPI-RAVI-1', proofUrl: expect.stringContaining('receipt.png'),
    });

    // Anita only received ₹1,500 of it, and excuses Priya this time.
    await openPool(page, p.anita, eventId);
    await page.getByTestId(`confirm-${raviDues.id}`).click();
    const amountModal = page.getByTestId('pool-amount-modal');
    await expect(amountModal).toContainText('Confirm money received');
    await expect(page.getByTestId('pool-amount-input')).toHaveValue('2000');
    await page.getByTestId('pool-amount-input').fill('1500');
    await page.getByTestId('pool-amount-submit').click();
    await expect(amountModal).toHaveCount(0);
    await expect(raviRow).toContainText('Part paid');
    await expect(raviRow).toContainText('₹1,500.00 of ₹2,000.00');
    await page.getByTestId(`waive-${priyaDues.id}`).click();
    await expect(page.getByTestId(`contribution-${priyaDues.id}`)).toContainText('Waived');
    expect((await contributionOf(eventId, p.anita, p.ravi)).receivedMinor).toBe(150_000);
    expect((await contributionOf(eventId, p.anita, p.priya)).status).toBe('waived');

    // Ravi gives the kitty ₹500; Priya lends it ₹300.
    await openPool(page, p.ravi, eventId);
    await page.getByTestId('pool-add-money').click();
    await page.getByTestId('pool-amount-input').fill('500');
    await page.getByTestId('top-up-gift').check();
    await page.getByTestId('pool-amount-submit').click();
    await expect(amountModal).toHaveCount(0);
    const gift = await contributionOf(eventId, p.anita, p.ravi, 'top_up');
    expect(gift).toMatchObject({ gift: true, status: 'initiated', claimedMinor: 50_000 });
    await expect(page.getByTestId(`contribution-${gift.id}`)).toContainText('Gift');

    await openPool(page, p.priya, eventId);
    await page.getByTestId('pool-add-money').click();
    await page.getByTestId('pool-amount-input').fill('300');
    await expect(page.getByTestId('top-up-loan')).toBeChecked();
    await expect(amountModal).toContainText('Paid back to me when the kitty settles up');
    await page.getByTestId('pool-amount-submit').click();
    await expect(amountModal).toHaveCount(0);
    const loan = await contributionOf(eventId, p.anita, p.priya, 'top_up');
    expect(loan.gift).toBeFalsy();
    await expect(page.getByTestId(`contribution-${loan.id}`)).toContainText('Top-up · paid back at close');

    // Anita confirms both; the dialog says which is paid back.
    await openPool(page, p.anita, eventId);
    await page.getByTestId(`confirm-${gift.id}`).click();
    await expect(amountModal).toContainText("A gift from Ravi: it isn't paid back.");
    await page.getByTestId('pool-amount-submit').click();
    await expect(amountModal).toHaveCount(0);
    await page.getByTestId(`confirm-${loan.id}`).click();
    await expect(amountModal).toContainText("You'll pay this back to Priya when the kitty closes.");
    await page.getByTestId('pool-amount-submit').click();
    await expect(amountModal).toHaveCount(0);

    // The kitty: ₹2,000 + ₹1,500 + ₹500 + ₹300 in, ₹1,000 spent; Ravi still owes ₹500 of his dues.
    await expect(page.getByTestId('pool-totals')).toContainText('collected ₹4,300.00');
    await expect(page.getByTestId('pool-totals')).toContainText('spent ₹1,000.00');
    await expect(page.getByTestId('pool-arrears')).toContainText('(₹500.00)');
    await expect(page.getByTestId(`ledger-${raviDues.id}`)).toContainText('+₹1,500.00');
    await expect(page.getByTestId(`ledger-${gift.id}`)).toContainText('+₹500.00');
    await expect(page.getByTestId(`ledger-${loan.id}`)).toContainText('+₹300.00');

    // Settling up: the gift pays for ₹500 of the spending, the rest is shared by agreed dues
    // (Anita and Ravi ₹250 each; Priya's were waived); Priya's loan comes back to her.
    await page.getByTestId('pool-settle-up').click();
    await expect(page.getByTestId('reconcile-figure-result')).toBeVisible({ timeout: 10_000 });
    await expect(page.getByTestId('reconcile-figure-collected')).toContainText('₹4,300.00');
    await expect(page.getByTestId('reconcile-figure-spent')).toContainText('₹1,000.00');
    await expect(page.getByTestId('reconcile-figure-result')).toHaveText('Left over₹3,300.00');
    await expect(page.getByTestId(`reconcile-row-user:${p.ravi}`)).toContainText('gets back ₹1,250.00');
    await expect(page.getByTestId(`reconcile-row-user:${p.priya}`)).toContainText('gets back ₹300.00');
    await expect(page.getByTestId(`reconcile-row-user:${p.anita}`)).toContainText('pays ₹1,550.00');
  });

  test('a claim with a receipt uploaded on the form is approved, paid and confirmed, and reads "Reimbursed"', async ({ page }) => {
    const p = await pool.cast('claim');
    const eventId = await pool.createPool(p.anita, 'Offsite budget', {
      preset: 'sponsor_budget', targetAmountMinor: 2_000_000, overrides: { authorizedSpenders: [p.ravi] },
    });
    await pool.join(eventId, p.anita, p.ravi);

    // Ravi claims back an airport taxi he paid himself.
    await openEvent(page, p.ravi, eventId);
    await page.getByTestId('tab-expenses').click();
    await page.getByTestId('add-expense-btn').click();
    await expect(page.getByTestId('paid-with-pool_reimbursement')).toBeVisible({ timeout: 15_000 });
    await page.getByTestId('paid-with-pool_reimbursement').click();
    await page.getByTestId('expense-title-input').fill('Airport taxi');
    await page.getByTestId('expense-amount-input').fill('800');
    await expect(page.getByTestId('claim-note')).toHaveText("You'll be reimbursed ₹800.00 from the budget once it's approved.");
    await expect(page.getByTestId('receipt-field')).toContainText('A receipt is required for this expense.');
    await expect(page.getByTestId('create-expense-submit')).toHaveText('Submit claim');

    // Not without a receipt.
    await page.getByTestId('create-expense-submit').click();
    await expect(page.getByTestId('create-expense-error')).toHaveText('Attach a receipt to record this.');

    // He uploads a photo of the bill through the receipt field.
    await page.getByTestId('receipt-input').setInputFiles(PNG_1PX);
    await expect(page.getByTestId('receipt-field')).toContainText('Receipt 1');
    await expect(page.getByTestId('receipt-field')).not.toContainText('A receipt is required');
    await page.getByTestId('create-expense-submit').click();
    await page.waitForURL(new RegExp(`/events/${eventId}$`), { timeout: 15_000 });

    const taxi = (await pool.ledger(eventId, p.anita)).entries.find((e: any) => e.title === 'Airport taxi');
    expect(taxi).toMatchObject({ fundingSource: 'pool_reimbursement', status: 'pending', amountMinor: -80_000 });
    expect(taxi.receiptUrls).toEqual([expect.stringContaining('receipt.png')]);
    await page.getByTestId('tab-expenses').click();
    const row = page.getByTestId(`expense-item-${taxi.id}`);
    await expect(row).toContainText('Claim');
    await expect(row).toContainText('Awaiting approval');
    await expect(row).toContainText('1 receipt(s)');

    // Anita approves it on the budget page: a payment to Ravi appears.
    await openPool(page, p.anita, eventId);
    const approvals = page.getByTestId('pool-pending-approvals');
    await expect(approvals).toContainText('Airport taxi');
    await expect(approvals).toContainText('Reimbursement');
    await expect(approvals.getByRole('link', { name: 'receipt' })).toHaveAttribute('href', /receipt\.png/);
    await page.getByTestId(`approve-draw-${taxi.id}`).click();
    await expect(approvals).toHaveCount(0);
    const leg = (await pool.settlements(eventId, p.anita)).find((l) => l.kind === 'pool_reimbursement');
    expect(leg).toMatchObject({ fromUserId: p.anita, toUserId: p.ravi, amount: 800, status: 'pending' });
    const legRow = page.getByTestId(`pool-leg-${leg.id}`);
    await expect(legRow).toContainText(/You → Ravi\s*Reimbursement\s*To pay/);
    await expect(legRow).toContainText('₹800.00');

    // She pays him outside the app and marks it paid.
    await page.getByTestId(`pool-leg-pay-${leg.id}`).click();
    await expect(page.getByText('Send ₹800.00 to Ravi, then record it.')).toBeVisible();
    await page.getByLabel('Reference (optional)').fill('UPI-TAXI-1');
    await page.getByTestId('pool-leg-pay-submit').click();
    await expect(legRow).toContainText('Paid — awaiting confirmation');

    // Ravi confirms he got it.
    await openPool(page, p.ravi, eventId);
    await page.getByTestId(`pool-leg-confirm-${leg.id}`).click();
    await expect(page.getByTestId(`pool-leg-${leg.id}`)).toContainText('Done');
    await page.getByTestId('tab-expenses').click();
    await expect(page.getByTestId(`reimbursement-badge-${taxi.id}`)).toHaveText('Reimbursed');

    // Paid on its own: the budget stays open.
    const paid = (await pool.settlements(eventId, p.anita)).find((l) => l.id === leg.id);
    expect([paid.status, paid.paymentReference]).toEqual(['completed', 'UPI-TAXI-1']);
    expect((await pool.event(eventId, p.anita)).status).toBe('active');
  });
});
