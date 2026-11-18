# Money Pooling — Phase 2 Implementation Plan (for review)

**Status:** **Approved 2026-11-16** with every recommendation in §1 (D1–D11). D12 is decided too: a 7-day free trial for new subscribers (§10A). Nothing is built yet.
**Branch:** `feature/money-pooling-enhancements-phase2`, created from `feature/money-pooling-enhancements-phase1` at `cf6d871`. Its PR targets the Phase 1 branch.
**Design:** [MONEY_POOLING_DESIGN.md](MONEY_POOLING_DESIGN.md) §9.3, §10.6, §11 and §12. Where this plan and the design doc differ, the difference is listed in §1, so you can accept or change it.

Paths below are relative to `traxettle-rush/` unless they start with `traxettle-app/`.

---

## 0. Scope

| # | Feature | Design doc | Summary |
|---|---|---|---|
| A | **Advances and returns** | §9.3 | The custodian hands pool money to spenders. The app tracks what each spender is holding. Spenders say how they paid ("money I'm holding", "the sponsor's card/UPI", "my money"). |
| B | **Paying back early** | §10.6 | The custodian pays a lender back before the pool closes. |
| C | **Netting at settle-up** | §11 | Unpaid repayments and claims of the cycle being settled are folded into the final plan instead of being paid on their own. |
| D | **"Several of us" is Pro** | §12 | Only the person creating a group pool needs Pro. Pro lists across the apps mention group pools, shown only when the release switch is on. |

**Not in Phase 2:**
- Turning on `CONTRIBUTOR_POOLS_IN_PRODUCTION`. That's a separate release step (§11 of this plan).
- Transfers between spenders, which were dropped on 2026-11-12. Lenders requesting early repayment in the app. More than one custodian.
- Store listings, RevenueCat text and review notes. They change in the release that turns the switch on (§11).

---

## 1. Decisions to confirm before building

Each row has a recommendation. Rows marked **deviation** differ from the design doc.

| # | Question | Recommendation | Alternative |
|---|---|---|---|
| D1 **deviation** | §9.3 says spends from held money and on the sponsor's card are "always already paid". Phase 1 lets spenders choose "already paid" or "asking first". What happens to "asking first"? | **Keep the Phase 1 timing choice under both pool-money options.** The method (held money or card) decides what happens on a rejected, already-paid spend: held money stays owed (no leg), and a card spend gets the Phase 1 repayment leg. Asking first, then rejected: nothing happens, as now. Without the method, an approved "asking first" spend paid with held cash would never reduce `held`, and the spender would be asked to return money they already spent. | Drop "asking first", as the design doc implies. That removes a Phase 1 feature. |
| D2 **deviation** | §9.3's custodian action "Ask for money back" sounds like a request with a notification. | **"Record money returned"**: the custodian records cash they've received from a spender, confirmed at once. Spenders also get **"Return money"**, which the custodian confirms. No request or notification flow. | Build "Ask for money back" as a request plus notification (more work; can come later). |
| D3 | Who confirms a hand-over? | **The receiver confirms.** If the receiver records it themselves, it's confirmed at once (like the custodian recording their own top-up). Advances and early repayments are recorded only by the custodian. The person who recorded it can cancel it while it's waiting. | — |
| D4 **deviation** | Proof on advances, returns and repayments. §9.3 sketches `proof?: Attachment[]`. | **One `proofUrl`**, the same as contributions, reusing the existing upload and preview UI. | A list of attachments (new UI on both apps). |
| D5 | Early repayment limit. | **Up to what the lender has lent and not yet been repaid:** their confirmed top-ups that aren't gifts, minus repayments confirmed or waiting. Overdraft cover isn't included (it's recorded only at close). | — |
| D6 | Does early repayment lower the overdraft baseline? | **Yes.** Repaid money is no longer funding, so the 20% tolerance shrinks with it, and so does the "funded" figure for collections. | No: keeps the tolerance, but it's then based on money no longer in the pool. |
| D7 | Someone holding pool money (or owed money from it) leaves the event. | **Blocked** with *"Return the pool money you're holding first"*. The exception is a recurring pool that closes the cycle on membership change: there, what they hold goes into their leaving settlement automatically. | Allow leaving and leave it to the people involved. |
| D8 | Changing the custodian while spenders hold money or hand-overs are unconfirmed. | **Blocked** until the money held is back with the custodian and nothing is waiting. | Allow it; the new custodian inherits the held money. |
| D9 | The Pro check and the `mock-` test users. | **No exception for mock users,** the same as multi-currency. The API tests make creators Pro through a helper, and `pool-smoke.mjs` switches its user to Pro first. | Skip the check for `mock-` users, as the 3-event limit does. Then the Pro tests need non-mock users. |
| D10 | `allowSponsorCardSpends` turned off, but an older app sends a pool spend without a method. | **Accept it** as a Phase 1-style spend. The switch hides the option in new apps and refuses an explicit `sponsor_card`. | Refuse it, which breaks older app builds for that pool. |
| D11 **deviation** | §11.5 says notifications should show the netting breakdown. | **No change to notification text.** The Review and Payment lists show which repayments and claims were included, and the preview shows the breakdown. | Add the breakdown to the push and email text (needs per-person text, as the greedy plan doesn't map folded rows to single payments). |
| D12 **decided** | Free trial (§12.3). | **A 7-day free trial for new subscribers**, switched on in the stores only after the Phase 2 build is live. Phase 2 adds an iOS eligibility check and an Android trial check (§10A). | No trial. |

---

## 2. Build order

The packages depend on each other in this order. Each one ends green on `tsc` and the tests.

1. **WP1** Shared types and maths (`libraries/shared`).
2. **WP2** API: advances, returns, early repayments.
3. **WP3** API: payment method on pool spends, and the card switch.
4. **WP4** API: netting at settle-up.
5. **WP5** API: Pro check.
6. **WP6** Web UI.
7. **WP7** Mobile UI.
8. **WP8** Pro feature lists and error text (web and mobile).
9. **WP9** Tests across packages: the new suites, plus updates to existing suites.
10. **WP10** Docs and the Phase 2 end-to-end test plan.
11. **WP11** Free trial: iOS eligibility check and Android trial check (mobile only). It doesn't depend on WP1–WP10, so it can be built at any point.

Suggested commits: one per package. WP9 tests go in with the package they cover.

---

## 3. WP1: shared types and maths

### 3.1 Types (`libraries/shared/src/pool.ts`)

```ts
export type PoolAdvanceKind = 'advance' | 'return' | 'repayment';
export type PoolAdvanceStatus = 'initiated' | 'confirmed' | 'rejected' | 'cancelled';

/** Money handed between the custodian and someone else (design doc §9.3, §10.6). */
export interface PoolAdvance {
  id: string;
  eventId: string;
  cycleId: string;
  kind: PoolAdvanceKind;
  fromUserId: string;          // advance/repayment: the custodian; return: the holder
  toUserId: string;            // advance: the spender; return: the custodian; repayment: the lender
  amountMinor: number;
  currency: string;
  status: PoolAdvanceStatus;
  note?: string | null;
  proofUrl?: string | null;
  rejectionReason?: string | null;
  createdBy: string;
  createdAt: string;
  confirmedAt?: string | null;
  updatedAt: string;
  auditTrail: PoolAuditEntry[];
}

export interface PoolHoldings {
  /** remaining − Σ held. */
  withCustodianMinor: number;
  /** Σ held over everyone but the custodian (can be negative). */
  withSpendersMinor: number;
  /** entity key → held. > 0 holds pool money · < 0 the pool owes them. Zeros omitted. */
  heldBy: Record<string, number>;
  /** Advances recorded but not yet confirmed: not available to hand out again. */
  pendingOutMinor: number;
}
```

Additions to existing types:

| Type | Field | Meaning |
|---|---|---|
| `PoolConfig` | `allowSponsorCardSpends?: boolean` | Absent ⇒ true. |
| `PoolDrawState` | `paidFrom?: 'advance' \| 'sponsor_card'` | Absent ⇒ Phase 1 behaviour. |
| `PoolCycle` | `openingHeld?: Record<string, number>` | What each person held at the start (carried from a carry-forward close). |
| `PoolCycleTotals` | `earlyRepaymentsMinor: number` | Confirmed early repayments; lowers the balance. |
| `PoolCycleSummary` | `holdings: PoolHoldings` | — |
| `PoolLedgerEntry` | `type` adds `'advance'`, plus `advanceKind?`, `fromUserId?`, `toUserId?`, `paidFrom?` | — |
| `PoolLedger` | `advances: PoolAdvance[]` | For the action buttons. |
| `PoolSpenderSummary` | `heldMinor: number` | — |
| `PoolEntityShare` | `repaidMinor?: number`, `heldMinor?: number` | — |
| `PoolReconciliation` | `earlyRepaymentsMinor?`, `heldBy?`, `nettedLegIds?: string[]` | Cycle history shows what was held and what was folded. |
| `PoolAuditAction` | `'cancelled'` | — |

In `libraries/shared/src/index.ts`:
- `Settlement.status` adds `'netted'`, and `Settlement` gains `nettedAt?: string | null` and `nettedPlanAt?: string | null`. The second is a pointer to the plan: the event's `lastSettlementGeneratedAt` when it was folded.
- `UserCapabilities` gains `contributorPools: boolean`.
- `CreateExpenseDto` and `UpdateExpenseDto` gain `paidFrom?: 'advance' | 'sponsor_card'`.

### 3.2 Maths (`libraries/shared/src/pool-math.ts`)

- **`computeCycleTotals(input)`:** new optional input `earlyRepaymentsMinor` (default 0), subtracted from `balanceMinor` and returned in the totals.
- **`computeOverdraftState`:** the `confirmed_funding` and `expected_funding` baselines subtract `totals.earlyRepaymentsMinor` (D6). `target_amount` is unchanged.
- **`computeFundingState`:** `fundedMinor` subtracts `totals.earlyRepaymentsMinor`.
- **New `computeHoldings(input)`:**
  ```ts
  computeHoldings({
    custodianEntityKey, openingHeld, balanceMinor,
    advances: Array<{ kind; status; fromKey; toKey; amountMinor }>,
    draws: Array<{ payerKey; amountMinor; status; fundingSource; paidFrom? }>,
  }): PoolHoldings
  ```
  For each key other than the custodian's:

  `held = openingHeld + confirmed advances to them − confirmed returns from them − approved pool spends they made with paidFrom 'advance'`

  Repayments don't change `held`. `pendingOutMinor` is the total of initiated advances. `withCustodianMinor = balanceMinor − Σ held`.
- **New `outstandingLoans(contributions, advances, custodianUserId)`:** per lender, `lentTopUps(...)`, minus confirmed and initiated repayments to them (D5).
- **New `earlyRepaymentImpact(overdraft, amountMinor)`:** returns `{ alreadyPaused, pauses, addToResumeMinor }`, using the same floor and clearance rules as `nextOverdraftLatch`. Both apps use it for the warning in §10.6.
- **`ReconcileInput`** gains:
  - `repayments?: Array<{ entityKey: string; amountMinor: number }>`, the confirmed early repayments;
  - `held?: Record<string, number>`, from `computeHoldings`.
- **`reconcileCycle`:**
  - `repaid[k]` reduces each person's position: `net = opening + contributed − gifted − repaid − fairShare + cover`, and `closing = opening + contributions − repaid − spend + cover`. **Σ net = closing still holds**, so the existing invariant check stays as it is.
  - The settle disposition adds the holdings, for each `k` with `held[k] ≠ 0`: `settlementBalances[k] −= held[k]` and `settlementBalances[custodian] += held[k]`. Σ stays 0. This one change produces §9.3's "one leg per spender from their final `held`", and §10.3's "`lent − held`", in both the final plan and settle-policy cycle closes.
  - It returns `earlyRepaymentsMinor` and `heldBy`, and fills `repaidMinor` / `heldMinor` on each share.
- **`splitForMembershipChange`:**
  - A leaver's `held` goes into `exitBalances` (leaver −held, custodian +held).
  - It returns a new `carryHeld` for everyone else.

### 3.3 UI helpers (`libraries/shared/src/pool-ui.ts`)

- **Payment-method options:** `paidWithOptions({ model, isCustodian, allowCardSpends, holdingMinor, hasAdvances })` returns the list both apps render:
  - **Custodian:** "Pool funds", as now.
  - **Anyone else:**
    - "Pool money I'm holding (₹x left)", only when they hold money or have received an advance this cycle;
    - "The sponsor's card/UPI", only while `allowCardSpends` (the label uses the custodian's name in "Several of us" pools);
    - "My money — claim it back";
    - plus "My money — split it" in hybrid events, as now.
- **Hand-over labels:** `ADVANCE_KIND_LABEL` (*Advance*, *Returned*, *Paid back early*) and `advanceStatusText(advance, viewerId)`, which gives *Waiting for {name} to confirm*, *Confirmed*, *Not received*, *Cancelled*.
- **Netted rows:**
  - `REPAYMENT_STATUS` and `REIMBURSEMENT_STATUS` gain `in_settlement` (*"In final settlement"*).
  - `repaymentStatus` and `reimbursementStatus` gain an optional `eventStatus` argument: `netted` gives `in_settlement` while the event is in Review or Payment, then *Repaid* / *Reimbursed* once it's Settled.
- **Notes:** `POOL_LEGS_NETTED_NOTE = "Repayments and unpaid claims are included in the payments above."`. `POOL_LEGS_PAID_SEPARATELY_NOTE` now applies only to pool payments that were already being paid at settle-up.
- **`openPoolSideLegs`** excludes `netted`.
- **Pro error text:** `proRequiredMessage(feature?: string)`. `'contributor_pools'` gives *"Group pools (\"Several of us\") are a Pro feature."*; `'multi_currency_settlement'` and the default give the current multi-currency text.
- **Pro list entry:** `GROUP_POOLS_PRO_FEATURE = { title: 'Group pools', desc: 'Pool money with your group: trip kitty, shared fund, club treasury or collection.' }`. The apps show it only when `contributorPoolsAvailable(appEnv)` is true (WP8).

---

## 4. WP2: API, advances, returns and early repayments

### 4.1 Storage

New collection `poolAdvances` (constant `ADVANCES` in `apps/api/src/services/pool.service.ts`).

The in-memory Firestore needs no change: it's queried with `where('cycleId', '==', …)`, like contributions.

### 4.2 Validation (`apps/api/src/validation/pool.schemas.ts`)

```ts
export const advanceCreateSchema = z.object({
  kind: z.enum(['advance', 'return', 'repayment']),
  userId: z.string().min(1).optional(),      // the other person; for a holder's own return, omitted
  amountMinor: positiveMinor,
  note: z.string().max(500).optional(),
  proofUrl: z.string().max(2000).optional(),
}).strict();
```

`reasonSchema` is reused for reject. `poolConfigPatchSchema` gains `allowSponsorCardSpends: z.boolean()`.

### 4.3 Service (`pool.service.ts`, new section "Advances, returns and early repayments")

**Methods:**

| Method | Rules |
|---|---|
| `listAdvances(cycleId)` | Sorted by `createdAt`. |
| `recordAdvance(eventId, actorId, input)` | Shared checks: the event is `active` (else 409 `POOL_EVENT_NOT_ACTIVE`), the current cycle is `open`, the amount is above zero. See the per-kind table below. |
| `confirmAdvance(id, actorId)` | Only `toUserId`; only from `initiated`. Sets `confirmedAt`; audit `confirmed`. Repayment: `refreshOverdraftLatch`. |
| `rejectAdvance(id, actorId, reason?)` | Only `toUserId`; only from `initiated` → `rejected` (final), with `rejectionReason` (default *"Not received"*). |
| `cancelAdvance(id, actorId)` | Only `createdBy`; only from `initiated` → `cancelled`. |

Confirm, reject and cancel all require the event `active` and the cycle `open`.

**What `recordAdvance` does for each kind:**

| Kind | Who records | Checks | Status |
|---|---|---|---|
| `advance` | Custodian only | `userId` is set, isn't the custodian, and passes `canDraw`. Refused while `overdraft.latched` or `balanceMinor ≤ 0` (409 `POOL_ADVANCE_NOT_AVAILABLE`). Refused if the amount is over `withCustodian − pendingOut` (409 `POOL_ADVANCE_EXCEEDS_CUSTODIAN`, data `{ availableMinor }`). | `initiated` |
| `return` | The holder (no `userId`) | Amount ≤ their `held` − their initiated returns (409 `POOL_RETURN_EXCEEDS_HELD`, data `{ heldMinor }`). | `initiated` |
| `return` | The custodian, with `userId` = the holder | Same held check. | `confirmed` (the receiver recorded it) |
| `repayment` | Custodian only, `userId` = the lender | Amount ≤ `outstandingLoans[userId]` (409 `POOL_REPAYMENT_EXCEEDS_LOAN`, data `{ outstandingMinor }`). Allowed while paused; the warning is in the UI (§10.6). | `initiated` |

**Changes to existing methods:**
- `buildSummary`:
  - loads `_advances`;
  - passes confirmed repayments to `computeCycleTotals`;
  - adds `holdings = computeHoldings(...)`, with keys from `entityForUser`.
- `getLedger`:
  - adds a ledger row per advance: `counted` only for confirmed repayments, and the amount is negative only for repayments;
  - adds `heldMinor` to each spender row and `advances` to the response.
- `reconcileInput`: passes `repayments` (confirmed repayments by lender entity) and `held` (`holdings.heldBy`).
- `closeCycle`:
  - new guard `assertNoUnconfirmedAdvances` (409 `POOL_UNCONFIRMED_MOVEMENTS`, data `{ count }`), next to `assertNoUnconfirmedTopUps`;
  - carry-forward without leavers: `openingHeld = result.heldBy`;
  - with leavers: `openingHeld = split.carryHeld`;
  - settle: `openingHeld = {}`.
- `openNextCycle` / `createCycle`: a new `openingHeld` parameter, stored on the cycle.
- `beginDissolution`: the same unconfirmed-hand-over guard.
- `snapshot`: adds `heldBy` and `earlyRepaymentsMinor`.
- `assertCanLeave(eventId, userId)` (D7): if the current open cycle's `heldBy` for the user's entity isn't 0, and the pool isn't `recurring` with `membershipChangeClosesCycle`, refuse with 409 `POOL_HOLDER_LEAVING`.
- `updateConfig` (D8): a custodian change is refused while any `held ≠ 0` or any advance is `initiated` (409 `POOL_CUSTODIAN_CHANGE_BLOCKED`).
- `owesRepayment`: adds `&& expense.poolDraw?.paidFrom !== 'advance'`. A rejected spend from held money stays in `held` instead of getting a leg.

### 4.4 Routes (`apps/api/src/routes/pools.ts`)

```
POST /api/pools/event/:eventId/advances          advanceCreateSchema → recordAdvance   (201)
POST /api/pools/advances/:advanceId/confirm      {}                  → confirmAdvance
POST /api/pools/advances/:advanceId/reject       reasonSchema        → rejectAdvance
POST /api/pools/advances/:advanceId/cancel       {}                  → cancelAdvance
```

Each route runs `requireEventAccess`, then `announce(eventId, 'advance')` so open screens refresh over the socket. Errors go through the existing `fail()`.

### 4.5 Proof upload (`apps/api/src/routes/uploads.ts`)

New scope `pool_advance_proof` with `eventId`. It's allowed for event participants and stored under `pools/{eventId}/advances/`. The proof is uploaded first, and the URL is sent with the create request (the record doesn't exist yet). That's why this isn't modelled on contribution proof, which needs the contribution id.

---

## 5. WP3: API, payment method on pool spends

- **`apps/api/src/routes/expenses.ts`:** pass `body.paidFrom` to `prepareDraw` (create, about line 156), and `dto.paidFrom` to `prepareAmountChange` (edit, about line 230).
- **`prepareDraw`:**
  - `paidFrom` is accepted only with `fundingSource: 'pool'` and an actor who isn't the custodian (else 400 `POOL_PAID_FROM_INVALID`).
  - `sponsor_card` while `allowSponsorCardSpends === false` gives 400 `POOL_CARD_SPENDS_OFF`.
  - Missing `paidFrom` is accepted (D10).
  - Spending from held money is never refused for exceeding what's held: `held` goes below zero and the pool owes the spender (§9.3).
  - Timing (`alreadyIncurred`) stays the caller's choice (D1). Overdraft and cap checks are unchanged.
  - `poolDraw.paidFrom` is stored.
- **`prepareAmountChange`:** keeps the existing `paidFrom` unless a new one is sent. The same checks apply.
- **`getLedger`:** draw rows include `paidFrom`.

---

## 6. WP4: API, netting at settle-up

### 6.1 New pure helper `apps/api/src/services/pool-netting.ts`

```ts
export function foldablePoolLegs(legs: Array<Record<string, any> & { id: string }>, cycleId: string): Array<...>
  // kind ∈ {pool_repayment, pool_reimbursement}, poolCycleId === cycleId, status ∈ {pending, failed}
export function foldLegsIntoBalances(legs, groups: Group[]): Balance[]
  // payer's entity −amount, payee's entity +amount; a user in a group folds into the group (§11.5 "Groups")
```

### 6.2 `SettlementService` (`apps/api/src/services/settlement.service.ts`)

**Generating and regenerating the plan.** In `generateSettlement` and `regenerateSettlement`:
1. `clearStandardSettlements` also restores `netted` legs to `pending`, clearing `nettedAt` and `nettedPlanAt` with an audit `unfolded`, **in the same batch** as deleting the old plan.
2. **New `foldOpenPoolLegs(eventId, now)`:**
   - runs only for a pool event with a reconciling cycle (`poolService.reconcilingCycleId(eventId)`, new);
   - in `db.runTransaction`, re-reads that cycle's repayment and claim legs and flips those still `pending`/`failed` to `netted` (`nettedAt = nettedPlanAt = now`, audit `netted`);
   - returns the folded legs.

   A leg someone marked paid a moment earlier is already `initiated`, so it's skipped and stays separate (§11.5).
3. `calculateBalancesForPlan` merges peer + pool + `foldLegsIntoBalances(folded)`.
4. The plan is calculated and saved as now, and `lastSettlementGeneratedAt = now`.

If step 4 fails, the legs stay `netted` with no plan. The next generate starts with step 1 and restores them, so no debt is lost.

**Every place that reads leg status** (§11.5):

| Where | Change |
|---|---|
| `settleEventIfComplete` | Counts `netted` as done. |
| `hasOpenPoolSideLegs` | Ignores `netted`. |
| `getOutstandingForUser` | Skips `netted`. |
| `getPendingSettlementTotal` | Skips `netted`. |
| `markPaidByPayee`, `approvePayment`, `rejectPayment`, `retryPayment`, `closeForDeletedUser` | New guard `assertNotNetted(data)`: 409, *"This payment is included in the final settlement."* `initiatePayment` already refuses it. This protects against older app builds, which show a netted row as "To pay". |
| `finalizePoolIfAny` | Passes the netted leg ids to `poolService.finalizeOnSettled`, which stores `nettedLegIds` in the snapshot. |

### 6.3 `PoolService`

- **New `reconcilingCycleId(eventId)`.**
- **`assertDrawMutable`:** a leg in `netted` is treated like `pending`: it's returned as `legToRemove`. The expense route already marks the plan stale in Review, and regenerating re-folds without it. `POOL_REPAYMENT_OWED` still stops a spender deleting their own debt.
- **`previewClose({ forDissolution: true })`** returns two new fields:
  - `folded`: `Array<{ settlementId?: string; expenseId: string; kind; fromKey; toKey; amountMinor; title }>`. It covers open legs (`pending`/`failed`), plus the legs settle-up will create: approved claims without a leg, and rejected already-paid card spends without a leg.
  - `separate`: the legs already being paid (`initiated`), which stay "Paid separately".

### 6.4 Behaviour this changes (as accepted in §11.5)

- A close where only a repayment is open now goes to **Review** (everyone approves) instead of straight to Payment. That also removes the false "settled" socket update, which was watch item 5 in the Phase 1 test plan.
- Payments can now go between members, not only to and from the custodian.
- Folded amounts are converted to the settlement currency with the rest of the plan.

---

## 7. WP5: API, Pro check

- **`apps/api/src/services/entitlement.service.ts`:**
  - `computeCapabilities` returns `contributorPools: hasActivePro(entitlement)`;
  - `PRO_FEATURE_CODES.contributorPools = 'contributor_pools'`.
- **`apps/api/src/routes/events.ts` (`POST /`):** after `buildConfigForNewEvent`, if `pool.poolConfig.funderMode === 'contributors'`, run `assertCapability(uid, 'contributorPools')`. If refused, return 403:
  ```json
  { "success": false, "error": "Group pools (\"Several of us\") require Pro", "code": "FEATURE_REQUIRES_PRO", "feature": "contributor_pools" }
  ```
  The check uses the built config's `funderMode`, not the preset name, so overrides can't bypass it.
- **`apps/api/src/routes/pools.ts` (`POST /event/:eventId/convert`):** the same check before `convertToHybrid`. Conversion always makes a group pool; a sponsor budget is already refused there.
- **No checks** on settle-up, regenerate, dissolve, cycle closes, joining or paying in (§12.2 rule 3).
- **Profile responses** already include `computeCapabilities`, so both apps receive `contributorPools` with no route change.

---

## 8. WP6: Web UI

### 8.1 `apps/web/src/utils/pool-api.ts`

```ts
recordAdvance: (eventId, body: { kind; userId?; amountMinor; note?; proofUrl? }) => api.post<PoolAdvance>(`/api/pools/event/${eventId}/advances`, body),
confirmAdvance: (id) => api.post<PoolAdvance>(`/api/pools/advances/${id}/confirm`, {}),
rejectAdvance: (id, reason?) => api.post<PoolAdvance>(`/api/pools/advances/${id}/reject`, reason ? { reason } : {}),
cancelAdvance: (id) => api.post<PoolAdvance>(`/api/pools/advances/${id}/cancel`, {}),
uploadAdvanceProof: (eventId, file) => api.post<{ url: string }>('/api/uploads', { scope: 'pool_advance_proof', eventId, ...file }),
```

### 8.2 `apps/web/src/components/pool/PoolTab.tsx`

**Summary card:**
- The custodian sees *With you ₹x · With spenders ₹y* (`pool-holdings`).
- A spender sees *You're holding ₹x*, or *The pool owes you ₹x* when the figure is negative.

**Actions row:**
- Custodian:
  - **Give money** opens `GiveMoneyModal`: who, amount, note, optional proof. It includes the §9.3 hint *"Moving money between spenders? Record a return from one and an advance to the other. The cash can go directly."* It's disabled with the reason while paused or overdrawn.
  - **Record money returned** opens `ReturnMoneyModal` with a "from whom" field.
- A holder with money: **Return money** opens `ReturnMoneyModal` without the "from whom" field.

**New card "Money handed over" (`pool-movements`):**
- One row per advance: *Advance / Returned / Paid back early*, the people involved, the amount, the status, and a proof link.
- The receiver gets **Confirm** and **Not received**. The person who recorded it gets **Cancel** while it's waiting.

**Money lent (inside the contributions card):**
- For each lender with an outstanding loan, the custodian gets **Pay back now**, which opens `PayBackModal`.
- When `earlyRepaymentImpact` says spending is or will be paused, the modal shows a warning: *"Spending is paused. Paying Ravi ₹4,000 now means you'll need to add ₹X before anyone can spend again."*

**Other changes:**
- **Spenders card:** a *Holding* column.
- **`LedgerRow`:** shows advance rows, and *paid with the sponsor's card / held money* on draws.
- **`ReconcileModal`, settle mode:**
  - **"Included in the final settlement"** (`reconcile-folded`) lists `preview.folded`, with a breakdown per person, e.g. *"Ravi gets back ₹10,000, less ₹600 owed for Snacks = ₹9,400"*;
  - **"Paid separately"** now lists only `preview.separate`.

### 8.3 Other web components

- **`PoolMeter.tsx`:** an optional `holdings` prop renders the legend *With you · With spenders · Spent · Remaining*.
- **`SpenderPermissions.tsx`:** in sponsor pools, a checkbox *"Spenders can pay with my card or UPI"* (`allowSponsorCardSpends`), saved with the rest.
- **`PaidWithControl.tsx`:**
  - renders `paidWithOptions(...)`;
  - `PaidWith` gains the UI-only values `'pool_held'` and `'pool_card'`, mapped on submit to `fundingSource: 'pool'` plus `paidFrom`;
  - `SpendTimingControl` stays (D1).
- **Expense create and edit** (`apps/web/src/app/events/[eventId]/expenses/create/page.tsx` and `…/[expenseId]/edit/page.tsx`): pass the summary's holdings and the config to `PaidWithControl`, and send `paidFrom`.
- **`PoolPayments.tsx`:** status `netted` shows *"In final settlement"* with no actions.

### 8.4 Event page (`apps/web/src/app/events/[eventId]/page.tsx`)

- **Review list and payments list:** netted rows are shown muted, labelled *"{label} · included in the payments above"*, with no buttons. The note above them is `POOL_LEGS_NETTED_NOTE` when any are netted.
- **"x of y complete" counter (about line 1534):** leaves netted rows out of both numbers. The same goes for the Summary counts.

### 8.5 Create event (Pro)

- **`FundingStep.tsx`:** new prop `contributorPoolsLocked`. When true:
  - the "Several of us" card shows a **PRO** badge;
  - choosing it shows *"Group pools are a Pro feature"* with **Learn how to get Pro** (`/pro`);
  - submit is disabled.
- **`apps/web/src/app/events/create/page.tsx`:**
  - `ProfileCaps` gains `contributorPools`;
  - pass `contributorPoolsLocked = !caps.contributorPools`;
  - the catch block uses `proRequiredMessage(err.feature)` instead of the fixed multi-currency text (lines 215–217).

---

## 9. WP7: Mobile UI

- **`apps/mobile/src/services/pool.ts`:** the same five client functions as web, with `uploadAdvanceProof` using `scope: 'pool_advance_proof'`.
- **`apps/mobile/src/screens/PoolScreen.tsx`:** the same changes as web PoolTab:
  - holdings line;
  - **Give money**, **Record money returned**, **Return money** and **Pay back now** buttons;
  - the "Money handed over" card;
  - Holding in the spenders card;
  - ledger rows;
  - `ReconcileSheet` with "Included in the final settlement" and "Paid separately".

  New sheets in the same file: `GiveMoneySheet`, `ReturnMoneySheet`, `PayBackSheet`. They reuse `Sheet`, `AmountSheet` patterns and `pickReceiptImage` for proof.

  Netted rows in Pool payments show *"In final settlement"*.
- **`apps/mobile/src/components/pool/PoolViews.tsx`:**
  - `PoolMeterView` gets the optional holdings legend;
  - `PaidWithSelector` renders `paidWithOptions(...)`;
  - `FundingStepView` gets `contributorPoolsLocked`: a PRO badge, a notice, and an **Upgrade** button that opens `ProUpgrade`.
- **Spender permissions card** (PoolScreen, about line 334): the card/UPI switch.
- **`CreateExpenseScreen.tsx` and `EditExpenseScreen.tsx`:** send `paidFrom`.
- **`EventDetailScreen.tsx`:** netted rows muted with no buttons, the netted note, and netted rows left out of the counter (about line 732).
- **`CreateEventScreen.tsx`:** pass `contributorPoolsLocked`. The catch block uses `proRequiredMessage(err.feature)` (about line 168); `ApiRequestError` already carries `feature`.
- **`apps/mobile/src/context/AuthContext.tsx`:** add `contributorPools` to the capabilities type and wherever they're set (about lines 42, 79, 117, 135, 148, 392).

---

## 10. WP8: Pro feature lists and error text

The "Group pools" lines appear only when `contributorPoolsAvailable(appEnv)` is true. They're visible on local and staging, and hidden in production until the switch is turned on, so Pro never advertises something users can't open.

| Where | Change |
|---|---|
| `apps/mobile/src/screens/ProUpgradeScreen.tsx` (`PRO_FEATURES`) | Insert `GROUP_POOLS_PRO_FEATURE` after Multi-Currency, when available. |
| `apps/mobile/src/screens/ProfileScreen.tsx` (about line 815) | *"Unlimited events, group pools, multi-currency & more"* when available. |
| `apps/mobile/src/context/PurchaseContext.tsx` (`PRO_READY`) | *"…all Pro features, including group pools and multi-currency settlement."* when available. |
| `apps/mobile/src/screens/HelpScreen.tsx` (`FEATURES`) | A pooling card. "Just me" is always described as free; "Several of us is Pro" is added when available. |
| `apps/web/src/app/pro/page.tsx` | A **Group pools** badge when available. *Advanced analytics* becomes *Analytics (coming soon)*, as on mobile. |
| `apps/web/src/app/help/page.tsx` | The same badges, plus a short pooling section. |

The static user guide (`apps/web/public/traxettle/index.html`) can't read the app environment, so it changes in the release commit (§11).

---

## 10A. WP11: Free trial (D12)

### 10A.1 How it works today

**The trial UI is already in the app (1.0.40 included).** `ProUpgradeScreen.tsx` reads `proPackage.product.introPrice`:
- with no offer it shows **"Subscribe for ₹X/year"**;
- with a free offer it shows **"Start free trial"** and *"Free for your first week, then ₹X/year."* (`introOfferText` in `apps/mobile/src/utils/subscriptionTerms.ts`), plus the renewal terms Apple requires.

The stores have no offer yet, so nobody sees it. **Creating the offer in a store switches it on in every installed app**, which is why the store setup waits for this build.

**Two gaps:**
1. **iOS shows the trial to everyone.** Apple gives an introductory offer once per account per subscription group. Someone who already had Pro would see "Start free trial" and be charged at once, which is misleading (Guideline 3.1.2) and leads to complaints.
2. **Android may not show it.** `introPrice` is Apple's field. RevenueCat reports a Google Play trial through `product.defaultOption.freePhase`, so the screen may show the normal price even when a trial applies. Paying through the package already applies the trial (RevenueCat's default option picks it); only the text may be wrong.

### 10A.2 Code changes (installed SDK: `react-native-purchases` 10.14.0)

**`apps/mobile/src/utils/subscriptionTerms.ts`**, a new pure function:
```ts
export function resolveIntroOffer(input: {
  platform: 'ios' | 'android' | string;
  product: Pick<PurchasesStoreProduct, 'introPrice' | 'defaultOption'>;
  /** iOS only: the result of checkTrialOrIntroductoryPriceEligibility for this product. */
  iosEligibility?: INTRO_ELIGIBILITY_STATUS | null;
}): IntroOffer | null
```
- **iOS:** returns `product.introPrice` only when `iosEligibility === INTRO_ELIGIBILITY_STATUS_ELIGIBLE` (2). Unknown (0), ineligible (1), no offer (3) and an error all return `null`. RevenueCat's guidance is to show the normal price when unsure.
- **Android:** uses `product.defaultOption?.freePhase`, else `defaultOption?.introPhase`, mapped to the `IntroOffer` shape:
  - `price` from `price.amountMicros / 1e6` (0 for a free trial);
  - `priceString` from `price.formatted`;
  - `periodUnit` and `periodNumberOfUnits` from `billingPeriod.unit` and `billingPeriod.value`;
  - `cycles` from `billingCycleCount ?? 1`.

  It falls back to `product.introPrice`, then `null`. Google only returns offers the user qualifies for, so no separate check is needed.

**`apps/mobile/src/context/PurchaseContext.tsx`:**
- **New state `introOffer: IntroOffer | null`**, exposed in the context value and the default context (`null`).
- **Worked out after the package loads** (next to `setStorePriceString`, about line 128): on iOS, call `Purchases.checkTrialOrIntroductoryPriceEligibility([pkg.product.identifier])` and read `[identifier].status`; then `setIntroOffer(resolveIntroOffer(...))`. A failed check gives `null`.
- **Worked out again** after a purchase or restore, and when customer info changes, because eligibility ends once someone subscribes.

**`apps/mobile/src/screens/ProUpgradeScreen.tsx`** (about lines 54–58): use `introOffer` from `usePurchase()` instead of `proPackage?.product.introPrice`. The button and text logic stay as they are.

**No changes:** the purchase call (`purchasePackage`), the API (RevenueCat webhooks already handle trials, below), web (Pro isn't sold there), and the Profile and Dashboard upgrade banners (they show the yearly price).

**Why the API needs no change.** In `apps/api/src/services/billing/revenuecat.service.ts`:
- a trial starting arrives as `INITIAL_PURCHASE`, which turns Pro on;
- cancelling during the trial sends `CANCELLATION`, which keeps Pro until the trial ends;
- `EXPIRATION` turns Pro off;
- a trial that converts to a paid year arrives as `RENEWAL`.

### 10A.3 Tests (automated)

`apps/mobile/src/__tests__/subscriptionTerms.test.ts`, new `resolveIntroOffer` cases:
- iOS eligible → offer; *"Free for your first week, then ₹999/year."*
- iOS ineligible, unknown, no offer, or a missing eligibility value → `null`; the button reads "Subscribe for ₹999/year".
- Android free phase of 7 days (`P1W` or `P7D`) → *"Free for your first week…"* or *"Free for your first 7 days…"*.
- Android paid intro phase → *"₹49 for your first month, then ₹999/year."*
- Android with no phases, falling back to `introPrice` → handled; with nothing at all → `null`.

A PurchaseContext test with RevenueCat mocked: the eligibility check is called on iOS only, and an error results in no trial text.

### 10A.4 Turning the trial on (release step, after the Phase 2 build is live in both stores)

**Order:**
1. App Review of 1.0.40 is finished.
2. The Phase 2 build, with this eligibility check, is live on the App Store and Google Play.
3. Create the offers below.
4. Run the live checks in §10A.5 straight away.

Older installed builds also start showing the trial. On iOS they skip the eligibility check, which matters little at first, because Pro is new and almost nobody has had it before.

**App Store Connect** (store screens move around now and then; the names below are as of late 2026):
1. **Apps → Traxettle → Monetization → Subscriptions → Traxettle Pro** (the group) **→ Pro Yearly** (`traxettle_pro_yearly`).
2. Under **Subscription Prices**, choose **Create Introductory Offer** (the **+** next to the prices).
3. **Countries or regions:** select all (the same as the subscription's availability).
4. **Start date:** today; **end date:** No End Date.
5. **Type:** Free. **Duration:** 1 Week.
6. Confirm. Pro Yearly now lists an introductory offer of *Free · 1 week*.
7. **App Review notes,** in the next submission: *"Pro Yearly includes a 1-week free trial for new subscribers."*

Apple applies eligibility automatically: one introductory offer per account per subscription group, for new subscribers only. No app build is needed.

**Google Play Console:**
1. **Traxettle → Monetize with Play → Products → Subscriptions →** the Pro subscription (the one RevenueCat lists as `pro_yearly_1`) **→ Base plans and offers**.
2. **Add offer**, then pick the yearly base plan.
3. **Offer ID:** `trial-7d` (it can't be changed later).
4. **Eligibility:** *New customer acquisition* → *Never had this subscription*.
5. **Phases → Add phase → Free trial → 7 days.**
6. **Tags:** none. Don't add `rc-ignore-offer`, which would make RevenueCat skip the offer.
7. **Save**, then **Activate**. It's usually live within a few hours.

**RevenueCat:** nothing to change. Offering `default` and package `$rc_annual` stay as they are, and RevenueCat reads the offer from each store. Optionally, check under **Products** that the Play product shows the `trial-7d` offer once Play has published it.

**Turning it off** if something is wrong:
- App Store Connect: Pro Yearly → the introductory offer → set the end date to today, or delete the offer.
- Play Console: the offer → **Deactivate**.

People already in a trial keep it.

### 10A.5 Testing steps

**Before release, without touching the stores**
1. The automated tests in §10A.3 pass.
2. **iOS, optional, on a simulator with an Xcode StoreKit configuration file.** Add a `.storekit` file that defines `traxettle_pro_yearly` with a 1-week free introductory offer, select it in the scheme (Run → Options → StoreKit Configuration), and run a debug build.
   - A fresh state shows **"Start free trial"**.
   - Buy, then delete the transaction in Xcode's **Debug → StoreKit → Manage Transactions**, and buy again with the transaction kept: the screen shows **"Subscribe for ₹X/year"**.

   This tests only the screen and eligibility logic. The purchase isn't validated by RevenueCat or the API in this mode; RevenueCat's StoreKit-testing guide covers what extra setup a full purchase needs.

**On release day, right after creating the offers**

Use a TestFlight build of the Phase 2 version (production API) with **Sandbox** accounts, and the Play **internal testing** track with **licence tester** accounts. In both stores' test environments a 1-week (7-day) trial lasts **about 3 minutes**, so the whole cycle takes minutes.

| # | Platform | Steps | Expected |
|---|---|---|---|
| T1 | iOS | Sign in to the app with a new account. On the device, use a **new Sandbox account** (Settings → App Store → Sandbox Account). Open **Upgrade to Pro**. | **"Start free trial"**, *"Free for your first week, then ₹X/year."*, the renewal terms, and the Terms and Privacy links. |
| T2 | iOS | Tap **Start free trial**. | Apple's sheet shows the 1-week free trial and the price after it. After confirming, within about a minute the app shows **Pro Active** on Profile, and Pro features work (a 4th event can be created). RevenueCat → Customers shows the user in **Trial**. |
| T3 | iOS | During the trial, cancel: Settings → App Store → Sandbox Account → Manage, or **Manage subscription** in the app. | Pro stays until the trial ends. About 3 minutes later the app returns to the free plan the next time it comes to the foreground. A 4th event is blocked again. A group pool created during the trial **still works** (§12 rule 3). |
| T4 | iOS | Same Sandbox account, open **Upgrade to Pro** again. | **"Subscribe for ₹X/year"**, with no trial text (not eligible any more). |
| T5 | iOS | A second new Sandbox account and app account: start the trial and **don't cancel**. | After about 3 minutes it renews as paid. Pro stays on, and RevenueCat shows it converted to paid. |
| T6 | iOS | During a trial, sign in on a second device or reinstall, then **Restore Purchases**. | "Restored!" and Pro is on. |
| T7 | iOS | Reset for re-testing: App Store Connect → **Users and Access → Sandbox → Test Accounts** → the account → **Clear Purchase History**. | The account sees "Start free trial" again. |
| A1 | Android | A **licence tester** Google account that has never had Pro, with an app account. Open **Upgrade to Pro**. | **"Start free trial"** and *"Free for your first week…"* (or *"…first 7 days…"*). If the screen shows the normal price here, the Android check in §10A.2 isn't working, so stop and fix it. |
| A2 | Android | Tap **Start free trial**. | Google's sheet shows the 7-day free trial. Pro turns on within about a minute. RevenueCat shows a trial. |
| A3 | Android | Cancel in Play Store → Payments & subscriptions → Subscriptions. | Pro stays until the shortened trial ends, then the app returns to free. |
| A4 | Android | Same tester, open **Upgrade to Pro** again. | **"Subscribe for ₹X/year"**, because Google no longer returns the offer. Google has no reset; use another tester account to repeat. |
| A5 | Android | Another tester: start the trial and don't cancel. | It renews as paid, and Pro stays on. |
| W1 | Web | Sign in on web with an account that's in a trial. | Profile shows Pro, and Pro features work: the server reads the same entitlement. |

**If any check fails,** turn the offer off (§10A.4), fix it, and turn it on again with the next build.

---

## 11. Release checklist (not part of the Phase 2 code)

Done when "Several of us" is released, after App Review and after Phase 2 is in stage:

1. **Deploy the API first, then ship the apps.** The new apps call endpoints and send fields the old API rejects.
2. **The release commit:**
   - sets `CONTRIBUTOR_POOLS_IN_PRODUCTION = true`;
   - updates `apps/web/public/traxettle/index.html` (Pro section and a pooling section);
   - updates `play-store-assets/full-description.txt`.
3. **App Store Connect:**
   - the app description;
   - the Traxettle Pro subscription's localized description;
   - the promo image and screenshots, if they list features;
   - the review notes ([APP_REVIEW_RESPONSE.md](../deployment/APP_REVIEW_RESPONSE.md)).
4. **RevenueCat product descriptions** ([REVENUECAT_SETUP.md](REVENUECAT_SETUP.md)).
5. **Free trial (D12):** once the Phase 2 build is live in both stores, create the offers (§10A.4) and run the release-day checks (§10A.5).
6. **Before hand-testing on staging,** give the tester accounts Pro with the internal tester switch.

---

## 12. WP9: Tests

**Shared (`libraries/shared/src/__tests__`)**
- `pool-math.test.ts`:
  - `computeHoldings`: advance, return, spend from held money, a rejected spend leaving `held` unchanged, spending past what's held (negative), opening held.
  - `withCustodian + Σ held = remaining`, added to the existing randomised invariant test.
  - `reconcileCycle` with repayments and held: Σ net = closing, settlement balances sum to 0, and the held adjustment lands on the right people.
  - Worked example: an advance of ₹20,000 with ₹15,000 spent gives a ₹5,000 leg spender → custodian.
  - `splitForMembershipChange` with a leaver holding money.
  - The overdraft baseline after an early repayment.
  - `earlyRepaymentImpact` (already paused, becomes paused, no effect).
  - `outstandingLoans`.
- `pool-ui.test.ts`: `paidWithOptions` for each kind of person and setting, the netted labels with each event status, `proRequiredMessage`, and `openPoolSideLegs` excluding netted.

**API (`apps/api/src/__tests__`)**
- **New `routes/pools.advances.test.ts`:**
  - each kind: record → confirm / reject / cancel, including who may do each;
  - refusals: `POOL_ADVANCE_NOT_AVAILABLE`, `POOL_ADVANCE_EXCEEDS_CUSTODIAN`, `POOL_RETURN_EXCEEDS_HELD`, `POOL_REPAYMENT_EXCEEDS_LOAN`, `POOL_EVENT_NOT_ACTIVE`;
  - a custodian-recorded return confirmed at once;
  - `POOL_UNCONFIRMED_MOVEMENTS` on close and on settle-up;
  - held money becomes a settle-up leg, a settle-policy close leg, and carried `openingHeld`;
  - a member leaving with held money (exit leg in a rolling fund; refused elsewhere);
  - custodian change blocked;
  - an early repayment that pauses spending, with the latch released after a top-up;
  - a rejected spend from held money creates no repayment leg;
  - `paidFrom` checks and `POOL_CARD_SPENDS_OFF`;
  - a spend without a method (older apps) accepted.
- **New `routes/settlements.netting.test.ts`:**
  - Scenario 1 settles as one payment, Anita → Ravi ₹9,400. Scenario 3 gives Anita → Priya ₹1,300 and Ravi → Priya ₹100.
  - A leg `initiated` before settle-up stays separate, and the event settles once both are done.
  - Regenerating restores and re-folds with no duplicates. A failed save leaves netted legs that the next generate restores.
  - Editing or deleting the rejected spend during Review removes its leg and marks the plan stale.
  - `netted` counts as done for auto-settle and is left out of outstanding totals.
  - `markPaidByPayee` and `closeForDeletedUser` refuse a netted leg.
  - A leg flipped to `initiated` before the fold isn't folded.
  - Split-expenses events produce exactly the same plans (existing regression suites, unchanged).
- **`routes/events.pro-gating.test.ts`, extended:**
  - Free: Kitty, Fund, Treasury and Collection each get 403 `contributor_pools`.
  - Pro and grace period get 201. Expired and revoked get 403.
  - Free users can still create "Just me" and split events.
  - Converting: free refused, Pro allowed.
  - A free member joins, pays in, spends, approves and settles up in a Pro creator's pool.
  - After the creator's Pro expires mid-cycle, closing the cycle, settling up and dissolving still work.
- **Existing suites that create group pools** (`pools.flows.test.ts`, `pools.recurring.test.ts`, `services/pool.service.test.ts`): a `makePro(uid)` helper is called before creating the pool (D9).
- `scripts/local-dev/pool-smoke.mjs`: switch the user to Pro through `/api/internal/entitlements` first.

**Web (`apps/web/src/__tests__/pool`)**
- The movements card actions; the Give money modal, including its disabled reason; the Pay back now warning; the payment-method options; the card switch.
- ReconcileModal's folded and separate tables.
- Netted rows and the counter on the event page.
- FundingStep's PRO badge and blocked submit.
- The Pro page badge shown and hidden by environment.

**Mobile (`apps/mobile/src/__tests__`)**
- `services/pool.test.ts`: the new client functions.
- Rendering tests where suites exist for these screens. Most of the logic is covered through the shared helpers.

**E2E:** `e2e/tests/tier-entitlements.spec.ts` adds the free-user refusal for "Several of us".

**Every package:** `npx tsc --noEmit` clean in shared, api, web and mobile, and the full suites green. The two known mobile failures listed in the testing guide are excepted.

---

## 13. WP10: Docs

- **[MONEY_POOLING_DESIGN.md](MONEY_POOLING_DESIGN.md):**
  - mark §9.3, §10.6, §11 and §12 as built;
  - add the accepted deviations from §1 to §0;
  - update the status line and the §8 summary.
- **[MONEY_POOLING_TESTING.md](../runbook/MONEY_POOLING_TESTING.md):** a Phase 2 section (short version), and Pro creators in UC-1, UC-3, UC-4, UC-5 and hybrid.
- **New `traxettle-app/docs/runbook/MONEY_POOLING_PHASE2_E2E.md`**, in the same format as the Phase 1 plan:
  1. advances in a "Just me" budget, through to settle-up;
  2. Scenario 1 and Scenario 3 re-run with netting;
  3. an early repayment while paused;
  4. a free user and a Pro user creating a Kitty;
  5. Pro lapsing mid-month.
- **Pro and tier docs, describing the server behaviour:**
  - [Functional.md](../app/Functional.md) §16 and 9.7;
  - [TIER_ENTITLEMENT_ENV_MATRIX.md](TIER_ENTITLEMENT_ENV_MATRIX.md);
  - [PRO_FREE_IMPLEMENTATION_CHECKLIST.md](PRO_FREE_IMPLEMENTATION_CHECKLIST.md);
  - [DESIGN_DOCUMENT.md](DESIGN_DOCUMENT.md) §16.2–16.3.

---

## 14. Compatibility with app builds already installed

| Situation | What happens | Acceptable because |
|---|---|---|
| An older app sees a `netted` leg | It shows "To pay" and buttons; the API refuses them with *"This payment is included in the final settlement."* | Money can't be paid twice; updating the app shows the right label. |
| An older app spends from the pool | No `paidFrom`, so it's treated as Phase 1 (card/UPI) | D10. |
| An older app closes or settles while a hand-over is unconfirmed | It shows the API's error text | Same as `POOL_PENDING_DRAWS` today. |
| An older app tries to create a group pool | 403 with the message (only possible on staging, since production hides the option) | — |
| A new app against the old API | New endpoints don't exist; strict schemas refuse new fields | Release order: API first (§11). |
| An older app once the trial offer exists | It shows "Start free trial" without the iOS eligibility check | The offers are created only after the Phase 2 build is live (§10A.4), and Pro is new, so almost nobody is ineligible yet. |

---

## 15. Rough size

| Package | Size |
|---|---|
| WP1 shared | Medium |
| WP2 advances API | Large |
| WP3 payment method | Small |
| WP4 netting API | Large |
| WP5 Pro check | Small |
| WP6 web UI | Large |
| WP7 mobile UI | Large |
| WP8 Pro lists | Small |
| WP9 tests | Large (spread across the packages) |
| WP10 docs | Medium |
| WP11 free trial | Small (plus about an hour of store setup and release-day testing) |

---

## 16. Implementation notes (as built)

Small differences from the plan, recorded as each package is built. WP10 copies them into the design doc's §0.

**WP1 (2026-11-16)**
- **Optional fields, so older servers and existing data keep working:**
  - `PoolCycleTotals.earlyRepaymentsMinor` is left out when it's 0, so pools without early repayments report exactly as before;
  - `PoolCycleSummary.holdings`, `PoolLedger.advances`, `PoolSpenderSummary.heldMinor` and `UserCapabilities.contributorPools` are optional (the plan listed them as required). Clients treat a missing value as none or false.
- **`PRO_FEATURE_CODES.contributorPools`** is added in WP1, not WP5. The API needs it to compile once the capability exists. Nothing checks the capability until WP5.
- **"Paid with" titles use the pool's own word and the custodian's name:** *"Budget money I'm holding"* (or *"Kitty money…"*) and *"Anita's card or UPI"* (*"The custodian's card or UPI"* when the name isn't known).
- **New shared helper `paidWithChoiceFor`** picks the right option when editing a saved spend. Spends saved before Phase 2 (no method) count as the custodian's own spend, or as a spend on the custodian's card for anyone else.

**WP2 (2026-11-16)**
- **Membership changes in rolling funds:** if anything is still waiting (a pending spend, an unconfirmed top-up or an unconfirmed hand-over), the pool now just updates the member list instead of closing the cycle. Before, only pending spends were handled this way. An unconfirmed top-up made the close fail inside the membership update, which ignored the error, so even the member list wasn't updated.
- **Leaving (D7):** only someone counted on their own is checked. A member of an event group isn't, because the group keeps the money when one member leaves.
- **Ledger:**
  - spender rows show `heldMinor` only when it isn't 0, and people holding money who haven't spent yet get a row;
  - the entries list shows hand-overs that are waiting or confirmed; the new `advances` list has every one, including rejected and cancelled.
- **Confirm and cancel** take an empty body (new `emptySchema`).
- **Until WP3,** the API tests write `paidFrom` onto the expense directly. WP3 replaces that with the expense form's field.

**WP3 (2026-11-17)**
- **Changing the payment method on its own** (with no amount change) re-runs the approval check, the same as an amount change. The method decides what's owed if the spend is rejected, so the spend goes back for approval when the pool requires it, and any unpaid repayment is removed. The plan only covered keeping the method on amount edits.
- **Turning card spends off later** doesn't block edits to spends already recorded on the card. Only a newly chosen card method is refused (`POOL_CARD_SPENDS_OFF`).
- **The expense-added notification** now names the method: *Pool money they hold* or *The custodian's card or UPI*.

**WP4 (2026-11-17)**
- **Order of work at settle-up:** the old plan is cleared and folded rows restored (one batch); this cycle's open repayments and claims are marked `netted` (one transaction); then the plan is worked out and saved. If saving fails, the rows stay `netted` with no plan, and the next run restores them first, so no debt is lost or doubled. The plan described marking rows after saving the plan; this order is safer.
- **Restored rows go back to `pending`,** including ones that had `failed`. New audit actions `netted` and `unfolded` record each step.
- **Refusing a netted row** (pay, mark paid, retry, close for a deleted user) returns **400**, *"This payment is included in the final settlement"*, the same code the other settlement status errors use. The plan said 409.
- **Regenerating during Review:** the check for who is "affected" (whose approvals reset) now compares only the plan's own payments. Before, every pool payment counted as part of the old plan, so pool events reset approvals that hadn't changed. Split-expenses events are unchanged.
- **Settle-up preview:** `folded` lists the rows the plan will include, including those settle-up creates (approved claims and rejected card spends without a row yet). `separate` lists every other open pool payment: already being paid, from an earlier cycle, or a leaving settlement. A cycle-close preview returns both lists empty.
- **Three Phase 1 API tests** now follow the new flow: Review, then one payment. Before, the event went straight to Payment and the pool payment was paid on its own.
- **Until WP6 and WP7,** the apps still show Phase 1 wording ("Paid separately") in the settle-up preview, and show a netted row as payable (the API refuses it). Don't hand-test settle-up wording on this branch until then.

**WP5 (2026-11-17)**
- **One shared check** (`apps/api/src/utils/pro-gates.ts`, `groupPoolRefusal`) is used by event creation and by adding a pool to an existing event.
- **If the subscription lookup itself fails,** the API returns a server error instead of saying "needs Pro". The multi-currency check treats any failure as "needs Pro"; that check is unchanged.
- **Subscription states:** "billing retry" counts as free and the grace period as Pro, the same rule as every other Pro limit (`hasActivePro`).
- **Adding a "Just me" budget to a split-expenses event** is still refused for its own reason (400), never as a Pro refusal.
- **Tests:**
  - new helper `makePro(store, …uids)`; the existing pool suites make their pool creator Pro;
  - `scripts/local-dev/pool-smoke.mjs` switches its user to Pro first, so the local API must run with `INTERNAL_TIER_SWITCH_ENABLED=true`. WP10 updates the run instructions in the testing guide.
- **Checked against a running local API:** the smoke script passes; a free user creating a Kitty gets the 403; a free user's "Just me" budget is created.
- **Moved to WP6:** the end-to-end (Playwright) check for a free user, because it needs the web PRO badge.

**WP6 (2026-11-18)**
- **Held money appears as a line under the meter,** not as a legend inside it: *"With you ₹x · With spenders ₹y"* for the custodian, *"You're holding ₹x"* for a spender. `PoolMeter` is unchanged.
- **New shared helpers** for the settle-up preview: `settleUpRows` and `describeSettleUpRow` (*"₹10,000 from the budget, less ₹600 for Snacks (repayment)"*). Web and mobile use the same wording.
- **Preview types moved to shared:** `PoolFoldedItem` and `PoolSeparateLeg` (they had been API-only).
- **The settle-up preview** blocks settling while a hand-over is still waiting for confirmation, the same way as pending expenses.
- **Settlement lists:** netted rows come after the plan's own payments, so their label (*"included in the payments above"*) reads correctly. The note above the list now says *"included in these payments. They aren't paid on their own."*
- **Edit expense:** a spender can switch a pool spend between *"Pool money I'm holding"* and the custodian's card. Spends saved before Phase 2 (no method) show as the card, and saving one unchanged doesn't count as a change.
- **Web API errors** now carry `feature`, so create-event shows the right Pro message.
- **Bug fixed along the way (API):** a brand-new user's first profile load returned a fixed capability list without `contributorPools`, so the PRO badge didn't show until they reloaded. The defaults now come from the entitlement service.
- **Checked in a browser** against a local API with seeded data:
  - the pool tab: holdings, hand-overs, approvals with payment method, Holding column, activity;
  - the settle-up preview: Ravi gets back ₹4,400 = ₹5,000 less ₹600;
  - the Review list after settling up: one ₹4,900 payment plus the netted ₹600;
  - the PRO badge for a new free user.
- **End-to-end (Playwright) checks added** to `e2e/tests/tier-entitlements.spec.ts`: a free user is refused a Kitty and allowed a "Just me" budget; the create page marks "Several of us" PRO. **Not run here:** Playwright browsers aren't installed on this Mac. The API part matches the live check in WP5.

**WP7 (2026-11-18)**
- **Mobile mirrors web:**
  - **pool screen:** the holdings line, **Give money**, **Money returned**, **Return money** and **Pay back now** (all through one `HandOverSheet`), the "Money handed over" card, holding figures, and hand-overs and payment methods in Activity;
  - **settle-up sheet:** the per-person breakdown, "Included in the final settlement" and "Paid separately", and it waits for hand-overs;
  - **other screens:** the shared "Paid with" options; spenders can switch the method on Edit expense; netted rows are muted and left out of the counter.
- **Wording:** the custodian's "Record money returned" button reads **"Money returned"** on mobile, to fit the button row.
- **Upgrading from create event:** a free user who picks "Several of us" sees PRO and a notice with **Upgrade to Pro** (opens the upgrade screen). Submitting offers the same choice.
- **Capabilities:** the mobile app tracks `contributorPools` as unknown until a server that reports it answers, so an older server never locks the option.
- **Also fixed on web:** the "Settlement Details" popup (missed in WP6) now leaves netted rows out of its total and lists them last, labelled.
- **Tests:** a new `src/__tests__/screens/PoolScreen.test.tsx` renders the pool screen with React Native stand-ins and checks the holdings, hand-overs, loan, actions and settle-up breakdown. Also new: tests for the hand-over client calls and for the capability in the auth context.
- **Not checked on a device or simulator:** the mobile app needs the Firebase emulators to sign in locally. The web popup fix was checked in a browser.

**WP8 (2026-11-18)**
- **Release check, one place per app:**
  - **mobile:** a new hook `useContributorPoolsAvailable` (the app environment, or the staging switch in release builds). It replaces the copy in create-event and drives every Pro list.
  - **web:** `GROUP_POOLS_RELEASED` in `apps/web/src/utils/proFeatures.ts`.
- **Mobile lists** come from pure helpers in `src/utils/proFeatures.ts`: the upgrade screen's list (group pools after multi-currency), the Profile row, the after-purchase message, and a new **Pool Money** card in Help (placed after Groups).
- **Web Pro and Help pages** share one badge list. It now includes **Unlimited events**, which web had been missing although mobile lists it. *Advanced analytics* became **Analytics (coming soon)**, as on mobile. Help's feature list gains a pooling line.
- **A build with no app environment counts as production,** so group pools stay out of the lists unless the build says it's local or staging, or the switch is on. Tested.
- **Checked in a browser (local build):** the Pro page and Help show Unlimited events, Multi-currency settlement, Group pools, Analytics (coming soon), More power-user features, plus the pooling line.
- **Left for the release commit** (§11): the static user guide (`apps/web/public/traxettle/index.html`) and the store and RevenueCat text.

**WP11 (2026-11-18)**
- **`resolveIntroOffer`** in `apps/mobile/src/utils/subscriptionTerms.ts`, as planned:
  - **iOS:** the offer only when the eligibility status is 2 (eligible); anything else shows the normal price.
  - **Android:** the default option's free phase, then its paid intro phase, then `introPrice`.
  - The eligible value is a plain constant (`INTRO_ELIGIBLE = 2`), so the file still doesn't load the native module.
- **The RevenueCat calls live in `services/purchases.ts`:**
  - `getIntroOffer(pkg)` runs the iOS check and turns any error into "no offer". It skips the call when the store has no offer at all.
  - `onCustomerInfoChanged(listener)` wraps RevenueCat's customer-info listener.
- **`PurchaseContext`** exposes `introOffer`. It's worked out when the package loads, and again:
  - after a purchase, a restore, or `refreshStatus`;
  - whenever RevenueCat reports a customer-info change.

  It's cleared on sign-out. The upgrade screen reads it instead of `product.introPrice`; the button and text logic are unchanged.
- **Bug fixed along the way (from WP8):** the after-purchase message read the release switch from the first render. In a release build switched to staging it could leave group pools out. The purchase callback now picks up the current value; it also picks up the current sign-in error, which had the same problem.
- **Tests (mobile 153):**
  - `subscriptionTerms.test.ts`: the cases in §10A.3;
  - new `services/purchases.test.ts`: the check runs on iOS only; an error, ineligible, or no offer gives the normal price;
  - new `context/PurchaseContext.test.tsx`: renders the provider with the real upgrade screen and checks "Start free trial", "Subscribe for ₹999/year", a re-check after a purchase and after a customer-info change, and that sign-out clears the offer.
- **Not checked on a device or simulator.** The store setup and the live checks are release steps (§10A.4–10A.5).
