# Money Pooling — Phase 1 end-to-end test scenarios

A hand-test plan for the branch `feature/money-pooling-enhancements-phase1`. Each scenario takes one event
from creation to **Settled** and checks the Phase 1 changes along the way:

- **§9.2 Rejected spends already paid with the pool's money.** Anyone except the custodian who picks
  *Pool funds* says whether the spend is **already paid** or **asking first**. If an already-paid spend
  is rejected, the spender owes it back. This shows up as a *Repayment* under Pool payments.
- **§10 Money added by others.** Money added by anyone except the custodian is a **loan**, paid back
  when the pool closes. The exception is money marked as a **gift**.

For the reasons behind these rules, see [MONEY_POOLING_DESIGN.md §9.2 and §10](../utility/MONEY_POOLING_DESIGN.md).
For setup and the older use-case checks, see [MONEY_POOLING_TESTING.md](MONEY_POOLING_TESTING.md).

---

## 0. Before you start

### Where to run

Run **the branch's own API on your Mac**. None of these options touch production.

| Option | Command (from `traxettle-rush/`) | Where the data goes |
|---|---|---|
| Web | `bash scripts/local-dev/04_real_web.sh staging` | Staging Firestore |
| Mobile | `bash scripts/local-dev/03_real_mobile.sh staging` | Staging Firestore |
| Fully offline | `sh scripts/local-dev/02_emulator_web.sh` | Firebase emulators on this Mac |

- `03` and `04` both start the API on port 3001, so run only one at a time.
- **Don't open these test events in the TestFlight or App Store app.** Those apps use the deployed
  staging API. It runs older code that doesn't know about repayments or gifts.
- After pulling the branch, rebuild the shared library, because the apps read its built `dist/`:

  ```bash
  node common/scripts/install-run-rush.js install
  node common/scripts/install-run-rush.js build --to @traxettle/shared --to @traxettle/ui
  ```

  On Node 25 or later, put `RUSH_ALLOW_UNSUPPORTED_NODEJS=1` in front of each command.

### The people

| Name | Role |
|---|---|
| **Anita** | Creates every event and holds the money (custodian / sponsor) |
| **Ravi** | A spender in the budgets and a member in the kitties |
| **Priya** | A guest in the budgets (not a spender) and a member in the kitties |

On web, use three browser profiles, or Chrome, Safari and Firefox. All incognito windows share one
session, so two incognito windows can't act as two different people.

### Good to know

- A **Budget** needs a receipt on every pool expense and every claim. Keep a small image ready.
- A free account can have at most 3 active or closed events. Each scenario ends with its event settled.
  Run them in order and finish each one before starting the next.
- All amounts are in INR. Names in this plan appear as **You** on the screen of the person they refer to.

### Automated suites first (about 2 minutes)

```bash
(cd libraries/shared && npm test) && (cd apps/api && npm test) && (cd apps/web && npm test) && (cd apps/mobile && npm test)
(cd apps/api && npx tsc --noEmit) && (cd apps/web && npx tsc --noEmit) && (cd apps/mobile && npx tsc --noEmit)
```

---

## Scenario 1: Wedding budget ("Just me"), from start to finish

This is the main scenario. It covers everything in §9.2 and §10 for a sponsor budget. It also covers
the existing reimbursement and final-settlement flows.

The **Balance** column shows the budget balance after each step, when it changes.

### Setup

| # | Who | Do | Expect | Balance |
|---|---|---|---|---|
| 1.1 | Anita | Create the event "Goa wedding". Under Funding, choose **Pool money → Just me**. Set the total budget to **50,000**. | The tabs are **Budget · Expenses · Spenders**. | ₹50,000 |
| 1.2 | Anita | Invite Ravi and Priya. On **Spenders**, tick **Can spend** for Ravi and set his limit to **20,000**. Leave Priya as a guest. Save. | | |

### A. The expense form

| # | Who | Do | Expect | Balance |
|---|---|---|---|---|
| A1 | Ravi | Tap **Add expense**. | Paid with lists **My money — claim it back · Suggested** first, already selected. There's no "already paid / asking" question. | |
| A2 | Ravi | Choose **Pool funds**. | Two choices appear, neither selected: *I've already paid with the budget's money* ("If it's not approved, you'll owe it back.") and *I'm asking before I spend* ("Spend only once it's approved."). | |
| A3 | Ravi | Enter "Flowers", ₹2,000 and a receipt. Submit without choosing either option. | Refused: *Say whether you've already paid with the budget's money or are asking first.* Nothing is saved. Leave the form. | |
| A4 | Anita | Add expense: **Pool funds**, "Venue deposit", ₹15,000, with a receipt. | No **Suggested** label and no already-paid question. The expense is saved and approved immediately. | ₹35,000 |

### B. Asking for approval

| # | Who | Do | Expect | Balance |
|---|---|---|---|---|
| B1 | Ravi | Add expense: Pool funds, **already paid**, "Decorations", ₹3,000, with a receipt. | Toast **Expense recorded**: *Waiting for approval. If it's not approved, you'll owe it back to the budget's holder.* | |
| B2 | Ravi | Add expense: Pool funds, **asking first**, "Band advance", ₹4,000, with a receipt. | Toast **Asked for approval**: *Spend the budget's money only once it's approved.* | |
| B3 | Ravi | Add expense: Pool funds, **already paid**, "Cake", ₹1,500, with a receipt. | The same toast as B1. | |
| B4 | Ravi | Add expense: **My money — claim it back**, "Taxi", ₹800, with a receipt. | Toast **Claim submitted**. | |
| B5 | Anita | Open the **Budget** tab. | "Waiting for your approval" lists Decorations as *Pool spend · already paid*, Band advance as *Pool spend · asking first*, Cake as *Pool spend · already paid* and Taxi as *Reimbursement*. The totals show *awaiting approval ₹9,300*, and the balance hasn't moved. | ₹35,000 |
| B6 | Anita | Approve Decorations, then Band advance. | *Deducted from the pool.* | ₹28,000 |
| B7 | Anita | Approve Taxi. | Pool payments shows *Anita → Ravi · Reimbursement · To pay ₹800*. Anita taps **Mark as paid** and Ravi taps **Confirm received**, so the row shows **Done**. The event stays **Active**. | ₹27,200 |

### C. Rejecting spends

| # | Who | Do | Expect | Balance |
|---|---|---|---|---|
| C1 | Anita | Tap **Reject** on Cake. | The dialog shows a warning: *Ravi says this was already paid with the budget's money. If you reject it, they owe ₹1,500 back to you.* | |
| C2 | Anita | Confirm the rejection. The reason is optional. | Pool payments shows *Ravi → Anita · Repayment (spend not approved) · To pay ₹1,500*. In Expenses, Cake has an **Owed back** badge. The Budget history shows Cake as *Rejected* and *Owed back*. | ₹27,200 |
| C3 | Ravi | Add expense: Pool funds, **asking first**, "Fireworks", ₹2,500, with a receipt. | *Asked for approval.* | |
| C4 | Anita | Reject Fireworks. | No warning appears and no payment is created. Fireworks shows only *Rejected*. | ₹27,200 |

### D. Ravi can't erase what he owes

| # | Who | Do | Expect |
|---|---|---|---|
| D1 | Ravi | Delete Cake. | Refused: *This spend was not approved, so it is owed back to the custodian. Only the custodian or an admin can delete it.* |
| D2 | Ravi | Delete Fireworks. | Allowed, because nothing is owed on it. |
| D3 | Ravi | Edit Cake and change the amount from ₹1,500 to **₹1,200**. | Cake goes back to *awaiting approval*, still marked *already paid*. The repayment row and the **Owed back** badge both disappear. |
| D4 | Anita | Reject Cake again. | The warning shows ₹1,200. A new repayment appears: *Ravi → Anita ₹1,200 · To pay*. |
| D5 | Ravi | Edit Cake and change only the title, to "Wedding cake". | The edit saves. Cake stays rejected, and the ₹1,200 repayment doesn't change. |

### E. Paying it back

| # | Who | Do | Expect |
|---|---|---|---|
| E1 | Ravi | In Pool payments, tap **Mark as paid** on the ₹1,200 repayment. | The row shows *Paid — awaiting confirmation*. Cake's badge changes to **Repayment sent**. |
| E2 | Ravi | Edit the amount on Cake. | Refused: *This repayment is already being paid and can no longer change.* |
| E3 | Anita | Delete Cake. | Refused with the same message. |
| E4 | Anita | Tap **Not received** on the repayment. | The row shows *Retry needed*. Cake goes back to **Owed back**, and Ravi can tap **Mark as paid** again. |
| E5 | Ravi, then Anita | Ravi taps **Mark as paid**, then Anita taps **Confirm received**. | The row shows **Done**. Cake shows **Repaid** in the expense list and in the Budget history. |

### F. Going over the spending limit

| # | Who | Do | Expect | Balance |
|---|---|---|---|---|
| F1 | Ravi | Add expense: Pool funds, **asking first**, "Catering", ₹15,000, with a receipt. | Refused: the spend is over Ravi's spending limit. The form also offers *It's already paid — record it anyway* (see [watch item 3](#watch-list)). Don't press it. | |
| F2 | Ravi | Switch to **I've already paid** and submit. | The spend is saved as pending and flagged **Over spending limit**. | |
| F3 | Anita | Approve Catering. | | ₹12,200 |

### G. Money added by others (§10)

| # | Who | Do | Expect | Balance |
|---|---|---|---|---|
| G1 | Ravi | In Budget, tap **Add money**. | The sheet offers **Anita pays it back when the budget closes** (selected) and **It's a gift — don't pay me back**. The hint says *Anita confirms once it arrives.* | |
| G2 | Ravi | Enter ₹10,000, keep the default and tap **Add**. | Toast: *Waiting for the custodian to confirm.* A new row shows **Ravi · Top-up · paid back at close · Awaiting confirmation**. | ₹12,200 |
| G3 | Priya | Tap **Add money**, enter ₹5,000 and choose **It's a gift**. | A new row shows **Priya · Gift · Awaiting confirmation**. | |
| G4 | Anita | Tap **Add money** and enter ₹2,000. | There's no loan-or-gift choice. The hint says *Money you hold is added straight away.* The row shows **Anita · Top-up**, already confirmed. No "pay back" line appears. | ₹14,200 |
| G5 | Anita | Tap **Finish & report**, then **Settle up** in the preview. | The preview opens, and its figures leave out the two unconfirmed amounts. Pressing **Settle up** is refused: *Confirm or reject the money people have added to the pool before closing it.* The event stays Active. See [watch item 1](#watch-list). | |
| G6 | Anita | Tap **Confirm** on Ravi's row. | The hint says *You'll pay this back to Ravi when the budget closes.* Confirm ₹10,000. | ₹24,200 |
| G7 | Anita | Tap **Confirm** on Priya's row. | The hint says *A gift from Priya: it isn't paid back.* Confirm ₹5,000. | ₹29,200 |
| G8 | Everyone | Look at the Budget summary. | Anita sees *You'll pay back ₹10,000 that others added, when the budget closes.* Ravi sees *₹10,000 to get back from Anita when the budget closes.* Priya sees *Lent by others: ₹10,000 (paid back at close).* | |

### H. Leave one repayment unpaid at the end

| # | Who | Do | Expect |
|---|---|---|---|
| H1 | Ravi | Add expense: Pool funds, **already paid**, "Snacks", ₹600, with a receipt. | |
| H2 | Anita | Reject Snacks. | A repayment appears: *Ravi → Anita ₹600 · To pay*. **Leave it unpaid.** |

### I. Finish and settle

| # | Who | Do | Expect |
|---|---|---|---|
| I1 | Anita | Tap **Finish & report**. | The preview shows Collected **₹67,000**, Spent from the pool **−₹37,800** and Left over **₹29,200**. Under "What happens next": **Ravi gets back ₹10,000** and **Anita pays ₹10,000**. Priya isn't listed. Below that, **Paid separately** lists *Ravi → You · Repayment (spend not approved)* **₹600**, with *These stay as they are and are paid on their own. They aren't combined with the amounts above.* |
| I2 | Anita | Tap **Settle up**. | The event moves to **Review**. The Pool payments list is gone (it only shows while the event is active); the Settlement Review lists every payment instead. Above the rows: *Pool payments (reimbursements and repayments) are paid on their own. They aren't combined with the other payments.* The rows are Anita → Ravi **₹10,000** with no label, plus the event's pool payments, each labelled: Taxi ₹800 *Reimbursement · already paid*, Cake ₹1,200 *Repayment (spend not approved) · already paid*, and Snacks ₹600 *Repayment (spend not approved) · paid on its own*. The ₹600 isn't netted against the ₹10,000; netting comes in Phase 2 (see [watch item 4](#watch-list)). |
| I3 | Everyone | Approve the settlement. | The event moves to **Payment**. The Settlements list shows **2/4** complete, because Taxi and Cake were paid earlier. |
| I4 | Anita, then Ravi | Anita taps **I've Paid** for ₹10,000, then Ravi taps **Confirm Receipt** (mobile: **Confirm**). | That payment is done (**3/4**), but the event **stays in Payment** because the ₹600 repayment is still open. |
| I5 | Ravi, then Anita | In the Settlements list, Ravi taps **I've Paid** on the ₹600 row (*Repayment (spend not approved), paid on its own*), then Anita taps **Confirm Receipt** (mobile: **Confirm**). | The event is **Settled**. The Budget shows the cycle as closed, and Cycle history has its reconciliation. Snacks shows **Repaid**. |

**Why these numbers (I1):**

- Spent = 15,000 + 3,000 + 4,000 + 15,000 + the 800 reimbursement = 37,800.
- Collected = Anita's 50,000 + her 2,000 + Ravi's 10,000 loan + Priya's 5,000 gift = 67,000.
- Left over = 67,000 − 37,800 = 29,200. Of that, Anita keeps 19,200 of her own money and pays Ravi
  back his 10,000. Priya's gift was spent.
- Snacks was rejected, so it isn't in Spent: Left over already assumes Ravi's ₹600 comes back. That's
  why it's a separate payment, and why netting it later (₹9,400 in one payment) counts nothing twice.
- To move the money only once today: Anita sends Ravi ₹9,400. Ravi confirms the ₹10,000 payment, and
  Anita taps **Mark as Paid** on the ₹600 repayment. Both rows end **Done**.

---

## Scenario 2: Trip kitty ("Several of us") with a loan and a gift

Production builds hide "Several of us". Local and staging builds show it.

### Setup

| # | Who | Do | Expect | Balance |
|---|---|---|---|---|
| 2.1 | Anita | Create the event "Coorg trip". Choose **Pool money → Several of us → Kitty** and set "Each person puts in" to **10,000**. Leave Advanced alone, so "Spends need approval" stays at Never. | | ₹0 |
| 2.2 | Anita | Invite Ravi and Priya. | Each of them gets a ₹10,000 contribution. | |
| 2.3 | All | Anita marks her contribution as paid, and it's confirmed immediately. Ravi and Priya mark theirs as paid, and Anita confirms both. | | ₹30,000 |

### A. Spending, with no approvals in this kitty

| # | Who | Do | Expect | Balance |
|---|---|---|---|---|
| A1 | Anita | Add expense: Pool funds, "Homestay", ₹18,000. A receipt is optional. | Anita isn't asked the already-paid question. The expense is saved. | ₹12,000 |
| A2 | Priya | Add expense: **Pool funds**. | No option is marked **Suggested** (only budgets do that). The already-paid/asking question **still appears** (see [watch item 2](#watch-list)). | |
| A3 | Priya | Choose **already paid** and save "Fuel" for ₹6,000. | The expense is approved straight away. Toast **Expense recorded**: *"Fuel" was paid from the kitty.* | ₹6,000 |

### B. Adding money

| # | Who | Do | Expect | Balance |
|---|---|---|---|---|
| B1 | Ravi | Tap **Add money**. | The options are **Paid back to me when the kitty settles up** (selected) and **It's a gift**. | |
| B2 | Ravi | Enter ₹3,000 and keep the default. | A new row shows *Ravi · Top-up · paid back at close*. | |
| B3 | Priya | Tap **Add money**, enter ₹6,000 and choose **gift**. | A new row shows *Priya · Gift*. | |
| B4 | Anita | Tap **Settle up**, then **Settle up** in the preview. | Refused: *Confirm or reject the money people have added…* | |
| B5 | Anita | Confirm both rows. | The hints say *You'll pay this back to Ravi when the kitty closes.* and *A gift from Priya: it isn't paid back.* | ₹15,000 |
| B6 | Everyone | Look at the kitty summary. | There's **no** "pay back / lent" line. That line only appears in budgets. | |

### C. Settle

| # | Who | Do | Expect |
|---|---|---|---|
| C1 | Anita | Tap **Settle up**. | The preview shows Collected **₹39,000**, Spent **−₹24,000** and Left over **₹15,000**. Under "What happens next": **Anita pays ₹11,000**, **Ravi gets back ₹7,000** and **Priya gets back ₹4,000**. |
| C2 | Everyone | Tap **Settle up**, approve the settlement, then make the payments. Anita taps **I've Paid** for Ravi's ₹7,000 and Priya's ₹4,000, and each of them taps **Confirm**. | The event goes from Review to Payment to **Settled**. |

**Why these numbers (C1):**

- Priya's ₹6,000 gift pays for part of the spending. Each person's share is (24,000 − 6,000) ÷ 3 = 6,000.
- Ravi put in 13,000 and gets 7,000 back, so his 3,000 loan comes back in full.
- Priya put in 16,000 and gets 4,000 back.
- Anita put in 10,000 and keeps 4,000 of the cash she holds.
- If Priya had kept the default (a loan), each share would be 8,000. Ravi would get 5,000 back and
  Priya 8,000.

---

## Scenario 3: Kitty with approvals (§9.2 in a "Several of us" pool)

### Setup

| # | Who | Do | Expect | Balance |
|---|---|---|---|---|
| 3.0 | Anita | Create the event "Office party". Choose **Kitty** and set "Each person puts in" to **2,000**. Under **Advanced**, set "Spends need approval" to **Above an amount** and enter **1,000**. Invite Ravi and Priya. Everyone pays in, and Anita confirms. | | ₹6,000 |

### Steps

| # | Who | Do | Expect | Balance |
|---|---|---|---|---|
| 3.1 | Ravi | Add expense: Pool funds, **asking first**, "Balloons", ₹600. | It's under ₹1,000, so it's approved immediately. Toast **Expense recorded**. | ₹5,400 |
| 3.2 | Ravi | Add expense: Pool funds, **already paid**, "DJ", ₹1,500. | It's over ₹1,000, so it waits for approval. The toast ends with *…you'll owe it back to the kitty's holder.* | |
| 3.3 | Priya | Add expense: Pool funds, **asking first**, "Cake", ₹1,200. | *Asked for approval.* | |
| 3.4 | Priya | Open the kitty. | Priya can't approve or reject either spend. Only Anita can. | |
| 3.5 | Anita | Approve Cake. | | ₹4,200 |
| 3.6 | Anita | Reject DJ. | The warning says *Ravi says this was already paid with the kitty's money. If you reject it, they owe ₹1,500 back to you.* A repayment appears: Ravi → Anita, ₹1,500, *To pay*. | ₹4,200 |
| 3.7 | Anita | Tap **Settle up**. | The preview shows Collected ₹6,000, Spent −₹1,800 and Left over ₹4,200. **Anita pays ₹2,800**, **Ravi gets back ₹1,400** and **Priya gets back ₹1,400**. The DJ spend isn't included. **Paid separately** lists *Ravi → You · Repayment (spend not approved)* **₹1,500**. |
| 3.8 | Everyone | Approve the settlement. Anita pays Ravi and Priya (**I've Paid**, then **Confirm Receipt**). | The Settlements list has three rows: the two payments and the ₹1,500 repayment, labelled *Repayment (spend not approved), paid on its own*. The event **stays in Payment** while the repayment is open. Netted, this would be two payments (Anita → Priya ₹1,300, Ravi → Priya ₹100), planned for Phase 2. |
| 3.9 | Ravi, then Anita | In the Settlements list, Ravi taps **I've Paid** on the ₹1,500 row, then Anita taps **Confirm Receipt**. | The event is **Settled**. |

---

## Scenario 4: Budget edge cases for repayments

### Setup

| # | Who | Do | Expect |
|---|---|---|---|
| 4.0 | Anita | Create a budget event "Stage lights" with ₹10,000. Make Ravi a spender with no limit. Priya is a guest. | |

### Steps

| # | Who | Do | Expect |
|---|---|---|---|
| 4.1 | Ravi | Add expense: Pool funds, **asking first**, "Generator", ₹30,000, with a receipt. | Refused, because it goes past the overdraft limit (the budget plus the 20% allowance). |
| 4.2 | Ravi | Submit the same spend as **I've already paid**. | It's saved as pending and flagged **Over limit**. Already-paid spends are never refused, only flagged. |
| 4.3 | Anita | Reject Generator. | The warning shows ₹30,000. A repayment appears: Ravi → Anita, ₹30,000. |
| 4.4 | Anita | Delete Generator. | Allowed: the custodian may delete it. The ₹30,000 repayment disappears. Anita can forgive the debt; Ravi couldn't erase it himself (Scenario 1, D1). |
| 4.5 | Ravi, then Anita | Ravi adds "Lunch" for ₹500: Pool funds, already paid, with a receipt. Anita rejects it. | A repayment appears: Ravi → Anita, ₹500, *To pay*. Leave it unpaid. |
| 4.6 | Anita | Tap **Finish & report**. | The preview shows Collected ₹10,000, Spent ₹0 and Left over ₹10,000, with *Nothing to pay out of the budget — ₹10,000 stays with the sponsor.* (mobile: *Nothing to pay out of the budget.*). **Paid separately** lists *Ravi → You · Repayment (spend not approved)* **₹500**. |
| 4.7 | Anita | Tap **Settle up**. | There's nothing to review. The event goes **straight to Payment**, not Settled, because the ₹500 repayment is still open. The Settlements list shows that one row, labelled *Repayment (spend not approved), paid on its own*. If the screen says *Settled*, reload the page. If it still says Settled, that's a bug (see [watch item 5](#watch-list)). |
| 4.8 | Ravi, then Anita | In the Settlements list, Ravi taps **I've Paid** on the ₹500 row, then Anita taps **Confirm Receipt**. | The event is **Settled**. |

---

## Scenario 5: Budget edge cases for added money

### Setup

| # | Who | Do | Expect |
|---|---|---|---|
| 5.0 | Anita | Create a budget event "Pooja" with ₹10,000. Make Ravi a spender. Priya is a guest. | |

### Steps

| # | Who | Do | Expect |
|---|---|---|---|
| 5.1 | Ravi | Tap **Add money**, enter ₹4,000 and keep the loan default. | The row shows *Awaiting confirmation*. |
| 5.2 | Anita | Tap **Confirm**, but change the amount to **₹3,000** (only ₹3,000 arrived). | Anita sees *You'll pay back ₹3,000 that others added…* and Ravi sees *₹3,000 to get back from Anita…*. A lender is paid back only what the custodian confirmed. |
| 5.3 | Ravi | Tap **Add money**, enter ₹2,000 and keep the loan default. | The row shows *Awaiting confirmation*. |
| 5.4 | Anita | Mark it as **not received**. | The row goes back to unpaid, and Ravi can mark it as paid again. The payback line still says ₹3,000. |
| 5.5 | Priya, then Anita | Priya adds ₹1,000 as a **gift**, and Anita confirms it. | The row shows *Priya · Gift*. The payback amount doesn't change. Priya sees *Lent by others: ₹3,000 (paid back at close).* |
| 5.6 | Anita | Tap **Finish & report**, then **Settle up**. | Allowed: the ₹2,000 marked as not received doesn't block closing. The preview shows Collected ₹14,000, Spent ₹0 and Left over ₹14,000. **Ravi gets back ₹3,000** and **Anita pays ₹3,000**. Priya's unspent gift stays with Anita. **Check:** the unpaid ₹2,000 must not appear as money Ravi owes. |
| 5.7 | Everyone | Approve the settlement. Anita pays Ravi ₹3,000, and Ravi confirms. | The event is **Settled**. |

---

## Scenario 6: Regression check that split-expenses events are unchanged

| # | Who | Do | Expect |
|---|---|---|---|
| 6.1 | Anita | Create the event "Dinner" with **Split expenses** (the default) and invite Ravi and Priya. | There's no pool tab and no "Paid with" control. |
| 6.2 | Ravi | Add a ₹3,000 expense split three ways. | It's the classic form, with no already-paid question. |
| 6.3 | Everyone | Settle up, approve, pay and confirm. | The event is **Settled**, the same as before Phase 1. |

---

## Mobile pass

Run `bash scripts/local-dev/03_real_mobile.sh staging`. Then repeat **Scenario 1, sections A to G** and
**Scenario 2, section B** in the app. To switch people, sign out and back in, or use a second simulator.
The pool lives on the **Pool screen**: tap the pool card on the event screen.

The steps are the same as on web. These are the places where the wording or controls differ:

| Where | Mobile shows |
|---|---|
| Paid with, for a budget spender | **My money — claim it back  · Suggested**, listed first |
| Submitting a pool spend with no timing chosen | Alert **One more thing**: *Have you already paid with the budget's money, or are you asking before you spend?* |
| Saving an already-paid spend | Alert **Recorded**: *Waiting for approval. If it's not approved, you'll owe it back to the budget's holder.* |
| Saving an asking-first spend | Alert **Asked for approval**: *Spend the budget's money only once it's approved.* |
| An approval row | *Pool spend · already paid · Ravi · 1 receipt(s)* or *Pool spend · asking first · …* |
| Rejecting an already-paid spend | Alert **Reject this spend?**: *Ravi says this was already paid with the budget's money. If you reject it, Ravi owes ₹1,500 back to you.* It offers Cancel / Reject, with **no reason field**. |
| Rejecting an asking-first spend | Happens immediately, with no prompt |
| A Pool payments row | *Repayment (spend not approved) · To pay*. The buttons are **Mark paid** for the payer, and **Received** / **Not received** for the recipient. A failed payment shows *To pay* again (web shows *Retry needed*). |
| Settle-up sheet with an open repayment | Under **Paid separately**: *Ravi → You: ₹600.00 · Repayment (spend not approved)*, then the same note as web |
| Pool payments in Settlement Review / Settlements | The same note above the rows, and a grey line under each pool payment: *Repayment (spend not approved) · paid on its own* in Review, *Repayment (spend not approved), paid on its own* in Settlements. The buttons are **I've Paid** and **Confirm** |
| Expense badges on the event screen | **Owed back**, then **Repayment sent**, then **Repaid** |
| Pool history row | *… · rejected · owed back* (lower case) |
| Add money sheet | ◉ *Anita pays it back when the budget closes* / ○ *It's a gift — don't pay me back*. The button is **Save**. In a kitty, the first option reads *Paid back to me when the kitty settles up*. |
| Contribution rows | *Ravi · top-up · paid back at close*, *Priya · gift* and *Anita · top-up* |
| Confirm sheet hints and payback summary lines | The same text as on web |
| A refusal for going over the limit | The alert offers *It's already paid — record it* |

---

## Watch list

These are behaviours the current build is expected to show. They aren't failures, but decide whether
you want each one changed before release.

1. **Unconfirmed money added by others isn't flagged until the last step.** The settle-up preview opens
   normally, and the refusal only appears when you press **Settle up**. Pending spends behave
   differently: they show a banner and disable the button. The preview could warn upfront in the same way.
2. **The already-paid question appears even when no approval is needed.** In a kitty set to approval
   "Never", a member who picks Pool funds is still asked "already paid / asking first", although the
   spend is approved either way. The app could ask only when an approval might be needed.
3. **"Record it anyway" contradicts an asking-first answer.** When a spender chose *asking first* and
   the spend is refused (over the limit), the form still offers *It's already paid — record it anyway*.
   That contradicts what they just said. You could hide the button for asking-first spends.
4. **Repayments and unpaid claims aren't netted.** They aren't offset against the final settlement. In
   Scenario 1, Anita pays Ravi ₹10,000 while Ravi pays Anita ₹600: two payments instead of one ₹9,400.
   The amounts are right; only the number of payments is higher. **Decided 2026-11-15:** netting is
   built with Phase 2, and is required before "Several of us" pools are released in production
   ([design doc §11](../utility/MONEY_POOLING_DESIGN.md)). Until then, the preview and the settlement
   lists label these payments as *paid on its own* (Scenario 1, I1 and I2). To move money once, use
   the workaround under "Why these numbers (I1)".
5. **The event can briefly show Settled while it's in Payment.** When Finish & report leaves only a
   repayment open, the API sends a real-time "settled" update even though the event goes to Payment.
   Check what the screen shows before and after a reload (Scenario 4, step 4.7).

---

## Sign-off checklist

| ✓ | Requirement | Where it's tested |
|---|---|---|
| ☐ | Budget spenders get *My money — claim it back* first, marked Suggested | S1 A1 · mobile pass |
| ☐ | Anyone except the custodian must say *already paid* or *asking first* | S1 A2–A3 · S2 A2 |
| ☐ | The custodian isn't asked, and their spend is approved immediately | S1 A4 · S2 A1 |
| ☐ | Approval rows label *already paid* and *asking first* | S1 B5 |
| ☐ | Rejecting an already-paid spend warns first, then creates a repayment | S1 C1–C2 · S3 3.6 |
| ☐ | Rejecting an asking-first spend creates no repayment | S1 C4 |
| ☐ | A spender can't delete an owed-back spend, but the custodian can | S1 D1 · S4 4.4 |
| ☐ | Changing the amount sends the spend back for approval and drops the repayment | S1 D3–D4 |
| ☐ | Editing other fields leaves the rejection and the repayment alone | S1 D5 |
| ☐ | A repayment locks once it's being paid, and *Not received* allows a retry | S1 E2–E5 |
| ☐ | Badges go from Owed back to Repayment sent to Repaid | S1 C2, E1, E5 |
| ☐ | Over a limit, asking first is refused and already paid is recorded and flagged | S1 F1–F2 · S4 4.1–4.2 |
| ☐ | Added money offers loan (default) or gift, and the custodian gets no choice | S1 G1–G4 · S2 B1 |
| ☐ | Closing is refused while added money awaits confirmation | S1 G5 · S2 B4 |
| ☐ | The confirm hints say who pays back what | S1 G6–G7 · S2 B5 |
| ☐ | The budget summary shows who gets what back | S1 G8 · S5 5.2 |
| ☐ | Loans are paid back at close and gifts aren't | S1 I1–I5 · S2 C1 · S5 5.6 |
| ☐ | In a kitty, a gift lowers everyone's share | S2 C1 |
| ☐ | An open repayment keeps the event in Payment | S1 I4 · S3 3.8 · S4 4.7 |
| ☐ | Open pool payments are listed as *Paid separately* in the preview and labelled in the settlement lists (not netted until Phase 2) | S1 I1–I2 · S3 3.7–3.8 · S4 4.6–4.7 |
| ☐ | A partial confirmation pays back only what was confirmed | S5 5.2 |
| ☐ | Added money marked not received isn't paid back and doesn't block closing | S5 5.4, 5.6 |
| ☐ | Split-expenses events are unchanged | S6 |
| ☐ | The mobile app matches the web app | Mobile pass |
