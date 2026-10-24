#!/usr/bin/env node
/**
 * Money-pooling smoke test against a RUNNING local API.
 *
 * Uses `Bearer mock-*` tokens, which the API accepts only in local/test
 * environments — start the API with APP_ENV=local (mock Firestore or emulator):
 *
 *   cd apps/api && APP_ENV=local PORT=3001 npx ts-node src/index.ts
 *   node scripts/local-dev/pool-smoke.mjs            # defaults to http://localhost:3001
 *   API=http://localhost:3201 node scripts/local-dev/pool-smoke.mjs
 *
 * Exercises: kitty creation, contributions, receipt upload, a pool draw,
 * the graduated-overdraft refusal and "already paid" override, access control,
 * and the settle-up plan. Exits non-zero on any failed check.
 */
const BASE = process.env.API || 'http://localhost:3001';
const call = async (method, path, uid, body) => {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${uid}` },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, body: await res.json().catch(() => ({})) };
};
let failures = 0;
const check = (label, cond, extra = '') => {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${label}${extra ? `  — ${extra}` : ''}`);
  if (!cond) failures += 1;
};

const run = Date.now().toString(36);
const A = `mock-smoke-alice-${run}`, B = `mock-smoke-bob-${run}`;

const p2p = await call('POST', '/api/events', A, { name: 'Plain trip', type: 'trip', startDate: '2026-10-01', currency: 'INR' });
check('split-expenses event still created normally', p2p.status === 201 && p2p.body.data.fundingModel === undefined);

const created = await call('POST', '/api/events', A, {
  name: 'Live Kitty', type: 'trip', startDate: '2026-10-01', currency: 'INR',
  pool: { preset: 'trip_kitty', defaultContributionMinor: 1000000 },
});
check('create kitty through /api/events', created.status === 201 && created.body.data.fundingModel === 'pool', `status ${created.status}`);
const eventId = created.body.data.id;

check('add Bob', (await call('POST', `/api/events/${eventId}/participants`, A, { userId: B })).status === 201);

const ledger1 = await call('GET', `/api/pools/event/${eventId}/ledger`, A);
check('/api/pools is mounted (ledger)', ledger1.status === 200, `status ${ledger1.status}`);
const contribs = ledger1.body.data.contributions;
check('both members have default dues', contribs.length === 2);

for (const c of contribs) {
  await call('POST', `/api/pools/contributions/${c.id}/mark-paid`, c.fromUserId, {});
  await call('POST', `/api/pools/contributions/${c.id}/confirm`, A, {});
}
const s1 = await call('GET', `/api/pools/event/${eventId}/summary`, B);
check('confirmed money raises the balance', s1.body.data.totals.balanceMinor === 2000000, `balance ${s1.body.data.totals.balanceMinor}`);

const upload = await call('POST', '/api/uploads', B, { scope: 'expense_receipt', eventId, base64: Buffer.from('img').toString('base64'), contentType: 'image/png' });
check('/api/uploads is mounted (receipt upload)', upload.status === 201 && Boolean(upload.body.data.url), `status ${upload.status}`);

const spend = await call('POST', '/api/expenses', B, { eventId, title: 'Villa', amount: 23000, currency: 'INR', fundingSource: 'pool', attachments: [upload.body.data.url] });
check('pool draw within the 20% allowance', spend.status === 201 && spend.body.data.poolDraw.status === 'approved', `status ${spend.status}`);

const refused = await call('POST', '/api/expenses', B, { eventId, title: 'Boat', amount: 2000, currency: 'INR', fundingSource: 'pool' });
check('draw past the floor is refused with details', refused.status === 409 && refused.body.code === 'POOL_OVERDRAFT_BLOCKED' && refused.body.data.shortfall === 100000,
  JSON.stringify(refused.body.data));

const anyway = await call('POST', '/api/expenses', B, { eventId, title: 'Boat', amount: 2000, currency: 'INR', fundingSource: 'pool', alreadyIncurred: true });
check('already-paid draw is recorded and flagged', anyway.status === 201 && anyway.body.data.poolFlags.includes('exceeds_tolerance'));

const s2 = await call('GET', `/api/pools/event/${eventId}/summary`, A);
check('pool is paused at the floor', s2.body.data.overdraft.zone === 'blocked' && s2.body.data.overdraft.latched === true, s2.body.data.overdraft.zone);

const outsider = await call('GET', `/api/pools/event/${eventId}/summary`, `mock-smoke-stranger-${run}`);
check('outsiders are refused', outsider.status === 403);

const preview = await call('POST', `/api/pools/event/${eventId}/close-preview`, A, { forDissolution: true });
check('settle-up preview shows the shortfall to cover', preview.status === 200 && preview.body.data.coverNeededMinor === 500000, `coverNeeded ${preview.body.data.coverNeededMinor}`);

const dissolve = await call('POST', `/api/pools/event/${eventId}/dissolve`, A, {});
check('settle up generates the final plan', dissolve.status === 200, `status ${dissolve.status}`);
const legs = (await call('GET', `/api/settlements/event/${eventId}`, A)).body.data;
// ₹20,000 in, ₹25,000 out; Alice covered ₹5,000. Fair share ₹12,500 each ⇒ Bob owes Alice ₹2,500.
check('one leg: Bob pays Alice ₹2,500', legs.length === 1 && legs[0].fromUserId === B && legs[0].toUserId === A && legs[0].amount === 2500, JSON.stringify(legs.map((l) => [l.fromUserId, l.toUserId, l.amount])));
check('event moved to review', (await call('GET', `/api/events/${eventId}`, A)).body.data.status === 'review');

console.log(failures === 0 ? '\nALL LIVE CHECKS PASSED' : `\n${failures} LIVE CHECK(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
