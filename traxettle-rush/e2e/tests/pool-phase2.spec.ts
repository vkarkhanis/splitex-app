/**
 * Money pooling Phase 2 in the browser: handing money to spenders, paying lenders back early,
 * and netting at settle-up. The scenarios follow the hand-test plan
 * (traxettle-app/docs/runbook/MONEY_POOLING_PHASE2_E2E.md) with the same people and amounts.
 * Each test seeds most of its data through the API (helpers/pool.ts), does the key steps in the
 * web app, and checks what people see.
 */
import { test, expect, Page } from '@playwright/test';
import { loginAsMockUser } from '../helpers/auth';
import { apiRequestWithStatus, switchTier } from '../helpers/api';
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
    await expect(anita).toContainText('₹2,800.00 to the kitty, less ₹1,500.00 for DJ (repayment)');
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

  test('Scenario 5: a Fund carries held money into the next month, and keeps working after the creator\'s Pro lapses', async ({ page }) => {
    const p = await pool.cast('s5', { anitaPro: true });
    const eventId = await pool.createPool(p.anita, 'Flat 4B', { preset: 'household', defaultContributionMinor: 500_000 });
    await pool.join(eventId, p.anita, p.ravi);
    for (const uid of [p.anita, p.ravi]) await pool.payIn(eventId, p.anita, uid);
    const groceries = await pool.spend(eventId, p.ravi, 'Groceries', 2_000, { paidFrom: 'sponsor_card', alreadyIncurred: true });
    expect(groceries.poolDraw.status).toBe('approved');
    const advance = await pool.handOver(eventId, p.anita, { kind: 'advance', userId: p.ravi, amountMinor: 100_000 });
    await pool.decideAdvance(advance.id, p.ravi, 'confirm');

    await openPool(page, p.anita, eventId);
    await expect(page.getByTestId('pool-holdings')).toHaveText('With you ₹7,000.00 · With spenders ₹1,000.00');

    // The creator's Pro lapses: spending and closing the month still work.
    expect((await switchTier(p.anita, 'free')).status).toBe(200);
    const electricity = await pool.spend(eventId, p.ravi, 'Electricity', 1_000, { paidFrom: 'sponsor_card', alreadyIncurred: true });
    expect(electricity.poolDraw.status).toBe('approved');
    await openPool(page, p.anita, eventId);
    await page.getByTestId('pool-close-cycle').click();
    await expect(page.getByTestId('reconcile-figure-result')).toHaveText('Left over₹7,000.00');
    await settleUp(page);

    // A new month: Ravi still holds the ₹1,000.
    await openPool(page, p.ravi, eventId);
    await expect(page.getByTestId('pool-holdings')).toHaveText("You're holding ₹1,000.00 of the fund's money.");
    for (const uid of [p.anita, p.ravi]) await pool.payIn(eventId, p.anita, uid);

    // Only new group pools need Pro.
    const kitty = await apiRequestWithStatus('POST', '/api/events', {
      name: 'New kitty', type: 'trip', startDate: '2026-12-01', currency: 'INR', pool: { preset: 'trip_kitty', defaultContributionMinor: 100_000 },
    }, p.anita);
    expect(kitty.body.code).toBe('FEATURE_REQUIRES_PRO');

    await openPool(page, p.anita, eventId);
    await openSettleUp(page);
    await expect(page.getByTestId('reconcile-figure-carried_in')).toContainText('₹7,000.00');
    await expect(page.getByTestId('reconcile-figure-collected')).toContainText('₹10,000.00');
    await expect(page.getByTestId('reconcile-figure-result')).toHaveText('Left over₹17,000.00');
    await expect(page.getByTestId(`reconcile-row-user:${p.ravi}`)).toContainText('gets back ₹7,500.00');
    await expect(page.getByTestId(`reconcile-row-user:${p.anita}`)).toContainText('pays ₹7,500.00');
    await settleUp(page);
    const legs = await pool.settlements(eventId, p.anita);
    expect(planLegs(legs)).toEqual([[p.anita, p.ravi, 7500]]);
    for (const uid of [p.anita, p.ravi]) await pool.approveReview(eventId, uid);
    await pool.payAndConfirm(legs.find((l) => !l.kind).id, p.anita, p.ravi);
    expect((await pool.event(eventId, p.anita)).status).toBe('settled');
  });

  test('Scenario 6: budget edge cases, and every kind of pool payment at settle-up', async ({ page }) => {
    const p = await pool.cast('s6');
    const eventId = await pool.createPool(p.anita, 'Sangeet', {
      preset: 'sponsor_budget', targetAmountMinor: 3_000_000, overrides: { authorizedSpenders: [p.ravi] },
    });
    await pool.join(eventId, p.anita, p.ravi);
    await pool.join(eventId, p.anita, p.priya);
    const removeRavi = () => apiRequestWithStatus('DELETE', `/api/events/${eventId}/participants/${p.ravi}`, undefined, p.anita);

    // A. A waiting hand-over can be cancelled; someone holding money can't be removed.
    const first = await pool.handOver(eventId, p.anita, { kind: 'advance', userId: p.ravi, amountMinor: 500_000 });
    await openPool(page, p.anita, eventId);
    await page.getByTestId(`advance-cancel-${first.id}`).click();
    await expect(page.getByTestId(`advance-${first.id}`)).toContainText('Cancelled');
    await expect(page.getByTestId('pool-holdings')).toHaveText('With you ₹30,000.00 · With spenders ₹0.00');
    const second = await pool.handOver(eventId, p.anita, { kind: 'advance', userId: p.ravi, amountMinor: 500_000 });
    await pool.decideAdvance(second.id, p.ravi, 'confirm');
    expect((await removeRavi()).body.error).toBe('This person still holds ₹5,000.00 of pool money. It needs to be returned first.');

    // B. Spending beyond what he holds; then changing how it was paid.
    const lights = await pool.spend(eventId, p.ravi, 'Lights', 6_000, { paidFrom: 'advance', alreadyIncurred: true });
    await pool.approveDraw(lights.id, p.anita);
    await openPool(page, p.ravi, eventId);
    await expect(page.getByTestId('pool-holdings')).toHaveText('The budget owes you ₹1,000.00 for spends beyond the money you held.');
    await openPool(page, p.anita, eventId);
    await expect(page.getByTestId('pool-holdings')).toHaveText(/^With you ₹25,000\.00 · With spenders [−-]₹1,000\.00$/);
    expect((await removeRavi()).body.error).toBe('The pool owes this person ₹1,000.00 for spends beyond the money they held. Give them that amount first.');

    await pool.call('PUT', `/api/expenses/${lights.id}`, p.ravi, { paidFrom: 'sponsor_card' });
    let s = await pool.summary(eventId, p.anita);
    expect(s.totals.balanceMinor).toBe(3_000_000);
    expect(s.holdings.heldBy[`user:${p.ravi}`]).toBe(500_000);
    await pool.approveDraw(lights.id, p.anita);
    s = await pool.summary(eventId, p.anita);
    expect([s.totals.balanceMinor, s.holdings.heldBy[`user:${p.ravi}`]]).toEqual([2_400_000, 500_000]);
    const back = await pool.handOver(eventId, p.ravi, { kind: 'return', amountMinor: 500_000 });
    await pool.decideAdvance(back.id, p.anita, 'confirm');

    // C. A loan (paying back too much is refused), a claim, a repayment being paid, and one not.
    await pool.addMoney(eventId, p.anita, p.ravi, 200_000);
    await openPool(page, p.anita, eventId);
    await page.getByTestId(`pay-back-${p.ravi}`).click();
    await page.getByTestId('handover-amount').fill('2500');
    await expect(page.getByTestId('handover-too-much')).toHaveText("That's more than ₹2,000.00.");
    await expect(page.getByTestId('handover-submit')).toBeDisabled();
    const taxi = await pool.call('POST', '/api/expenses', p.ravi, {
      eventId, title: 'Taxi', amount: 800, currency: 'INR', fundingSource: 'pool_reimbursement', attachments: ['https://receipts.example/e2e.jpg'],
    });
    await pool.approveDraw(taxi.id, p.anita);
    const snacks = await pool.spend(eventId, p.ravi, 'Snacks', 400, { paidFrom: 'sponsor_card', alreadyIncurred: true });
    const snacksLeg = (await pool.rejectDraw(snacks.id, p.anita)).poolDraw.settlementId;
    await pool.call('POST', `/api/settlements/${snacksLeg}/pay`, p.ravi, { referenceId: 'UPI-E2E', note: 'paid' });
    const cake = await pool.spend(eventId, p.ravi, 'Cake', 300, { paidFrom: 'sponsor_card', alreadyIncurred: true });
    await pool.rejectDraw(cake.id, p.anita);

    // D. Settle up.
    await openPool(page, p.anita, eventId);
    await openSettleUp(page);
    await expect(page.getByTestId('reconcile-figure-collected')).toContainText('₹32,000.00');
    await expect(page.getByTestId('reconcile-figure-spent')).toContainText('₹6,800.00');
    await expect(page.getByTestId('reconcile-figure-result')).toHaveText('Left over₹25,200.00');
    const ravi = page.getByTestId(`reconcile-row-user:${p.ravi}`);
    for (const text of ['₹2,000.00 from the budget', 'plus ₹800.00 for Taxi (claim)', 'less ₹300.00 for Cake (repayment)', 'gets back ₹2,500.00']) {
      await expect(ravi).toContainText(text);
    }
    await expect(page.getByTestId(`reconcile-row-user:${p.anita}`)).toContainText('pays ₹2,500.00');
    await expect(page.getByTestId('reconcile-folded')).toContainText('You → Ravi · Reimbursement · Taxi');
    await expect(page.getByTestId('reconcile-folded')).toContainText('Ravi → You · Repayment (spend not approved) · Cake');
    await expect(page.getByTestId('reconcile-separate')).toContainText('Ravi → You · Repayment (spend not approved) · sent, awaiting confirmation');
    await settleUp(page);
    let legs = await pool.settlements(eventId, p.anita);
    expect(planLegs(legs)).toEqual([[p.anita, p.ravi, 2500]]);

    await page.reload();
    await page.getByTestId('settlement-details-btn').click();
    await expect(page.getByText('Total:').locator('..')).toContainText('₹2900.00');
    await page.keyboard.press('Escape');

    // Forgiving Cake during Review un-folds it and asks for the plan to be regenerated.
    await pool.call('DELETE', `/api/expenses/${cake.id}`, p.anita);
    await page.reload();
    await expect(page.getByText('Expenses have changed.')).toBeVisible();
    await page.getByTestId('regenerate-btn').click();
    await expect.poll(async () => planLegs(await pool.settlements(eventId, p.anita))).toEqual([[p.anita, p.ravi, 2800]]);

    // Payment: the repayment being paid keeps the event open until it's confirmed.
    for (const uid of [p.anita, p.ravi, p.priya]) await pool.approveReview(eventId, uid);
    await page.reload();
    await expect(page.getByTestId('settlement-section')).toContainText('0/2 complete');
    legs = await pool.settlements(eventId, p.anita);
    await pool.payAndConfirm(legs.find((l) => !l.kind).id, p.anita, p.ravi);
    expect((await pool.event(eventId, p.anita)).status).toBe('payment');
    await page.reload();
    await expect(page.getByTestId('settlement-section')).toContainText('1/2 complete');
    await pool.call('POST', `/api/settlements/${snacksLeg}/approve`, p.anita);
    expect((await pool.event(eventId, p.anita)).status).toBe('settled');
    await page.reload();
    await page.getByTestId('tab-expenses').click();
    await expect(page.getByTestId(`reimbursement-badge-${taxi.id}`)).toHaveText('Reimbursed');
    await expect(page.getByTestId(`repayment-badge-${snacks.id}`)).toHaveText('Repaid');
  });

  test('Scenario 7A: a Treasury with tiered dues; joining doesn\'t close the month; what\'s left carries over', async ({ page }) => {
    const p = await pool.cast('s7a', { anitaPro: true });
    const eventId = await pool.createPool(p.anita, 'Chess club', { preset: 'club_treasury', defaultContributionMinor: 50_000 });
    await pool.join(eventId, p.anita, p.ravi);
    await pool.payIn(eventId, p.anita, p.ravi);
    await pool.join(eventId, p.anita, p.priya);
    expect(await pool.call<any[]>('GET', `/api/pools/event/${eventId}/cycles`, p.anita)).toHaveLength(1);
    await pool.call('PUT', `/api/pools/event/${eventId}/contributions`, p.anita, { contributions: [
      { entityId: p.anita, entityType: 'user', expectedMinor: 200_000 },
      { entityId: p.priya, entityType: 'user', expectedMinor: 20_000 },
    ] });
    for (const uid of [p.anita, p.priya]) await pool.payIn(eventId, p.anita, uid);
    let s = await pool.summary(eventId, p.anita);
    expect([s.totals.expectedRegularMinor, s.totals.balanceMinor]).toEqual([270_000, 270_000]);
    await pool.spend(eventId, p.anita, 'Chess boards', 900);

    await openPool(page, p.anita, eventId);
    await page.getByTestId('pool-close-cycle').click();
    await expect(page.getByTestId('reconcile-figure-collected')).toContainText('₹2,700.00');
    await expect(page.getByTestId('reconcile-figure-spent')).toContainText('₹900.00');
    await expect(page.getByTestId('reconcile-figure-result')).toHaveText('Left over₹1,800.00');
    await settleUp(page);
    s = await pool.summary(eventId, p.anita);
    // Next month: the ₹1,800 carried over, and the tiered dues (₹2,000 / ₹500 / ₹200) carry over too.
    expect([s.cycle.sequence, s.cycle.openingBalanceMinor, s.totals.expectedRegularMinor]).toEqual([2, 180_000, 270_000]);
  });

  test('Scenario 7B: a Collection refuses spending until the target is reached, then only up to what is left', async ({ page }) => {
    const p = await pool.cast('s7b', { anitaPro: true });
    const eventId = await pool.createPool(p.anita, 'Office gift', { preset: 'target_collection', targetAmountMinor: 300_000, defaultContributionMinor: 100_000 });
    await pool.join(eventId, p.anita, p.ravi);
    await pool.join(eventId, p.anita, p.priya);
    await pool.payIn(eventId, p.anita, p.anita);
    const early = await apiRequestWithStatus('POST', '/api/expenses', { eventId, title: 'Gift', amount: 500, currency: 'INR', fundingSource: 'pool' }, p.anita);
    expect([early.body.code, early.body.data?.shortfall]).toEqual(['POOL_UNDERFUNDED', 200_000]);
    for (const uid of [p.ravi, p.priya]) await pool.payIn(eventId, p.anita, uid);
    await pool.spend(eventId, p.anita, 'Gift', 2_400);
    const tooMuch = await apiRequestWithStatus('POST', '/api/expenses', { eventId, title: 'Card', amount: 700, currency: 'INR', fundingSource: 'pool' }, p.anita);
    expect([tooMuch.body.code, tooMuch.body.data?.shortfall]).toEqual(['POOL_INSUFFICIENT_FUNDS', 10_000]);

    await openPool(page, p.anita, eventId);
    await openSettleUp(page);
    await expect(page.getByTestId('reconcile-figure-result')).toHaveText('Left over₹600.00');
    await expect(page.getByTestId(`reconcile-row-user:${p.ravi}`)).toContainText('gets back ₹200.00');
    await expect(page.getByTestId(`reconcile-row-user:${p.priya}`)).toContainText('gets back ₹200.00');
    await expect(page.getByTestId(`reconcile-row-user:${p.anita}`)).toContainText('pays ₹400.00');
    await settleUp(page);
    expect(planLegs(await pool.settlements(eventId, p.anita))).toEqual([[p.anita, p.priya, 200], [p.anita, p.ravi, 200]].sort());
  });

  test('Scenario 7C: a hybrid Kitty settles pool money and a split dinner in one plan', async ({ page }) => {
    const p = await pool.cast('s7c', { anitaPro: true });
    const eventId = (await pool.call('POST', '/api/events', p.anita, {
      name: 'Weekend trip', type: 'trip', startDate: '2026-12-01', currency: 'INR', fundingModel: 'hybrid',
      pool: { preset: 'trip_kitty', defaultContributionMinor: 100_000, allowPeerExpenses: true },
    })).id as string;
    expect((await pool.event(eventId, p.anita)).fundingModel).toBe('hybrid');
    await pool.join(eventId, p.anita, p.ravi);
    await pool.join(eventId, p.anita, p.priya);
    for (const uid of [p.anita, p.ravi, p.priya]) await pool.payIn(eventId, p.anita, uid);
    await pool.spend(eventId, p.anita, 'Fuel', 1_500);
    await pool.call('POST', '/api/expenses', p.ravi, {
      eventId, title: 'Dinner', amount: 900, currency: 'INR', splitType: 'equal',
      splits: [p.anita, p.ravi, p.priya].map((entityId) => ({ entityType: 'user', entityId, amount: 300 })),
    });

    // The preview shows the pool's part; the plan adds the split dinner.
    await openPool(page, p.anita, eventId);
    await openSettleUp(page);
    await expect(page.getByTestId(`reconcile-row-user:${p.ravi}`)).toContainText('gets back ₹500.00');
    await expect(page.getByTestId(`reconcile-row-user:${p.priya}`)).toContainText('gets back ₹500.00');
    await expect(page.getByTestId(`reconcile-row-user:${p.anita}`)).toContainText('pays ₹1,000.00');
    await settleUp(page);
    expect(planLegs(await pool.settlements(eventId, p.anita))).toEqual([[p.anita, p.priya, 200], [p.anita, p.ravi, 1100]].sort());
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

  test('Joining a Fund after money has moved starts a part-month with no dues, and says so', async ({ page }) => {
    const p = await pool.cast('pm', { anitaPro: true });
    const eventId = await pool.createPool(p.anita, 'Flat 4B', { preset: 'household', defaultContributionMinor: 500_000 });
    // Anita pays in before Ravi joins (the order the hand test warns about in 5.1).
    await pool.payIn(eventId, p.anita, p.anita);
    await pool.join(eventId, p.anita, p.ravi);

    const after = await pool.ledger(eventId, p.anita);
    expect(after.cycles.map((c: any) => [c.sequence, c.status, c.closeReason])).toEqual([[1, 'closed', 'membership_change'], [2, 'open', null]]);
    expect(after.contributions.filter((c: any) => c.kind === 'regular')).toEqual([]);

    await openPool(page, p.ravi, eventId);
    await expect(page.getByTestId('pool-part-month')).toHaveText('You joined mid-month: your dues start next month.');
    await expect(page.locator('[data-testid^="mark-paid-"]')).toHaveCount(0);
    await expect(page.getByTestId('pool-add-money')).toBeVisible();

    await openPool(page, p.anita, eventId);
    await expect(page.getByTestId('pool-part-month')).toHaveText(
      'The members changed mid-month, so the month was squared up. There are no dues for the rest of it: they start again next month. To ask for dues now, use “Set amounts”.',
    );
  });

  test('Asking before spending needs no receipt, and reads "Requested" until it is approved', async ({ page }) => {
    const p = await pool.cast('ask');
    const eventId = await pool.createPool(p.anita, 'Goa wedding', {
      preset: 'sponsor_budget', targetAmountMinor: 5_000_000, overrides: { authorizedSpenders: [p.ravi] },
    });
    await pool.join(eventId, p.anita, p.ravi);

    await loginAsMockUser(page, p.ravi);
    await page.goto(`/events/${eventId}/expenses/create`);
    await page.getByTestId('paid-with-pool_card').click();
    await page.getByTestId('expense-title-input').fill('Band advance');
    await page.getByTestId('expense-amount-input').fill('4000');
    // Already paid: a Budget needs the receipt.
    await page.getByTestId('spend-timing-paid').click();
    await expect(page.getByTestId('receipt-field')).toContainText('A receipt is required');
    // Asking first: nothing is bought yet, so it doesn't.
    await page.getByTestId('spend-timing-asking').click();
    await expect(page.getByTestId('receipt-field')).not.toContainText('A receipt is required');
    await page.getByTestId('create-expense-submit').click();
    await page.waitForURL(new RegExp(`/events/${eventId}$`), { timeout: 15_000 });

    const band = (await pool.ledger(eventId, p.anita)).entries.find((e: any) => e.title === 'Band advance');
    expect(band).toMatchObject({ status: 'pending', alreadyIncurred: false, receiptUrls: [] });
    await page.getByTestId('tab-expenses').click();
    await expect(page.getByTestId(`expense-item-${band.id}`)).toContainText('Requested from the pool by Ravi');

    await pool.approveDraw(band.id, p.anita);
    await page.reload();
    await page.getByTestId('tab-expenses').click();
    await expect(page.getByTestId(`expense-item-${band.id}`)).toContainText('Paid from the pool by Ravi');
  });
});
