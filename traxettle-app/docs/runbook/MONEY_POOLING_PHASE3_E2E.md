# Money Pooling — Phase 3 hand-test plan

What Phase 3 adds ([proposal and as-built notes](../utility/MONEY_POOLING_PHASE3_PROPOSAL.md)):
- **A spender list** in "Several of us" pools.
- **Approvers.**
- **Expenses entered in another currency,** converted to the event's currency. This covers both pool spends and ordinary split expenses.

Branch: `feature/money-pooling-enhancements-phase3`.

---

## 0. Before you start

- **Setup:** exactly as in [Phase 2's plan, §0](MONEY_POOLING_PHASE2_E2E.md#0-before-you-start).
  - The same three devices and steps, with **Anita on web, Ravi on the iOS simulator, Priya on the Android emulator**.
  - Run `bash scripts/local-dev/05_set-flags.sh --tier free --payments mock` first.
  - After pulling, rebuild the shared library: `cd libraries/shared && npx tsc`.
- **Accounts:** Anita is **Pro**, using the Local Tier Switch on web or the Internal Tier Switch in the app. Ravi and Priya are **free**.
- **The app talks to the live rates service.** Scenario C uses a fixed rate on the event, so its figures are exact. Where a step uses *today's* rate, check that the figures agree with each other rather than with a fixed number.
- **Mobile labels:** on mobile the card is **Who can spend and approve** on the Pool screen. The buttons are **Everyone / People I choose**, **Never / Always / Above…**, **Allow / Can spend ✓** and **Approver / Approver ✓**.

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
