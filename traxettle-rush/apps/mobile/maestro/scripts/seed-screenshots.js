#!/usr/bin/env node
/* eslint-disable no-console */
// Seeds the demo data for the App Store screenshots (maestro/screenshots) through the LOCAL API:
// three people (Anita Rao, Priya Nair, Ravi Kumar) and four events:
//   - Flat 4B — November: household bills, settlement generated, one payment done, one pending.
//   - Europe Summer Trip: spent in EUR, settled in INR.
//   - Aarav's 5th Birthday: a budget (pool) Anita funds and Priya and Ravi spend from, with one
//     spend waiting for her approval.
//   - Goa Getaway: the newest trip, still collecting expenses.
// The flows sign in as Anita (demo.anita@example.com, password Password123!, PIN 1234).
//
// Run by capture-screenshots.sh against a fresh, throwaway Firebase emulator. It refuses any API that
// isn't on this Mac. Env: SEED_API_URL (default http://127.0.0.1:$MAESTRO_API_PORT, port 3001),
// SEED_ANITA_TIER (free|pro, default free: the home screen then shows the Pro upgrade banner, as in
// the 2026-11-04 set).

const API = (process.env.SEED_API_URL || `http://127.0.0.1:${process.env.MAESTRO_API_PORT || 3001}`).replace(/\/$/, '');
const PASSWORD = 'Password123!';
const ANITA_TIER = process.env.SEED_ANITA_TIER === 'pro' ? 'pro' : 'free';

const host = new URL(API).hostname;
if (!['127.0.0.1', 'localhost', '::1', '[::1]'].includes(host)) {
  console.error(`[seed-screenshots] STOP: ${API} isn't a local API. This script only seeds the local emulator.`);
  process.exit(1);
}

// A 1×1 PNG: the pool spends need a receipt, and the screenshots only show "1 receipt(s)".
const RECEIPT_B64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGP4//8/AAX+Av4N70a4AAAAAElFTkSuQmCC';

async function call(method, path, token, body) {
  const res = await fetch(API + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || json.success === false) {
    const err = new Error(`${method} ${path} → ${res.status} ${JSON.stringify(json).slice(0, 400)}`);
    err.status = res.status;
    throw err;
  }
  return json.data;
}

const people = {
  anita: { email: 'demo.anita@example.com', name: 'Anita Rao' },
  priya: { email: 'demo.priya@example.com', name: 'Priya Nair' },
  ravi: { email: 'demo.ravi@example.com', name: 'Ravi Kumar' },
};

async function signUp(p) {
  let data;
  try {
    data = await call('POST', '/api/auth/register', null, { email: p.email, password: PASSWORD, displayName: p.name });
  } catch (e) {
    if (e.status !== 409) throw e;
    data = await call('POST', '/api/auth/login', null, { identifier: p.email, password: PASSWORD, provider: 'email' });
  }
  p.id = data.user.id;
  p.token = data.accessToken;
  // Pro while seeding: settling in another currency and budgets are Pro features.
  await call('POST', '/api/internal/entitlements/switch', p.token, { tier: 'pro' });
  await call('PUT', '/api/users/profile', p.token, {
    preferences: { notifications: true, currency: 'INR', timezone: 'Asia/Kolkata' },
  });
  console.log(`[seed-screenshots] user ${p.name} ${p.id}`);
}

async function main() {
  for (const p of Object.values(people)) await signUp(p);
  const { anita, priya, ravi } = people;
  const everyone = [anita, priya, ravi];

  async function createEvent(body) {
    const ev = await call('POST', '/api/events', anita.token, body);
    for (const p of [priya, ravi]) {
      await call('POST', `/api/events/${ev.id}/participants`, anita.token, { userId: p.id, role: 'member' });
    }
    console.log(`[seed-screenshots] event ${body.name} ${ev.id}`);
    return ev;
  }

  async function expense(ev, payer, title, amount, currency, date, opts = {}) {
    const members = opts.members || everyone;
    const amounts = opts.amounts || members.map(() => Math.round((amount / members.length) * 100) / 100);
    return call('POST', '/api/expenses', payer.token, {
      eventId: ev.id,
      title,
      amount,
      currency,
      date,
      splitType: opts.splitType || 'equal',
      isPrivate: false,
      splits: members.map((m, i) => ({ entityType: 'user', entityId: m.id, amount: amounts[i] })),
      selectedEntities: members.map((m) => ({ entityType: 'user', entityId: m.id, name: m.name })),
    });
  }

  async function poolSpend(ev, who, title, amount, date) {
    const up = await call('POST', '/api/uploads', who.token, {
      scope: 'expense_receipt',
      eventId: ev.id,
      base64: RECEIPT_B64,
      contentType: 'image/png',
      filename: `${title.replace(/\W+/g, '-').toLowerCase()}.png`,
    });
    const receipt = up.url || up.downloadUrl || up.path;
    return call('POST', '/api/expenses', who.token, {
      eventId: ev.id, title, amount, currency: 'INR', date, fundingSource: 'pool', attachments: [receipt],
    });
  }

  // Created oldest first: the home screen lists the newest first (Goa, Birthday, Europe, Flat).

  // 1. Flatmates: settlement generated and approved by all; Ravi has paid, Priya hasn't yet.
  const flat = await createEvent({
    name: 'Flat 4B — November', description: 'Shared household bills', type: 'event',
    startDate: '2026-11-01T00:00:00.000Z', currency: 'INR',
  });
  await expense(flat, anita, "Cook's salary", 6000, 'INR', '2026-11-01');
  await expense(flat, anita, 'Electricity bill', 3000, 'INR', '2026-11-06');
  await expense(flat, priya, 'Wi-Fi (Airtel Fiber)', 1200, 'INR', '2026-11-03');
  await expense(flat, priya, 'Cooking gas refill', 600, 'INR', '2026-11-12');
  await expense(flat, ravi, 'Groceries (BigBasket)', 2700, 'INR', '2026-11-14');
  await call('POST', `/api/settlements/event/${flat.id}/generate`, anita.token, {});
  for (const p of everyone) await call('POST', `/api/settlements/event/${flat.id}/approve-settlement`, p.token, {});
  const flatSettlements = await call('GET', `/api/settlements/event/${flat.id}`, anita.token);
  const legs = Array.isArray(flatSettlements) ? flatSettlements : flatSettlements.settlements || [];
  const raviLeg = legs.find((s) => (s.fromEntityId || s.fromUserId) === ravi.id);
  if (!raviLeg) throw new Error(`No settlement from Ravi in ${JSON.stringify(legs).slice(0, 400)}`);
  await call('POST', `/api/settlements/${raviLeg.id}/pay`, ravi.token, { paymentMode: 'upi', referenceId: 'UPI 431906552810' });
  await call('POST', `/api/settlements/${raviLeg.id}/approve`, anita.token, {});

  // 2. Europe: spent in EUR, settled in INR at a set rate.
  const europe = await createEvent({
    name: 'Europe Summer Trip', description: 'Paris, Rome and Barcelona', type: 'trip',
    startDate: '2026-06-12T00:00:00.000Z', endDate: '2026-06-24T00:00:00.000Z', currency: 'EUR',
    settlementCurrency: 'INR', fxRateMode: 'predefined', predefinedFxRates: { EUR_INR: 98.4 },
  });
  await expense(europe, anita, 'Hotel in Paris (4 nights)', 840, 'EUR', '2026-06-12');
  await expense(europe, priya, 'Eurail passes', 612, 'EUR', '2026-06-12');
  await expense(europe, ravi, 'Colosseum guided tour', 66, 'EUR', '2026-06-17');
  await expense(europe, anita, 'Dinner in Trastevere', 138, 'EUR', '2026-06-18');
  await expense(europe, ravi, 'Sagrada Família tickets', 99, 'EUR', '2026-06-22');

  // 3. Birthday budget ("Pool money → Just me"): Anita funds ₹60,000, Priya and Ravi spend from it.
  const party = await createEvent({
    name: "Aarav's 5th Birthday", description: 'Party at Little Explorers', type: 'event',
    startDate: '2026-11-15T00:00:00.000Z', currency: 'INR',
    fundingModel: 'pool', pool: { preset: 'sponsor_budget', targetAmountMinor: 6000000 },
  });
  await call('PUT', `/api/pools/event/${party.id}/config`, anita.token, { authorizedSpenders: [priya.id, ravi.id] });
  await poolSpend(party, anita, 'Party venue', 18000, '2026-11-02');
  const cake = await poolSpend(party, priya, 'Cake & cupcakes', 6500, '2026-11-14');
  const magic = await poolSpend(party, ravi, 'Magician show', 7000, '2026-11-15');
  await poolSpend(party, priya, 'Return gifts', 5400, '2026-11-15'); // left waiting for Anita's approval
  for (const e of [cake, magic]) await call('POST', `/api/pools/expenses/${e.id}/approve`, anita.token, {});

  // 4. Goa: the newest trip, still collecting expenses.
  const goa = await createEvent({
    name: 'Goa Getaway', description: 'Long weekend by the beach', type: 'trip',
    startDate: '2026-10-30T00:00:00.000Z', endDate: '2026-11-03T00:00:00.000Z', currency: 'INR',
  });
  await expense(goa, anita, 'Beach villa (3 nights)', 36000, 'INR', '2026-10-30');
  await expense(goa, ravi, 'Scuba diving at Grande Island', 10500, 'INR', '2026-10-31');
  await expense(goa, priya, "Seafood dinner at Britto's", 4860, 'INR', '2026-11-01');
  await expense(goa, anita, 'Scooter rentals', 2400, 'INR', '2026-10-31', { splitType: 'custom', members: [anita, ravi], amounts: [1200, 1200] });
  await expense(goa, ravi, 'Airport cab', 1950, 'INR', '2026-10-30');
  await expense(goa, priya, 'Groceries & snacks', 3240, 'INR', '2026-10-30');

  if (ANITA_TIER !== 'pro') await call('POST', '/api/internal/entitlements/switch', anita.token, { tier: ANITA_TIER });
  console.log(`[seed-screenshots] done (Anita on ${ANITA_TIER}): ${JSON.stringify({ flat: flat.id, europe: europe.id, party: party.id, goa: goa.id })}`);
}

main().catch((err) => {
  console.error('[seed-screenshots] failed:', err?.message || err);
  process.exit(1);
});
