# Release: money pooling, Phases 1–3

The steps to ship money pooling (Phases 1, 2 and 3, with their bug fixes) to production: merge into
`stage`, deploy the API and the web app, then build the iOS and Android apps for the stores.

**The order matters: API first, then web, then the apps.** The new apps send fields and call endpoints that
the current production API rejects (its schemas are strict). The 1.0.40 app keeps working with the new API.

What ships, in one line each:
- **Phase 1:** "Pool money → Just me" budgets (free), top-ups as a loan or a gift, already-paid versus asking-first spends.
- **Phase 2:** "Several of us" pools (Kitty, Fund, Treasury, Collection) for Pro, hand-overs, netting at settle-up, early repayment, and a 7-day free trial for Pro.
- **Phase 3:** a spender list and approvers in "Several of us" pools, and expenses entered in another currency (Pro).
- **Fixes:** taps blocked by toasts in the app, toasts behind sheets on Android, the "on behalf of" payer's missing expense, and renaming an event during settlement review.

Nothing in this release changes Firestore indexes, security rules or native modules. Pool queries are
single-field, so Firestore's automatic indexes cover them.

---

## 1. Merge into `stage`

The branches are stacked: Phase 2 contains Phase 1, and Phase 3 contains both. None of them is missing
anything from `stage`.

Open three pull requests on GitHub, **one at a time and in this order**, and merge each with **Create a
merge commit**. Don't squash or rebase: that would rewrite the commits the next branch is built on, so its
pull request would show them again and conflict.

1. `feature/money-pooling-enhancements-phase1` → `stage`:
   https://github.com/vkarkhanis/splitex-app/compare/stage...feature/money-pooling-enhancements-phase1
2. `feature/money-pooling-enhancements-phase2` → `stage`, after step 1 is merged. It then shows only Phase 2's commits.
   https://github.com/vkarkhanis/splitex-app/compare/stage...feature/money-pooling-enhancements-phase2
3. `feature/money-pooling-enhancements-phase3` → `stage`, after step 2.
   https://github.com/vkarkhanis/splitex-app/compare/stage...feature/money-pooling-enhancements-phase3

The Phase 3 pull request is the first to run CI (`.github/workflows/ci.yml`, added in Phase 3): type
checks, every unit and API test, and the browser tests. Wait for it to pass before merging. If it fails,
fix it on the Phase 3 branch.

A single pull request from Phase 3 into `stage` would merge the same code. Three keep each phase's
history separate.

**Then, on the Mac you build and deploy from** (from the repository root). The deploy and build
scripts upload or build the **working tree**, so it must be a clean checkout of `stage`:

```bash
git checkout stage
git pull
git status
```

`git status` must show nothing to commit. Then, from `traxettle-rush/` (drop the
`RUSH_ALLOW_UNSUPPORTED_NODEJS=1` prefix on Node 24):

```bash
RUSH_ALLOW_UNSUPPORTED_NODEJS=1 node common/scripts/install-run-rush.js install
RUSH_ALLOW_UNSUPPORTED_NODEJS=1 node common/scripts/install-run-rush.js build --to @traxettle/shared --to @traxettle/ui
bash scripts/regression/run.sh full
```

Optional, about 25 minutes per platform. This needs the simulator and the emulator, and uses the debug
test app and local servers only:

```bash
bash scripts/regression/run.sh mobile
```

---

## 2. Deploy the API: staging, then production

From `traxettle-rush/`, on the clean `stage` checkout. You need `gcloud` signed in, plus `jq`, which the
scripts use to package the Firebase key. **Without `jq`, the API silently runs on in-memory mock
data.** Check that it's installed:

```bash
jq --version
```

**Staging:**

```bash
bash scripts/api-deployment/deploy-staging-gmail.sh
```

```bash
curl https://traxettle-api-staging-943648574702.us-central1.run.app/health
```

```bash
gcloud run services logs read traxettle-api-staging --project traxettle-staging --region us-central1 --limit 100 | grep -i "firebase"
```

The logs must say *Initializing Firebase with real credentials*, never *using mock services*.

Then try it with a TestFlight or Play internal build switched to staging (tap "Traxettle" 7 times on the
sign-in screen): sign in, open an event, add an expense.

**Production:** the same, with the production scripts. The production settings come from
`.traxettle/api-prod.env`, which `configure-prod.sh` created on the Mac you deployed from before.

```bash
bash scripts/api-deployment/deploy-prod-gmail.sh
```

```bash
curl https://traxettle-api-prod-ncwutlgtga-uc.a.run.app/health
```

```bash
bash scripts/api-deployment/verify-deployed-api-env.sh production
```

Check the production logs for *Initializing Firebase with real credentials* the same way, with
`traxettle-api-prod` and the production project id.

**Right after the production deploy**, check the 1.0.40 store app on a phone. Open an event, add an
expense, and settle up: it should work as before. This is check R4 in
[MONEY_POOLING_PHASE2_E2E.md](../runbook/MONEY_POOLING_PHASE2_E2E.md).

**Undo:** Cloud Run keeps the previous revision. In the Cloud Run console, open the service →
**Revisions**, and send 100% of traffic to the previous revision, or run:

```bash
gcloud run services update-traffic traxettle-api-prod --project <prod-project-id> --region us-central1 --to-revisions <previous-revision>=100
```

---

## 3. Deploy the web app: staging, then production

From `traxettle-rush/`, on the same clean `stage` checkout, after the API of the same environment.
Each script builds the Next.js app from the repository into Cloud Run (with `Dockerfile.web`), then
deploys Firebase Hosting in front of it. It needs `gcloud`, `firebase` (Firebase CLI) and `rsync`.

```bash
bash scripts/web-deployment/deploy-web-staging.sh
```

Open the staging site, sign in, open an event and the Pro page, then:

```bash
bash scripts/web-deployment/deploy-web-prod.sh
```

The production settings come from `.traxettle/web-prod.env`. If that file isn't on this Mac, create it
first with `bash scripts/web-deployment/configure-prod.sh`; it asks for each value.

**Check production web** (R1 in the Phase 2 plan), with a free account:
- Create event → **Pool money**: *Several of us* shows locked, with **PRO** and *🔒 Pro feature*.
- The Pro page lists **Group pools** and **Expenses in another currency**.
- The user guide (`/traxettle/`) has the Pool money section.

If the Cloud Run part finishes but the script seems to stop, see §11.5 of
[DEPLOYMENT_RUNBOOK.md](DEPLOYMENT_RUNBOOK.md).

---

## 4. Version number

Store builds set the version themselves (see "Versions" in
[DEPLOYMENT_CHANNELS.md](DEPLOYMENT_CHANNELS.md)). Left alone, this release would be **1.0.41**. For a
feature release this size, start **1.1.0** first, from `traxettle-rush/apps/mobile`:

```bash
npm run version:bump -- minor
```

```bash
npm run version:show
```

Both platforms then ship 1.1.0. Commit the version files after the builds (step 7).

---

## 5. iOS: build, upload, TestFlight

From `traxettle-rush/apps/mobile`. **Quit Xcode first.** The script writes the production settings,
runs `expo prebuild --clean`, archives a Release build and uploads it to App Store Connect:

```bash
APPLE_TEAM_ID=<team id> bash scripts/build-ios.sh testflight
```

If you sign with your App Store profile (no registered device), add `IOS_PROVISIONING_PROFILE="<profile name>"`.
To archive in Xcode instead, use `build-ios.sh xcode` and then `build-ios.sh xcode-done`; see section 5 of
[DEPLOYMENT_CHANNELS.md](DEPLOYMENT_CHANNELS.md).

**If the upload fails, upload from Organizer, then record the build yourself.** The script records the
iOS version and build number in `release-versions.json` only when its own upload succeeds. (`xcode-done`
records it when you archive in Xcode.) A failed upload keeps the archive.

1. In Xcode: **Window → Organizer → Archives** → the archive for this version and build →
   **Distribute App → App Store Connect → Upload**.
2. Record the build. The build number is in the archive's name (`Traxettle-<version>-<build>.xcarchive`)
   and in App Store Connect → TestFlight:

   ```bash
   bash scripts/version.sh record ios <build number>
   ```

3. Check that iOS now shows this version as last shipped:

   ```bash
   npm run version:show
   ```

Don't rerun `testflight` for the same build: it would bump the build number and archive again.

When the build has processed in TestFlight (10–30 minutes), install it and check:
- It opens on **production**. Sign in, see your events, and open the Pro screen: it lists **Group pools** and **Expenses in another currency**.
- With a free account: *Several of us* is locked on Create event (R2).
- Switch to staging (7 taps on "Traxettle"): create a Kitty as a Pro test account and add a USD spend.

Don't buy anything in TestFlight with a real account. Purchases there use the Sandbox.

---

## 6. Android: build, internal testing, production

From `traxettle-rush/apps/mobile`. It needs the release keystore, `android/gradle.properties.local` and
`google-services.prod.json`, as for 1.0.40:

```bash
bash scripts/build-android.sh production
```

The file to upload is `android/app/build/outputs/bundle/release/app-release.aab`.

1. Play Console → Traxettle → **Testing → Internal testing → Create new release** → upload the `.aab` →
   release notes → **Review** → **Start rollout**.
2. Install it from the internal-testing link and run the same checks as for iOS (step 5).
3. Then **Promote release → Production**. Consider a staged rollout (for example 20%), which you can halt.

---

## 7. Record the release

After both builds have uploaded.

**First check that both builds are recorded,** from `traxettle-rush/apps/mobile`:

```bash
npm run version:show
```

- "Last shipped" must show **1.1.0 for iOS** (with its build number) and **1.1.0 for Android** (with its `versionCode`).
- If iOS still shows the previous version, its upload went through Organizer (or `xcode-done` wasn't run): record it as in step 5.
- If the builds ran on different Macs, each Mac records only its own platform. Commit both records, or
  record the missing one with `version.sh record`.

Then, from the repository root:

1. **Commit the version files** the builds changed, on a small branch (as with PR #23), then open a pull request into `stage`:

   ```bash
   git checkout -b release/1.1.0
   git add traxettle-rush/apps/mobile/app.json traxettle-rush/apps/mobile/package.json traxettle-rush/apps/mobile/android/app/build.gradle traxettle-rush/apps/mobile/release-versions.json
   git commit -m "chore: release 1.1.0"
   git push -u origin release/1.1.0
   ```

   If `release/1.1.0` already exists (one platform was committed first), commit the other platform's
   record on it and push. The open pull request picks it up.

   Pull on the other Mac before building there, or it reuses the version and Play rejects the `versionCode`.
2. **Tag the release commit**: the tip of `release/1.1.0`, which is the code you built plus its version
   files. A hotfix branched from that tag then builds 1.1.1. From the code commit alone, `version.sh` would
   still see the previous version.

   ```bash
   git fetch origin
   git tag ios-v1.1.0 origin/release/1.1.0
   git tag android-v1.1.0 origin/release/1.1.0
   git push origin ios-v1.1.0 android-v1.1.0
   ```

3. **Bring `main` up to date:** a pull request from `stage` into `main`, as with PR #13.

---

## 8. Store listings and submission

The texts below are within each store's limits (counted 2026-11-26). Don't mention the free trial in the
App Store text until the trial offer exists (step 9).

### Google Play Console

**Release notes** (the release's *What's new*, 475 of 500 characters):

```text
• Pool money with your group: a trip kitty, shared fund, club treasury or collection (Pro; people you invite join free)
• Choose who can spend from a pool, and name approvers
• Enter a cost in the currency you paid in; it's converted for you (Pro)
• Hand cash to spenders and see who holds what
• Settling up combines refunds, repayments and claims into fewer payments
• Expense dates, and a filter to hide private expenses
• Fixes, including taps that paused after a message
```

**Main store listing → Full description:** paste `traxettle-rush/play-store-assets/full-description.txt`
(3,545 of 4,000 characters). The short description stays as it is.

### App Store Connect (version 1.1.0)

**What's New** (891 of 4,000 characters):

```text
• Pool money with your group: a trip kitty, a shared fund, a club treasury or a collection. Group pools come with Traxettle Pro; people you invite join free.
• Choose who can spend from a pool, and name approvers who check spends and claims.
• Enter a cost in the currency you paid in, such as dollars on a rupee trip. Traxettle converts it to the event's currency and shows both amounts (needs the organiser's Pro).
• Hand cash to the people who spend, and see who holds what.
• Pay back money someone lent the pool before it closes.
• Settling up now combines refunds, repayments and unpaid claims into one set of payments.
• Every expense has a date, and the expense list can hide private expenses.
• Fixes: taps no longer pause for a few seconds after a message appears; whoever pays "on behalf of" others now sees that expense; an event can be renamed while its settlement is in review.
```

**Description:** the Play text without its last Pro line (*Free trial for new subscribers, where offered*),
3,497 of 4,000 characters. Add that line once the trial offer exists.

**Promotional Text** (optional; 148 of 170 characters, and it can change without a new build):

```text
New: pool money with your group, choose who can spend and approve, and enter costs in the currency you paid in. Group pools come with Traxettle Pro.
```

**Traxettle Pro → Pro Yearly → App Store Localization → Description** (48 of 55 characters):

```text
Unlimited events, multi-currency and group pools
```

A changed subscription description sends the subscription to review with the version: put the version,
then the subscription, into one draft with **Add for Review**.

**Also:**
- **Promo image:** `app-store-assets/pro-yearly-promo-1024-group-pools.png` (local only, not in git).
- **Review notes:** [APP_REVIEW_RESPONSE.md](APP_REVIEW_RESPONSE.md) §3 (3,289 of 4,000 characters). Fill in the second demo account.
- **Age rating:** answer the new questions (due January 2027), as the next submission requires.
- **Screenshots:** the current ones don't show the Upgrade screen, so they can stay.

**RevenueCat:** the product descriptions in [REVENUECAT_SETUP.md](../utility/REVENUECAT_SETUP.md), if set.

---

## 9. After both stores have the new version live

1. **Free trial:** create the 7-day offers in App Store Connect and Play Console, then run checks T1–T7 and
   A1–A5 straight away. Both are in [MONEY_POOLING_PHASE2_PLAN.md](../utility/MONEY_POOLING_PHASE2_PLAN.md)
   §10A.4–10A.5. Older installed builds start offering the trial too.
2. **Release-day checks** R1–R4 in [MONEY_POOLING_PHASE2_E2E.md](../runbook/MONEY_POOLING_PHASE2_E2E.md), on production.
3. **Phase 3 on production,** with your own Pro account and a free one: a kitty with **Only people I choose**
   and an approver, and a spend in USD. Delete the test event afterwards.

**If the app has a serious problem:** halt the staged rollout in Play Console. On iOS, pause a phased
release, or remove the version from sale and submit a fix. The API and web can go back to their previous
revisions (steps 2 and 3), but only while no app depending on the new API is out.
