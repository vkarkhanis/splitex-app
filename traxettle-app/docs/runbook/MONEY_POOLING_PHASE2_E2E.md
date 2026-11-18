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

### Where to run

Run **the branch's own API on your Mac**, as in Phase 1. None of these options touch production.

| Option | Command (from `traxettle-rush/`) | Where the data goes |
|---|---|---|
| Web | `bash scripts/local-dev/04_real_web.sh staging` | Staging Firestore |
| Mobile | `bash scripts/local-dev/03_real_mobile.sh staging` | Staging Firestore |
| Fully offline | `sh scripts/local-dev/02_emulator_web.sh` | Firebase emulators on this Mac |

- **Don't open these test events in the TestFlight or App Store app.** Those apps use the deployed
  staging API, which doesn't know about hand-overs or netting.
- Rebuild the shared library after pulling the branch:
  `node common/scripts/install-run-rush.js build --to @traxettle/shared --to @traxettle/ui`
  (on Node 25 or later, put `RUSH_ALLOW_UNSUPPORTED_NODEJS=1` in front).

### Making someone Pro

"Several of us" pools need a Pro creator. On a local build, switch a test account without buying anything:

- **Web:** Profile → **Local Tier Switch** → **Pro** (or **Free**). `04_real_web.sh` turns this on.
- **Mobile:** Profile → **Internal Tier Switch**.

The switch changes the tier the server uses, the same one a real subscription sets.

### The people

| Name | Role | Plan |
|---|---|---|
| **Anita** | Creates every event and holds the money (custodian / sponsor) | **Pro** (except where Scenario 5 lapses it) |
| **Ravi** | A spender in the budgets and a member in the pools | Free |
| **Priya** | A guest in the budgets; tries to create a Kitty in Scenario 4 | Free, then Pro |

On web, use three browser profiles, or Chrome, Safari and Firefox (incognito windows share one session).

### Good to know

- A **Budget** needs a receipt on every pool expense and every claim. Keep a small image ready.
- Anita is Pro, so the free plan's 3-event limit doesn't apply to her. Ravi and Priya only join events,
  except in Scenario 4.
- All amounts are in INR. People appear as **You** on their own screen.
- **Balance** is what's left in the pool. Handing money over doesn't change it: it only moves the
  money between **With you** (the custodian) and **With spenders**.
- Adding a group pool to an existing split-expenses event has no button in the apps, only an API call.
  The automated tests check that it needs Pro.

### Automated suites first (about 3 minutes)

```bash
(cd libraries/shared && npm test) && (cd apps/api && npm test) && (cd apps/web && npm test) && (cd apps/mobile && npm test)
(cd apps/api && npx tsc --noEmit) && (cd apps/web && npx tsc --noEmit) && (cd apps/mobile && npx tsc --noEmit)
```

The Playwright suite is optional (see [MONEY_POOLING_TESTING.md §2](MONEY_POOLING_TESTING.md#2-automated-tests)).
`pool-phase2.spec.ts` runs Scenario 1, Scenario 3, and Phase 1's Scenarios 3 and 4 with netting in a
browser (data set up through the API). `tier-entitlements.spec.ts` covers the Pro refusal and the PRO badge.
What they don't cover: Scenario 2's Phase 1 Scenario 1 re-run, Scenarios 4 and 5, and the mobile pass.

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
| A1 | Anita | Open **Budget**. | Buttons **Give money** and **Record money returned**. | ₹50,000 |
| A2 | Anita | Tap **Give money**. | The sheet **Give money to a spender** lists only Ravi (Priya can't spend) and shows *Up to ₹50,000.00*. The hint starts *They confirm once they have it. Moving money between spenders? Record a return from one and an advance to the other…* | |
| A3 | Anita | Enter **20,000**, note "Cash for decor", attach a photo as proof (optional), tap **Give money**. | Toast **Money handed over**: *Waiting for them to confirm.* The card **Money handed over** lists *Advance · Waiting for Ravi to confirm*, You → Ravi ₹20,000, with **Cancel**. Under the meter: *With you ₹50,000.00 · With spenders ₹0.00 · ₹20,000.00 handed over, waiting to be confirmed*. | ₹50,000 |
| A4 | Ravi | Open **Budget**. | The same row reads *Waiting for you to confirm*, with **Confirm** and **Not received**. | |
| A5 | Ravi | Tap **Confirm**. | Toast *Recorded as received.* Ravi sees *You're holding ₹20,000.00 of the budget's money.* | ₹50,000 |
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
| 4.1 | Priya (free) | **Create event → Pool money**. | **Several of us** has a **PRO** badge. **Just me** doesn't. |
| 4.2 | Priya | Pick **Several of us**. | A notice: *Group pools are a Pro feature. Only you need Pro: everyone you invite joins free.* with **Learn how to get Pro** (web). Mobile shows **Upgrade to Pro**, which opens the upgrade screen. |
| 4.3 | Priya | Choose **Kitty**, fill in the form and submit. | Refused: *Group pools ("Several of us") are a Pro feature.* No event is created. |
| 4.4 | Priya | Follow **Learn how to get Pro**. | The Pro page lists **Unlimited events · Multi-currency settlement · Group pools · Analytics (coming soon) · More power-user features**. Help's Pro card shows the same, and its feature list has a pooling line. |
| 4.5 | Priya | Create a **Just me** budget, and a **Split expenses** event. | Both are created: they're free. |
| 4.6 | Priya | Switch to **Pro** (see "Making someone Pro"). Open create event again. | No PRO badge or notice. Create "Book club" as a **Kitty**, ₹1,000 each. It's created. |
| 4.7 | Ravi (free) | Join "Book club" and pay in; Priya confirms. Ravi adds a ₹300 pool expense. | All of it works on the free plan. |
| 4.8 | Priya | Settle up "Book club", approve, pay, confirm. Then delete or settle her other test events, and switch back to **Free**. | **Settled**. |

**Mobile:** the upgrade screen lists **Group pools** after Multi-Currency Settlement. Profile's upgrade
row reads *Unlimited events, group pools, multi-currency & more*. Help has a **Pool Money** card.

**Production builds** (TestFlight, App Store, the live web app) hide "Several of us" and leave group
pools out of every Pro list until `CONTRIBUTOR_POOLS_IN_PRODUCTION` is turned on. That's expected.

---

## Scenario 5: The creator's Pro lapses mid-month

| # | Who | Do | Expect | Balance |
|---|---|---|---|---|
| 5.1 | Anita (Pro) | Create "Flat 4B": **Several of us → Fund**, ₹5,000 per person per month. Invite Ravi. Both pay in; Anita confirms Ravi's. | | ₹10,000 |
| 5.2 | Ravi | Add a pool expense "Groceries", ₹2,000. | Saved. | ₹8,000 |
| 5.3 | Anita | Switch to **Free**. | | |
| 5.4 | Ravi | Add a pool expense "Electricity", ₹1,000. | Still works. | ₹7,000 |
| 5.5 | Anita | Tap **Close <month>** and confirm. | The cycle closes. A new month opens with ₹7,000 carried (₹3,500 each) and fresh dues of ₹5,000 each. | ₹7,000 |
| 5.6 | Anita, Ravi | Both pay the new month; Anita confirms Ravi's. | Works on the free plan. | ₹17,000 |
| 5.7 | Anita | Try to create a new **Kitty**. | **PRO** badge, and creating is refused. Only *new* group pools need Pro. | |
| 5.8 | Anita | Back in "Flat 4B", tap **Settle up**. | Carried in ₹7,000, Collected ₹10,000, Spent ₹0, Left over ₹17,000. Ravi **gets back ₹8,500.00**; you **pay ₹8,500.00** (you hold the cash; your own ₹8,500 stays with you). | |
| 5.9 | Everyone | Settle up, approve, pay, confirm. Then switch Anita back to **Pro**. | **Settled**. | |

---

## Mobile pass

Run `bash scripts/local-dev/03_real_mobile.sh staging`. Repeat **Scenario 1, sections A to E**, and
**Scenario 4, steps 4.1–4.3**, in the app. The pool lives on the **Pool screen**: tap the pool card on
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
| Create event, free user | **PRO** on "Several of us", and a notice with **Upgrade to Pro** |

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
| ☐ | The mobile app matches the web app | Mobile pass |
