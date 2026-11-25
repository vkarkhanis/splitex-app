/**
 * Settling a split-expenses event in the browser, every step clicked: Settle Now, each person's
 * approval, "I've Paid", "Confirm Receipt" and Close Event (gap 1 of the coverage map), and a
 * USD event settled in INR at a set rate, created through the form (gap 6). Only the people,
 * the members and the expenses are set up through the API.
 */
import { test, expect } from '@playwright/test';
import * as pool from '../helpers/pool';
import { confirmDialog, futureDate, openEvent, signIn, splitEvent } from '../helpers/ui';

test.describe.configure({ timeout: 120_000 });

/** "Ravi → Anita" on a settlement card, whatever the spacing around the arrow. */
const flow = (from: string, to: string) => new RegExp(`${from}\\s*→\\s*${to}`);

test.describe('Settlement in the browser', () => {
  test('a split expense is settled from the page: settle, both approve, pay, confirm receipt, close', async ({ page }) => {
    const p = await pool.cast('settle');
    const eventId = await splitEvent(p.anita, [p.ravi], 'Coorg weekend');
    await pool.call('POST', '/api/expenses', p.anita, {
      eventId, title: 'Homestay', amount: 3000, currency: 'INR', splitType: 'equal',
      splits: [p.anita, p.ravi].map((entityId) => ({ entityType: 'user', entityId, amount: 1500 })),
    });

    // Anita settles: the plan goes to review with one payment, Ravi → Anita ₹1,500.
    await openEvent(page, p.anita, eventId);
    await page.getByTestId('settle-btn').click();
    await confirmDialog(page, 'Generate Settlement Plan');
    const review = page.getByTestId('settlement-review-section');
    await expect(review).toContainText('0/2 approved');
    await expect(page.getByTestId('event-status-badge')).toHaveText('review');
    const [leg] = await pool.settlements(eventId, p.anita);
    expect(leg).toMatchObject({ fromUserId: p.ravi, toUserId: p.anita, amount: 1500, status: 'pending' });
    const reviewCard = page.getByTestId(`settlement-review-txn-${leg.id}`);
    await expect(reviewCard).toContainText(flow('Ravi', 'Anita'));
    await expect(reviewCard).toContainText('₹1500.00');

    // Anita approves; Ravi is still pending.
    await expect(page.getByTestId(`settlement-approval-${p.anita}`)).toContainText('Pending');
    await page.getByTestId('approve-settlement-btn').click();
    await expect(review).toContainText('1/2 approved');
    await expect(page.getByTestId(`settlement-approval-${p.anita}`)).toContainText('Approved');
    await expect(page.getByTestId(`settlement-approval-${p.ravi}`)).toContainText('Pending');
    await expect(review).toContainText('✓ You have approved');
    await expect(page.getByTestId('approve-settlement-btn')).toHaveCount(0);

    // Ravi approves last: payments open, and only he can pay.
    await openEvent(page, p.ravi, eventId);
    await page.getByTestId('approve-settlement-btn').click();
    const payments = page.getByTestId('settlement-section');
    await expect(payments).toContainText('0/1 complete');
    await expect(page.getByTestId('event-status-badge')).toHaveText('payment');
    const card = page.getByTestId(`settlement-txn-${leg.id}`);
    await expect(card).toContainText(flow('Ravi', 'Anita'));
    await expect(card).toContainText('Awaiting payment');
    await expect(card).toContainText('₹1500.00');

    // He pays outside the app and marks it paid with a reference.
    await page.getByTestId(`pay-btn-${leg.id}`).click();
    const payModal = page.getByTestId('settlement-pay-modal');
    await expect(payModal).toContainText('Complete payment via UPI / Net Banking / Bank Transfer outside Traxettle.');
    await page.getByTestId('settlement-pay-reference').fill('UPI-COORG-1');
    await page.getByTestId('settlement-pay-submit').click();
    await expect(payModal).toHaveCount(0);
    await expect(card).toContainText('Marked paid — awaiting payee confirmation');
    await expect(card).toContainText('Awaiting');
    await expect(page.getByTestId(`pay-btn-${leg.id}`)).toHaveCount(0);
    expect((await pool.settlements(eventId, p.anita))[0]).toMatchObject({ status: 'initiated', paymentReference: 'UPI-COORG-1' });

    // Anita confirms she received it: the event is settled and can be closed.
    await openEvent(page, p.anita, eventId);
    await expect(card).toContainText('Marked paid — awaiting payee confirmation');
    await page.getByTestId(`approve-btn-${leg.id}`).click();
    await expect(card).toContainText('Payment confirmed ✓');
    await expect(card).toContainText('Done');
    await expect(page.getByTestId('event-status-badge')).toHaveText('settled');
    await expect(payments).toContainText('1/1 complete');
    expect((await pool.settlements(eventId, p.anita))[0].status).toBe('completed');

    // Still on her dashboard while settled; closing it moves it to Closed Events.
    await page.goto('/dashboard');
    await expect(page.getByTestId(`event-card-${eventId}`)).toBeVisible({ timeout: 15_000 });
    await page.goto(`/events/${eventId}`);
    await page.getByTestId('close-event-btn').click();
    await confirmDialog(page, 'Close Event');
    await page.waitForURL(/\/dashboard$/, { timeout: 15_000 });
    await expect(page.getByTestId('dashboard-page')).toBeVisible();
    await expect(page.getByTestId(`event-card-${eventId}`)).toHaveCount(0);
    expect((await pool.event(eventId, p.anita)).status).toBe('closed');
    await page.goto('/closed-events');
    await expect(page.getByTestId(`closed-event-card-${eventId}`)).toContainText('Coorg weekend');
  });

  test('a USD event settled in INR at a set rate: created through the form, the settlement shows rupees and the rate', async ({ page }) => {
    const p = await pool.cast('fx', { anitaPro: true });

    // Anita (Pro) creates the event through the form.
    await signIn(page, p.anita);
    await page.goto('/events/create');
    await page.getByTestId('event-name-input').fill('New York trip');
    await page.getByTestId('event-type-select').selectOption('trip');
    await page.getByTestId('event-currency-select').selectOption('USD');
    await page.getByTestId('event-start-date-input').fill(futureDate());
    await page.getByTestId('settlement-currency-select').selectOption('INR');
    await page.getByTestId('fx-mode-predefined').check();
    await page.getByTestId('predefined-fx-rate-input').fill('83.5');
    await expect(page.getByText('Multi-currency settlement requires Pro.')).toHaveCount(0);
    await page.getByTestId('create-event-submit').click();
    await page.waitForURL(/\/events\/(?!create$)[^/]+$/, { timeout: 15_000 });
    const eventId = new URL(page.url()).pathname.split('/').pop()!;
    expect(eventId).not.toBe('create');
    await expect(page.getByRole('heading', { name: 'New York trip' })).toBeVisible();
    expect(await pool.event(eventId, p.anita)).toMatchObject({
      name: 'New York trip', currency: 'USD', settlementCurrency: 'INR', fxRateMode: 'predefined', predefinedFxRates: { USD_INR: 83.5 },
    });

    // Ravi joins and Anita's $120 dinner is split equally.
    await pool.join(eventId, p.anita, p.ravi);
    await pool.call('POST', '/api/expenses', p.anita, {
      eventId, title: 'Dinner', amount: 120, currency: 'USD', splitType: 'equal',
      splits: [p.anita, p.ravi].map((entityId) => ({ entityType: 'user', entityId, amount: 60 })),
    });

    // Settling shows the dollar amount and what it comes to in rupees.
    await page.reload();
    await page.getByTestId('settle-btn').click();
    await confirmDialog(page, 'Generate Settlement Plan');
    const [leg] = await pool.settlements(eventId, p.anita);
    expect(leg).toMatchObject({ fromUserId: p.ravi, toUserId: p.anita, amount: 60, settlementCurrency: 'INR', settlementAmount: 5010, fxRate: 83.5 });
    const review = page.getByTestId('settlement-review-section');
    await expect(review).toContainText('$60.00≈ ₹5010.00');
    await expect(page.getByTestId(`settlement-review-txn-${leg.id}`)).toContainText('$60.00≈ ₹5010.00');

    // Once both approve, the payment card shows the rupee amount and the rate used.
    for (const uid of [p.anita, p.ravi]) await pool.approveReview(eventId, uid);
    await openEvent(page, p.ravi, eventId);
    const card = page.getByTestId(`settlement-txn-${leg.id}`);
    await expect(card).toContainText(flow('Ravi', 'Anita'));
    await expect(card).toContainText('$60.00≈ ₹5010.00 @83.5');
    await expect(page.getByTestId('settlement-section')).toContainText('$60.00≈ ₹5010.00');

    // Ravi pays in rupees: the dialog offers Indian payment methods.
    await page.getByTestId(`pay-btn-${leg.id}`).click();
    const payModal = page.getByTestId('settlement-pay-modal');
    await expect(payModal).toContainText('Payee Methods (INR)');
    await expect(payModal).toContainText('Complete payment via UPI / Net Banking / Bank Transfer outside Traxettle.');
    await page.getByTestId('settlement-pay-submit').click();
    await expect(card).toContainText('Marked paid — awaiting payee confirmation');
    expect((await pool.settlements(eventId, p.anita))[0]).toMatchObject({ status: 'initiated', paymentMethod: 'upi_or_netbanking' });
  });
});
