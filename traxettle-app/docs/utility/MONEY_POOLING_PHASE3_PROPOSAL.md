# Money Pooling — Phase 3 Proposal: spenders, approvers and spends in another currency

**Status:** Proposal for review, written 2026-11-24. Not scheduled: it would follow the Phase 2 release and the Expo SDK upgrade.
**Builds on:** [MONEY_POOLING_DESIGN.md](MONEY_POOLING_DESIGN.md) §9 (spenders and approvals) and §12 (Pro), and the Phase 2 work in [MONEY_POOLING_PHASE2_PLAN.md](MONEY_POOLING_PHASE2_PLAN.md).

Paths below are relative to `traxettle-rush/` unless they start with `traxettle-app/`.

---

## 0. Why

The use case: Person A plans a trip for 25 people. Everyone contributes, and A plus two others book and pay for
things. In a "Several of us" pool today:

- **Everyone can spend.** In a Kitty, Fund, Treasury or Collection, any participant can record a pool spend
  (`canDraw` in `apps/api/src/services/pool.service.ts` lets anyone in a `contributors` pool spend). The
  **Can spend** list only exists in a Budget ("Just me").
- **Approving means being an admin.** The only way to let the two co-organisers approve spends is to make them event
  admins (the invite form's Role, or **Promote**). Admin also lets them settle up the whole trip, close the month,
  change pool settings and amounts, excuse dues, and promote or demote others.
- **One currency.** Pool spends must be in the trip's currency, so a cost paid in another currency (a visa fee in
  rupees for a trip in yen) has to be converted by hand.

---

## 1. Scope

| # | Feature | Summary |
|---|---|---|
| A | **Spender list in "Several of us" pools** | The organiser can choose **Only people I choose** instead of everyone. Others can still claim back money they spent, with approval. |
| B | **Approver permission** | A per-person **Can approve** switch in any pool. Approvers approve or reject other people's spends and claims, and nothing else. |
| C | **Pool spends in another currency** | A spender may enter a pool spend or claim in another currency. The app converts it to the trip currency using the rates multi-currency settlement already uses, and keeps both amounts. |
| D | **Split expenses in another currency** (an existing gap) | The same conversion for ordinary split expenses, which today are added up as if they were in the event currency (§6). |

**Not in Phase 3:**
- Approvers confirming money received or handing out money. Those stay with the custodian, who holds the money.
- More than one custodian.
- Historical exchange rates (see §5, *Limits*).

---

## 2. Decisions to confirm

Each has a recommendation.

| # | Question | Recommendation | Alternative |
|---|---|---|---|
| D1 | Default for the spender list | **Everyone can spend**, as today. Existing pools are unchanged; the organiser opts in. | Default to the list for Collections. |
| D2 | Can people not on the list still claim back money they spent? | **Yes.** Their claims always wait for approval, whatever the approval setting. People do end up paying for things. | No: they can only add split expenses (hybrid events). |
| D3 | Per-person spending limits in "Several of us" pools | **Yes**, the same control the Budget has (`spenderCapsMinor`). | Leave limits to Budgets. |
| D4 | Is the approver a third event role or a pool permission? | **A pool permission** ("Can approve"), next to "Can spend". Event roles stay admin and member. Only pools have approvals, so the invite flow and non-pool events don't change. | An "Approver" role in the invite form. |
| D5 | Do an approver's own spends need approval? | **Yes, from someone else**, as with admins today. Nobody approves their own spend. | Approvers' own spends are approved automatically. |
| D6 | Do approvers also decide claims (reimbursements)? | **Yes**, both spends and claims. | Spends only. |
| D7 | Which rate converts a spend in another currency? | **The same as multi-currency settlement:** the event's predefined rate if it has one, otherwise today's rate (`FxRateService.getRate`: open.er-api.com, cached daily in Firestore). | Today's rate only. |
| D8 | A rate typed by the spender ("what my bank charged")? | **Not in v1.** They can enter the trip-currency amount directly, as today. | A manual rate, marked for the approver to check. |
| D9 | Who gets spends in another currency? | **The same Pro capability as multi-currency settlement** (`multiCurrencySettlement`), from the event's creator. "Several of us" pools already need a Pro creator; a free user's Budget stays in one currency. | Free in every pool. |
| D10 | Split expenses in another currency (§6) | **Convert them the same way in Phase 3.** Before that, as a separate quick fix: stop web offering another currency for split expenses, as mobile already does. | Only the quick fix. |
| D11 | Editing the original amount of a converted spend | **Keep the stored rate.** Only a change of currency fetches a new rate. | Always fetch today's rate. |

---

## 3. A — Spender list in "Several of us" pools

**Today:** a Budget has `authorizedSpenders`, `authorizedSpenderGroups` and `spenderCapsMinor`, edited through the
**Can spend** list (web `components/pool/SpenderPermissions.tsx`; mobile's "Who can spend" card on `PoolScreen`).
In contributor pools, `canDraw` lets any participant spend.

**Change:**
- **Config:** a new `PoolConfig.spendersMode?: 'everyone' | 'listed'`. Absent means `everyone` in contributor pools. A Budget always uses its list, as today.
- **API:** when `spendersMode === 'listed'`, `canDraw` allows managers, listed people and members of listed groups.
  - Anyone else can file a `pool_reimbursement` claim, which is always pending (D2).
  - A pool spend from them is refused: *"Only the people the organiser chose can spend from the kitty. You can still claim back money you spent."*
- **Limits (D3):** `spenderCapsMinor` applies in contributor pools when the list is on. It's the same check and refusal as in a Budget.
- **"Paid with":**
  - People not on the list see only **My money — claim it back**, plus ordinary split expenses in a hybrid event.
  - `paidWithOptions` gains a `canSpendFromPool` input.
- **Give money** offers only listed spenders. The web and mobile `spenderIds` already filter like this for Budgets.
- **Taking someone off the list** is refused while they hold pool money or a hand-over is waiting. It's the same rule as leaving the event or changing the custodian. They return the money first.
- **Turning the list on later:** spends already waiting can still be approved or rejected; only new ones are checked.
- **UI:**
  - Create event → Several of us → **Advanced**: *Who can spend: Everyone in the event / Only people I choose*.
  - The people themselves are chosen after inviting, in the same **Can spend** list (with limits) that Budgets use, shown on the Pool tab.
- **Groups:** a whole family can be listed through `authorizedSpenderGroups`.

---

## 4. B — Approver permission

**Today:**
- "Managers" are the custodian, the creator and event admins (`isManager`).
- `approveDraw` and `rejectDraw` call `requireManager`.
- `canApproveDraw(approver, payer, custodian, isManager)` stops anyone approving their own spend.

**Change:**
- **Config:** a new `PoolConfig.approverUserIds?: string[]`. It works in every pool type, including Budgets, where a co-sponsor might approve.
- **API:**
  - A new `canApprove(event, config, uid)` = `isManager || approverUserIds.includes(uid)`.
  - `approveDraw` and `rejectDraw` check it instead of `requireManager`.
  - `canApproveDraw` is unchanged, so nobody approves their own spend.
  - Because an approver isn't a manager, their own spends wait for approval when approvals are on (D5). That follows from the existing `needsApproval` logic with no special case.
- **What an approver can't do:**
  - settle up or close a month;
  - change settings, amounts or dues, or excuse dues;
  - change roles;
  - confirm money received or hand out money.
- **UI:**
  - A **Can approve** switch next to **Can spend** in the pool's people list; event admins and the creator set it.
  - Approvers see **Waiting for your approval**: the web and mobile `approvableDraws` pass `isManager || isApprover` to `canApproveDraw`.
  - If approvals are off, the list shows *"Spends don't need approval in this kitty. Turn approval on to use approvers."*
- **Leaving:** someone who leaves the event is dropped from `approverUserIds`.
- **Optional:** a push notification, *"Waiting for your approval"*, to the custodian and approvers. Today everyone gets the general *expense added* notification and nothing approval-specific.

---

## 5. C — Pool spends in another currency

**The flow:**
1. **Form:** on a pool spend or claim, the currency picker is enabled. Today it's disabled for pool spends. It defaults to the trip currency.
2. **Preview:** picking another currency shows *"≈ ¥10,450 at 1 INR = 2.09 JPY (today's rate)"*, with the rates attribution (`FxRatesAttribution`).
   - It comes from a new `GET /api/pools/event/:eventId/fx-preview?from=INR&amount=5000`, which uses the event's predefined rates first (D7).
   - No route exposes rates today: `FxRateService` is only used inside settlement.
3. **Submit:** the client sends the original amount and currency. The server works out the rate itself; it doesn't trust the client's.
   - It converts the amount and rounds to the trip currency's minor unit (`toMinor`; yen has none).
   - It stores `amount` and `currency` in the **trip currency**, plus `originalAmount`, `originalCurrency`, `fxRate`, `fxRateDate` and `fxRateSource` (`predefined` or `eod`).
4. **Every pool rule uses the converted amount:** the receipt and approval thresholds, limits, spending pauses and held money. Nothing else in the pool maths changes.
5. **Display:** lists, the approval row, the ledger and Activity show both amounts, for example *"¥10,450 (₹5,000)"*. Receipts are unchanged.
6. **Edits (D11):**
   - Changing the original amount converts at the stored rate; changing the currency fetches a new rate.
   - If the converted amount of an approved spend changes, it goes back for approval, as amount changes do today.
7. **No rate available** (the rates service is down and nothing is cached): the form says *"Couldn't get today's INR→JPY rate. Enter the amount in JPY, or try again later."*
8. **Older clients:** the existing *"Pool expenses must be in the pool currency"* refusal stays for any request without conversion allowed (D9).

**Limits:**
- The free rates service only gives today's rate, so a spend recorded days later is converted at the rate on the day it's recorded. A predefined rate on the event avoids this.
- The converted figure is notional: no money changed currency. This is fair for shared costs, and it's why a manual rate isn't in v1 (D8).

---

## 6. D — Split expenses in another currency (existing gap)

**Found 2026-11-24:**
- On web, the expense form's currency picker is enabled for split expenses (USD, EUR, GBP, INR, JPY) in any event.
- The API accepts any currency (`routes/expenses.ts`).
- `calculateEntityBalances` in `services/settlement.service.ts` adds `expense.amount` as if it were in the event currency. So $100 in a rupee event counts as ₹100.
- Mobile always uses the event currency, so it isn't affected.

**Proposal:** apply §5's conversion to split expenses too:
- store the original amount and the converted one;
- split the converted amount;
- use the same Pro capability (D9).

**Before that (D10):** a small separate fix. Web shows only the event currency for split expenses. Check production data for any existing expenses in another currency first, so they can be corrected or flagged.

---

## 7. Older app builds

- **New config fields:** older clients ignore them. The server enforces the spender list and approvers anyway.
  - A non-listed member on an old build who tries a pool spend gets the readable refusal.
  - An approver on an old build won't see the approval card until they update. Their approvals still work from a new build or web.
- **Converted spends:** older clients show the trip-currency amount, which is correct, and ignore the original-amount fields.
- **Pool currency:** older clients can't pick another currency for pool spends (the picker is disabled), so nothing changes for them.

---

## 8. Work packages

| WP | What | Size |
|---|---|---|
| 1 | **Shared:** config fields, `canSpendFromPool` / `canApprove` helpers, "Paid with" options, two-currency display helpers, tests | S |
| 2 | **API, A and B:** `canDraw`, approve/reject checks, the taking-off-the-list guard, limits in contributor pools, schemas, route tests | M |
| 3 | **API, C and D:** conversion on expense create and edit, the preview route, original-amount fields, balances for split expenses, tests | M |
| 4 | **Web:** create-event option; people list with **Can spend**, **Can approve** and limit; approval card; currency picker and preview; two-currency display | M |
| 5 | **Mobile:** the same as web | M |
| 6 | **Browser tests, hand-test plan and docs** (design doc §0, Functional.md, the user guide) | S |

**Tests to include:**
- **Spender list:** a non-listed member's spend is refused but their claim is accepted and pending; Give money offers only listed spenders.
- **Taking someone off the list:** refused while they hold money; a whole listed family can spend; limits apply.
- **Approvers:** an approver approves someone else's spend; can't approve their own; can't settle up, close a month or change settings; is dropped on leaving.
- **Another currency:** a ₹5,000 spend in a yen trip is stored as yen with the original amount; the predefined rate wins over today's rate.
- **Thresholds and edits:** receipt and approval thresholds use the converted amount; editing keeps the rate; changing currency fetches a new one; no rate gives the clear error.
- **Split expenses:** one in another currency is converted before balances are worked out.
