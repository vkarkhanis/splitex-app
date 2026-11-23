# Money Pooling — Phase 2 end-to-end test scenarios

A hand-test plan for the branch `feature/money-pooling-enhancements-phase2`. Each scenario takes one event
from creation to **Settled** and checks the Phase 2 changes along the way:

- **§9.3 Handing money to spenders.** The custodian gives a spender cash (an *advance*), the spender
  confirms it, and the app tracks what each spender holds. Spenders say how they paid: money they hold,
  the custodian's card or UPI, or their own money.
- **§10.6 Paying back early.** The custodian pays back money someone lent, before the pool closes.
- **§11 Netting.** At settle-up, this cycle's unpaid repayments and claims are folded into the final
  payments instead of being paid on their own.
- **§12 "Several of us" is Pro.** Only the person creating a group pool needs Pro. Members join free, and
  a lapse never blocks a pool that already exists.

For the reasons behind these rules, see [MONEY_POOLING_DESIGN.md](../utility/MONEY_POOLING_DESIGN.md)
(§0 lists where the build differs from the text). The build plan and its notes are in
[MONEY_POOLING_PHASE2_PLAN.md](../utility/MONEY_POOLING_PHASE2_PLAN.md). Phase 1's scenarios are in
[MONEY_POOLING_PHASE1_E2E.md](MONEY_POOLING_PHASE1_E2E.md); Scenario 2 below re-runs two of them.

---

## 0. Before you start

### Is it safe to run during App Review?

Yes, with the setup below. It runs **the branch's own API and web app on your Mac**, connected to the
**staging** Firebase project. Nothing is deployed.

- **App Review is untouched.** Build 1.0.40, which Apple is reviewing, uses the production API and the
  production Firebase project. These steps never touch either.
- **The deployed staging API (Cloud Run) is untouched,** so TestFlight builds switched to Staging keep
  working as they do now.
- **What gets written, and where.** Test accounts' events, contributions and payments go to staging
  Firestore, as in Phase 1. So do a new `poolAdvances` collection and a few new optional fields. The
  deployed staging API ignores them.
- **No database changes are needed.** Phase 2's new queries are all single equality filters, which
  Firestore indexes automatically. No Firestore or Storage rules changed.
- **Don't open these test events in a TestFlight or App Store build switched to Staging.** Those builds
  use the deployed staging API, which runs older code and doesn't know about hand-overs or netting.
- **Don't buy anything.** Pro is switched on test accounts with the tier switch (below), and the free
  trial can't be tested yet (watch item 5).

### Steps on the Mac you test on

You need the same files as for Phase 1 (the staging service account and Firebase config files). The
bootstrap step at the start of each script lists anything missing.

1. **Get the branch**, from the repository root (the folder containing `traxettle-rush/`):

   ```bash
   git fetch origin
   git checkout feature/money-pooling-enhancements-phase2
   git pull
   ```

2. **Install and build**, from `traxettle-rush/`. On Node 25 or later, keep the
   `RUSH_ALLOW_UNSUPPORTED_NODEJS=1` prefix; on Node 24 it isn't needed.

   ```bash
   RUSH_ALLOW_UNSUPPORTED_NODEJS=1 node common/scripts/install-run-rush.js install
   RUSH_ALLOW_UNSUPPORTED_NODEJS=1 node common/scripts/install-run-rush.js build --to @traxettle/shared --to @traxettle/ui
   ```

   Run the build step again after every pull: the apps read the shared library's built `dist/`.

3. **Optional: the automated suites** (about 3 minutes), from `traxettle-rush/`:

   ```bash
   (cd libraries/shared && npm test) && (cd apps/api && npm test) && (cd apps/web && npm test) && (cd apps/mobile && npm test)
   ```

4. **Set the local-dev flags** to the free tier and mock payments. Every payment in this plan is
   recorded with *I've Paid* and *Confirm Receipt*, so no payment gateway is needed:

   ```bash
   bash scripts/local-dev/05_set-flags.sh --tier free --payments mock
   ```

   This rewrites `scripts/local-dev/.runtime.env`. The file is in git, so git will show it as changed;
   put it back afterwards with `git checkout -- scripts/local-dev/.runtime.env` if you like.

5. **Start one API for everything: web, the iOS simulator and the Android emulator.** Each device can
   then be signed in as a different person, and they all update live.

   1. **Start the devices:** an iPhone in the Simulator app, and an emulator from Android Studio
      (Device Manager). Check that `adb devices` lists the emulator.
   2. **Terminal 1, the API and Metro** (from `traxettle-rush/`). First clear Metro's cache once, because
      the last Metro run on that Mac may have used a different API address:

      ```bash
      rm -rf "${TMPDIR:-/tmp/}"metro-*
      ```

      ```bash
      bash scripts/local-dev/03_real_mobile.sh staging
      ```

      Wait until the API is listening on port 3001 and Metro is waiting on port 8081. If the script says
      the environment switched, press Enter, and add `--build` in step 4 below.
   3. **Terminal 2, the web app** (from `traxettle-rush/`):

      ```bash
      bash scripts/local-dev/04_real_web.sh staging
      ```

      This script also tries to start an API on port 3001. Terminal 1's is already there, so this one
      stops with *EADDRINUSE: address already in use* and *app crashed - waiting for file changes*.
      **That's expected:** both scripts run the same API code against staging, and the web app uses
      Terminal 1's. Open http://localhost:3000 once the web app is ready.
   4. **Terminal 3, install and open the app** on the simulator and the emulator (from `traxettle-rush/`):

      ```bash
      bash scripts/local-dev/06_staging_mobile.sh ios --no-bundler
      ```

      ```bash
      bash scripts/local-dev/06_staging_mobile.sh android --no-bundler
      ```

      With `--no-bundler`, this script only builds (if needed), installs and opens the app. It also
      connects the emulator to Metro. The app loads its code from Terminal 1's Metro, which points it at
      your local API. The script checks first that the deployed staging API answers, but only checks.
      The first Android build takes several minutes. Add `--build` to force a fresh install, for example
      when the app was built for a different Firebase project.
   5. **Check all three use the branch's API.** Terminal 1 prints a request for each screen the apps
      load. Create event offers *Several of us*, and Profile shows the tier switch: **Local Tier Switch**
      on web, **Internal Tier Switch** in the app.
   6. **Sign in:** **Anita on web, Ravi on the iOS simulator, Priya on the Android emulator.** One
      account can be signed in on several devices at once. For the mobile pass's custodian steps, also
      sign Anita into one of the apps.

   **Ctrl+C** in Terminals 1 and 2 stops everything. Keep Terminal 1 running while you test: it owns
   the API that all three use. Without mobile, Terminal 2 alone is enough: its API then starts normally.

6. **When you're done:** switch the test accounts back to the plan they should keep. The test events
   can stay on staging, or you can delete them.

### Accounts and making someone Pro

Use three staging test accounts (the Phase 1 ones are fine): **Anita**, **Ravi** and **Priya**. Set
each account's display name to match, so the screens read like this plan. On web, use three browser
profiles, or Chrome, Safari and Firefox: incognito windows share one session.

"Several of us" pools need a Pro creator. Switch a test account without buying anything:

- **Web:** Profile → **Local Tier Switch** → **Pro** (or **Free**). The script turns this on.
- **Mobile:** Profile → **Internal Tier Switch**.

The switch changes the tier the server uses, the same one a real subscription sets. It only changes
the staging account you're signed in as.

### The people

| Name | Role | Plan |
|---|---|---|
| **Anita** | Creates every event and holds the money (custodian / sponsor) | **Pro** (except where Scenario 5 lapses it) |
| **Ravi** | A spender in the budgets and a member in the pools | Free |
| **Priya** | A guest in the budgets; tries to create a Kitty in Scenario 4 | Free, then Pro |

### Good to know

- A **Budget** needs a receipt on every pool expense and every claim. Keep a small image ready.
- Anita is Pro, so the free plan's 3-event limit doesn't apply to her. Ravi and Priya only join events,
  except in Scenario 4.
- All amounts are in INR. People appear as **You** on their own screen.
- **Balance** is what's left in the pool. Handing money over doesn't change it: it only moves the
  money between **With you** (the custodian) and **With spenders**.
- Run the scenarios in order. Each one ends with its event **Settled**.
- **Already automated** (`e2e/tests/pool-phase2.spec.ts`, run with Playwright): Scenarios 1, 3, 5, 6 and 7,
  and Phase 1's Scenarios 3 and 4 with netting. Running them by hand is still worth it: the automated
  tests set up most data through the API and run on web only, while here you click every step, on web
  and mobile.

---

## Scenario 1: Wedding budget with money handed over, from start to finish

The main scenario: advances, spends from held money, a spend on the custodian's card, returns, a loan,
and a settle-up that nets all of it into one payment.

### Setup

| # | Who | Do | Expect | Balance |
|---|---|---|---|---|
| 1.1 | Anita | Create "Goa wedding": **Pool money → Just me**, total budget **50,000**. | Tabs **Budget · Expenses · Spenders**. | ₹50,000 |
| 1.2 | Anita | Invite Ravi and Priya. On **Spenders**, tick **Can spend** for Ravi (no limit). Priya stays a guest. Save. | Spenders shows **Spenders can pay with my card or UPI**, ticked. | |

### A. Handing money over

| # | Who | Do | Expect | Balance |
|---|---|---|---|---|
| A1 | Anita | Open the **Budget** tab. | A **Give money** button. **Record money returned** isn't there yet: it appears once a spender holds money (D5). | ₹50,000 |
| A2 | Anita | Tap **Give money**. | The sheet **Give money to a spender** lists only Ravi (Priya can't spend) and shows *Up to ₹50,000.00*. The hint starts *They confirm once they have it. Moving money between spenders? Record a return from one and an advance to the other…* | |
| A3 | Anita | Enter **20,000**, note "Cash for decor", attach a photo as proof (optional), tap **Give money**. | Toast **Money handed over**: *Waiting for them to confirm.* The card **Money handed over** lists *Advance · Waiting for Ravi to confirm*, You → Ravi ₹20,000, with **Cancel**. Under the meter: *With you ₹50,000.00 · With spenders ₹0.00 · ₹20,000.00 handed over, waiting to be confirmed*. | ₹50,000 |
| A4 | Ravi | Open **Budget**. | The same row reads *Waiting for you to confirm*, with **Confirm** and **Not received**. | |
| A5 | Ravi | Tap **Confirm**. | Toast *Recorded as received.* Ravi sees *You're holding ₹20,000.00 of the budget's money.* and a **Return money** button. The row reads *Confirmed*, with the note and a **proof** link that opens the photo. | ₹50,000 |
| A6 | Anita | Look at Budget and Spenders. | *With you ₹30,000.00 · With spenders ₹20,000.00*. Spenders has a **Holding** column: Ravi ₹20,000. | ₹50,000 |
| A7 | Anita | **Give money**, enter **35,000**. | *Up to ₹30,000.00*, a red *That's more than ₹30,000.00.*, and the button is disabled. | |
| A8 | Anita | Change it to **5,000** and give it. Then, as Ravi, tap **Not received** on it. | The row shows *Not received* and never counts: Ravi still holds ₹20,000. | ₹50,000 |

### B. Paying with what he holds

| # | Who | Do | Expect | Balance |
|---|---|---|---|---|
| B1 | Ravi | Tap **Add expense**. | Paid with lists **My money — claim it back · Suggested** first, then **Budget money I'm holding** (*₹20,000.00 left.*) and **Anita's card or UPI** (*Paid with their card, UPI or account.*). Either pool option still asks *already paid* or *asking first* (design doc §0). | |
| B2 | Ravi | **Budget money I'm holding**, **already paid**, "Decorations", ₹15,000, with a receipt. | Waits for approval. | |
| B3 | Anita | Open **Budget**. | "Waiting for your approval" shows Decorations as *Pool spend · already paid* with the badge **Money they hold**. | |
| B4 | Anita | Approve Decorations. | *With you ₹30,000.00 · With spenders ₹5,000.00*. Ravi sees *You're holding ₹5,000.00…* | ₹35,000 |
| B5 | Ravi | **Budget money I'm holding**, **already paid**, "Flowers", ₹2,000, with a receipt. | | |
| B6 | Anita | **Reject** Flowers. | The warning: *Ravi paid this with budget money they hold. If you reject it, the ₹2,000.00 stays with them, to be returned or settled at the end.* After rejecting, **no** repayment appears under Pool payments, and Ravi still holds ₹5,000. | ₹35,000 |
| B7 | Ravi | **Anita's card or UPI**, **already paid**, "Band", ₹600, with a receipt. | The approval row shows the badge **Your card or UPI** (to Anita). | |
| B8 | Anita | **Reject** Band. | The warning: *Ravi says this was already paid with the budget's money. If you reject it, they owe ₹600.00 back to you.* Pool payments shows *Ravi → Anita · Repayment (spend not approved) · To pay ₹600*. **Leave it unpaid.** | ₹35,000 |

### C. Turning card spends off

| # | Who | Do | Expect |
|---|---|---|---|
| C1 | Anita | Spenders → untick **Spenders can pay with my card or UPI** → Save. | |
| C2 | Ravi | **Add expense**. | Paid with offers only **My money — claim it back** and **Budget money I'm holding**. Close the form. |
| C3 | Ravi | Edit **Band**. | Editing still works. The card method was chosen before the switch, so it's kept. |
| C4 | Anita | Tick the switch again and save. | |

### D. Returning money

| # | Who | Do | Expect | Balance |
|---|---|---|---|---|
| D1 | Ravi | Tap **Return money**, enter **6,000**. | The sheet **Return budget money** says *That's more than ₹5,000.00.* and the button is disabled. | |
| D2 | Ravi | Change it to **1,000** and tap **Return money**. | Toast *Waiting for Anita to confirm.* The row reads *Returned · Waiting for Anita to confirm*. | ₹35,000 |
| D3 | Anita | Tap **Finish & report**. | A red banner: *1 hand-over is waiting for confirmation. Confirm, reject or cancel it first.* **Settle up** is disabled. Close the preview. | |
| D4 | Anita | **Confirm** Ravi's return. | Ravi holds ₹4,000. *With you ₹31,000.00 · With spenders ₹4,000.00*. | ₹35,000 |
| D5 | Anita | Tap **Record money returned**, pick *Ravi (holds ₹4,000.00)*, enter **1,000**, tap **Record**. | Hint *Recorded straight away: you are the one receiving it.* It's confirmed at once. Ravi holds ₹3,000. | ₹35,000 |

### E. A loan

| # | Who | Do | Expect | Balance |
|---|---|---|---|---|
| E1 | Ravi | **Add money** ₹10,000, keep *Anita pays it back when the budget closes*. | *Awaiting confirmation.* | |
| E2 | Anita | **Confirm** it. | Anita sees *You'll pay back ₹10,000.00 that others added, when the budget closes.* and *Ravi lent the budget money: ₹10,000.00 still to pay back.* with **Pay back now** (don't press it; that's Scenario 3). | ₹45,000 |

### F. Finish and settle

| # | Who | Do | Expect |
|---|---|---|---|
| F1 | Anita | Tap **Finish & report**. | Collected **₹60,000**, Spent from the pool **−₹15,000**, Left over **₹45,000**. Ravi's row: *₹7,000.00 from the budget, less ₹600.00 for Band (repayment)* → **gets back ₹6,400.00**. Your row: **pays ₹6,400.00**. Under **Included in the final settlement**: *Ravi → You · Repayment (spend not approved) · Band* **₹600.00**, then *These are included in the payments above instead of being paid on their own.* There's no **Paid separately** section. |
| F2 | Anita | Tap **Settle up**. | The event moves to **Review**. The list shows **Anita → Ravi ₹6,400** first, then the Band row, greyed out: *Repayment (spend not approved) · included in the payments above*. Above the rows: *Repayments and unpaid claims are included in these payments. They aren't paid on their own.* In Expenses, Band shows **In final settlement**. |
| F3 | Everyone | Approve. | The event moves to **Payment**. The counter shows **0/1** complete: the Band row isn't counted again. |
| F4 | Anita, then Ravi | Anita taps **I've Paid** for ₹6,400, then Ravi taps **Confirm Receipt**. | The event is **Settled**. Band shows **Repaid**. Cycle history has the reconciliation. |

**Why these numbers (F1):**

- Collected = Anita's 50,000 budget + Ravi's 10,000 loan = 60,000. Spent = Decorations 15,000. Flowers and
  Band were rejected, so they aren't spending.
- Ravi holds 20,000 − 15,000 (Decorations) − 1,000 − 1,000 (returns) = 3,000. The rejected Flowers spend
  doesn't lower it: he still owes that money. The ₹5,000 he never received doesn't count.
- His position from the budget: lent 10,000 − held 3,000 = 7,000. Less the ₹600 he owes for Band = 6,400,
  paid as one payment instead of three (₹10,000 to him, ₹3,000 and ₹600 from him).

---

## Scenario 2: Phase 1 scenarios with netting

Run [Phase 1's Scenario 1 and Scenario 3](MONEY_POOLING_PHASE1_E2E.md) as written, with these changes:

- Anita must be **Pro** for Scenario 3 (a Kitty).
- Where Phase 1 says Ravi or Priya pick **Pool funds**, pick **Anita's card or UPI**: for anyone but the
  custodian, that's what "Pool funds" became. *Budget money I'm holding* (or *Kitty money…*) only appears
  once the custodian has handed them money.

### Phase 1 Scenario 1, steps I1–I5 (Wedding budget)

| # | Who | Do | Expect |
|---|---|---|---|
| I1 | Anita | Tap **Finish & report**. | Collected **₹67,000**, Spent **−₹37,800**, Left over **₹29,200**, as before. Ravi's row: *₹10,000.00 from the budget, less ₹600.00 for Snacks (repayment)* → **gets back ₹9,400.00**. Your row: **pays ₹9,400.00**. **Included in the final settlement** lists *Ravi → You · Repayment (spend not approved) · Snacks* **₹600.00**. Nothing is under **Paid separately** (Taxi and Cake are already paid). |
| I2 | Anita | Tap **Settle up**. | **Review** lists Anita → Ravi **₹9,400**, then Taxi ₹800 *Reimbursement · already paid*, Cake ₹1,200 *Repayment (spend not approved) · already paid*, and Snacks ₹600 *Repayment (spend not approved) · included in the payments above* (greyed out, last). |
| I3 | Everyone | Approve. | **Payment**, with **2/3** complete (Taxi and Cake; Snacks isn't counted). |
| I4 | Anita, then Ravi | Anita taps **I've Paid** for ₹9,400; Ravi confirms. | The event is **Settled** straight away. Phase 1 needed a separate ₹600 payment here. Snacks shows **Repaid**. |

### Phase 1 Scenario 3, steps 3.7–3.9 (Office party kitty)

| # | Who | Do | Expect |
|---|---|---|---|
| 3.7 | Anita | Tap **Settle up**. | Collected ₹6,000, Spent −₹1,800, Left over ₹4,200. Ravi: *₹1,400.00 from the kitty, less ₹1,500.00 for DJ (repayment)* → **pays ₹100.00**. Priya: **gets back ₹1,400.00**. You: *₹2,800.00 to the kitty, plus ₹1,500.00 for DJ (repayment)* → **pays ₹1,300.00**. DJ is under **Included in the final settlement**. |
| 3.8 | Everyone | **Settle up**, then approve. | Two payments: **Anita → Priya ₹1,300** and **Ravi → Priya ₹100**, plus the DJ row greyed out. Ravi pays Priya directly; nothing is routed through Anita (design doc §11.3). |
| 3.9 | Anita, Ravi, then Priya | Both pay (**I've Paid**); Priya confirms both. | The event is **Settled**. |

### Phase 1 Scenario 4, steps 4.6–4.8 (only a repayment open)

| # | Who | Do | Expect |
|---|---|---|---|
| 4.6 | Anita | Tap **Finish & report**. | Ravi: *Owes ₹500.00 for Lunch (repayment)* → **pays ₹500.00**. You: *Owed ₹500.00 for Lunch (repayment)* → **gets back ₹500.00**. |
| 4.7 | Anita | Tap **Settle up**. | The event goes to **Review**, not straight to Payment: there's now a plan payment, Ravi → Anita ₹500, plus the Lunch row greyed out. Phase 1's watch item 5 (a false "Settled") no longer applies. |
| 4.8 | Everyone | Approve; Ravi pays; Anita confirms. | **Settled**. |

---

## Scenario 3: Paying a lender back early, while spending is paused

A budget of ₹10,000 with the usual 20% overdraft allowance. The allowance is 20% of the money confirmed
so far, and money paid back early comes off it (design doc §0).

### Setup

| # | Who | Do | Expect | Balance |
|---|---|---|---|---|
| 3.0 | Anita | Create "Pooja": **Just me**, budget **10,000**. Ravi can spend. Ravi adds ₹4,000 (a loan); Anita confirms. | *Ravi lent the budget money: ₹4,000.00 still to pay back.* with **Pay back now**. | ₹14,000 |
| 3.1 | Anita | Add expense: **Pool funds**, "Hall", ₹13,000, with a receipt. | Saved and approved (it's her own spend). | ₹1,000 |

### Steps

| # | Who | Do | Expect | Balance |
|---|---|---|---|---|
| 3.2 | Anita | Tap **Pay back now** next to Ravi. | The amount is filled in as **4,000**. A warning: *This pauses spending. You'll need to add ₹3,000.01 before anyone can spend again.* (₹1,000 − ₹4,000 = −₹3,000, past the new limit of −₹2,000.) | |
| 3.3 | Anita | Change the amount to **1,000**. | The warning disappears. Tap **Pay back now**: toast *Waiting for Ravi to confirm.* The row reads *Paid back early · Waiting for Ravi to confirm*. The loan line already says ₹3,000 still to pay back. | ₹1,000 |
| 3.4 | Ravi | **Confirm** it. | | ₹0 |
| 3.5 | Anita | Add expense: Pool funds, "Decor", ₹3,000, with a receipt. | Refused: it goes past the limit (−₹2,600). Tap **It's already paid — record it anyway**: saved and flagged. The meter turns red: *Pool spending is paused — add more than ₹3,000.00 to resume*. | −₹3,000 |
| 3.6 | Anita | **Pay back now** next to Ravi (filled in as 3,000). | The warning: *Spending is paused. Paying Ravi ₹3,000.00 now means you'll need to add ₹6,000.01 before anyone can spend again.* It's allowed. Tap **Pay back now**. | |
| 3.7 | Ravi | **Confirm** it. | The loan line and **Pay back now** disappear: nothing is left to pay back. The banner now says to add more than ₹6,000.00. | −₹6,000 |
| 3.8 | Ravi | Add expense: Anita's card or UPI, **asking first**, "Lamps", ₹500, with a receipt. | Refused: spending is paused. |
| 3.9 | Anita | **Add money** ₹6,000. | Still paused: the balance has to go **above** zero. | ₹0 |
| 3.10 | Anita | **Add money** ₹500. | Spending resumes. | ₹500 |
| 3.11 | Anita | **Finish & report**, then **Settle up**. | The figures add up: Collected **₹20,500**, Paid back early **−₹4,000**, Spent from the pool **−₹16,000**, Left over **₹500**. Nobody is paid anything: Ravi's loan is fully paid back. The event is **Settled**. |

---

## Scenario 4: A free user and a Pro user creating a Kitty

| # | Who | Do | Expect |
|---|---|---|---|
| 4.1 | Priya (free) | **Create event → Pool money**. | **Just me** is selected. **Several of us** is shown **locked**: greyed out, dashed border, a **PRO** badge and *🔒 Pro feature*. |
| 4.2 | Priya | Tap **Several of us**. | It **doesn't get selected**: Just me stays selected, and no Kitty / Fund choices appear. A notice: *Group pools are a Pro feature. Only you need Pro: everyone you invite joins free.* with **Learn how to get Pro** (web), or **Upgrade to Pro** on mobile, which opens the upgrade screen. |
| 4.3 | Priya | Tap **Just me** again. | The notice goes away. There's no way to create a group pool without Pro. |
| 4.4 | Priya | Follow **Learn how to get Pro**. | The Pro page lists **Unlimited events · Multi-currency settlement · Group pools · Analytics (coming soon) · More power-user features**. Help's Pro card shows the same, and its feature list has a pooling line. |
| 4.5 | Priya | Create a **Just me** budget, and a **Split expenses** event. | Both are created: they're free. |
| 4.6 | Priya | Switch to **Pro** (see "Making someone Pro"). Open create event again. | No PRO badge or notice. Create "Book club" as a **Kitty**, ₹1,000 each. It's created. |
| 4.7 | Ravi (free) | Join "Book club" and pay in; Priya confirms. Ravi adds a ₹300 pool expense. | All of it works on the free plan. |
| 4.8 | Priya | Settle up "Book club", approve, pay, confirm. Then delete or settle her other test events, and switch back to **Free**. | **Settled**. |

**Mobile:** the upgrade screen lists **Group pools** after Multi-Currency Settlement. Profile's upgrade
row reads *Unlimited events, group pools, multi-currency & more*. Help has a **Pool Money** card.

**Production builds:** this branch turns `CONTRIBUTOR_POOLS_IN_PRODUCTION` on, so production builds made
from it offer "Several of us" (Pro only) and list group pools. Builds already installed from 1.0.40 and
the currently deployed web app still hide them until the Phase 2 release.

---

## Scenario 5: A Fund across two months: held money carries over, and the creator's Pro lapses

| # | Who | Do | Expect | Balance |
|---|---|---|---|---|
| 5.1 | Anita (Pro) | Create "Flat 4B": **Several of us → Fund**, ₹5,000 per person per month. Invite Ravi. Both pay in; Anita confirms Ravi's. | | ₹10,000 |
| 5.2 | Ravi | Add expense: **Anita's card or UPI**, **already paid**, "Groceries", ₹2,000. | Saved and approved: a Fund doesn't ask for approval. | ₹8,000 |
| 5.3 | Anita, then Ravi | Anita taps **Give money**: ₹1,000 to Ravi for the cleaner. Ravi confirms. | Anita sees *With you ₹7,000.00 · With spenders ₹1,000.00*. Ravi sees *You're holding ₹1,000.00 of the fund's money.* | ₹8,000 |
| 5.4 | Anita | Switch to **Free**. | | |
| 5.5 | Ravi | Add expense: **Anita's card or UPI**, already paid, "Electricity", ₹1,000. | Still works: the lapse doesn't block an existing pool. | ₹7,000 |
| 5.6 | Anita | Tap **Close <month>** (the button names the month) and confirm. | The cycle closes. A new month opens with ₹7,000 carried (₹3,500 each) and fresh dues of ₹5,000 each. Ravi **still holds ₹1,000**: held money carries over. | ₹7,000 |
| 5.7 | Anita, Ravi | Both pay the new month; Anita confirms Ravi's. | Works on the free plan. | ₹17,000 |
| 5.8 | Anita | Try to create a new **Kitty**. | **Several of us** is locked (PRO, *🔒 Pro feature*) and can't be picked. Only *new* group pools need Pro. | |
| 5.9 | Anita | Back in "Flat 4B", tap **Settle up**. | Carried in ₹7,000, Collected ₹10,000, Spent from the pool ₹0, Left over ₹17,000. Ravi **gets back ₹7,500.00**: his ₹8,500 share less the ₹1,000 he holds. You **pay ₹7,500.00**. | |
| 5.10 | Everyone | Settle up, approve, pay, confirm. Then switch Anita back to **Pro**. | **Settled**. | |

**Why these numbers (5.9):** month one spent ₹3,000, so each of you carried ₹5,000 − ₹1,500 = ₹3,500.
Month two adds ₹5,000 each with no spending, so each share is ₹8,500. Anita holds ₹16,000 of the cash and
Ravi ₹1,000, so Anita pays Ravi ₹8,500 − ₹1,000 = ₹7,500.

---

## Scenario 6: Budget edge cases

The less common paths: cancelling, spending beyond what you hold, changing how a spend was paid, leaving
while holding money, and every kind of pool payment meeting at settle-up.

### Setup

| # | Who | Do | Expect | Balance |
|---|---|---|---|---|
| 6.0 | Anita | Create "Sangeet": **Just me**, budget **30,000**. Invite Ravi (**Can spend**) and Priya (guest). | | ₹30,000 |

### A. Hand-overs

| # | Who | Do | Expect | Balance |
|---|---|---|---|---|
| 6.1 | Anita | **Give money** ₹5,000 to Ravi. While it waits, tap **Cancel** on its row. | The row reads *Cancelled*. *With you ₹30,000.00 · With spenders ₹0.00*. | ₹30,000 |
| 6.2 | Anita, then Ravi | Give Ravi ₹5,000 again, attaching a photo as proof. Ravi confirms. | Ravi holds ₹5,000. | ₹30,000 |
| 6.3 | Anita | Participants → remove Ravi, and confirm. | Refused: *This person still holds ₹5,000.00 of pool money. It needs to be returned first.* Ravi stays. | |

### B. Spending beyond what he holds, and changing how it was paid

| # | Who | Do | Expect | Balance |
|---|---|---|---|---|
| 6.4 | Ravi | **Budget money I'm holding** (*₹5,000.00 left.*), already paid, "Lights", ₹6,000, with a receipt. Anita approves it. | Ravi sees *The budget owes you ₹1,000.00 for spends beyond the money you held.* Anita sees *With you ₹25,000.00 · With spenders −₹1,000.00*. | ₹24,000 |
| 6.5 | Anita | Try to remove Ravi again. | Refused: *The pool owes this person ₹1,000.00 for spends beyond the money they held. Give them that amount first.* | |
| 6.6 | Ravi | Edit **Lights**: change Paid with to **Anita's card or UPI**, and save. | Lights goes back to *Awaiting approval*: changing how it was paid is checked again, like changing the amount. Ravi holds ₹5,000 again. | ₹30,000 |
| 6.7 | Anita | Approve **Lights** again. | The approval row shows **Your card or UPI**. Ravi still holds ₹5,000: a card spend doesn't use his cash. | ₹24,000 |
| 6.8 | Ravi, then Anita | Ravi taps **Return money**, ₹5,000; Anita confirms. | Ravi holds nothing, and his **Return money** button disappears. | ₹24,000 |

### C. A loan, a claim and two repayments

| # | Who | Do | Expect | Balance |
|---|---|---|---|---|
| 6.9 | Ravi, then Anita | Ravi adds ₹2,000 (keep the loan default); Anita confirms. | *Ravi lent the budget money: ₹2,000.00 still to pay back.* | ₹26,000 |
| 6.10 | Anita | **Pay back now**, change the amount to **2,500**. | *That's more than ₹2,000.00.* and the button is disabled. Close the sheet. | |
| 6.11 | Ravi, then Anita | Ravi adds **My money — claim it back**, "Taxi", ₹800, with a receipt. Anita approves it. | Pool payments: *Anita → Ravi · Reimbursement · To pay ₹800*. **Leave it unpaid.** | ₹25,200 |
| 6.12 | Ravi, then Anita | Ravi adds **Anita's card or UPI**, already paid, "Snacks", ₹400. Anita rejects it. Ravi taps **Mark as paid** on the ₹400 repayment and submits. | The repayment reads *Paid — awaiting confirmation*. **Leave it there.** | ₹25,200 |
| 6.13 | Ravi, then Anita | Ravi adds **Anita's card or UPI**, already paid, "Cake", ₹300. Anita rejects it. | A ₹300 repayment, *To pay*. **Leave it unpaid.** | ₹25,200 |

### D. Settle up with every kind of pool payment

| # | Who | Do | Expect |
|---|---|---|---|
| 6.14 | Anita | Tap **Finish & report**. | Collected **₹32,000**, Spent from the pool **−₹6,800**, Left over **₹25,200**. Ravi's row: *₹2,000.00 from the budget*, plus ₹800.00 for Taxi (claim), less ₹300.00 for Cake (repayment) → **gets back ₹2,500.00**. Your row: **pays ₹2,500.00**. **Included in the final settlement:** *You → Ravi · Reimbursement · Taxi* ₹800 and *Ravi → You · Repayment (spend not approved) · Cake* ₹300. **Paid separately:** *Ravi → You · Repayment (spend not approved) · sent, awaiting confirmation* ₹400, because Ravi already started paying it. |
| 6.15 | Anita | Tap **Settle up**. | **Review** lists **Anita → Ravi ₹2,500**, then Taxi and Cake greyed out (*… · included in the payments above*), and Snacks as *Repayment (spend not approved) · paid on its own*. In Expenses, Taxi and Cake show **In final settlement**. |
| 6.16 | Anita | Tap **Settlement Details**. | *Total: ₹2900.00* (₹2,500 plus the ₹400 being paid; this popup shows no thousands separator). The folded rows are listed last and aren't counted again. |
| 6.17 | Anita | In Expenses, delete **Cake** (forgiving it). | Allowed. The Review shows *⚠ Expenses have changed. Settlement needs to be regenerated before approvals can continue.* |
| 6.18 | Anita | Tap **Regenerate Settlement**. | The payment becomes **Anita → Ravi ₹2,800**, and the Cake row is gone. Taxi is still included. |
| 6.19 | Everyone | Approve. | **Payment**, with **0/2** complete: the ₹2,800 and the ₹400 repayment. Taxi isn't counted again. |
| 6.20 | Anita, then Ravi | Anita taps **I've Paid** for ₹2,800; Ravi taps **Confirm Receipt**. | **1/2**. The event **stays in Payment**, because the ₹400 repayment is still open. |
| 6.21 | Anita | In the Settlements list, tap **Confirm Receipt** on the ₹400 Snacks row. | The event is **Settled**. Taxi shows **Reimbursed** and Snacks **Repaid**. |

**Why these numbers (6.14):** Collected = Anita's 30,000 + Ravi's 2,000 loan. Spent = Lights 6,000 + the
Taxi claim 800. Ravi holds nothing, so from the budget he gets back his 2,000 loan, plus the 800 Taxi
claim and less the 300 Cake repayment, both folded in: 2,500. Snacks stays separate because he'd already
said he'd paid it.

---

## Scenario 7: Treasury, Collection and a hybrid event ("Several of us", Pro)

The two pool types Scenarios 2–5 don't use, and an event that mixes pool money with ordinary split
expenses. Anita is **Pro**; Ravi and Priya stay free.

### A. Treasury: tiered dues, and what's left carries over

| # | Who | Do | Expect | Balance |
|---|---|---|---|---|
| 7.1 | Anita | Create "Chess club": **Pool money → Several of us → Treasury**, "Each person puts in" **500**. Invite Ravi. Ravi pays; Anita confirms. | | ₹500 |
| 7.2 | Anita | Invite Priya. | Joining **doesn't close the month**: Cycle history still shows one month, and Priya gets a ₹500 contribution. | ₹500 |
| 7.3 | Anita | Tap **Set amounts**: Anita **2,000**, Priya **200** (Ravi stays 500). Save. | The contributions show ₹2,000 / ₹500 / ₹200. | |
| 7.4 | Anita, Priya | Anita marks hers paid (confirmed at once). Priya pays; Anita confirms. | | ₹2,700 |
| 7.5 | Anita | Add a pool expense "Chess boards", ₹900. | | ₹1,800 |
| 7.6 | Anita | Tap **Close <month>**, check the preview, and confirm. | Collected **₹2,700**, Spent **−₹900**, Left over **₹1,800**. A new month opens with **₹1,800 carried** (a Treasury always keeps its surplus) and **the same tiers: ₹2,000 / ₹500 / ₹200**, all *Not paid*. | ₹1,800 |

Leave "Chess club" open: a treasury runs on with no end date. Delete it when you're done, if you like.

### B. Collection: nothing is spent until the target is reached

| # | Who | Do | Expect | Balance |
|---|---|---|---|---|
| 7.7 | Anita | Create "Office gift": **Collection**, target **3,000**, "Each person puts in" **1,000**. Invite Ravi and Priya. Anita marks hers paid. | | ₹1,000 |
| 7.8 | Anita | Add a pool expense "Gift", ₹500. | Refused: *The collection hasn't reached its target yet (₹2,000.00 still to collect).* Don't press *record it anyway*. | ₹1,000 |
| 7.9 | Ravi, Priya | Both pay; Anita confirms. | Funded. | ₹3,000 |
| 7.10 | Anita | Add "Gift", ₹2,400. Then add "Card", ₹700. | The gift is saved. The card is refused: *Not enough money in the pool. Add at least ₹100.00 first.* A collection can't go below zero. Don't record it anyway. | ₹600 |
| 7.11 | Anita | Tap **Settle up**. | Left over **₹600**. Ravi **gets back ₹200**, Priya **gets back ₹200**, you **pay ₹400**: the ₹600 is refunded in proportion to what each person put in. | |
| 7.12 | Everyone | Settle up, approve, pay, confirm. | **Settled**. | |

### C. Hybrid: pool money and a split dinner in one settle-up

| # | Who | Do | Expect | Balance |
|---|---|---|---|---|
| 7.13 | Anita | Create "Weekend trip": **Kitty**, "Each person puts in" **1,000**. Open **Advanced** and tick **Also allow regular split expenses**. Invite Ravi and Priya. Everyone pays in; Anita confirms. | | ₹3,000 |
| 7.14 | Anita | Add a pool expense "Fuel", ₹1,500. | | ₹1,500 |
| 7.15 | Ravi | **Add expense**: Paid with offers a third option, **My money — split it**. Choose it: "Dinner", ₹900, split equally between all three. | The classic split form. The pool balance doesn't change. | ₹1,500 |
| 7.16 | Anita | Tap **Settle up**. | The preview shows the **pool's part**: Ravi gets back ₹500, Priya gets back ₹500, you pay ₹1,000. | |
| 7.17 | Anita | Tap **Settle up**. | Review has **one plan covering both**: **Anita → Ravi ₹1,100** and **Anita → Priya ₹200**. | |
| 7.18 | Everyone | Approve, pay, confirm. | **Settled**. | |

**Why these numbers (7.17):** from the pool, each person paid ₹1,000 and their share of the ₹1,500 fuel is
₹500, so each is owed ₹500. Anita holds the ₹1,500 cash, so she pays out ₹1,000. From the dinner, Ravi
paid ₹900 and each share is ₹300: Ravi is owed ₹600; Anita and Priya owe ₹300 each. Together: Ravi
+₹1,100, Priya +₹200, Anita −₹1,300.

---

## Release-day checks (production)

These local builds always offer "Several of us". Only production shows that this release really turns it
on. Run these right after release, in this order: the API is deployed first, then the web, then the new
app builds. Use real accounts; a sandbox purchase or the trial (plan §10A.5) gives Pro.

| # | Where | Do | Expect |
|---|---|---|---|
| R1 | Live web app, free account | Create event → **Pool money**. | **Several of us** is shown locked (PRO, *🔒 Pro feature*). The Pro page lists **Group pools**. |
| R2 | New TestFlight / Play internal-testing build, free account | The same, plus the upgrade screen and Profile. | Locked card; the upgrade screen lists **Group pools**; Profile reads *Unlimited events, group pools, multi-currency & more*. |
| R3 | A Pro account, or one on the trial | Create a **Kitty**; invite a free account, which pays in and spends. | Works. |
| R4 | The 1.0.40 App Store app, still installed | Open an event, add an expense, settle up. | Works against the new API. 1.0.40 still hides "Several of us": it predates this switch. |

---

## Other changes on this branch

| # | Where | Do | Expect |
|---|---|---|---|
| X1 | Web | As a brand-new account, open the Dashboard so the guided tour starts. In the browser console, run `window.dispatchEvent(new CustomEvent('traxettle:webAuthUnauthorized'))`. | *Session locked* appears **on top of** the tour card, and **Log out** works. (Before this branch, the tour card covered it.) |
| X2 | Web and mobile | Profile → upgrade row, Pro page, Help. | Covered in Scenario 4: group pools appear in every Pro list on local and staging builds. |

**Checked only by automated tests** (no screen for them, or they can't be set up by hand):
- changing the custodian while spenders hold money is refused (no screen changes the custodian);
- a member leaving a monthly Fund while holding money gets it into their leaving settlement;
- adding a group pool to an existing split-expenses event needs Pro (API only);
- subscription states such as the store's grace period and billing retry;
- an older app trying to pay a folded row is refused.

---

## Mobile pass

Start mobile as in §0 step 5. Repeat in the app: **Scenario 1, sections A to F**; **Scenario 4, steps
4.1–4.4**; **Scenario 5, step 5.9**; and **Scenario 6, steps 6.1–6.8**. The pool lives on the **Pool screen**: tap the pool card on
the event screen.

| Where | Mobile shows |
|---|---|
| Holdings line (custodian) | *With you ₹30,000.00 · With spenders ₹20,000.00*, and *… · ₹20,000.00 waiting to be confirmed* while an advance waits (web says *handed over, waiting…*) |
| Custodian's buttons | **Give money** and **Money returned** (web: *Record money returned*) |
| Spender's button | **Return money** |
| Give / return / pay back | One sheet for all three, with amount, note and optional proof |
| Lender line | *Ravi lent the budget money: ₹10,000.00 still to pay back.* with **Pay back now** |
| Settle-up sheet | The figures on one line (*Collected ₹60,000.00 · spent from the pool ₹15,000.00*, plus *carried in* or *paid back early* when there are any), then *Left over …* in bold. *Ravi: gets back ₹6,400.00*, with the breakdown under it. Then **Included in the final settlement**: *Ravi → You: ₹600.00 · Repayment (spend not approved) · Band* |
| A hand-over still waiting at settle-up | *1 hand-over is waiting for confirmation…*, and the button is disabled |
| Netted rows in Review and Settlements | Greyed out, labelled *included in the payments above*, and left out of the counter |
| Create event, free user | "Several of us" locked (greyed, dashed, **PRO**, *🔒 Pro feature*); tapping it shows the notice with **Upgrade to Pro** and doesn't select it |
| Rejecting a spend | An alert with the same warning text as web, Cancel / Reject, and **no reason field** |
| Spending beyond what you hold | *The budget owes you ₹1,000.00 for spends beyond the money you held.* |
| Edit expense, a spender's pool spend | **Paid with** can switch between *money I'm holding* and *Anita's card or UPI* |
| Settle-up figures in a Fund's second month | *Carried in ₹7,000.00 · collected ₹10,000.00 · spent from the pool ₹0.00*, then **Left over ₹17,000.00** |
| Pro lists | The upgrade screen lists **Group pools** after Multi-Currency Settlement; Profile reads *Unlimited events, group pools, multi-currency & more*; Help has a **Pool Money** card |

---

## Watch list

Behaviours the current build is expected to show. They aren't failures, but decide whether you want each
one changed before release.

1. **Cash swapped between spenders without a record.** The pool total stays right, but each spender's
   close-out isn't: one is asked to return money they no longer hold, and the other is paid for spending
   beyond what they held. They settle the difference between themselves (design doc §9.3, decisions).
2. **Notifications don't show the netting breakdown** (decision D11). Ravi was told "you owe ₹600" when
   Band was rejected. The ₹6,400 payment's notification doesn't mention the ₹600; the preview and the
   Review list do.
3. **Older installed apps show a netted row as "To pay".** Tapping pay is refused (*This payment is
   included in the final settlement*). Updating the app fixes the label.
4. **A close that only has a repayment open now goes to Review.** Everyone has to approve, so one person
   who never approves blocks it (Scenario 2, step 4.7). That was accepted in design doc §11.5.
5. **The free trial can't be tested yet.** It needs the store offers, which are created only after the
   Phase 2 build is live. Use the release-day checks in [plan §10A.5](../utility/MONEY_POOLING_PHASE2_PLAN.md).

---

## Sign-off checklist

| ✓ | Requirement | Where it's tested |
|---|---|---|
| ☐ | Only the custodian gives money, only to spenders, and only up to what they hold | S1 A2, A7 |
| ☐ | An advance counts only once the spender confirms; *Not received* never counts | S1 A3–A5, A8 |
| ☐ | Advances and returns never change the balance; *With you + With spenders* = balance | S1 A6, B4, D4–D5 |
| ☐ | Spenders see *money I'm holding* and the custodian's card, and the card can be switched off | S1 B1, C1–C4 |
| ☐ | An approved spend from held money lowers what they hold | S1 B4 |
| ☐ | A rejected spend from held money stays held (no repayment); a rejected card spend creates one | S1 B6, B8 |
| ☐ | Returns: the spender's need confirming, the custodian's are confirmed at once | S1 D2, D4–D5 |
| ☐ | Settle-up waits for hand-overs to be confirmed | S1 D3 |
| ☐ | A lender who holds money is paid *lent − held* | S1 F1 |
| ☐ | Unpaid repayments and claims are folded into the final payments, and the preview explains the figure | S1 F1 · S2 I1, 3.7, 4.6 |
| ☐ | Folded rows show as *included in the payments above*, aren't counted, and the event settles once the plan is paid | S1 F2–F4 · S2 I2–I4 |
| ☐ | Payments can go between members, not only through the custodian | S2 3.8 |
| ☐ | Paying back early: the amount is filled in, the pause warnings are right, and it's allowed while paused | S3 3.2, 3.6 |
| ☐ | Paying back early lowers the overdraft limit, and spending resumes only once the balance is above it | S3 3.5, 3.9–3.10 |
| ☐ | The settle-up figures show money paid back early (and carried in) and add up | S3 3.11 · S5 5.8 |
| ☐ | A free user sees PRO on "Several of us" and is refused; "Just me" and split events stay free | S4 4.1–4.5 |
| ☐ | The refusal names group pools, not multi-currency | S4 4.3 |
| ☐ | Pro lists show Group pools on local and staging builds | S4 4.4 · mobile note |
| ☐ | A Pro user can create one, and free members take part fully | S4 4.6–4.7 |
| ☐ | A lapsed creator's pool keeps working: spends, cycle close, settle up | S5 |
| ☐ | A waiting hand-over can be cancelled; proof attached to one opens from its row | S1 A5 · S6 6.1–6.2 |
| ☐ | Someone holding pool money, or owed by the pool, can't be removed | S6 6.3, 6.5 |
| ☐ | Spending beyond what you hold means the pool owes you the difference | S6 6.4 |
| ☐ | Changing how a spend was paid sends it back for approval and moves the money back | S6 6.6–6.7 |
| ☐ | Paying back more than is owed is refused | S6 6.10 |
| ☐ | Unpaid claims are folded in; a repayment already being paid stays separate and keeps the event in Payment | S6 6.14–6.21 |
| ☐ | Settlement Details doesn't count folded rows | S6 6.16 |
| ☐ | Forgiving a folded spend during Review asks to regenerate, and the plan changes | S6 6.17–6.18 |
| ☐ | Held money carries into a Fund's next month and is settled at the end | S5 5.3, 5.6, 5.9 |
| ☐ | A Treasury keeps tiered dues and its surplus month to month, and someone joining doesn't close the month | S7 7.1–7.6 |
| ☐ | A Collection refuses spending until the target is reached, then only up to what's left, and refunds the rest | S7 7.7–7.12 |
| ☐ | A hybrid event settles pool money and split expenses in one plan | S7 7.13–7.18 |
| ☐ | Production offers "Several of us" locked to free users and open to Pro (release day) | R1–R3 |
| ☐ | The 1.0.40 app keeps working against the new API (release day) | R4 |
| ☐ | The session lock sits above the guided tour | X1 |
| ☐ | The mobile app matches the web app | Mobile pass |
