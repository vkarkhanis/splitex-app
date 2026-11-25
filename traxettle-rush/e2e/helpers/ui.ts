/**
 * Browser helpers shared by the UI-driven specs (settlement-ui, expense-splits, event-edit-delete,
 * pool-ui, groups-settlement). Set-up still goes through the API (helpers/pool.ts); these only
 * sign in, open pages and answer the app's own confirmation dialogs.
 */
import { expect, Page } from '@playwright/test';
import { loginAsMockUser } from './auth';
import * as pool from './pool';

/** Signs in as a mock user and marks the dashboard's first-visit tour as seen, so it can't cover the page. */
export async function signIn(page: Page, userId: string) {
  await loginAsMockUser(page, userId);
  await page.evaluate(() => window.localStorage.setItem('traxettle.web.tour.completed', 'true'));
}

/** Signs in as `userId` and opens the event page. */
export async function openEvent(page: Page, userId: string, eventId: string) {
  await signIn(page, userId);
  await page.goto(`/events/${eventId}`);
  await expect(page.getByTestId('event-detail-page')).toBeVisible({ timeout: 15_000 });
}

/** The event page's generic "are you sure?" dialog: checks its title, then presses its confirm button. */
export async function confirmDialog(page: Page, title: string) {
  const dialog = page.getByTestId('confirm-modal');
  await expect(dialog).toContainText(title);
  await dialog.getByTestId('confirm-modal-confirm').click();
  await expect(dialog).toHaveCount(0);
}

/** A date `days` from today as YYYY-MM-DD: the create-event form refuses past start dates. */
export function futureDate(days = 60): string {
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

/** The split row for a person or group on the expense form (rows are keyed by position, so find it by name). */
export const splitRow = (page: Page, name: string) => page.locator('[data-testid^="split-row-"]', { hasText: name });

/** An INR split-expenses event created by `admin` with the others added as members. */
export async function splitEvent(admin: string, members: string[], name: string, extra: Record<string, unknown> = {}): Promise<string> {
  const event = await pool.call('POST', '/api/events', admin, {
    name, type: 'trip', startDate: futureDate(30), currency: 'INR', ...extra,
  });
  for (const uid of members) await pool.join(event.id, admin, uid);
  return event.id as string;
}

export const expenses = (eventId: string, token: string) => pool.call<any[]>('GET', `/api/expenses/event/${eventId}`, token);

export async function expenseByTitle(eventId: string, token: string, title: string) {
  const found = (await expenses(eventId, token)).find((e) => e.title === title);
  if (!found) throw new Error(`No expense titled "${title}" in ${eventId}`);
  return found;
}

/** Entity balances as the settlement plan sees them: { entityId: amount }, owed money positive. */
export async function balances(eventId: string, token: string): Promise<Record<string, number>> {
  const list = await pool.call<Array<{ entityId: string; amount: number }>>('GET', `/api/settlements/event/${eventId}/balances`, token);
  return Object.fromEntries(list.map((b) => [b.entityId, b.amount]));
}

/** A tiny valid PNG (1×1 pixel), for receipt and proof uploads. */
export const PNG_1PX = {
  name: 'receipt.png',
  mimeType: 'image/png',
  buffer: Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
    'base64',
  ),
};
