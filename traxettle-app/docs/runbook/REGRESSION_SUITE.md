# Regression suite

The automated checks that keep the whole app working while features and fixes are added. The aim:
**for any change, you hand-test only what changed; the suite covers the rest.**

All commands run from `traxettle-rush/`.

---

## 1. The rule for every change (definition of done)

A feature or bug fix is done when:

1. **It has tests at the right level** (§5 says where):
   - a **unit or API test** for the logic or the endpoint;
   - for anything a user does on a screen, a **Playwright** test (web) and, for flows that matter on mobile, a **Maestro** flow;
   - a **bug fix** adds a test that fails without the fix.
2. **`rush test:regression` passes locally** (or `bash scripts/regression/run.sh`), and **CI is green** on the pull request.
3. **The hand test covers only the change:** its own steps, as in the money-pooling hand-test plans. If a change touches mobile screens, also run `rush test:regression:mobile`.
4. **The coverage map (§7) is updated** when a feature is added, so the next person knows it's protected.

---

## 2. What runs

| Layer | Tool | Where | What it checks |
|---|---|---|---|
| Type checks | `tsc --noEmit` | API, web, mobile | The code compiles; shared types line up across apps |
| Unit and API tests | Jest | `libraries/shared`, `libraries/ui`, `apps/api`, `apps/web`, `apps/mobile` | Money maths, rules, every API route (against an in-memory Firestore), components and screens |
| Web end-to-end | Playwright | `e2e/tests` | The web app in Chrome against a real local API: sign-in, events, expenses, groups, invitations, settlements, tiers, pools |
| Mobile end-to-end | Maestro | `apps/mobile/maestro/flows` | The iOS or Android app against a local API and the Firebase emulators |

## 3. Commands

| Command | Runs | Time |
|---|---|---|
| `rush test:regression:quick` | Build shared libraries, type checks, every unit suite | ~3 min |
| `rush test:regression` | Quick, plus every Playwright test | ~7 min |
| `rush test:regression:mobile` | The Maestro flows (needs the test app on a simulator or emulator, §6) | ~10 min |
| `rush test:regression:all` | Everything above | ~17 min |

Each command is a tier of `scripts/regression/run.sh`, and you can run it directly:

```bash
bash scripts/regression/run.sh full
```

Run just some steps with `--only`, choosing from: `build typecheck shared ui api web mobile e2e maestro`.

```bash
bash scripts/regression/run.sh --only api,e2e
```

How it behaves:
- **Every step runs** even when an earlier one fails, so one run shows every problem.
- **Logs and a summary** are saved in `artifacts/regression/<timestamp>/` (git-ignored). The summary is also printed at the end, with the test counts.
- **The browser test report** opens with `(cd e2e && npx playwright show-report)`.
- **If Playwright's own Chromium isn't installed,** the runner uses the installed Google Chrome. Set `PLAYWRIGHT_CHANNEL=chrome` to choose that yourself.
- **The exit code is 1** if anything failed.

Single suites while you work:

```bash
(cd apps/api && npx jest routes/pools.phase3)
```

```bash
(cd e2e && npx playwright test tests/pool-phase2.spec.ts)
```

## 4. CI

`.github/workflows/ci.yml`, at the **repository root**:
- **When:** every pull request (any target branch, including phase-to-phase pull requests), every push to `main` or `stage`, and manually from the Actions tab.
- **Job `unit`:** type checks and every unit suite. Mobile is blocking.
- **Job `e2e`:** installs Chromium and runs every Playwright test. On failure, it keeps the HTML report and traces as the `playwright-report` artifact for 14 days.
- **Maestro isn't in CI:** it needs simulators. Run it locally before releasing a mobile build.

> Until 2026-11-24 the workflow lived in `traxettle-rush/.github/`, where GitHub doesn't look, so CI had never run. It's now at the root.

---

## 5. Where to add tests for a change

| Change | Add |
|---|---|
| Money maths, rules, formatting (shared) | `libraries/shared/src/__tests__/*.test.ts` |
| An API route or service | `apps/api/src/__tests__/routes/*.test.ts`. Pool tests use `helpers/poolHarness.ts` (`makePro` for a Pro creator). |
| A web component or page | `apps/web/src/__tests__/**`, plus a Playwright test if it's a user flow |
| A mobile screen | `apps/mobile/src/__tests__/**`, plus a Maestro flow if it's a key mobile flow |
| A user flow on web | `e2e/tests/<area>.spec.ts`. Set up data through the API (`e2e/helpers/api.ts`, `helpers/pool.ts`) and click only the steps being tested. |
| A user flow on mobile | `apps/mobile/maestro/flows/<area>/<flow>.yaml`. Sign up with `subflows/sign-up.yaml`; use `testID`s, not text, where you can. |
| A bug | A test that reproduces it, at the lowest level that can, before fixing it |

Conventions:
- **Every screen element a test touches gets a `testID`** (mobile) or **`data-testid`** (web).
- **Tests create their own data,** with unique names, and don't depend on each other's leftovers.
- **No real network calls.** API tests block `fetch`, and FX rates come from a seeded cache or the event's predefined rate.
- **Name a test by the behaviour it protects,** e.g. "refuses a spend in another currency unless the organiser has Pro".

---

## 6. Mobile (Maestro)

**One-time setup on a Mac:**
1. Maestro CLI: `curl -Ls "https://get.maestro.mobile.dev" | bash`. It installs to `~/.maestro/bin/maestro`.
2. JDK 21 for the Firebase emulators: `brew install openjdk@21`. The scripts find it in `/opt/homebrew/opt/openjdk@21`; you don't need to change your `PATH`.
3. The Firebase CLI is fetched with `npx` when needed. Or install it with `npm i -g firebase-tools`.

**Build and install the test app,** once, and again after native changes:

```bash
bash apps/mobile/maestro/scripts/build-test-app.sh ios
```

```bash
bash apps/mobile/maestro/scripts/build-test-app.sh android
```

It's a **Debug** build:
- **It loads its JavaScript from Metro,** which the runner starts with the local test settings: local API, Firebase emulators, free tier, mock payments. So code changes need no rebuild.
- **Its built-in defaults point at the local API** (`localhost:3001`, or `10.0.2.2:3001` on Android).
- **iOS** builds for the `iPhone 17 Pro` simulator. Pass another name as the second argument.
- **Android** needs an emulator already running.
- **Without the real Firebase configs,** the iOS build uses the repo's example config. Google Sign-In isn't tested.

> **Never test with a Release build.** A Release build ignores the `EXPO_PUBLIC_*` settings: `src/config/env.ts` reads them as `(process.env as any).X`, which Release bundles don't inline. So it doesn't know it's a local build, and like every store build it uses the **production** API unless the 7-tap **Switch to Staging API** is on (`getResolvedApiBaseUrl` in `src/api.ts`). On 2026-11-24 that sent test runs to production. Store builds are unaffected: they're meant to default to production, and the one TestFlight build is promoted to the App Store.

**Run the flows:**

```bash
rush test:regression:mobile
```

What the runner does:
1. Starts the Firebase emulators, the API on port 3001, and Metro.
2. **Runs a safety check first.** The app tries to sign in as a made-up account, which changes nothing anywhere. The runner stops unless that attempt reaches the local API, so a test app wired to staging or production can't create data there. (`MAESTRO_SKIP_BACKEND_CHECK=true` turns the check off; don't.)
3. Cleans test data, runs every flow in `maestro/flows`, then cleans up again.

Options:
- **Pick a device:** `MAESTRO_DEVICE=<id>`.
- **Run only some folders:** `MAESTRO_FLOWS="pools settlement"`.
- **Screenshots and logs for failures:** `MAESTRO_MODE=artifacts`. They go to `apps/mobile/maestro/artifacts/`.

**Writing a flow:**
- **Start with `runFlow: ../../subflows/sign-up.yaml`.** It signs out anyone left over, registers a fresh user, and handles the PIN, the iOS "Save Password?" prompt and the first-run walkthrough. Then the flow works alone and in any order.
- **Other subflows:** `sign-in`, `create-split-event`, `invite`, `accept-invitation`, `open-event`, `add-expense`, `switch-to-pro` and `go-back`. Maestro's own `back` only works on Android.
- **iOS gotchas:**
  - Match text that sits inside a tappable card as part of a label (`".*Lunch ${output.runId}.*"`): iOS reads a card's texts as one label.
  - A backdrop that wraps a modal's content needs `accessible={false}`, or iOS hides everything inside it.
  - Don't use `hideKeyboard`: on iOS it can tap the screen. After typing text, close the keyboard with `pressKey: Enter`. A number pad has no Enter key: tap the field's label instead (`tapOn: "Amount \\(.*\\)"`). An open keyboard covers the buttons below it, and a tap there lands on a key.
  - After `scrollUntilVisible`, add `waitForAnimationToEnd` before tapping. A tap while the list is still gliding, or while a sheet is sliding up, only stops the movement.
- **The app's alerts:** `src/context/FeedbackContext.tsx` replaces `Alert.alert`.
  - A one-button alert ("Success", "Approved") becomes a toast, so there's no OK button to tap. Check the result on screen instead (`.*You have approved.*`, `.*Current: PRO.*`). Some flows still have an `optional` `tapOn: "OK"`; it does nothing.
  - **While a toast is showing, taps do nothing** (see §8). Before tapping after a step that shows one, `runFlow: ../../subflows/wait-for-toast.yaml`. `sign-out` and `go-back` already start with it.
  - An alert with choices becomes a dialog. Tap its buttons by id: `confirm-button-<label>`, e.g. `confirm-button-settle-now`, `confirm-button-close`, `confirm-button-sign-out`. Matching the label's text also matches the button behind the dialog and the dialog's title.
  - `flows/config.yaml` sets `snapshotKeyHonorModalViews: false`. Without it, iOS sometimes reported an empty screen while a dialog was open. The runner passes that file with `--config`, because Maestro reads it by itself only when given the whole folder.
- **Debug app gotchas:**
  - React Native's "Open debugger to view warnings" banner covers the bottom of the screen and takes taps meant for the buttons under it, though screenshots don't show it. `index.js` hides it when Metro runs with `EXPO_PUBLIC_E2E=true`, which the runner sets.
  - The runner sets both the plain and the `_EMULATOR_` API addresses (`EXPO_PUBLIC_API_URL_IOS` and `EXPO_PUBLIC_API_URL_EMULATOR_IOS`, and the Android ones). With the Firebase emulators on, the app reads the `_EMULATOR_` ones, and without them it falls back to port 3002.
  - The runner refuses to start if something already listens on its ports (the API port, 8081 for Metro, the emulators' 8080, 9099 and 9199): a leftover server would answer instead of this run's. It stops everything it started when it ends.

---

## 7. Coverage map

The 2026-11-24 audit mapped all 166 shipped features in Functional.md, plus the pool phases, to their
tests: [REGRESSION_COVERAGE_AUDIT_2026-11-24.md](REGRESSION_COVERAGE_AUDIT_2026-11-24.md).
- **Unit and API tests** covered 130 features fully and 30 partly.
- **End-to-end** coverage was thin. Web money flows were set up through the API instead of clicked, and the mobile flows no longer ran at all.

These were added afterwards.

### Where each area stands

Last full check on 2026-11-24: all 7 Maestro flows passed on the iOS simulator (iPhone 17 Pro, Debug app, local API and emulators), in about 19 minutes. The Android flows haven't been run yet.

| Area | Unit/API | Web (Playwright) | Mobile (Maestro) |
|---|---|---|---|
| Sign-up, sign-in, sign-out, PIN lock | ✅ | Mock sign-in only (`auth.spec`) | ✅ `auth/auth-and-profile` |
| Events: create, edit, delete, close, lock in payment | ✅ | ✅ `events`, `event-edit-delete` | ✅ `events/create-and-manage` (create) |
| Expenses: equal, ratio, custom, on behalf, private | ✅ | ✅ `expense-splits`, `expenses` | ✅ equal split (`add-expense` subflow) |
| Groups as one entity in splits and settlement | ✅ | ✅ `groups-settlement`, `groups` | ✅ `groups/create-group` (create) |
| Invitations: send, accept, decline | ✅ | ✅ `invitations` | ✅ accept (`groups`, `settlement`) |
| Settlement: settle, approve, pay, confirm, close | ✅ | ✅ `settlement-ui` | ✅ `settlement/same-currency-mock` |
| Multi-currency settlement (set rate) | ✅ | ✅ `settlement-ui` | ✅ `settlement/multi-currency-mock` |
| Tiers and Pro gating | ✅ | ✅ `tier-entitlements` | ✅ Pro switch (`switch-to-pro`) |
| Pools: create, dues, top-ups, gifts, claims, receipts | ✅ | ✅ `pool-ui` | ✅ `pools/kitty` (create, pay in, spend, settle up) |
| Pools Phase 2: hand-overs, early repayment, netting | ✅ | ✅ `pool-phase2` | — |
| Pools Phase 3: spender list, approvers, other currency | ✅ | ✅ `pool-phase3` | — |
| Navigation, invitations inbox, closed events | ✅ | ✅ `navigation`, `closed-events` | ✅ `navigation/history-and-invitations` |

### Still not covered end to end
- **Real sign-in against Firebase Auth** (web register and login forms, forgot password). Web tests use mock tokens. This needs the Auth emulator in the Playwright setup.
- **Live updates** (sockets) for settlements and pools, and **overdraft warnings** on the expense form.
- **Account deletion** and closing a deleted user's payment.
- **Group edit and membership changes,** invitation revoke, the admin role, and inviting someone into a group.
- **Mobile:** Phase 2 and 3 pool flows, edit and delete, Profile edits, Pro upgrade screen, Unsettled Payments, Apple sign-in.

Add tests for these as the areas change. Update the table when you add coverage.

---

## 8. Known issues the suite has found

| Found | Issue | Where | Status |
|---|---|---|---|
| 2026-11-24 | **The person who pays "on behalf of" others doesn't see that expense** on the web event page: they aren't in its splits, so `isSharedWithMyEntity` hides it, and Total Expense excludes it | `apps/web/src/app/events/[eventId]/page.tsx` | Open: test `expense-splits.spec.ts` is `fixme` |
| 2026-11-24 | **No event edit can be saved during settlement review:** the Edit dialog always sends the currency, and the API refuses any currency field in review | web Edit event dialog and `apps/api` events route | Open: test `event-edit-delete.spec.ts` is `fixme` |
| 2026-11-24 | **Release builds ignore `EXPO_PUBLIC_*` settings** (`env.ts` reads them as `(process.env as any).X`, which Release bundles don't inline). Store builds don't depend on them: they choose production or staging with hard-coded URLs and the 7-tap switch. But a Release *test* build can't be pointed at a local API. `eas.json`'s staging-profile settings and its production placeholder URL go unused | `apps/mobile/src/config/env.ts`, `apps/mobile/eas.json` | By design for store builds. Tests use a Debug build plus the preflight check. Tidying `eas.json` is optional |
| 2026-11-24 | **The iOS dashboard menu and date picker** were one merged element to VoiceOver and to tests | `DashboardScreen.tsx`, `DateField.tsx` | Fixed (`accessible={false}` on the backdrops) |
| 2026-11-24 | **About one API run in six fails a single, different test** (seen: `join failed: 404 {}` in `pools.flows`, and a `users` profile test). Tests already run one at a time | `apps/api` tests | Mitigated. One cause found: on a busy machine a route flow test could pass Jest's 5-second limit, and the timed-out test's open request then kept Jest from exiting, hanging the run. `jest.config.ts` now allows 20 seconds per test and exits when the tests finish (`forceExit`). Failed tests also retry once and log the first failure (`jest.setup.ts`) |
| 2026-11-24 | `settlements.spec.ts` "multi-currency settlement with predefined FX" silently skipped: its user wasn't Pro | `e2e/tests/settlements.spec.ts` | Fixed: the test switches its user to Pro first |
| 2026-11-24 | `events.spec.ts` "should show empty state" could run before the dashboard loaded | `e2e/tests/events.spec.ts` | Fixed: a fresh user, and it waits for the empty state |
| 2026-11-24 | **On iOS the app ignores taps for about 3 seconds after any toast** ("Success", "Approved", "Recorded"...). Toasts are drawn in a full-screen React Native `Modal`, which catches every touch even where it's transparent. Proven on the simulator: a tap on the Dark theme works normally and does nothing while the "Switched to PRO" toast is up. Android likely behaves the same. | `apps/mobile/src/context/FeedbackContext.tsx` | Open. Maestro flows wait for toasts to clear (`subflows/wait-for-toast.yaml`) |
