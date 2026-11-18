/**
 * Money pooling Phase 2 in the browser: handing money to spenders, paying lenders back early,
 * and netting at settle-up. The scenarios follow the hand-test plan
 * (traxettle-app/docs/runbook/MONEY_POOLING_PHASE2_E2E.md) with the same people and amounts.
 * Each test seeds most of its data through the API (helpers/pool.ts), does the key steps in the
 * web app, and checks what people see.
 */
import { test, expect, Page } from '@playwright/test';
import { loginAsMockUser } from '../helpers/auth';
import { apiRequestWithStatus } from '../helpers/api';
import * as pool from '../helpers/pool';

test.describe.configure({ timeout: 120_000 });

/** Signs in as `userId` and opens the event's pool tab. */
async function openPool(page: Page, userId: string, eventId: string) {
  await loginAsMockUser(page, userId);
  await page.goto(`/events/${eventId}`);
  await page.getByTestId('tab-pool').click();
  await expect(page.getByTestId('pool-tab')).toBeVisible({ timeout: 15_000 });
}

async function openSettleUp(page: Page) {
  await page.getByTestId('pool-settle-up').click();
  await expect(page.getByTestId('reconcile-figure-result')).toBeVisible({ timeout: 10_000 });
}

async function settleUp(page: Page) {
  await page.getByTestId('reconcile-submit').click();
  await expect(page.getByTestId('reconcile-submit')).toHaveCount(0, { timeout: 15_000 });
}

const planLegs = (legs: any[]) =>
  legs.filter((l) => !l.kind).map((l) => [l.fromUserId, l.toUserId, l.amount]).sort();

test.describe('Money pooling Phase 2', () => {
  test('Scenario 1: hand-overs, a rejected card spend and a loan settle as one ₹6,400 payment', async ({ page }) => {
    const p = await pool.cast('s1');
    const eventId = await pool.createPool(p.anita, 'Goa wedding', {
      preset: 'sponsor_budget', targetAmountMinor: 5_000_000, overrides: { authorizedSpenders: [p.ravi] },
    });
    await pool.join(eventId, p.anita, p.ravi);
    await pool.join(eventId, p.anita, p.priya);

    // A. Anita gives Ravi ₹20,000. Only people who can spend are offered; Priya is a guest.
    await openPool(page, p.anita, eventId);
    await page.getByTestId('pool-give-money').click();
    await expect(page.getByTestId('handover-who').locator('option')).toHaveText(['Ravi']);
    await expect(page.getByTestId('pool-handover-modal')).toContainText('Up to ₹50,000.00');
    await page.getByTestId('handover-amount').fill('20000');
    await page.getByTestId('handover-note').fill('Cash for decor');
    await page.getByTestId('handover-submit').click();
    await expect(page.getByTestId('pool-holdings')).toHaveText(
      'With you ₹50,000.00 · With spenders ₹0.00 · ₹20,000.00 handed over, waiting to be confirmed',
    );

    // Ravi confirms he has it.
    const advance = (await pool.ledger(eventId, p.anita)).advances.find((a: any) => a.kind === 'advance');
    await openPool(page, p.ravi, eventId);
    await expect(page.getByTestId(`advance-${advance.id}`)).toContainText('Waiting for you to confirm');
    await page.getByTestId(`advance-confirm-${advance.id}`).click();
    await expect(page.getByTestId('pool-holdings')).toHaveText("You're holding ₹20,000.00 of the budget's money.");

    // B. Ravi spends from what he holds and on Anita's card. Anita approves Decorations and rejects the rest.
    const decorations = await pool.spend(eventId, p.ravi, 'Decorations', 15_000, { paidFrom: 'advance', alreadyIncurred: true });
    const flowers = await pool.spend(eventId, p.ravi, 'Flowers', 2_000, { paidFrom: 'advance', alreadyIncurred: true });
    const band = await pool.spend(eventId, p.ravi, 'Band', 600, { paidFrom: 'sponsor_card', alreadyIncurred: true });
    await pool.approveDraw(decorations.id, p.anita);

    await openPool(page, p.anita, eventId);
    await expect(page.getByTestId('pool-holdings')).toHaveText('With you ₹30,000.00 · With spenders ₹5,000.00');
    await page.getByTestId(`reject-draw-${flowers.id}`).click();
    await expect(page.getByTestId('reject-warning')).toContainText(
      'Ravi paid this with budget money they hold. If you reject it, the ₹2,000.00 stays with them, to be returned or settled at the end.',
    );
    await page.getByTestId('reason-submit').click();
    await expect(page.getByTestId(`reject-draw-${flowers.id}`)).toHaveCount(0);
    await page.getByTestId(`reject-draw-${band.id}`).click();
    await expect(page.getByTestId('reject-warning')).toContainText(
      "Ravi says this was already paid with the budget's money. If you reject it, they owe ₹600.00 back to you.",
    );
    await page.getByTestId('reason-submit').click();
    await expect(page.getByTestId(`reject-draw-${band.id}`)).toHaveCount(0);
    // Only the card spend is owed back; the held-money one stays in what Ravi holds.
    const owed = await pool.settlements(eventId, p.anita);
    expect(owed.map((l) => [l.kind, l.fromUserId, l.toUserId, l.amount])).toEqual([['pool_repayment', p.ravi, p.anita, 600]]);

    // D. Ravi returns ₹1,000. Settling up waits until Anita confirms it.
    const returned = await pool.handOver(eventId, p.ravi, { kind: 'return', amountMinor: 100_000 });
    await openPool(page, p.anita, eventId);
    await page.getByTestId('pool-settle-up').click();
    await expect(page.getByTestId('reconcile-waiting-handovers')).toContainText('1 hand-over is waiting for confirmation');
    await expect(page.getByTestId('reconcile-submit')).toBeDisabled();
    await pool.decideAdvance(returned.id, p.anita, 'confirm');
    // Anita records another ₹1,000 he handed her: confirmed at once.
    await pool.handOver(eventId, p.anita, { kind: 'return', userId: p.ravi, amountMinor: 100_000 });

    // E. Ravi lends the budget ₹10,000.
    await pool.addMoney(eventId, p.anita, p.ravi, 1_000_000);

    // F. Settle up: what Ravi lent, less what he holds and the ₹600 he owes, in one payment.
    await openPool(page, p.anita, eventId);
    await expect(page.getByTestId('pool-holdings')).toHaveText('With you ₹42,000.00 · With spenders ₹3,000.00');
    await expect(page.getByTestId('pool-loans')).toContainText('Ravi lent the budget money: ₹10,000.00 still to pay back.');
    await openSettleUp(page);
    await expect(page.getByTestId('reconcile-figure-collected')).toContainText('₹60,000.00');
    await expect(page.getByTestId('reconcile-figure-spent')).toContainText('₹15,000.00');
    await expect(page.getByTestId('reconcile-figure-result')).toHaveText('Left over₹45,000.00');
    const raviRow = page.getByTestId(`reconcile-row-user:${p.ravi}`);
    await expect(raviRow).toContainText('₹7,000.00 from the budget, less ₹600.00 for Band (repayment)');
    await expect(raviRow).toContainText('gets back ₹6,400.00');
    await expect(page.getByTestId(`reconcile-row-user:${p.anita}`)).toContainText('pays ₹6,400.00');
    await expect(page.getByTestId('reconcile-folded')).toContainText('Ravi → You · Repayment (spend not approved) · Band');
    await expect(page.getByTestId('reconcile-separate')).toHaveCount(0);
    await settleUp(page);

    // Review: the plan's one payment, then the Band repayment, included in it.
    expect((await pool.event(eventId, p.anita)).status).toBe('review');
    const legs = await pool.settlements(eventId, p.anita);
    expect(planLegs(legs)).toEqual([[p.anita, p.ravi, 6400]]);
    const bandLeg = legs.find((l) => l.kind === 'pool_repayment');
    expect(bandLeg.status).toBe('netted');
    await page.reload();
    await expect(page.getByTestId('settlement-review-netted-note')).toHaveText(
      "Repayments and unpaid claims are included in these payments. They aren't paid on their own.",
    );
    await expect(page.getByTestId(`settlement-review-txn-${bandLeg.id}`)).toContainText('included in the payments above');

    // Payment: the folded repayment isn't counted again, and paying the plan settles the event.
    for (const uid of [p.anita, p.ravi, p.priya]) await pool.approveReview(eventId, uid);
    await page.reload();
    await expect(page.getByTestId('settlement-section')).toContainText('0/1 complete');
    await pool.payAndConfirm(legs.find((l) => !l.kind).id, p.anita, p.ravi);
    expect((await pool.event(eventId, p.anita)).status).toBe('settled');
    await page.reload();
    await page.getByTestId('tab-expenses').click();
    await expect(page.getByTestId(`repayment-badge-${band.id}`)).toHaveText('Repaid');
  });

  test('Scenario 3: paying a lender back early warns before pausing, and the settle-up figures add up', async ({ page }) => {
    const p = await pool.cast('s3');
    const eventId = await pool.createPool(p.anita, 'Pooja', {
      preset: 'sponsor_budget', targetAmountMinor: 1_000_000, overrides: { authorizedSpenders: [p.ravi] },
    });
    await pool.join(eventId, p.anita, p.ravi);
    await pool.addMoney(eventId, p.anita, p.ravi, 400_000);
    await pool.spend(eventId, p.anita, 'Hall', 13_000);

    // Paying all ₹4,000 back would pause spending: the allowance shrinks with the repayment.
    await openPool(page, p.anita, eventId);
    await expect(page.getByTestId('pool-loans')).toContainText('Ravi lent the budget money: ₹4,000.00 still to pay back.');
    await page.getByTestId(`pay-back-${p.ravi}`).click();
    await expect(page.getByTestId('handover-amount')).toHaveValue('4000');
    await expect(page.getByTestId('handover-warning')).toHaveText(
      "This pauses spending. You'll need to add ₹3,000.01 before anyone can spend again.",
    );
    await page.getByTestId('handover-amount').fill('1000');
    await expect(page.getByTestId('handover-warning')).toHaveCount(0);
    await page.getByTestId('handover-submit').click();
    await expect(page.getByTestId('pool-loans')).toContainText('₹3,000.00 still to pay back.');
    const first = (await pool.ledger(eventId, p.anita)).advances.find((a: any) => a.kind === 'repayment');
    await pool.decideAdvance(first.id, p.ravi, 'confirm');

    // Anita's already-paid Decor takes the budget past its limit, so spending pauses.
    await pool.spend(eventId, p.anita, 'Decor', 3_000, { alreadyIncurred: true });
    expect((await pool.summary(eventId, p.anita)).overdraft.latched).toBe(true);

    // Paying back while paused is allowed, with a warning.
    await openPool(page, p.anita, eventId);
    await page.getByTestId(`pay-back-${p.ravi}`).click();
    await expect(page.getByTestId('handover-amount')).toHaveValue('3000');
    await expect(page.getByTestId('handover-warning')).toHaveText(
      "Spending is paused. Paying Ravi ₹3,000.00 now means you'll need to add ₹6,000.01 before anyone can spend again.",
    );
    await page.getByTestId('handover-submit').click();
    await expect(page.getByTestId('pool-loans')).toHaveCount(0);
    const second = (await pool.ledger(eventId, p.anita)).advances.find((a: any) => a.kind === 'repayment' && a.status === 'initiated');
    await pool.decideAdvance(second.id, p.ravi, 'confirm');

    // While paused, asking to spend is refused; spending resumes only once the balance is above zero.
    const refused = await apiRequestWithStatus('POST', '/api/expenses', {
      eventId, title: 'Lamps', amount: 500, currency: 'INR', fundingSource: 'pool',
      paidFrom: 'sponsor_card', alreadyIncurred: false, attachments: ['https://receipts.example/e2e.jpg'],
    }, p.ravi);
    expect(refused.body.code).toBe('POOL_OVERDRAFT_BLOCKED');
    await pool.addMoney(eventId, p.anita, p.anita, 600_000);
    expect((await pool.summary(eventId, p.anita)).overdraft.latched).toBe(true);
    await pool.addMoney(eventId, p.anita, p.anita, 50_000);
    expect((await pool.summary(eventId, p.anita)).overdraft.latched).toBe(false);

    // The preview shows the ₹4,000 paid back, so its figures add up; nobody is owed anything.
    await openPool(page, p.anita, eventId);
    await openSettleUp(page);
    await expect(page.getByTestId('reconcile-figure-collected')).toContainText('₹20,500.00');
    await expect(page.getByTestId('reconcile-figure-paid_back_early')).toContainText('₹4,000.00');
    await expect(page.getByTestId('reconcile-figure-spent')).toContainText('₹16,000.00');
    await expect(page.getByTestId('reconcile-figure-result')).toHaveText('Left over₹500.00');
    await settleUp(page);
    expect((await pool.event(eventId, p.anita)).status).toBe('settled');
    expect(await pool.settlements(eventId, p.anita)).toEqual([]);
  });

  test('Netting in a kitty: payments go between members (Phase 1 Scenario 3, re-run)', async ({ page }) => {
    const p = await pool.cast('kitty', { anitaPro: true });
    const eventId = await pool.createPool(p.anita, 'Office party', {
      preset: 'trip_kitty', defaultContributionMinor: 200_000, overrides: { expenseApproval: 'always' },
    });
    await pool.join(eventId, p.anita, p.ravi);
    await pool.join(eventId, p.anita, p.priya);
    for (const uid of [p.anita, p.ravi, p.priya]) await pool.payIn(eventId, p.anita, uid);
    await pool.spend(eventId, p.anita, 'Balloons and cake', 1_800);
    const dj = await pool.spend(eventId, p.ravi, 'DJ', 1_500, { paidFrom: 'sponsor_card', alreadyIncurred: true });
    await pool.rejectDraw(dj.id, p.anita);

    await openPool(page, p.anita, eventId);
    await openSettleUp(page);
    const ravi = page.getByTestId(`reconcile-row-user:${p.ravi}`);
    await expect(ravi).toContainText('₹1,400.00 from the kitty, less ₹1,500.00 for DJ (repayment)');
    await expect(ravi).toContainText('pays ₹100.00');
    await expect(page.getByTestId(`reconcile-row-user:${p.priya}`)).toContainText('gets back ₹1,400.00');
    const anita = page.getByTestId(`reconcile-row-user:${p.anita}`);
    await expect(anita).toContainText('₹2,800.00 to the kitty, plus ₹1,500.00 for DJ (repayment)');
    await expect(anita).toContainText('pays ₹1,300.00');
    await settleUp(page);

    // Two payments, both to Priya; nothing is routed through Anita.
    const legs = await pool.settlements(eventId, p.anita);
    expect(planLegs(legs)).toEqual([[p.anita, p.priya, 1300], [p.ravi, p.priya, 100]].sort());
    expect(legs.find((l) => l.kind === 'pool_repayment').status).toBe('netted');
    for (const uid of [p.anita, p.ravi, p.priya]) await pool.approveReview(eventId, uid);
    await page.reload();
    await expect(page.getByTestId('settlement-section')).toContainText('0/2 complete');
    for (const leg of legs.filter((l) => !l.kind)) await pool.payAndConfirm(leg.id, leg.fromUserId, leg.toUserId);
    expect((await pool.event(eventId, p.anita)).status).toBe('settled');
    await page.reload();
    await page.getByTestId('tab-expenses').click();
    await expect(page.getByTestId(`repayment-badge-${dj.id}`)).toHaveText('Repaid');
  });

  test('A close with only a repayment open goes to Review with one payment (Phase 1 Scenario 4, re-run)', async ({ page }) => {
    const p = await pool.cast('s4');
    const eventId = await pool.createPool(p.anita, 'Stage lights', {
      preset: 'sponsor_budget', targetAmountMinor: 1_000_000, overrides: { authorizedSpenders: [p.ravi] },
    });
    await pool.join(eventId, p.anita, p.ravi);
    const lunch = await pool.spend(eventId, p.ravi, 'Lunch', 500, { paidFrom: 'sponsor_card', alreadyIncurred: true });
    await pool.rejectDraw(lunch.id, p.anita);

    await openPool(page, p.anita, eventId);
    await openSettleUp(page);
    const ravi = page.getByTestId(`reconcile-row-user:${p.ravi}`);
    await expect(ravi).toContainText('Owes ₹500.00 for Lunch (repayment)');
    await expect(ravi).toContainText('pays ₹500.00');
    await settleUp(page);

    // Phase 1 went straight to Payment with the repayment paid on its own; now it's a plan to review.
    expect((await pool.event(eventId, p.anita)).status).toBe('review');
    const legs = await pool.settlements(eventId, p.anita);
    expect(planLegs(legs)).toEqual([[p.ravi, p.anita, 500]]);
    for (const uid of [p.anita, p.ravi]) await pool.approveReview(eventId, uid);
    await pool.payAndConfirm(legs.find((l) => !l.kind).id, p.ravi, p.anita);
    expect((await pool.event(eventId, p.anita)).status).toBe('settled');
  });
});
