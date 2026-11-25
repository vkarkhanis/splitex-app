/**
 * Seeding helpers for the money-pooling end-to-end tests. Each call goes straight to the API
 * with a `mock-` token and throws if the API refuses, so a broken setup fails loudly instead of
 * leaving a test to check the wrong screen.
 */
import { apiRequestWithStatus, switchTier } from './api';

/** Budgets need a receipt on every spend and claim; the API only checks one is attached. */
const RECEIPT = ['https://receipts.example/e2e.jpg'];

export async function call<T = any>(method: string, path: string, token: string, body?: unknown): Promise<T> {
  const res = await apiRequestWithStatus(method, path, method === 'GET' ? undefined : (body ?? {}), token);
  if (res.status >= 400 || res.body?.success === false) {
    throw new Error(`${method} ${path} as ${token} → ${res.status}: ${JSON.stringify(res.body)}`);
  }
  return res.body.data as T;
}

export interface Cast {
  anita: string;
  ravi: string;
  priya: string;
}

/**
 * The three people of the Phase 2 test plan, with fresh ids per test and their names set, so
 * the screens say "Ravi" rather than a user id. Anita creates and holds every pool.
 */
export async function cast(tag: string, options: { anitaPro?: boolean } = {}): Promise<Cast> {
  const run = Date.now().toString(36);
  const people: Cast = {
    anita: `mock-anita-${tag}-${run}`,
    ravi: `mock-ravi-${tag}-${run}`,
    priya: `mock-priya-${tag}-${run}`,
  };
  const names: Record<keyof Cast, string> = { anita: 'Anita', ravi: 'Ravi', priya: 'Priya' };
  for (const key of Object.keys(people) as Array<keyof Cast>) {
    await call('PUT', '/api/users/profile', people[key], { displayName: names[key] });
  }
  if (options.anitaPro) {
    const switched = await switchTier(people.anita, 'pro');
    if (switched.status !== 200) throw new Error(`Could not make Anita Pro: ${JSON.stringify(switched.body)}`);
  }
  return people;
}

export async function createPool(token: string, name: string, pool: Record<string, unknown>): Promise<string> {
  const event = await call('POST', '/api/events', token, { name, type: 'event', startDate: '2026-12-01', currency: 'INR', pool });
  return event.id as string;
}

export const join = (eventId: string, admin: string, userId: string) =>
  call('POST', `/api/events/${eventId}/participants`, admin, { userId });

export const ledger = (eventId: string, token: string) => call('GET', `/api/pools/event/${eventId}/ledger`, token);
export const summary = (eventId: string, token: string) => call('GET', `/api/pools/event/${eventId}/summary`, token);
export const event = (eventId: string, token: string) => call('GET', `/api/events/${eventId}`, token);

/** A member pays their dues in full; the custodian confirms (their own dues confirm at once). */
export async function payIn(eventId: string, custodian: string, userId: string) {
  const { contributions } = await ledger(eventId, custodian);
  const dues = contributions.find((c: any) => c.fromUserId === userId && c.kind === 'regular');
  const marked = await call('POST', `/api/pools/contributions/${dues.id}/mark-paid`, userId);
  if (marked.status !== 'confirmed') await call('POST', `/api/pools/contributions/${dues.id}/confirm`, custodian);
}

/** Money added beyond dues: a loan from anyone but the custodian, confirmed by the custodian. */
export async function addMoney(eventId: string, custodian: string, userId: string, amountMinor: number) {
  const topUp = await call('POST', `/api/pools/event/${eventId}/top-ups`, userId, { amountMinor });
  if (topUp.status === 'confirmed') return topUp;
  await call('POST', `/api/pools/contributions/${topUp.id}/mark-paid`, userId);
  return call('POST', `/api/pools/contributions/${topUp.id}/confirm`, custodian);
}

/** A pool spend, in rupees. `extra` carries paidFrom / alreadyIncurred for spenders. */
export async function spend(eventId: string, token: string, title: string, amount: number, extra: Record<string, unknown> = {}) {
  return call('POST', '/api/expenses', token, {
    eventId, title, amount, currency: 'INR', fundingSource: 'pool', attachments: RECEIPT, ...extra,
  });
}

export const approveDraw = (expenseId: string, token: string) => call('POST', `/api/pools/expenses/${expenseId}/approve`, token);
export const rejectDraw = (expenseId: string, token: string) => call('POST', `/api/pools/expenses/${expenseId}/reject`, token);

/** Records an advance, return or early repayment. */
export const handOver = (eventId: string, token: string, body: Record<string, unknown>) =>
  call('POST', `/api/pools/event/${eventId}/advances`, token, body);
export const decideAdvance = (advanceId: string, token: string, action: 'confirm' | 'reject' | 'cancel') =>
  call('POST', `/api/pools/advances/${advanceId}/${action}`, token);

export const settlements = (eventId: string, token: string) => call<any[]>('GET', `/api/settlements/event/${eventId}`, token);
export const approveReview = (eventId: string, token: string) => call('POST', `/api/settlements/event/${eventId}/approve-settlement`, token);
/** The payer says they've paid (mocked, no gateway), then the payee confirms. */
export async function payAndConfirm(settlementId: string, payer: string, payee: string) {
  await call('POST', `/api/settlements/${settlementId}/pay`, payer, { referenceId: 'UPI-E2E', note: 'paid' });
  await call('POST', `/api/settlements/${settlementId}/approve`, payee);
}
