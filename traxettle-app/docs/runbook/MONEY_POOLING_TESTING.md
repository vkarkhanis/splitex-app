# Money Pooling — Run Locally & Test

How to run the money-pooling feature on your machine and verify it, from the
automated suites down to hand-testing each use case. Design background:
[MONEY_POOLING_DESIGN.md](../utility/MONEY_POOLING_DESIGN.md).

All commands run from `traxettle-rush/` unless stated otherwise.

---

## 1. One-time setup

```bash
node common/scripts/install-run-rush.js install
node common/scripts/install-run-rush.js build --to @traxettle/shared --to @traxettle/ui
```

`rush.json` pins Node `>=24.11.1 <25`. If you are on a newer Node, Rush refuses
to run; either switch to Node 24 (`nvm install 24 && nvm use 24`) or prefix Rush
commands with `RUSH_ALLOW_UNSUPPORTED_NODEJS=1` (works, but untested by Rush).

The web and mobile apps read `@traxettle/shared` from its built `dist/`, so
**re-run the build step after pulling changes to `libraries/shared`.**

---

## 2. Automated tests

| Package | Command | What covers pooling |
|---|---|---|
| Shared | `cd libraries/shared && npm test` | `pool.test.ts`, `pool-math.test.ts`, `pool-ui.test.ts` — money helpers, presets, allocation, overdraft, reconciliation (incl. randomised invariant checks) |
| API | `cd apps/api && npm test` | `routes/pools.flows.test.ts`, `routes/pools.recurring.test.ts`, `services/pool.service.test.ts`, `services/upload.service.test.ts`, plus the updated expense/auth/regression suites |
| Web | `cd apps/web && npm test` | `__tests__/pool/*` (coverage thresholds include the pool components) |
| Mobile | `cd apps/mobile && npm test` | `__tests__/services/pool.test.ts` |

Typecheck everything:

```bash
(cd apps/api && npx tsc --noEmit) && (cd apps/web && npx tsc --noEmit) && (cd apps/mobile && npx tsc --noEmit)
```

> Known, pre-existing mobile failures unrelated to pooling: `firebase.test.ts`
> (expects a stale emulator project id) and `App.test.tsx` (Jest cannot parse
> the suite). CI runs mobile tests as non-blocking until those are fixed.

---

## 3. Run the app locally

### Option A — fastest: in-memory API, no Firebase (good for UI work)

Without Firebase credentials the API falls back to an in-memory Firestore and,
with `APP_ENV=local`, accepts `Bearer mock-<id>` test tokens. **Data is lost
when the API restarts.**

```bash
# Terminal 1 — API on :3001
cd apps/api && APP_ENV=local PORT=3001 npx ts-node src/index.ts

# Terminal 2 — Web on :3000
cd apps/web && NEXT_PUBLIC_APP_ENV=local NEXT_PUBLIC_API_URL=http://localhost:3001 npx next dev --webpack -p 3000
```

Sign in as a test user from the browser console on http://localhost:3000
(the same mechanism the Playwright suite uses), then reload:

```js
localStorage.setItem('traxettle.authToken', 'mock-alice');
localStorage.setItem('traxettle.uid', 'mock-alice');
```

Switch to another person (e.g. `mock-bob`) the same way. To add Bob to an
event you created as Alice, call the API directly:

```bash
curl -X POST http://localhost:3001/api/events/<eventId>/participants \
  -H 'Authorization: Bearer mock-alice' -H 'Content-Type: application/json' \
  -d '{"userId":"mock-bob"}'
```

Quick end-to-end API check against the running server:

```bash
node scripts/local-dev/pool-smoke.mjs          # expects ALL LIVE CHECKS PASSED
```

### Option B — Firebase emulators (real auth, persistent local data)

```bash
sh scripts/local-dev/02_emulator_web.sh        # web + API + emulators
sh scripts/local-dev/01_emulator_mobile.sh     # mobile + API + emulators
```

Register real test accounts in the app (one per person you want to simulate;
use a second browser profile or an incognito window for the second person) and
invite them by email. Receipts upload to the Storage emulator.

---

## 4. Hand-testing checklist

Use INR and round numbers so the arithmetic is easy to check.

### UC-3 Trip kitty (start here)

1. **Create event → Funding: Pool money → Several of us → Kitty**, "Each person puts in" = 10,000. You land on the **Kitty** tab.
2. Expect: "Nothing in the pool yet" (neutral grey), your contribution "Not paid".
3. Add a second person. They automatically get a 10,000 contribution.
4. **Mark as paid** your own contribution → it is **confirmed immediately** (you're the custodian, the money is in your hands).
5. As the other person, **Mark as paid**; as the custodian, **Confirm**. Balance → ₹20,000.
6. **Add expense → Paid with: Pool funds**, ₹23,000. Note the form has **no split section**. Expect a warning that it goes into overdraft; it saves.
7. Add another ₹2,000 pool expense → refused: *"This would go past the overdraft limit. Add at least ₹1,000…"*. Click **It's already paid — record it anyway** → saved and flagged.
8. Kitty tab: meter red, *"Pool spending is paused — add more than ₹5,000 to resume"*. **Add money** ₹4,000 → still paused; ₹2,000 more → resumes automatically.
9. **Settle up** → the preview shows who covered the shortfall and who pays whom. Confirm → event goes to review → approve → pay → confirm → **settled**; the cycle is closed with its reconciliation in Cycle history.

### UC-2 Sponsor budget (wedding)

1. **Pool money → Just me**, total budget 8,00,000. Tabs: **Budget · Expenses · Spenders**.
2. Invite two people; in **Spenders**, tick **Can spend** for one (optionally a limit). Save.
3. As the spender: **Add expense → My money — claim it back**, attach a receipt (required), submit → "Waiting for your approval" appears for the sponsor.
4. As the sponsor: **Approve** → a **Pool payments** row appears (*You → spender, Reimbursement, To pay*). Mark paid; the spender confirms. The event **stays active**.
5. Try a pool spend without a receipt → refused (receipts are mandatory for budgets).
6. **Finish & report** → nobody owes anyone; the unspent budget stays with the sponsor; event → settled.

### Phase 1 enhancements (design doc §9.2 and §10)

> For full end-to-end runs (each event from creation to Settled, with expected text and balances
> at every step), use [MONEY_POOLING_PHASE1_E2E.md](MONEY_POOLING_PHASE1_E2E.md). The steps below
> are the short version.

Use a fresh "Just me" budget with two invited people, one allowed to spend (the **spender**), and the
sponsor (**custodian**).

**Rejected spends already paid with the pool's money (§9.2)**

1. As the spender, **Add expense**: *My money — claim it back* is listed first, marked **Suggested**, and selected.
2. Switch to **Pool funds**: the form now asks *"I've already paid with the budget's money"* or *"I'm asking before
   I spend"*. Submitting without choosing is refused with a prompt.
3. Record one as **already paid** (₹500) and one as **asking first** (₹700). The sponsor's approval list shows
   *Pool spend · already paid* and *Pool spend · asking first*.
4. As the sponsor, **Reject** the already-paid one: a warning says the spender will owe ₹500 back. Confirm →
   **Pool payments** shows *spender → you · Repayment (spend not approved) · To pay*; the expense shows *Owed back*.
   Reject the asking-first one → no payment is created.
5. As the spender, try to **delete** the rejected already-paid expense → refused ("only the custodian or an admin").
   Edit its amount instead → it goes back to *awaiting approval* and the repayment disappears; reject again →
   a new repayment for the new amount.
6. The spender taps **Mark paid** on the repayment, the sponsor taps **Received** → *Repaid*.
7. **Finish & report** while a repayment is unpaid → the preview lists it under **Paid separately**; the event waits in
   *payment* until it's paid and confirmed (from the Settlements list, where it's labelled *paid on its own*). It isn't
   netted against other payments; netting is planned for Phase 2 (design doc §11).

**Money added by others (§10)**

1. As the spender, **Add money** ₹10,000: the sheet offers *"{sponsor} pays it back when the budget closes"*
   (default) or *"It's a gift — don't pay me back"*. Keep the default. As the third person, add ₹5,000 as a **gift**.
2. The Budget list shows *top-up · paid back at close* and *gift*. The sponsor's **Confirm** sheet says
   *"You'll pay this back to … when the budget closes"* (or *"A gift…"*).
3. Before confirming, **Finish & report** is refused: *"Confirm or reject the money people have added…"*.
4. Confirm both. The summary shows *"You'll pay back ₹10,000 that others added"* to the sponsor and
   *"₹10,000 to get back from {sponsor}"* to the spender.
5. **Finish & report** → one payment, **sponsor → spender ₹10,000**, settled with *I've Paid* → *Confirm* (or the
   spender's *Mark as Paid*). The gift is not paid back.

### UC-1 Shared-living fund

1. **Pool money → Several of us → Fund**, 15,000 per person per month. Invite flatmates — **no extra cycles** are created while nobody has paid.
2. Pay in, spend (rent, electricity with a PDF receipt), leave someone unpaid.
3. **Close <Month>** → preview shows each person's carried credit/debt → confirm → a new month opens with the balance carried and fresh dues.
4. Overspend before closing → the close preview asks **who covered the shortfall**.
5. Remove a flatmate after money has moved → the cycle closes and they are squared up through **Pool payments** (a *Leaving settlement* — paid to them if they're in credit, by them if they owe); everyone else carries forward into a continuing cycle labelled *"(from <date>)"*.

### UC-4 Club treasury · UC-5 Target collection · UC-6 Hybrid

- **Treasury**: set tiered amounts with **Set amounts** (e.g. 2,000 / 500 / 200); joiners don't close the cycle; surplus always carries.
- **Collection**: target 20,000 → pool spends are refused until the target is collected, then allowed only up to the balance.
- **Hybrid** (Advanced → *Also allow regular split expenses*): the expense form offers a third option, *My money — split it* (the classic form). **Settle up** produces **one** plan covering pool refunds and peer debts.

### Regression: split-expenses events are unchanged

Create an event with **Split expenses** (the default). There is no pool tab,
no "Paid with" control, and settling works exactly as before. Receipts can now
be attached to ordinary expenses too.

### Mobile

The event screen shows a pool card (tap → Pool screen). Create/edit expense
shows **Paid with** and **Take photo / Choose photo** for receipts.

---

## 5. Useful API calls

```bash
curl http://localhost:3001/api/pools/event/<eventId>/summary  -H 'Authorization: Bearer mock-alice'
curl http://localhost:3001/api/pools/event/<eventId>/ledger   -H 'Authorization: Bearer mock-alice'
curl -X POST http://localhost:3001/api/pools/event/<eventId>/close-preview \
  -H 'Authorization: Bearer mock-alice' -H 'Content-Type: application/json' -d '{"forDissolution":true}'
```

Full endpoint list: [MONEY_POOLING_DESIGN.md §5](../utility/MONEY_POOLING_DESIGN.md#5-api-surface).
