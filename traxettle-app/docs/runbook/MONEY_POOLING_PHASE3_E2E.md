# Money Pooling — Phase 3 hand-test plan

A hand-test plan for the branch `feature/money-pooling-enhancements-phase3`. It covers only what this
branch changes; the automated regression suite covers the rest of the app
([REGRESSION_SUITE.md](REGRESSION_SUITE.md)).

What the branch changes:
- **Phase 3** ([proposal and as-built notes](../utility/MONEY_POOLING_PHASE3_PROPOSAL.md)):
  - **a spender list** in "Several of us" pools;
  - **approvers**;
  - **expenses entered in another currency,** converted to the event's currency, for pool spends and ordinary split expenses.
- **Bug fixes** (Scenario E): in the app, taps no longer stop working for about 3 seconds after a message
  (a "toast") appears, and toasts now show above an open sheet. The dashboard menu and date fields were
  also fixed for VoiceOver.
- **Phase 2 fixes** from its hand test, which this branch includes (Scenario F).

---

## 0. Before you start

### Is it safe?

Yes. It runs **this branch's API and web app on your Mac**, connected to the **staging** Firebase
project. Nothing is deployed.

- **Production and the store app (1.0.40) are untouched.** They use the production API and Firebase
  project, which these steps never touch.
- **The deployed staging API (Cloud Run) is untouched,** so TestFlight builds switched to Staging keep
  working as they do now.
- **What gets written:** test accounts' events, contributions and expenses, in staging Firestore. Phase 3
  adds a few optional fields (the spender list and approvers on a pool; the entered amount, currency and
  rate on an expense). The deployed staging API ignores them.
- **No database or native changes** since Phase 2: no new Firestore indexes or rules, and no new native
  modules. The app already built on your Mac works; the new code reaches it through Metro.
- **Don't open these test events in a TestFlight or App Store build switched to Staging.** Those builds use
  the deployed staging API, which runs older code.
- **Don't buy anything.** Pro is switched on test accounts with the tier switch.

### Steps on the Mac you test on

You need the same files as for Phases 1 and 2 (the staging service account and Firebase config files).
The bootstrap step at the start of each script lists anything missing.

1. **Get the branch**, from the repository root (the folder containing `traxettle-rush/`):

   ```bash
   git fetch origin
   git checkout feature/money-pooling-enhancements-phase3
   git pull
   ```

2. **Install and build**, from `traxettle-rush/`. On Node 25 or later, keep the
   `RUSH_ALLOW_UNSUPPORTED_NODEJS=1` prefix; on Node 24 it isn't needed.

   ```bash
   RUSH_ALLOW_UNSUPPORTED_NODEJS=1 node common/scripts/install-run-rush.js install
   RUSH_ALLOW_UNSUPPORTED_NODEJS=1 node common/scripts/install-run-rush.js build --to @traxettle/shared --to @traxettle/ui
   ```

   Run the build step again after every pull: the apps read the shared library's built `dist/`.

3. **Optional: the automated suite**, from `traxettle-rush/`. `quick` takes about a minute (type checks
   and every unit and API test); `full` adds the browser tests, about 5 more minutes, and needs Google
   Chrome. It prints a summary table.

   ```bash
   bash scripts/regression/run.sh quick
   ```

4. **Set the local-dev flags** to the free tier and mock payments. Every payment in this plan is
   recorded with *I've Paid* and *Confirm Receipt*, so no payment gateway is needed:

   ```bash
   bash scripts/local-dev/05_set-flags.sh --tier free --payments mock
   ```

   This rewrites `scripts/local-dev/.runtime.env`, which is in git, so git will show it as changed. Put it
   back afterwards with `git checkout -- scripts/local-dev/.runtime.env`.

5. **Start one API for everything: web, the iOS simulator and the Android emulator.**

   1. **Start the devices:** an iPhone in the Simulator app, and an emulator from Android Studio
      (Device Manager). Check that `adb devices` lists the emulator.
   2. **Terminal 1, the API and Metro** (from `traxettle-rush/`). Clear Metro's cache first, because the
      last Metro run on that Mac may have used a different API address:

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
      **That's expected:** the web app uses Terminal 1's API. Open http://localhost:3000 once the web app
      is ready.
   4. **Terminal 3, install and open the app** on the simulator and the emulator (from `traxettle-rush/`):

      ```bash
      bash scripts/local-dev/06_staging_mobile.sh ios --no-bundler
      ```

      ```bash
      bash scripts/local-dev/06_staging_mobile.sh android --no-bundler
      ```

      With `--no-bundler`, this only builds (if needed), installs and opens the app, which loads its code
      from Terminal 1's Metro. Add `--build` to force a fresh install, for example when the app was built
      for a different Firebase project.
   5. **Check all three use the branch's API.** Terminal 1 prints a request for each screen the apps load.
      Create event offers *Several of us*, and Profile shows the tier switch: **Local Tier Switch** on web,
      **Internal Tier Switch** in the app. The pool card on the Pool screen is titled **Who can spend and
      approve** (Phase 3).
   6. **Sign in: Anita on web, Ravi on the iOS simulator, Priya on the Android emulator.** One account can
      be signed in on several devices at once. For Anita's steps in the app, sign her into one of them.

   **Ctrl+C** in Terminals 1 and 2 stops everything. Keep Terminal 1 running while you test.

6. **When you're done:** switch the test accounts back to the plan they should keep, and restore
   `.runtime.env` (step 4). The test events can stay on staging, or you can delete them.

### The people

| Name | Role | Plan |
|---|---|---|
| **Anita** | Creates every event and holds the money | **Pro** (Local Tier Switch on web, Internal Tier Switch in the app) |
| **Ravi** | A spender and member | Free |
| **Priya** | A member, and the approver | Free |

Use the Phase 1 and 2 staging test accounts, with display names to match. On web, use separate browser
profiles (or Chrome, Safari and Firefox): incognito windows share one session.

### Good to know

- **The app talks to the live rates service.** Scenario C uses a fixed rate on the event, so its figures
  are exact. Where a step uses *today's* rate, check that the figures agree with each other rather than
  with a fixed number.
- **Mobile labels:** on mobile the card is **Who can spend and approve** on the Pool screen. The buttons are
  **Everyone / People I choose**, **Never / Always / Above…**, **Allow / Can spend ✓** and
  **Approver / Approver ✓**.
- **The debug app's warning bar.** A development build can show a dark bar at the bottom, *Open debugger to
  view warnings*. It covers whatever is under it: dismiss it with its **×** before tapping a button at the
  very bottom of the screen. Store builds never show it.
- **Already automated:** Scenario A's main path, Scenario C's dollar spend and Scenario D's split
  (`e2e/tests/pool-phase3.spec.ts`), every Phase 3 rule in the API tests, and the toast fix in
  `FeedbackContext.test.tsx`. The browser tests run on web only and set up some data through the API, so
  clicking through here, on web and mobile, still adds something.

---

## Scenario A: A trip kitty where only chosen people spend, with an approver

| # | Who | Do | Expect |
|---|---|---|---|
| A1 | Anita | Create "Goa trip": **Pool money → Several of us → Kitty**, ₹2,000 per person. Under **Advanced**, set **Who can spend** to **Only people I choose**. Invite Ravi and Priya. Everyone pays in; Anita confirms. | Balance ₹6,000. Below the kitty, the card **Who can spend and approve** shows *Who can spend: Only people I choose*, with a **Can spend** column (nobody ticked yet) and a **Can approve** column. |
| A2 | Priya | **Add expense**. | **Paid with** offers only **My money — claim it back** (plus *My money — split it* if split expenses are allowed). No *Anita's card or UPI*. |
| A3 | Anita | In the card: tick **Can spend** for Ravi, **Can approve** for Priya, and set **Spends need approval** to **Always**. Save. | Toast *Saved: Spending permissions updated.* |
| A4 | Ravi | **Add expense**: **Anita's card or UPI**, **already paid**, "Cab", ₹500. | It waits for approval (approval is now Always). In Expenses: *Paid from the pool by Ravi* with **Pool · pending**. |
| A5 | Priya | Open the kitty. | **Waiting for your approval** lists Cab. Priya approves it. Balance ₹5,500. |
| A6 | Priya | **Add expense**: **My money — claim it back**, "Snacks", ₹300. | *Claim submitted.* It waits for approval. |
| A7 | Priya | Open the kitty. | Snacks **isn't** in Priya's approval list: nobody approves their own. |
| A8 | Anita | Approve Snacks. | A reimbursement payment Anita → Priya ₹300 appears under Pool payments. |
| A9 | Anita | Change **Spends need approval** to **Never** and save. Then, as Priya, add another claim, "Water", ₹100. | It **still** waits for approval: someone not on the list always needs approval for a claim. |
| A10 | Anita | Tap **Give money**. | Only **Ravi** is offered (Priya isn't a spender). Give ₹1,000; Ravi confirms. |
| A11 | Anita | Untick **Can spend** for Ravi and save. | Refused: *Someone you're taking off the spender list still holds ₹1,000.00 of pool money. It needs to be returned first.* |
| A12 | Ravi | **Return money** ₹1,000; Anita confirms. Anita unticks Ravi again and saves. | Saved. Ravi's **Add expense** now offers only *claim it back*. |
| A13 | Priya | As an approver, try **Settle up**, and try changing the card's settings. | Priya has no **Settle up** button, and the card is read-only for her. Approvers only approve. |
| A14 | Anita | Settle up and finish the event as usual. | Settles normally. |

**On mobile** (Ravi and Priya), repeat A2, A4–A7 and A12. Also, as Anita in the app, toggle **Approver** for Priya and **Always**: the same toasts as web.

---

## Scenario B: Approvers in a Budget

| # | Who | Do | Expect |
|---|---|---|---|
| B1 | Anita | Create a Budget ("Just me"), ₹20,000. Invite Ravi and Priya. On **Spenders**, tick **Can spend** for Ravi, **Can approve** for Priya, and choose **Always**. Save. | The Spenders tab card has **Can spend**, **Limit** and **Can approve** columns. |
| B2 | Ravi | **Anita's card or UPI**, already paid, "Flowers", ₹1,000. | Waits for approval. |
| B3 | Priya | Open the Budget. | **Waiting for your approval** lists Flowers. Priya approves. Balance ₹19,000. |
| B4 | Priya | **Add expense**. | Priya can't spend (not ticked) and, in a Budget, can't claim either. **Paid with** shows *You can't add expenses to this budget. Ask the organiser to let you spend.* Approving doesn't make her a spender. |

---

## Scenario C: A pool spend entered in another currency

**Setup:** Anita creates "Tokyo trip" on **web**:
- event currency **INR**;
- **Settlement Currency** USD, with a predefined rate of **1 INR = 0.0125 USD**, which means 1 USD = 80 INR;
- **Pool money → Several of us → Kitty**, ₹10,000 per person.

Invite Ravi; both pay in. Balance ₹20,000.

| # | Who | Do | Expect |
|---|---|---|---|
| C1 | Ravi | **Add expense**: **Anita's card or UPI**, **already paid**, "Visa fee", amount **10**, then change **Currency** to **USD**. | Under the currency: *≈ ₹800.00 at 1 USD = 80 INR (the event's set rate). It's recorded in INR.* |
| C2 | Ravi | Save. | In Expenses the row shows **₹800.00** with **$10.00** under it. The kitty's balance drops by ₹800 (to ₹19,200). In Activity: *… · entered as $10.00*. |
| C3 | Ravi | Edit Visa fee: change 10 to **12** (still USD). | The preview says *≈ ₹960.00 at 1 USD = 80 INR*. Saved: ₹960.00, with $12.00 under it. |
| C4 | Ravi | Edit it again: change the currency to **INR** and the amount to **900**. | Saved as ₹900.00 with **no** second line: back in the event currency. |
| C5 | Ravi | **Add expense** in **EUR**, 10. | There's no EUR rate on the event, so it uses **today's** rate: *≈ ₹… at 1 EUR = … INR (today's rate)*, with the rates credit link. Save. The saved rupee amount matches the preview. |
| C6 | Anita | Switch Anita to **Free**. As Ravi, open **Add expense**. | The currency picker is locked to INR (on mobile, there are no currency chips). |
| C7 | Ravi | Edit the EUR expense from C5 and change only its amount. | Allowed: it keeps its saved rate, without needing Pro. The preview uses that rate. |
| C8 | Anita | Switch back to **Pro**. Create a kitty with **Spends need approval → Above an amount, ₹1,000** in a fresh event (no fixed rate). As Ravi, add **USD 10** and then **USD 20**. | The approval threshold is checked on the **rupee** amount: USD 10 (about ₹830–900) is approved straight away; USD 20 (over ₹1,000) waits. |

**On mobile** (Ravi), repeat C1–C4. The currency chips appear under **Amount**, with the same preview text.

---

## Scenario D: A split expense in another currency

| # | Who | Do | Expect |
|---|---|---|---|
| D1 | Anita (Pro) | Create a split-expenses event "Dinner club" in **INR**, settlement currency **USD**, rate **1 INR = 0.0125 USD**. Invite Ravi and Priya. | |
| D2 | Ravi | **Add expense**: "Dinner", **30**, currency **USD**, split equally among all three. | Preview *≈ ₹2,400.00 at 1 USD = 80 INR*. Saved: **₹2,400.00** with **$30.00** under it. |
| D3 | Anyone | Open **Balances**. | Ravi is owed ₹1,600 (₹800 from each of the other two), not 30 or 20 dollars counted as rupees. |
| D4 | Ravi | Edit Dinner: switch to **custom** split: Anita $10, Ravi $10, Priya $10. Save. | Each share is ₹800.00 and they add up to ₹2,400.00. Reopening the edit form shows the shares in **dollars** again. |
| D5 | Priya (free) | Create her own split event in INR and add an expense. | The currency picker is **locked** to INR. Before Phase 3, web allowed another currency here and added it up as rupees. |

---

## Scenario E: Bug fixes in the app (iOS and Android)

Before this branch, every message box that pops up at the top of the app (a *toast*: "Success",
"Approved", "Error"…) made the whole screen ignore taps for about 3 seconds. And on Android, a toast raised
inside an open sheet appeared behind it.

| # | Who | Do | Expect |
|---|---|---|---|
| E1 | Anyone, in the app | Profile → **Internal Tier Switch** → tap the other tier. **While** the *Success* toast is still showing, tap a **Theme** (e.g. Dark). | The theme changes at once, with the toast still on screen. Before the fix, nothing happened. |
| E2 | Anyone, in the app | Add an expense, or approve something, and tap the next button straight away while its toast shows. | The tap works. |
| E3 | A **free** account, in the app | Open an event you created → **Edit** → **Settlement Currency: ₹ INR** (or any other) → **Save**. | The error *Multi-currency settlement requires Pro* appears **on top of** the Edit sheet, not hidden behind it. **Cancel** still works. |
| E4 | Anyone, in the app | Watch a few toasts. | They look and sit as before, below the status bar, and go away after about 3 seconds. Several in a row stack. |
| E5 | Anyone, in the app | **Sign Out** (dashboard menu), **Settle Now** and **Close Event**. | Each confirmation dialog appears, and both its buttons work. |
| E6 | Anyone, in the app | Open the dashboard's avatar menu and use each item; tap outside it. | Every item opens its screen; tapping outside closes the menu. |
| E7 | Anyone, in the app | Create event: set a **Start Date** and an **End Date**. | The date picker opens and the chosen dates show in the fields. |
| E8 | **With VoiceOver** (iOS, optional) | On the dashboard menu and the date fields, swipe through. | Each item is read on its own. Before, each read as one merged element. |

Web isn't affected by E1–E5: the web app has its own messages. Its pages only got test ids, which change
nothing on screen.

---

## Scenario F: Phase 2 fixes to re-check

These came from Phase 2's hand test and are in this branch too. Use any Budget or Kitty from the scenarios
above, or Phase 2's.

| # | Was reported | Do | Expect |
|---|---|---|---|
| F1 | Phase 2 A5: no toast on mobile | In the app, confirm a hand-over or a payment with **Received**. | A toast: *Confirmed: Recorded as received.* |
| F2 | Phase 2 A5: proof not a link on mobile | In the app, on a payment or hand-over with proof attached, tap the proof. | It opens the image or file. |
| F3 | Phase 1 B2: asking first still needed a receipt | As a spender in a Budget, **Add expense** with **Anita's card or UPI** and **I'm asking before I spend**. | No receipt required. In Expenses the row reads ***Requested** from the pool by Ravi*, not *Paid…*, until it's approved. |
| F4 | Settle-up breakdown read the wrong way | Settle up a pool where someone owes a repayment and is also owed a claim. | The line under each payment reads the right way for the person paying, e.g. *₹10,000.00 to the budget, less ₹600.00 for Snacks (repayment)*: *plus* for what they also owe, *less* for what they're owed. |
| F5 | Scenario 5: a Fund's part-month showed no dues and no reason | In a Fund, add or remove a member mid-month. | The Pool screen says *The members changed mid-month, so the month was squared up. There are no dues for the rest of it: they start again next month.* A member who just joined sees *You joined mid-month: your dues start next month.* The organiser also sees a hint to use **Set amounts**. |

---

## Older app builds

Use an app built from the **Phase 2** branch, the build that will be in the stores when Phase 3's API goes live. The 1.0.40 store build has no pools.

| # | Check | Expect |
|---|---|---|
| O1 | On the Phase 2 build, open Scenario A's kitty as Priya and try a pool spend. | Refused with *Only the people the organiser chose can spend from the kitty. You can still claim back money you spent.* |
| O2 | The Phase 2 build opens Scenario C's kitty. | The Visa fee shows the rupee amount. The dollar line simply isn't shown. |

---

## Watch list

1. **Live rates.** Today's rate changes daily, and the free service has no history. A spend recorded later uses the rate on the day it's recorded. A fixed rate on the event avoids this.
2. **"Spenders can pay with my card or UPI"** says "my" even when an admin who isn't the custodian is looking. That wording predates Phase 3.
3. **Approvers on a Phase 2 build** can't see the approval card until they update. Their approvals work from web or the new build.

---

## Sign-off checklist

| ☐ | Area | Where |
|---|---|---|
| ☐ | Only chosen people can spend; others can only claim, always with approval | A2–A9 |
| ☐ | Give money offers only spenders; a holder can't be taken off the list | A10–A12 |
| ☐ | Approvers approve others' spends, never their own, and can't settle up or change settings | A5, A7, A13, B3 |
| ☐ | Approval can be changed after creation (Never / Above / Always) | A3, A9, B1 |
| ☐ | A pool spend in another currency: preview, saved rupee amount, entered amount shown | C1–C2 |
| ☐ | Edits keep the rate; a new currency gets a new one; back to INR clears it | C3–C5, C7 |
| ☐ | Another currency needs the organiser's Pro | C6, D5 |
| ☐ | Thresholds use the converted amount | C8 |
| ☐ | Split expenses convert, splits add up, balances are in the event currency | D2–D4 |
| ☐ | Mobile: permissions card, approvals, currency chips and preview | A, C on mobile |
| ☐ | Older builds behave | O1–O2 |
| ☐ | App: taps work while a toast shows | E1–E2 |
| ☐ | App: a toast raised in a sheet shows on top of it | E3 |
| ☐ | App: toasts, confirmation dialogs, dashboard menu and date fields as before | E4–E7 |
| ☐ | Phase 2 fixes hold | F1–F5 |
