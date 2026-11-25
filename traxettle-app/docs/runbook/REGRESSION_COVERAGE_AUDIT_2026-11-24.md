> **Snapshot from 2026-11-24, taken before the gap tests were added.** It maps every ✅ feature in
> [Functional.md](../app/Functional.md) to the tests that covered it on that day. The gaps it lists
> were then worked on: see [REGRESSION_SUITE.md §7](REGRESSION_SUITE.md#7-coverage-map) for what's
> covered now. Keep this file as the baseline; record new coverage in §7.

# Traxettle — feature → automated-test coverage map

Snapshot of branch `feature/money-pooling-enhancements-phase3`, 2026-11-24. Read-only survey: every rating below comes from opening the test and checking what it does, not from file names. Paths are relative to `traxettle-rush/`.

## Summary

176 feature rows: every ✅ row of `traxettle-app/docs/app/Functional.md` §1–10 and §12–16 (166), plus 10 pool phase rows from `MONEY_POOLING_DESIGN.md` §0 and `MONEY_POOLING_PHASE3_PROPOSAL.md` that Functional.md does not already list.

| Level | Unit/API | Web E2E (Playwright) | Mobile E2E (Maestro), as written | Mobile E2E, as it runs today |
|---|---|---|---|---|
| Full | 130 | 20 | 0 | 0 |
| Partial | 30 | 80 | 38 | 3 |
| None | 16 | 45 | 93 | 128 |
| n/a | 0 | 31 | 45 | 45 |

Gap priority: High 85, Medium 59, Low 29, no gap 3.

**Cross-cutting findings**

- **Web money flows are driven through the API, not the UI.** `settle-btn`, `approve-settlement-btn`, `pay-btn-*`, `approve-btn-*`, `close-event-btn`, `delete-event-btn`, `delete-expense-*`, `expense-on-behalf-toggle`, `expense-private-toggle` and `split-mismatch-error` all exist in the web app and no spec touches them. `expense-lifecycle.spec.ts`, `settlements.spec.ts` and the invitation lifecycle tests are mostly `fetch` calls run by Playwright.
- **Vacuous or tolerant assertions.** `events.spec.ts` "should fill and submit create event form" passes on `url.includes('/events/')`, which is already true on `/events/create`. `tier-entitlements.spec.ts` ends with `toHaveURL(/\/events\//)`, which `/events/create` also matches. `expenses.spec.ts` "should fill expense form and submit" passes on an error. The group and invite "fill and submit" tests and the two "cancel … and go back" tests (events, expenses) assert nothing after the click. `settlements.spec.ts` accepts "Settlement Summary" *or* "Settlement Review" at the end.
- **Silent skips.** Most non-pool specs call `test.skip` if creating the event through the API fails, so a broken API shows up as skipped tests rather than failures.
- **No real sign-in in any E2E test.** Web specs inject a `mock-` token into localStorage. `POST /api/auth/register`, `/login`, `/refresh` and `/forgot-password` have no route tests either.
- **Pools: strong maths and API coverage, partial UI.** Every pool spec seeds through `e2e/helpers/pool.ts` (API). Contributions, top-ups, claims, gifts and pool creation are never done through the UI.
- **Mobile screens with no unit tests:** EventDetailScreen, CreateExpenseScreen, EditExpenseScreen, CreateEventScreen (only its FundingStepView), DashboardScreen, InvitationsScreen, ProfileScreen.
- **Mobile E2E is effectively absent.** 4 of the 6 Maestro flows predate the mandatory PIN set-up (16 Mar 2026) and stall right after registering; AUTH stops at a removed id after registering; NAV only works with a leftover signed-in session. See Part 2. None of them cover pooling, settlement review, groups with members, or Phase 2/3 work.
- Count check: `e2e/tests/*.spec.ts` has **87** `test(...)` definitions (the brief said 88).

## Legend

- **Full**: the feature's main path is exercised and its outcome asserted. **Partial**: only part of it, or render-only, or (for E2E) API calls run by Playwright with no UI. **None**: nothing found. **n/a**: not applicable at that level.
- **P†** (mobile): a Maestro flow is written to cover this step, but the flow breaks before reaching it today (PIN set-up or stale ids, Part 2). It counts as Partial "as written" and None "as it runs today".
- **Gap** names the missing side: (web), (mob) or (web+mob). High = expenses/splits, balances, settlements, pools, auth, event lifecycle; Medium = other user-facing flows; Low = infra, dev-only, server-side or API-only.
- Unit file short names (API under `apps/api/src/__tests__/`): `rt/events` routes/events.test.ts · `rt/events-pro` routes/events.pro-gating · `rt/expenses` · `rt/groups` · `rt/invitations` · `rt/users` · `rt/auth-apple` routes/auth.apple · `rt/billing` · `rt/internal-ent` routes/internal-entitlements · `rt/pools-flows` routes/pools.flows · `rt/pools-adv` routes/pools.advances · `rt/pools-rec` routes/pools.recurring · `rt/pools-p3` routes/pools.phase3 · `rt/pools-pro` routes/pools.pro-gating · `rt/netting` routes/settlements.netting · `svc/auth` services/auth.service · `svc/apple-auth` services/apple-auth.service · `svc/auth-apple` services/auth.apple · `svc/event` · `svc/expense` · `svc/group` · `svc/invitation` · `svc/settlement` · `svc/settlement-close-deleted` · `svc/settlement-outstanding` · `svc/fx` · `svc/email` · `svc/entitlement` · `svc/revenuecat` · `svc/rc-transfer` revenuecat.transfer · `svc/billing-events` · `svc/payment` · `svc/upload` · `svc/pool` · `svc/pool-netting` · `svc/account-deletion` · `util/event-guards` · `util/notification-helper` · `cfg/firebase` · `cfg/websocket` · `mw/auth` middleware/auth · `REG` regression.test.ts.
- Web `apps/web/src/__tests__/`: `web/api` utils/api · `web/errorMessages` · `web/proFeatures` · `web/unsettled-export` · `web/useSocket` hooks/useSocket · `web/profile` app/profile · `web/firebase-client` · `web/pool-components`, `web/pool-interactions`, `web/pool-phase2`, `web/pool-logic` (pool/). Mobile `apps/mobile/src/__tests__/`: `mob/AuthContext`, `mob/api`, `mob/App`, `mob/FundingStepView`, `mob/PoolScreen`, `mob/pool-svc` services/pool, `mob/PurchaseContext`, `mob/purchases`, `mob/serverPro`, `mob/subscriptionTerms`, `mob/ThemeContext`, `mob/useSocket`, `mob/eventLists`, `mob/proFeatures`, `mob/appleSignIn`, `mob/theme`, `mob/env`, `mob/runtime`, `mob/firebase`, `mob/version-script`. Shared `libraries/shared/src/__tests__/`: `sh/index`, `sh/pool`, `sh/pool-math`, `sh/pool-ui`. UI `libraries/ui/src/__tests__/`: `ui/snapshots`, `ui/ThemeProvider`, `ui/themes`, `ui/Toast`.
- Web E2E names are the spec file in `e2e/tests/` without `.spec.ts`. Maestro flows (`apps/mobile/maestro/flows/`): **AUTH** auth/auth-and-profile · **EVT** events/create-and-manage · **GRP** groups/create-group · **NAV** navigation/history-and-invitations · **SET1** settlement/same-currency-mock · **SETFX** settlement/multi-currency-mock.

## Part 1 — coverage table

### 1. Authentication & User Management

| # | Feature | Unit/API | Web E2E | Mobile E2E | Gap |
|---|---|---|---|---|---|
| 1.2 | Google OAuth sign-in | **F** — svc/auth "links Google to an existing email account…", "creates a new Google user…", "surfaces Google tokeninfo failures"; mob/AuthContext "google login accepts nested token…", "google login rejects when token missing". Route `POST /api/auth/google` itself untested | **P** — auth: "login page shows Google sign-in button", "register page shows Google sign-up button" (render only) | **N** | High (web+mob) |
| 1.4 | JWT access token (1h) | **P** — svc/auth "generates and refreshes tokens for an active session" (1h expiry not asserted); mw/auth Bearer parsing and 401s | **N** — Every spec injects a `mock-` token (helpers/auth.ts); a real JWT is never issued | **N** | Low (mechanism) |
| 1.5 | JWT refresh token (7d) | **P** — svc/auth "generates and refreshes tokens…", "rejects refresh tokens for revoked sessions". Route `POST /api/auth/refresh` untested | **N** | **N** | Low (mechanism) |
| 1.6 | Automatic token refresh | **F** — mob/api "refreshes access token after a 401 and retries once", "uses the current Firebase session before refresh token fallback", "clears stored tokens… when refresh fails"; web/api "uses fresh firebase token and stores it", "dispatches auth event on 401 responses" | **P** — auth: "web session shows lock overlay when auth is invalidated", "session lock overlay can sign the user out cleanly"; event-detail "shows the session lock overlay instead of a misleading not-found state…" (expiry simulated with a window event) | **N** | High (web+mob) |
| 1.7 | User logout | **F** — svc/auth "logs out a single session or all sessions"; mob/AuthContext "logout clears token and resets user…" | **F** — auth: "header sign out returns to unauthenticated state"; navigation: "should sign out and show unauthenticated nav" | **P†** — AUTH signs out from Profile, but only after the stale `dashboard-open-profile` tap | High (mob) |
| 1.8 | Profile — view | **F** — rt/users GET /profile (12 tests incl. authProviders/hasPassword); REG "GET /api/users/profile…" | **P** — auth: "profile page shows sign-in prompt when not authenticated" (signed-out only); navigation: menu-profile visible | **P†** — AUTH asserts "Security", "Email/password" on Profile (after stale id) | Medium (web+mob) |
| 1.9 | Profile — update | **F** — rt/users PUT /profile (7 tests); web/profile "toggles notifications when input is clicked" | **N** | **N** | Medium (web+mob) |
| 1.10 | Mock auth mode (dev) | **F** — mw/auth "should authenticate mock tokens…", "mock token environment guard" (it.each: refused outside local/test, allowed with opt-in) | **n/a** — Used by every spec (helpers/auth.ts) | **n/a** | Low (dev-only) |
| 1.11 | Email/password sign-in | **P** — Routes `POST /api/auth/register` and `/login` have no tests (bcrypt path untested). Client only: mob/AuthContext "login stores token then reloads profile", "register stores token and loads profile", provider-aware messages | **P** — auth: "login page renders supported sign-in options", "login submit is disabled when fields are empty", "register page renders with all form fields", "register submit is disabled…" (no form is ever submitted) | **P** — AUTH registers through the form and sets the PIN (runs today); its later login step sits after the stale id. EVT/GRP/SET1/SETFX register but stall at PIN set-up | High (web+mob) |
| 1.12 | Apple sign-in (iOS) | **F** — rt/auth-apple (4); svc/apple-auth (10: nonce, issuer, key rotation, revoke); svc/auth-apple (7: link by verified email, relay users); mob/appleSignIn (10); mob/AuthContext "apple login…"; rt/users "revokes Sign in with Apple before deleting…" | **n/a** — Not on web | **N** | High (mob; needs the system sheet, manual today) |
| 1.14 | Account deletion | **F** — svc/account-deletion (11: anonymise, admin hand-over, review auto-approval, groups, invitations); rt/users "deletes the signed-in account", "lists what the user still owes or is owed…"; svc/settlement-close-deleted (9); svc/settlement-outstanding (4); sh/index accountDeletionWarning, deletedPaymentParty | **N** | **N** | High (web+mob: close-out as paid / written off) |

### 2. Event Management

| # | Feature | Unit/API | Web E2E | Mobile E2E | Gap |
|---|---|---|---|---|---|
| 2.1 | Create event | **F** — rt/events "should create an event successfully", 400s; svc/event createEvent (+participantIds); REG "POST /api/events should create event" | **P** — events "should fill and submit create event form": success check is vacuous (`url.includes('/events/')` is already true on /events/create) and an error also passes. tier-entitlements "web create-event page updates after tier change broadcast" submits, but `toHaveURL(/\/events\//)` also matches /events/create. All other specs create events through the API | **P†** — EVT, GRP, SET1, SETFX create an event in the app (all stall at PIN set-up first) | High (web+mob) |
| 2.2 | Event list (dashboard) | **F** — rt/events GET list + "supports active/history filtering…"; svc/event getUserEvents (6); web/useSocket "useMultiEventSocket joins and leaves all rooms"; mob/useSocket "joins multiple rooms…" | **P** — events "should show empty state on dashboard when no events" (empty or grid); expense-lifecycle "deleted event disappears from dashboard" (after reload). No live tile update | **P†** — EVT asserts the new event on the dashboard | Medium (web+mob) |
| 2.3 | Event details | **F** — rt/events GET by id; svc/event getEvent (4) | **F** — event-detail "should display event detail page with tabs", "should switch between tabs" | **P†** — EVT taps each tab | Medium (mob) |
| 2.4 | Update event | **F** — rt/events PUT (3) + status guards (5); svc/event updateEvent; REG "PUT /api/events/:id should update event" | **P** — expense-lifecycle "should update event name via API" (API via Playwright); event-detail "should open edit event modal" (opens and closes, never saves) | **N** | High (web+mob) |
| 2.5 | Delete event | **F** — rt/events DELETE + settled/closed guards; svc/event deleteEvent incl. "should terminate pending settlements on delete"; REG | **P** — expense-lifecycle "should delete event via API", "non-admin cannot delete event" (API); "deleted event disappears from dashboard" (deleted via API, UI checked after reload). Delete button and the pending-amount confirmation never used | **N** | High (web+mob) |
| 2.6 | Event status lifecycle | **F** — svc/settlement approveSettlementReview "should transition to payment when all entities approved", approvePayment "…auto-settle event when all transactions complete"; rt/events "should allow closing a settled event", status guards | **P** — settlements "same-currency settlement…": generate via API, then the page shows "Settlement Review"; pool specs reach review → payment → settled through API calls. Close Event never clicked | **P†** — SET1/SETFX expect "Settled" and "Close Event" (no review step in the flow) | High (web+mob) |
| 2.7 | Event types | **F** — rt/events "should return 400 for invalid event type"; sh/index EventType enum | **P** — events form selects "trip"; tier-entitlements selects "event" (creation outcome not reliably asserted) | **N** | Medium (web+mob) |
| 2.8 | Event lock on settle/close | **F** — util/event-guards (10); rt/events status guards (403 in payment/settled/closed, currency change during review); svc/pool "refuses pool changes once the event is in payment" | **N** | **N** | High (web+mob) |
| 2.9 | Hide closed events from dashboard | **P** — rt/events "supports active/history filtering and limit handling"; live removal on close untested | **N** | **N** | High (web+mob) |
| 2.10 | Multi-currency settlement (Pro-gated) | **F** — rt/events-pro "blocks FX event creation…", "allows FX event creation…"; svc/entitlement "assertCapability…" | **F** — tier-entitlements "local tier switch API toggles FX capability for event creation" (API: 403 FEATURE_REQUIRES_PRO then success); "web create-event page updates after tier change broadcast" (UI shows "Multi-currency settlement requires Pro.", submit disabled then enabled) | **P†** — SETFX switches to Pro (`profile-tier-pro`) before an FX event | Medium (mob) |
| 2.11 | Closed events section | **P** — rt/events "emails closed event history from the last 3 months", filter=history; mob/eventLists | **P** — closed-events "renders closed events page actions" (render only; no closed event listed) | **P†** — NAV opens Closed Events, asserts "Email last 3 months", "Showing latest 5 closed events" (selectors valid; relies on a leftover signed-in session) | Medium (web+mob) |

### 3. Participant Management

| # | Feature | Unit/API | Web E2E | Mobile E2E | Gap |
|---|---|---|---|---|---|
| 3.1 | View participants | **F** — rt/events GET participants; svc/event getParticipants (3); REG | **P** — invitations "full flow: create event → invite → accept → verify participant" checks that some `participant-*` row is visible (the creator's row would also pass) | **P†** — EVT opens the Members tab | Medium (web+mob) |
| 3.2 | Add participant (admin) | **F** — rt/events POST participants; svc/event addParticipant (+admins, participantIds); REG | **P** — Used only as API set-up (`addParticipantToEvent`) in settlements, expense-lifecycle, pool specs | **N** | Medium (web+mob) |
| 3.3 | Remove participant | **F** — rt/events DELETE participant; svc/event removeParticipant (self, admin, admins array); REG | **P** — pool-phase2 "Scenario 6": API DELETE refused while the person holds pool money (negative only) | **N** | Medium (web+mob) |
| 3.4 | Creator protection | **F** — rt/events "should return 403 when trying to remove creator"; svc/event "should throw when trying to remove creator" | **N** | **N** | Medium (web+mob) |
| 3.5 | Role-based access | **F** — rt/events role route (4); svc/event isAdmin (4); REG "should return 403 when non-admin tries to send invitation" | **P** — expense-lifecycle "member cannot delete admin expense without admin role", "non-admin cannot delete event" (API via Playwright) | **N** | Medium (web+mob) |
| 3.6 | Participant status tracking | **P** — Invitation statuses tested (svc/invitation accept/decline); the participant status field is not asserted | **N** | **N** | Medium (web+mob) |

### 4. Expense Tracking

| # | Feature | Unit/API | Web E2E | Mobile E2E | Gap |
|---|---|---|---|---|---|
| 4.1 | Create expense | **F** — rt/expenses POST (7); svc/expense "defaults date to today…"; REG "POST /api/expenses should create expense" | **P** — expenses "should fill expense form and submit" passes on either redirect or an error message. Pool spends are created through the form successfully (pool-phase2 "Asking before spending…", pool-phase3) | **P†** — EVT/SET1/SETFX add an expense (stall at PIN set-up first) | High (web+mob) |
| 4.2 | View expenses for event | **F** — rt/expenses GET list; IDOR block "refuses to list an event's expenses to a non-participant", "hides other people's private expenses…" | **P** — Pool specs assert `expense-item-*` rows; no split-expense row is asserted | **P†** — EVT asserts "Lunch …" in the list | High (web+mob) |
| 4.3 | View single expense | **F** — rt/expenses GET by id, "answers 404 (not 403) for someone else's private expense" | **P** — expense-lifecycle "should delete expense via API" (GET after delete, API only) | **N** | High (web+mob) |
| 4.4 | Update expense | **F** — rt/expenses PUT (403, 400 on bad custom splits); svc/expense updateExpense authorization; REG | **P** — expense-lifecycle "should update expense via API" (API); "should navigate to expense edit page…" only checks a form renders | **N** | High (web+mob) |
| 4.5 | Delete expense | **F** — rt/expenses DELETE; svc/expense "should allow admin to delete expense they did not create"; REG | **P** — expense-lifecycle "should delete expense via API", "member cannot delete admin expense…" (API) | **N** | High (web+mob) |
| 4.6 | Equal split | **F** — svc/expense calculateEqualSplits (5); REG "should create expense with equal split" | **P** — expenses: checks `split-type-equal` and submits (outcome not asserted) | **P†** — Default split in EVT/SET1/SETFX | High (web+mob) |
| 4.7 | Ratio split | **F** — svc/expense calculateRatioSplits (8: 2:1, 3:2:5, zero total); REG "ratio split" | **P** — expenses "should change split type to ratio" (clicks, asserts nothing) | **N** | High (web+mob) |
| 4.8 | Custom split | **F** — REG "should create expense with custom split"; rt/expenses custom-sum checks | **P** — expenses "should change split type to custom" (asserts nothing); custom splits only seeded via API | **N** | High (web+mob) |
| 4.9 | Split validation | **F** — rt/expenses "should return 400 if custom splits do not sum to amount" (create and update); REG "should reject custom split that does not sum to total" | **N** — Only "should disable submit when required fields are empty"; `split-mismatch-error` never exercised | **N** | High (web+mob) |
| 4.10 | Event balance calculation | **F** — rt/expenses balances (3); svc/settlement calculateEntityBalances (12) | **P** — settlements asserts "$50.00" on the settlement; balance/summary cards never asserted | **N** | High (web+mob) |
| 4.11 | Calculate splits helper API | **F** — rt/expenses "POST /api/expenses/calculate-splits" (2) | **n/a** — API helper | **n/a** | Low (helper API) |
| 4.12 | Private expenses | **F** — rt/expenses "hides other people's private expenses…"; svc/settlement "should skip private expenses", tile Scenarios B and D | **N** — `expense-private-toggle` never used | **N** | High (web+mob) |
| 4.13 | Entity selection for splits | **F** — svc/settlement "should treat groups as single entities", "should resolve user splits to their group…"; svc/expense "should handle group entity types" | **N** | **N** | High (web+mob) |
| 4.14 | Currency symbols | **P** — mob/theme "has expected currency symbols"; sh/index formatMoney (2) | **F** — Amounts with symbols asserted throughout ("$50.00", "₹6,400.00", "$10.00") | **N** | Medium (mob) |
| 4.15 | Edit expense page | **N** — No web or mobile edit-page test (API update under 4.4) | **P** — expense-lifecycle "should navigate to expense edit page…" (render only; pre-population not checked) | **N** | High (web+mob) |
| 4.16 | "On Behalf Of" expenses | **F** — svc/settlement 6 "on behalf of" cases (single, group payer, multiple entities, empty array); sh/index paidOnBehalfOf shapes | **N** — `expense-on-behalf-toggle` never used | **N** | High (web+mob) |
| 4.18 | Receipt upload / attachment | **F** — svc/upload (6); rt/pools-flows "receipt and proof uploads" (PDF bills, outsiders, oversized); web/pool-interactions ReceiptField (2); mob/pool-svc pickReceiptImage (5) | **P** — pool-phase2 "Asking before spending…" asserts "A receipt is required"; receipts are attached as URLs through the API, never uploaded in the UI | **N** | High (web+mob) |

### 5. Group Management

| # | Feature | Unit/API | Web E2E | Mobile E2E | Gap |
|---|---|---|---|---|---|
| 5.1 | Create group | **F** — rt/groups POST (4); svc/group createGroup (4); REG | **P** — groups "should fill and submit create group form" (nothing asserted after submit), "should disable create group submit when name is empty" | **P†** — GRP (stale ids for the button, name and submit; selects no member, which the modal requires) | Medium (web+mob) |
| 5.2 | View groups | **F** — rt/groups GET event groups; svc/group getEventGroups (4) | **P** — groups "should show empty groups state" (empty or any list) | **P†** — EVT opens Groups tab; GRP asserts the new group | Medium (web+mob) |
| 5.3 | View single group | **F** — rt/groups GET by id; svc/group getGroup (4) | **N** | **N** | Medium (web+mob) |
| 5.4 | Update group | **F** — rt/groups PUT + "Group immutability & representative permissions"; svc/group updateGroup (7) | **N** | **N** | Medium (web+mob) |
| 5.5 | Delete group | **F** — rt/groups DELETE (3) + representative delete; svc/group deleteGroup | **N** | **N** | Medium (web+mob) |
| 5.6 | Add member to group | **F** — rt/groups POST members; svc/group addMember (4) | **N** | **N** | Medium (web+mob) |
| 5.7 | Remove member from group | **F** — rt/groups DELETE member (self, creator, 403); svc/group removeMember (4) | **N** | **N** | Medium (web+mob) |
| 5.8 | Group-as-entity splitting | **F** — svc/settlement "should treat groups as single entities", "should handle group entities in settlements", tile Scenarios A–E; svc/pool "groups as contributing entities" | **N** | **N** | High (web+mob) |
| 5.9 | Group representative | **F** — svc/group "default representative to first member…" (3 fallbacks) | **N** | **N** | Medium (web+mob) |
| 5.10 | Group reuse across events | **F** — rt/groups "POST /api/groups/:groupId/add-to-event" (3); svc/group addGroupToEvent, "include reusable groups found only via eventIds" | **N** | **N** | Medium (web+mob) |
| 5.11 | Group suggestions (70%) | **F** — rt/groups "should suggest groups with >= 70% member overlap"; svc/group suggestGroups (4) | **N** | **N** | Medium (web+mob) |
| 5.12 | Transfer representative | **F** — rt/groups transfer-representative (4) | **N** | **N** | Medium (web+mob) |
| 5.13 | Get user's groups | **F** — rt/groups "GET /api/groups/my"; svc/group getUserGroups | **N** | **N** | Medium (web+mob) |
| 5.14 | Group mutability | **F** — svc/group "should update name, description, memberIds, payerUserId", representative validation | **N** | **N** | Medium (web+mob) |

### 6. Invitation System

| # | Feature | Unit/API | Web E2E | Mobile E2E | Gap |
|---|---|---|---|---|---|
| 6.1 | Invite by email | **F** — rt/invitations POST (5) + "Email sending" (2); svc/invitation; REG | **P** — invitations "should fill and submit invite form" (nothing asserted after submit); lifecycle tests create invitations via API | **P†** — EVT/SET1/SETFX send an invite and see it on the Invitations tab | Medium (web+mob) |
| 6.2 | Invite by phone | **P** — svc/invitation "should create invitation with phone" (route untested for phone) | **N** | **N** | Medium (web+mob) |
| 6.3 | Invite by userId | **F** — svc/invitation "…with userId"; rt/invitations "should not attempt email when inviting by userId only" | **N** | **N** | Medium (web+mob) |
| 6.4 | View user's invitations | **F** — rt/invitations GET /my (+active/history filters, limit, email normalisation) | **P** — invitations "should display invitations page with empty state", "should switch between newest 5 and all active invitations" (no invitation row asserted) | **P†** — NAV: "See all active" / "Show newest 5"; GRP/SET1/SETFX accept from the list (reached via stale `dashboard-open-invitations`) | Medium (web+mob) |
| 6.5 | View event invitations | **F** — rt/invitations GET event; svc getEventInvitations | **P** — API `getEventInvitations` in lifecycle tests; the tab opens but rows are never asserted | **P†** — EVT asserts the invitee email on the tab | Medium (web+mob) |
| 6.6 | Accept invitation | **F** — rt/invitations accept (4, incl. "already accepted by another user"); svc accept; REG | **F** — invitations "should accept invitation when logged in" (UI, "joined"), "should show already-responded state for accepted invitation" | **P†** — GRP/SET1/SETFX tap "Accept" | Medium (mob) |
| 6.7 | Decline invitation | **F** — rt/invitations decline (3); svc decline (3) | **F** — invitations "should decline invitation when logged in", "…already-responded state for declined invitation" | **N** | Medium (mob) |
| 6.8 | Revoke invitation | **F** — rt/invitations DELETE (5); svc revokeInvitation (4); REG | **N** — `revoke-invitation-*` never used | **N** | Medium (web+mob) |
| 6.9 | Token-based invitation link | **F** — rt/invitations GET /token; svc getInvitationByToken | **F** — invitations "should show error when no token…", "…for invalid token", "should display invitation details for valid token" | **n/a** — No deep-link UI (6.16 unsupported) | — |
| 6.10 | Invitation expiry (7 days) | **F** — svc/invitation "should set expiry to 7 days from now", "should throw if invitation has expired"; rt/invitations "should filter out expired invitations when filter=active" | **N** | **N** | Medium (web+mob) |
| 6.11 | Invitation message | **F** — svc/email "should include optional message in email when provided" | **P** — invitations "should fill and submit invite form" types a message (not asserted) | **N** | Medium (web+mob) |
| 6.12 | Invitation role assignment | **P** — svc/invitation "should default role to member"; accepting an admin-role invitation is never tested | **P** — Role select set to "member" (not asserted) | **N** | Medium (web+mob) |
| 6.13 | Email notification on invite | **F** — svc/email sendInvitationEmail (10: mock, Ethereal, SMTP, accept URL); rt/invitations "should store emailSent status…" | **n/a** — Server side | **n/a** | Low (server-side) |
| 6.17 | Assign invitee to group | **F** — rt/invitations "Group assignment" (4) and "Group assignment on accept" (2); REG "…should add to group when groupId set" | **N** | **N** | Medium (web+mob) |
| 6.18 | Invite without group | **F** — rt/invitations "should create invitation without groupId (independent invitee)", "should accept invitation without groupId…" | **P** — All web invitations are group-less (API) and accepted in the UI | **P†** — Group-less invites in EVT/SET1/SETFX | Medium (mob) |

### 7. Settlement & Payments

| # | Feature | Unit/API | Web E2E | Mobile E2E | Gap |
|---|---|---|---|---|---|
| 7.1 | Settlement algorithm (greedy) | **F** — svc/settlement calculateSettlementPlan (5: two entities, minimise, groups, multi-party) | **P** — Indirect: pool specs assert plan legs (e.g. "Netting in a kitty": two payments, both to Priya) | **N** | High (web+mob) |
| 7.2 | Settlement plan generation | **F** — svc/settlement generateSettlement (+edge cases, FX); rt/pools-flows "generic settlement generation on a pool event" | **P** — settlements generates via API, then sees "Settlement Review". `settle-btn` is never clicked (pool events: `reconcile-submit` is clicked) | **P†** — SET1/SETFX tap Settle, then "Generate" (button is now "Settle Now") | High (web+mob) |
| 7.3 | Entity-level balances | **F** — svc/settlement calculateEntityBalances (12); rt/pools-flows reads `/api/settlements/event/:id/balances` | **N** | **N** | High (web+mob) |
| 7.4 | Get event settlements | **F** — svc/settlement getEventSettlements (2) | **P** — settlements: API `getEventSettlements` | **N** | High (web+mob) |
| 7.5 | Pending settlement total | **P** — svc/settlement getPendingSettlementTotal (2); rt/netting "aren't counted as outstanding" (route) | **N** — Delete-confirmation amount never checked | **N** | High (web+mob) |
| 7.6 | Initiate payment (mock) | **F** — svc/settlement initiatePayment (5), retryPayment (7); svc/payment (12) | **P** — settlements: pay via API (`paymentMethod: mock`), "payer can retry an initiated settlement payment" (API). `pay-btn-*` never clicked | **P†** — SET1/SETFX tap pay (it now opens a "Pay Settlement" modal the flows never submit) | High (web+mob) |
| 7.7 | Approve/confirm payment | **F** — svc/settlement approvePayment (5) | **P** — settlements: approve via API; `approve-btn-*` never clicked | **P†** — SET1/SETFX tap `event-detail-settlement-confirm-*` | High (web+mob) |
| 7.8 | Auto-settle | **F** — svc/settlement "should approve payment and auto-settle event when all transactions complete", "…not auto-settle if other transactions remain" | **P** — Pool specs assert status "settled" after API pay/confirm | **P†** — SET1/SETFX expect "Settled" | High (web+mob) |
| 7.9 | Payment mode (event lock) | **F** — util/event-guards; rt/events "should return 403 when event is in payment mode"; svc/settlement "should lock event to payment…" | **P** — pool-phase2 Scenario 6 asserts status "payment" (API) and "1/2 complete"; blocked edits never checked in the UI | **N** | High (web+mob) |
| 7.10 | No-payment edge case | **F** — svc/settlement "should set event to settled when no payments needed", regenerate "…zero settlements" | **P** — pool-phase2 Scenario 3 (pool event) settles with no payments through the UI; the split-expense case and `close-event-no-payments` untested | **N** | High (web+mob) |
| 7.11 | Settlement summary UI | **N** — No web or mobile component tests for settlement cards (PoolPayments covers pool legs only) | **P** — settlements checks "Settlement Review"/"Approval Status" and a final heading of Summary *or* Review; pool-phase2 checks "0/1 complete", "1/2 complete", netted notes, `settlement-details-btn` total. Pay/Confirm buttons never clicked | **P†** — SET1/SETFX settlement cards | High (web+mob) |
| 7.12 | Group payer resolution | **F** — svc/settlement "should resolve group payer userIds in settlements", "should allow group representative to approve for group", "…to regenerate" | **N** | **N** | High (web+mob) |
| 7.13 | Real-time settlement broadcast | **P** — cfg/websocket emitToEvent/emitToUser (generic); no test asserts `settlement:generated`, `settlement:updated` or `event:updated` emissions; web/useSocket "useEventSocket joins room, forwards updates…" | **N** — Specs call `page.reload()` after each change | **N** | High (web+mob) |
| 7.14 | FX rate service | **F** — svc/fx (14: predefined, reverse, EOD cache, fallback); sh/index showsProviderFxRates (5) incl. attribution wording | **P** — settlements "multi-currency settlement with predefined FX…" asserts `fxRate` 82.5 (API). EOD path and the rates credit never exercised | **P†** — SETFX uses EOD (live rates service) | High (web+mob) |
| 7.15 | Dual currency display | **P** — sh/index showsProviderFxRates; no UI component test | **N** — The multi-currency spec never opens a page | **P†** — SETFX (converted amounts never asserted) | High (web+mob) |
| 7.16 | Settlement currency config | **F** — rt/events-pro FX creation; svc/settlement "generateSettlement with FX conversion" (2) | **P** — tier-entitlements fills `settlement-currency-select`, `fx-mode-predefined`, `predefined-fx-rate-input` and submits (redirect assertion vacuous) | **P†** — SETFX taps `create-event-settlement-INR`, `create-event-fx-mode-eod` | High (web+mob) |

### 8. Web Application

| # | Feature | Unit/API | Web E2E | Mobile E2E | Gap |
|---|---|---|---|---|---|
| 8.1 | Login page | **P** — web/errorMessages (Firebase error mapping); page itself untested | **P** — auth: renders, submit disabled when empty, link to register (no submit) | **n/a** — Web only | High (web) |
| 8.2 | Registration page | **N** — Page and `POST /api/auth/register` untested | **P** — auth: renders all fields, submit disabled, Google button (no submit) | **n/a** — Web only | High (web) |
| 8.3 | Forgot password page | **N** — Page and `POST /api/auth/forgot-password` untested | **N** | **n/a** — Web only | High (web) |
| 8.4 | Dashboard page | **P** — web/useSocket useMultiEventSocket | **P** — events "should show empty state…", "should navigate to create event page"; expense-lifecycle "deleted event disappears from dashboard" | **n/a** — Web only | Medium (web) |
| 8.5 | Create event page | **P** — web/pool-components FundingStep (4); web/pool-phase2 FundingStep Pro (2) | **P** — See 2.1 / 7.16 (vacuous success checks); events "should show validation error when submitting empty form" (submit disabled) | **n/a** — Web only | High (web) |
| 8.6 | Event detail page | **P** — web/pool-components PoolTab (pool tab only) | **F** — event-detail tabs tests | **n/a** — Web only | — |
| 8.7 | Create expense page | **P** — web/pool-components PaidWithControl (5), SpendTimingControl | **P** — expenses: fields render, submit tolerates an error, ratio/custom unasserted; pool specs drive paid-with, spend-timing, currency and fx-preview | **n/a** — Web only | High (web) |
| 8.7a | Edit expense page | **N** | **P** — Render only (see 4.15) | **n/a** — Web only | High (web) |
| 8.8 | Invitations page | **N** | **P** — invitations: page renders, newest-5/all toggle | **n/a** — Web only | Medium (web) |
| 8.9 | Profile page | **P** — web/profile "toggles notifications when input is clicked" | **P** — Signed-out prompt only | **n/a** — Web only | Medium (web) |
| 8.10 | Navigation shell | **P** — ui/snapshots "AppShell renders consistently" | **F** — navigation (5 tests) | **n/a** — Web only | — |
| 8.11 | Edit event modal | **N** | **P** — Opens and closes only (`edit-event-save` never clicked) | **n/a** — Web only | High (web) |
| 8.12 | Invite user modal | **N** | **P** — Opens, fills, submits (no outcome asserted); disabled when empty | **n/a** — Web only | Medium (web) |
| 8.13 | Create group modal | **N** | **P** — Opens, fields, disabled, submit (no outcome), cancel | **n/a** — Web only | Medium (web) |
| 8.14 | Toast notifications | **F** — ui/Toast (3) | **N** — No toast ever asserted | **n/a** — Web only | Medium (web) |
| 8.15 | Loading states | **N** | **N** | **n/a** — Web only | Low |
| 8.16a | Real-time updates (WebSocket) | **F** — web/useSocket (5) | **P** — tier-entitlements live tier update; no live expense/group/settlement refresh (specs reload) | **n/a** — Web only | Medium (web) |
| 8.16 | Error states | **P** — web/errorMessages (10); web/api error handling; web/pool-components "offers a retry when loading fails" | **P** — invitations accept-page errors; event-detail session lock vs "Event not found" | **n/a** — Web only | Medium (web) |
| 8.17 | Confirmation modals | **P** — ui/snapshots Modal (3) | **P** — pool-phase2 reject-reason modal (`reason-submit`); delete expense/group, remove participant, close event, settle confirmations never exercised | **n/a** — Web only | High (web) |
| 8.18 | Consistent status badges | **N** | **N** | **n/a** — Web only | Medium (web) |
| 8.20 | Themes (dark mode) | **F** — ui/ThemeProvider (5); ui/themes (2); mob/ThemeContext (6) | **N** | **n/a** — Web only (mobile themes: no E2E either) | Medium (web) |

### 9. Mobile Application

| # | Feature | Unit/API | Web E2E | Mobile E2E | Gap |
|---|---|---|---|---|---|
| 9.1 | React Native + Expo setup | **F** — mob/App "waits for bootstrap…", "shows an initialization error state…"; mob/runtime (5); mob/env (6); mob/firebase (4) | **n/a** — Mobile only | **P** — Every flow launches the app; AUTH reaches the dashboard | Low |
| 9.2 | Mobile authentication | **F** — mob/AuthContext (29) incl. "locks the session after five minutes in the background…"; mob/api token storage | **n/a** — Mobile only | **P** — AUTH: register + PIN set-up run today; sign-out, login, lock/unlock sit after the stale `dashboard-open-profile` | High (mob) |
| 9.3 | Mobile dashboard | **P** — mob/eventLists (1); mob/useSocket | **n/a** — Mobile only | **P†** — All flows wait for `dashboard-create-event-button`; NAV uses the avatar menu | Medium (mob) |
| 9.4 | Mobile event detail | **P** — mob/PoolScreen (11, pool screen only); EventDetailScreen untested | **n/a** — Mobile only | **P†** — EVT/SET1/SETFX | High (mob) |
| 9.5 | Mobile create expense | **N** — CreateExpenseScreen untested (only the receipt picker in mob/pool-svc) | **n/a** — Mobile only | **P†** — EVT/SET1/SETFX | High (mob) |
| 9.6 | Mobile create event | **P** — mob/FundingStepView (4) | **n/a** — Mobile only | **P†** — EVT/GRP/SET1/SETFX | High (mob) |
| 9.7 | Free/Pro tiers | **F** — svc/entitlement (6); mob/proFeatures (5); mob/serverPro (4); mob/AuthContext switchTier; web/proFeatures (4) | **P** — tier-entitlements (4) | **P†** — SETFX switches tier on Profile | Medium (web+mob) |
| 9.10 | Camera receipt capture | **F** — mob/pool-svc "photographs a receipt with the camera", "explains a denied permission", "refuses images over 5MB…" | **n/a** — Mobile only | **N** | Medium (mob) |
| 9.11 | In-app purchase (RevenueCat) | **F** — mob/PurchaseContext (5); mob/purchases (5); mob/subscriptionTerms (9); svc/revenuecat (14); svc/rc-transfer (9); rt/billing (13) | **n/a** — Mobile only | **N** — Store sandbox only | Medium (mob) |

### 10. Shared Libraries

| # | Feature | Unit/API | Web E2E | Mobile E2E | Gap |
|---|---|---|---|---|---|
| 10.1 | Shared TypeScript types | **F** — sh/index "Shared types - Type shape validation" (~25) | **n/a** | **n/a** | Low |
| 10.2 | Shared enums | **F** — sh/index "Shared types - Enums" (12, incl. contract snapshot) | **n/a** | **n/a** | Low |
| 10.3 | Shared DTOs | **F** — sh/index CreateExpenseDto, UpdateEventDto, CreateInvitationDto, UpdateGroupDto… shapes | **n/a** | **n/a** | Low |
| 10.4 | API response types | **P** — sh/index "should create a valid ApiResponse" (PaginatedResponse, ValidationError not covered) | **n/a** | **n/a** | Low |
| 10.5 | UI component library | **P** — ui/snapshots AppShell, Modal, EmptyState; ui/Toast. Button, Input, Card, Select, TextArea, Badge, Tabs untested | **n/a** | **n/a** | Low |
| 10.6 | Theme system | **F** — ui/ThemeProvider (5); ui/themes (2) | **n/a** | **n/a** | Low |

### 12. DevOps & Infrastructure

| # | Feature | Unit/API | Web E2E | Mobile E2E | Gap |
|---|---|---|---|---|---|
| 12.1 | Rush monorepo | **N** | **n/a** | **n/a** | Low |
| 12.2 | Rush custom commands | **N** — — (scripts/regression/run.sh, uncommitted, chains them) | **n/a** | **n/a** | Low |
| 12.3 | Environment variable management | **P** — mob/env (6); mob/runtime (5); web/firebase-client (4) | **n/a** | **n/a** | Low |
| 12.4 | Mock mode (no Firebase) | **F** — cfg/firebase "falls back to in-memory mock services and supports CRUD/query helpers"; web/firebase-client "falls back to mock services when firebase init fails" | **P** — Every Playwright run uses the API in mock mode (indirect) | **n/a** | Low |
| 12.5 | CI/CD pipeline | **N** — — (the workflow runs the suites; nothing tests it) | **n/a** | **n/a** | Low |
| 12.6 | Docker containerization | **N** | **n/a** | **n/a** | Low |
| 12.7 | Production deployment | **P** — mob/version-script (7) covers release version bumping only | **n/a** | **n/a** | Low |

### 13. Notifications

| # | Feature | Unit/API | Web E2E | Mobile E2E | Gap |
|---|---|---|---|---|---|
| 13.1 | In-app toast notifications | **F** — ui/Toast (3) | **N** — No toast asserted | **N** — Mobile uses Alerts; flows dismiss them ("OK") without asserting content | Medium (web+mob) |
| 13.2 | Email notifications (invitations) | **F** — svc/email (32: invitation + notification + bulk, opt-outs); util/notification-helper (7) | **n/a** — Server side | **n/a** | Low (server-side) |

### 14. Analytics & Reporting

| # | Feature | Unit/API | Web E2E | Mobile E2E | Gap |
|---|---|---|---|---|---|
| 14.1 | Expense summary per event | **F** — rt/expenses balances; svc/settlement "entity-aware tile calculations" Scenarios A–E | **N** — Summary cards never asserted | **N** | High (web+mob) |
| 14.3 | Export to CSV / PDF | **P** — web/unsettled-export (1); mob/unsettled-payments-export (1); rt/events and rt/invitations history-email (2 each) | **P** — closed-events "Email last 3 months" and invitations "View history (email me)" buttons visible (never clicked); /unsettled-payments untested | **P†** — NAV asserts "Email 3-month history", "Email last 3 months" visible | Medium (web+mob) |

### 15. Entitlements & Billing Controls

| # | Feature | Unit/API | Web E2E | Mobile E2E | Gap |
|---|---|---|---|---|---|
| 15.1 | Shared entitlement model | **F** — sh/index hasActivePro (4); svc/entitlement (6) | **n/a** | **n/a** | Low |
| 15.2 | RevenueCat webhook ingestion | **F** — rt/billing (13 incl. TRANSFER); svc/revenuecat (14: EXPIRATION, refund, pause, grace); svc/rc-transfer (9); svc/billing-events (3) | **n/a** — Server to server | **n/a** | Low (server-side) |
| 15.3 | Internal entitlement switch route | **F** — rt/internal-ent (10) | **F** — tier-entitlements uses `/api/internal/entitlements/switch` and asserts 200 | **P†** — SETFX via the Profile tier control | Low (dev-only) |
| 15.4 | WebSocket tier update broadcast | **F** — rt/internal-ent "switches tier and emits websocket event"; rt/billing "processes webhook and emits tier update"; web/useSocket "useUserSocket subscribes to notification and tier update events" | **F** — tier-entitlements "web create-event page updates after tier change broadcast" | **N** | Medium (mob) |
| 15.5 | Local tier switching (mobile + web) | **F** — mob/AuthContext "switchTier calls internal endpoint and refreshes profile"; mob/AuthContext.override | **P** — Switched via API, never through the profile tier controls | **P†** — SETFX taps `profile-tier-pro` | Low (dev-only) |
| 15.6 | Staging/TestFlight mobile-only switching | **F** — rt/internal-ent "blocks switching other user in staging/internal env", "allows mock users…", "blocks non-tester real users in staging" | **n/a** — Env-specific | **n/a** | Low |
| 15.7 | Production manual switch disabled | **F** — rt/internal-ent "blocks internal tier switch in production even when feature flag is enabled" | **n/a** — Env-specific | **n/a** | Low |
| 15.8 | Non-prod real payment guardrails | **F** — svc/payment "should stay mocked in non-prod auto mode even when useRealGateway=true without API opt-in", "should allow opt-in live flow in non-prod when explicitly enabled" | **P** — settlements passes `useRealGateway=false` and asserts `paymentMethod: mock` | **n/a** | Low |

### 16. Money Pooling (Functional.md)

| # | Feature | Unit/API | Web E2E | Mobile E2E | Gap |
|---|---|---|---|---|---|
| 16.1 | Funding choice at event creation | **F** — rt/pools-flows "creating events" (7); sh/pool-ui "funding choice → create-event payload" (8); web/pool-components FundingStep (4); web/pool-phase2 FundingStep Pro (2); mob/FundingStepView (4) | **P** — tier-entitlements "web create-event page marks \"Several of us\" as Pro for a free user" (clicks `funding-pool`, `funder-*`). No pool is ever created through the form: every pool spec seeds via API | **N** | High (web+mob) |
| 16.2 | Pool presets | **F** — sh/pool "pool presets" (5); sh/pool-math reconcileCycle per use case; rt/pools-flows kitty and budget; rt/pools-rec fund and treasury | **P** — Behaviour of all five exercised with UI settle-up: Kitty ("Netting in a kitty"), Fund ("Scenario 5"), Treasury ("Scenario 7A"), Collection ("Scenario 7B"), Budget ("Scenario 1/3/6"). All created via API | **N** | High (web+mob) |
| 16.3 | Hybrid events | **F** — rt/pools-flows "marks an event hybrid…", "settles a hybrid event in ONE plan…", "refuses peer-to-peer expenses in a pure pool event but accepts them in a hybrid"; web/pool-components "also offers a regular split in a hybrid event" | **P** — pool-phase2 "Scenario 7C": settle-up in UI, one plan asserted; the split dinner is added via API | **N** | High (web+mob) |
| 16.4 | Add a pool to an existing event | **F** — rt/pools-flows "adds a pool to an existing split-expenses event, keeping its expenses", "will not add a sponsor budget…"; rt/pools-pro "adding a group pool… needs Pro" | **n/a** — API only (no screen) | **n/a** — API only | Low (API-only) |
| 16.5 | Contributions | **F** — rt/pools-flows "contributions" (9: handshake, partial, reject, waive, tiers); svc/pool guard rails; web/pool-interactions "lets a member mark their contribution paid…", "…confirm a claimed payment for a different amount", "…record a payment, reject a claim, or waive dues"; mob/pool-svc | **N** — Dues are always paid through the API helper `payIn`; the only UI check is that `mark-paid-*` is absent for a mid-month joiner | **N** | High (web+mob) |
| 16.6 | Top-ups | **F** — rt/pools-flows "self-confirms the custodian's own top-up…", "a member's top-up only unpauses once the custodian confirms it"; web/pool-interactions "adds money: straight in for the custodian, marked paid for a member" | **P** — `pool-add-money` visible (part-month test); top-ups only via API helper `addMoney` | **N** | High (web+mob) |
| 16.7 | Pool expenses ("Paid with") | **F** — rt/pools-flows "spending from the pool" (12); rt/pools-adv "how a pool spend was paid" (8); sh/pool-ui "Paid with" options (8); web/pool-components PaidWithControl (5) | **F** — pool-phase2 "Asking before spending needs no receipt, and reads \"Requested\" until it is approved" (form: `paid-with-pool_card`, `spend-timing-*`, list text); pool-phase3 (spend through the form) | **N** | High (mob) |
| 16.8 | Reimbursement claims | **F** — rt/pools-flows "pays a reimbursement through a settlement leg without settling or locking the event", "requires a receipt…", "auto-approves the custodian's own claim…", claim edits; sh/pool-ui reimbursement status (4) | **P** — Scenario 6: claim created and approved via API, then "plus ₹800.00 for Taxi (claim)" and the "Reimbursed" badge in the UI; pool-phase3 only checks the claim option is offered | **N** | High (web+mob) |
| 16.9 | Graduated overdraft | **F** — sh/pool-math overdraft blocks (~22); rt/pools-flows "warns, then pauses, then resumes only once the overdraft is repaid plus more"; web/pool-components PoolTileStatus; sh/pool-ui balance meter (5) | **P** — Scenario 3: pause warnings in the pay-back modal; latch and `POOL_OVERDRAFT_BLOCKED` checked via API. No warning on the expense form, no meter assertions | **N** | High (web+mob) |
| 16.10 | Approvals & spender controls | **F** — rt/pools-flows "sponsor budget (UC-2)" (authorised spenders, groups, caps, receipts, approval); sh/pool canApproveDraw (3); web/pool-interactions SpenderPermissions (4) | **P** — Scenario 1 rejects spends in the UI (`reject-warning`, `reason-submit`) and Give money offers only the authorised spender; pool-phase3 approver approves in the UI; "Asking before spending" checks the receipt rule. Caps and "above an amount" threshold not exercised | **N** | High (web+mob) |
| 16.11 | Transparency ledger | **F** — web/pool-components "shows the cycle, meter, totals, arrears, spenders and activity"; web/pool-interactions "browses a past cycle read-only…"; sh/pool-math computeCycleTotals, computeArrears | **P** — `pool-holdings` and `pool-loans` text asserted; meter, contributions, arrears, movements and cycle history never asserted | **N** | High (web+mob) |
| 16.12 | Recurring cycles | **F** — rt/pools-rec (20); sh/pool-math dispositions and carried credits | **F** — Scenario 5 closes the month in the UI (`pool-close-cycle`) and asserts the carried ₹7,000 next month; Scenario 7A closes in the UI | **N** | High (mob) |
| 16.13 | Membership changes | **F** — rt/pools-rec "pays out a flatmate who leaves in credit…", "drops a flatmate who leaves before any money moves…", "rolls the cycle when someone joins after money has moved…"; sh/pool-math splitForMembershipChange (7) | **P** — "Joining a Fund after money has moved…" (UI message); 7A joining keeps one cycle (API). No leaver flow | **N** | High (web+mob) |
| 16.14 | Fair settle-up | **F** — sh/pool-math reconcileCycle fairness, share bases, invariants (property tests); rt/pools-flows "settling up a kitty (UC-3)" (7) | **P** — Preview figures and per-person rows asserted in the UI (Kitty, 7B, 5). A non-payer's share and deficit cover ("asks who covered a shortfall") never exercised | **N** | High (web+mob) |
| 16.15 | Real-time pool updates | **P** — rt/pools-flows "alerts the custodian over the socket when a flagged expense is recorded" (`pool:alert`); `pool:updated` emission and pool-tab refresh untested | **N** — Specs re-open the tab | **N** | High (web+mob) |
| 16.18 | Rejected spends owed back | **F** — rt/pools-flows "rejected spends already paid with the pool's money (§9.2)" (4); sh/pool-ui repaymentStatus (2) | **F** — Scenario 1 (reject in the UI with warning; repayment leg; "Repaid" badge); "A close with only a repayment open goes to Review with one payment" | **N** | High (mob) |
| 16.19 | Money added by others (loan / gift) | **F** — rt/pools-flows "money added by others (§10)" (4); sh/pool-math lentTopUps, §10 worked example; web/pool-components "lets a member add money as a gift", "labels loans and gifts" | **P** — Loan added via API; "Ravi lent the budget money…" and its repayment at settle-up asserted. Gift never exercised | **N** | High (web+mob) |
| 16.20 | Handing money to spenders | **F** — rt/pools-adv advances, returns, closing (~20); sh/pool-math computeHoldings (8, property); web/pool-phase2 hand-over tests; mob/PoolScreen "gives money to a spender", "lets a spender confirm money handed to them and return what they hold" | **F** — Scenario 1 (Give money, confirm in the UI, holdings text); Scenario 6 (cancel in the UI); returns via API | **N** | High (mob) |
| 16.21 | "Several of us" is Pro | **F** — rt/pools-pro (8); sh/pool-ui "Several of us" (4); web/pool-phase2 FundingStep Pro; mob/FundingStepView; mob/proFeatures | **F** — tier-entitlements "only Pro users can create a \"Several of us\" pool" (API), "…marks \"Several of us\" as Pro for a free user" (UI); Scenario 5 lapse | **N** | Medium (mob) |
| 16.22 | Paying back early | **F** — rt/pools-adv "paying back early (§10.6)" (3); sh/pool-math earlyRepaymentImpact (4); web/pool-phase2 (3); mob/PoolScreen "pays a lender back early" | **F** — Scenario 3 (`pay-back-*`, both warnings); Scenario 6 (too-much check) | **N** | High (mob) |
| 16.23 | Netting at settle-up | **F** — rt/netting (20); svc/pool-netting (4); sh/pool-ui settle-up preview rows (5) | **F** — Scenario 1, "Netting in a kitty", Scenario 6 (folded/separate lists, regenerate after forgiving), "A close with only a repayment open…" | **N** | High (mob) |

### 16P. Money Pooling — phase rows (design doc §0, Phase 3 proposal)

| # | Feature | Unit/API | Web E2E | Mobile E2E | Gap |
|---|---|---|---|---|---|
| P1 | "Settle now" on a pool event reconciles the pool first (§0) | **F** — rt/pools-flows "reconciles the pool first instead of silently ignoring pool money", "still refuses when pool draws are undecided" | **N** — `settle-btn` on a pool or hybrid event never tried | **N** | High (web+mob) |
| P2a | Phase 2: leaving or changing custodian while money is held | **F** — rt/pools-adv "leaving and changing the custodian (D7, D8)" (3), "a member leaving a rolling fund hands back what they hold…" | **P** — Scenario 6: removal refused, error text asserted (API via Playwright) | **N** | High (web+mob) |
| P2b | Phase 2: changing how a spend was paid | **F** — rt/pools-adv "changing the method is checked again like an amount change…", "an approved spend moved off held money…", "turning card spends off later…" | **P** — Scenario 6 changes `paidFrom` with an API PUT and checks the summary | **N** | High (web+mob) |
| P2c | Phase 2: next month's dues keep tiers | **F** — rt/pools-rec "carries each member's dues into the next month: tiers stay, newcomers and waived dues get the default" | **P** — Scenario 7A closes in the UI; tiers checked via API | **N** | High (web+mob) |
| P2d | Phase 2: free-trial eligibility (§12.3) | **F** — mob/PurchaseContext (5); mob/purchases (5); mob/subscriptionTerms resolveIntroOffer (5) | **n/a** — Mobile only | **N** — Store sandbox only | Medium (mob) |
| P3-A | Phase 3: spender list in "Several of us" pools | **F** — rt/pools-p3 "A." (5: listed vs claim-only, default off, groups + limits, Give money, chosen at creation); sh/pool-ui "Phase 3: who may spend…" (5); web/pool-interactions SpenderPermissions; mob/FundingStepView "a group pool can be limited…"; mob/PoolScreen | **P** — pool-phase3: Anita ticks `spender-*` and saves; Priya (not listed) sees only `paid-with-pool_reimbursement`. `spendersMode` set via API, not the create-event Advanced option; limits and Give-money filtering not exercised | **N** | High (web+mob) |
| P3-B | Phase 3: approver permission | **F** — rt/pools-p3 "B." (3: approves others not own; can't settle/close/change settings/confirm money; dropped on leaving); sh/pool-ui; mob/PoolScreen "an approver sees spends waiting for approval…" | **F** — pool-phase3: approver set via `approver-*`, approver approves via `approve-draw-*` (her limits are API-only) | **N** | High (mob) |
| P3-C | Phase 3: pool spends in another currency | **F** — rt/pools-p3 "C." (5: today's rate, predefined first, threshold on converted, edit keeps rate, Pro + no-rate error); "telling the apps…"; sh/pool-ui "shows what was entered and the rate" | **F** — pool-phase3: USD spend through the form, `fx-preview` text, stored amounts, "$10.00" in the list (predefined rate only; EOD and no-rate error not exercised) | **N** | High (mob) |
| P3-D | Phase 3: split expenses in another currency | **F** — rt/pools-p3 "D. … is converted with its splits before balances are worked out" | **P** — expenses "should fill expense form and submit" only asserts the currency picker is disabled for a free organiser; the Pro conversion path is never exercised | **N** | High (web+mob) |
| P3-E | Phase 3 as built: "Spends need approval" after creation | **F** — web/pool-interactions "…approvers and approval are set here too"; mob/PoolScreen "…and when spends need approval" | **N** — Approval mode only set at creation via API | **N** | High (web+mob) |

## Part 2 — Maestro staleness

Flows: `apps/mobile/maestro/flows/**` (last changed 30 Mar 2026; EVT and GRP last changed 26 Feb, SET1 and SETFX 24 Feb). Every `id:` was checked against `testID=` / `testID:` in `apps/mobile/src` (tests excluded), with template ids expanded: `create-event-currency-${cur}` (CURRENCIES has USD), `create-event-settlement-${cur}` (INR), `event-detail-tab-${tab}` (expenses, participants, groups, invitations), `event-detail-settlement-pay-${s.id}` and `-confirm-${s.id}` (match the flows' `.*` regex ids). 44 unique ids are used; **39 resolve, 5 don't**.

### Ids that no longer exist, per flow

| Flow | Stale ids (line numbers) | Count |
|---|---|---|
| auth/auth-and-profile.yaml | `dashboard-open-profile` (l.12 optional; **l.60 and l.88 required**) | 1 |
| events/create-and-manage.yaml | `dashboard-open-profile` (l.10, optional); `event-detail-create-group-button` (l.132, required wait) | 2 |
| groups/create-group.yaml | `dashboard-open-profile` (l.10, l.88, optional); `dashboard-open-invitations` (l.120, required); `event-detail-create-group-button` (l.154); `create-group-name-input` (l.156); `create-group-submit-button` (l.160 required, l.163 optional) | 5 |
| navigation/history-and-invitations.yaml | none | 0 |
| settlement/same-currency-mock.yaml | `dashboard-open-profile` (l.8, l.91, optional); `dashboard-open-invitations` (l.125 assert, l.127 tap) | 2 |
| settlement/multi-currency-mock.yaml | `dashboard-open-profile` (l.8, l.127 optional; **l.46 required**); `dashboard-open-invitations` (l.161) | 2 |

What replaced them:

| Stale id | Current screen |
|---|---|
| `dashboard-open-profile` | Removed 26 Feb 2026 (commit 8585548, "rebranded app") when the dashboard header became an avatar menu. Tap `dashboard-avatar-menu`, then `menu-profile` (sign-out is also in the menu as `menu-signout`). |
| `dashboard-open-invitations` | Same commit: `dashboard-avatar-menu` → `menu-invitations`. |
| `event-detail-create-group-button` | Never existed in `apps/mobile/src` (no git history). The button is `event-detail-open-create-group-modal` (EventDetailScreen.tsx:1262). |
| `create-group-name-input`, `create-group-submit-button` | Never existed. The Create Group modal (EventDetailScreen.tsx ~1422) has no testIDs on its name field, member checkboxes or Create button; they need adding. |

### Other things in the flows that no longer match the screens

1. **Mandatory PIN set-up (since 16 Mar 2026, commit 5def2b1).** `App.tsx` shows `SetupPinScreen` whenever a user is signed in and no PIN is stored (`AuthContext.syncLocalUnlockState`). Only AUTH handles `setup-pin-*`. EVT (l.43), GRP (l.43, and after each relaunch), SET1 (l.41) and SETFX (l.41) wait for `dashboard-create-event-button` straight after registering and will time out. **This stops four flows before they create anything.**
2. **Settlement review step (added 26 Feb 2026).** "Settle Now" puts the event in `review`. Every participant must tap "Approve Settlement" (no testID) before the event moves to `payment` and `event-detail-settlement-pay-*` appears. SET1 and SETFX go straight from generating to paying.
3. **"Generate" is gone.** SET1 l.184 and SETFX l.218 tap "Generate"; the confirm dialog's button is now "Settle Now" (EventDetailScreen.tsx:326–329). The "Generate" text match only hits the variable name `lastSettlementGeneratedAt`. The "Settlements" assert right after (SET1 l.185, SETFX l.219) would see the "Settlement Review" section instead.
4. **Paying opens a modal.** `event-detail-settlement-pay-*` ("I've Paid") now opens a "Pay Settlement" modal (payee methods, reference, proof, note). The status only becomes `initiated` after the modal's own "I've Paid" button (no testID). SET1 l.214 and SETFX l.251 assert "initiated" straight after the first tap.
5. **"Retry Payment" is gone** (removed 1 Mar 2026, commit ce05e2d). SET1 l.215–216 assert and tap it. A failed payment now shows "Mark Paid Again", and an initiated one has no retry on mobile.
6. **Create Group needs a member.** The modal refuses with "Group name and at least one member are required." (EventDetailScreen.tsx:616). GRP never selects one.
7. **NAV assumes a signed-in, unlocked session** (`clearState: false`). In a full run after the other flows it would land on PIN set-up or the Unlock screen. Its own ids and texts ("See all active", "Email 3-month history", "Show newest 5", "Email last 3 months", "Showing latest 5 closed events") all still exist.
8. **SETFX depends on live rates.** It picks EOD (`create-event-fx-mode-eod`), so it calls open.er-api.com. `create-event-fx-mode-predefined` and `create-event-fx-rate-input` exist for a deterministic run.
9. **No flow covers anything built since March 2026:** the funding step and Pool screen (all of §16 and Phase 2/3), settlement review approvals, edit or delete of events and expenses, group membership, Profile edits, Pro upgrade, Unsettled Payments, or Apple sign-in.
10. Note: the committed runner passes the `flows/` folder to Maestro, which doesn't recurse into subfolders by itself. An uncommitted `flows/config.yaml` (`flows: ["*/*"]`, added today) makes it pick up the subfolders.

Where each flow stops today: AUTH at l.59–60 (`dashboard-open-profile`, after register and PIN set-up succeed); EVT, GRP, SET1 and SETFX at the first dashboard wait after registering (PIN set-up); NAV at l.7 unless a signed-in, unlocked session is left over.

## Part 3 — top 15 gaps

All 15 are High priority; they're ordered by how much money-flow risk each removes.

| # | Gap (rows) | Suggested end-to-end test (one line) |
|---|---|---|
| 1 | Split-expense settlement is never driven through the web UI (7.2, 7.6–7.8, 7.11, 2.6, 2.9, 2.11) | **Playwright** `settlement-ui.spec.ts`: admin clicks `settle-btn`, both users click `approve-settlement-btn`, payer clicks `pay-btn-{id}`, payee clicks `approve-btn-{id}`, assert "settled", then `close-event-btn` and the event moves from /dashboard to /closed-events. |
| 2 | Mobile settlement flows can't run (7.x, 2.6, 9.4) | **Maestro** rewrite `settlement/same-currency-mock.yaml`: handle `setup-pin-*` after every sign-in, reach invitations via `dashboard-avatar-menu` → `menu-invitations`, tap "Settle Now", both users "Approve Settlement", submit the "Pay Settlement" modal, confirm, assert "Close Event"; drop "Retry Payment". |
| 3 | Expense creation and split validation only half-tested in the UI (4.1, 4.6–4.10, 14.1) | **Playwright**: in a 3-person event add equal, ratio and custom expenses through the form, assert each row and the summary cards; enter custom splits that don't add up and assert `split-mismatch-error` and a disabled submit. |
| 4 | "On behalf of" has no E2E (4.16) | **Playwright**: add an expense with `expense-on-behalf-toggle` + `on-behalf-entity-*`, settle, and assert the payer is owed the full amount and has no share. |
| 5 | Private expenses have no E2E (4.12) | **Playwright**: user A adds a private expense with `expense-private-toggle`; user B's list and balances exclude it, A's include it. |
| 6 | Multi-currency settlement UI untested; create-event success checks are vacuous (7.14–7.16, 2.1, 2.10) | **Playwright**: Pro user creates a USD→INR predefined-rate event through the form (assert the URL is `/events/<id>`, not `/events/create`), adds an expense, settles, asserts the INR amount and FX rate on the settlement card. Fix the URL checks in `events.spec.ts` and `tier-entitlements.spec.ts` at the same time. |
| 7 | Edit/delete of events and expenses only via API (2.4, 2.5, 4.4, 4.5, 4.15, 8.11, 8.17) | **Playwright**: save an event edit via `edit-event-save`; edit an expense on its edit page (pre-filled values, save, list updated); delete it via `delete-expense-*` and the confirm modal; delete an event with a pending settlement via `delete-event-btn` and check the amount shown before `confirm-delete-btn`. |
| 8 | Event lock in payment/settled mode untested end to end (2.8, 7.9) | **Playwright**: once an event reaches payment, assert the add-expense, edit and invite controls are gone and a direct API edit returns 403. |
| 9 | No pool is ever created through the UI (16.1, 16.2, P3-A) | **Playwright**: create a Kitty via the form (`funding-pool` → `funder-contributors` → `preset-trip_kitty` → amount → Advanced "Only people I choose") and assert the Pool tab, dues and spender mode. |
| 10 | Contributions, top-ups and gifts only via API (16.5, 16.6, 16.19) | **Playwright**: member marks dues paid with reference and proof (`mark-paid-*`), custodian confirms a partial amount (`confirm-*`) and waives another, a member adds money as a gift and as a loan; assert the ledger and settle-up figures. |
| 11 | Reimbursement claims and receipt upload only via API (16.8, 4.18) | **Playwright**: member files "My money — claim it back" with a receipt uploaded through the receipt field, custodian approves in the UI, pays via `pool-leg-pay-*`, member confirms via `pool-leg-confirm-*`, badge reads "Reimbursed". |
| 12 | No mobile pool coverage at all (16.x, P3-x, 9.4, 9.6) | **Maestro** new `pool/budget.yaml`: create a "Just me" budget on Create Event, invite a spender, Give money (`pool-give-money`, `handover-*`), spender confirms and spends from it, custodian approves (`approve-*`) and settles up (`pool-settle-up`, `reconcile-submit`). |
| 13 | No real sign-in anywhere; forgot-password untested (1.11, 1.7, 8.1–8.3, 9.2) | **Playwright** against the Firebase Auth emulator: register through the form, sign out, sign in, request a password reset. **Maestro**: fix AUTH (`dashboard-avatar-menu` → `menu-profile`) so its login, lock and unlock steps run again. |
| 14 | Groups as split/settlement entities untested end to end (5.8, 7.12, 4.13) | **Playwright**: create a group with a designated payer through the modal (assert the row), split an expense with the group as one entity, settle, assert the group's payer gets `pay-btn-*` and the representative approves the review. |
| 15 | Phase 3 split expenses in another currency and approver limits not in the UI (P3-D, P3-B) | **Playwright**: Pro organiser adds a USD split expense in an INR event (fx-preview, splits and balances in INR); an approver who isn't an admin sees no Settle up or Close month. |

Next in line: overdraft warnings on the expense form and the meter (16.9); live updates for settlements and pools (7.13, 16.15); account deletion and closing a deleted user's payment (1.14); group edit and membership (5.4–5.7, Medium); invitation revoke, admin role and invite-into-group (6.8, 6.12, 6.17, Medium); repairing EVT and GRP in Maestro.
