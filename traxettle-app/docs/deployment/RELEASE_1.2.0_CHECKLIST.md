# Release 1.2.0 — the whole path, in order

Everything needed to ship 1.2.0, from switching on the free trial to both stores having 1.2.0 live.
Follow it top to bottom.

**What 1.2.0 is:** the Expo SDK 58 upgrade, built with Xcode 27 and the iOS 27 SDK, which App Store
uploads require from April 2027. No screens or rules change.

**What users notice:**
- **iOS:** ready for iOS 27, with full-screen support on iPad and iPhone Duo. It now needs **iOS 16.4 or
  later** (was 15.1); people on older iOS stay on 1.1.0.
- **Android:** edge-to-edge screens, and Android's own launch screen (the app icon on white).
- **Both:** cancelling Google sign-in no longer shows an error.
- **Both:** new Pro subscribers get a 7-day free trial. This is switched on in the stores
  ([B](#b-switch-on-the-7-day-free-trial-after-110-is-live)), so it also works in 1.1.0.

**Doesn't change:** the API and the web app. The 1.2.0 branch has no API, web or shared-library changes
([A4](#a4-confirm-there-is-nothing-to-deploy)).

**Separate from 1.2.0: the expense-order fix.**
- **What it is:** an API-only fix, so the expenses in an event come back in the same order every time.
  It's being made on `fix/expense-list-order`, from `stage`.
- **How it ships:** merged into `stage`, then an **API deploy** to staging and production
  ([L](#l-deploying-an-api-fix-from-stage)). No app or web build is needed: every app version, 1.1.0
  included, shows the order the API returns.
- **When:** whenever it's ready, before or after 1.2.0. It doesn't hold up any step here.

Background: [EXPO_58_IOS_27_UPGRADE_PLAN.md](../utility/EXPO_58_IOS_27_UPGRADE_PLAN.md) (§10 has the
milestone A and B results), [EXPO_58_HAND_TEST.md](../runbook/EXPO_58_HAND_TEST.md),
[XCODE_27_AND_MACOS_27.md](../runbook/XCODE_27_AND_MACOS_27.md),
[COMMAND_REFERENCE.md](../runbook/COMMAND_REFERENCE.md).

---

## Status on 2026-11-27

| Item | State |
|---|---|
| Milestone A (Expo 58, this Mac) | Done: all suites, Maestro 9/9 iOS and 9/9 Android |
| Milestone B (Xcode 27.2, other Mac) | Done except the release candidate: no build fixes needed, Maestro 9/9 on iOS 27, Release check on iPhone, iPad and Duo, Android signing key matches |
| iOS 1.1.0 | In App Review (sent 2026-11-26, automatic release) |
| Android 1.1.0 | Live on Google Play |
| 7-day trial | Not created on either store |
| `chore/expo-58` | Pushed; `stage` merged in at `31ca382` |
| Expense-order fix (API only) | In progress on `fix/expense-list-order`; ships as an API deploy ([L](#l-deploying-an-api-fix-from-stage)) |

## The order

| Step | Where | When |
|---|---|---|
| [A. Before you start](#a-before-you-start) | other Mac | first |
| [B. Switch on the 7-day free trial](#b-switch-on-the-7-day-free-trial-after-110-is-live) | consoles, your phone, the Mac | once each store has 1.1.0 live; before submitting 1.2.0 |
| [C. Final automated checks](#c-final-automated-checks) | other Mac | any time before D |
| [D. iOS release candidate](#d-ios-release-candidate-other-mac-xcode-27) | other Mac, Xcode 27 | after C; you can upload while 1.1.0 is in review |
| [E. iOS hand test](#e-ios-hand-test) | the Mac's TestFlight app, simulators | after D |
| [F. Android build and hand test](#f-android-build-internal-testing-and-hand-test-other-mac) | other Mac, your phone | after the **final** iOS build |
| [G. iPhone Duo screenshots](#g-iphone-duo-screenshots-other-mac) | other Mac | any time before I |
| [H. Merge into `stage` and tag](#h-merge-into-stage-and-tag) | GitHub, either Mac | after E and F pass |
| [I. Store listings and submission](#i-store-listings-and-submission) | consoles | after B and H; iOS only once 1.1.0 is released |
| [J. After release](#j-after-release) | everywhere | when 1.2.0 is live |
| [K. If something goes wrong](#k-if-something-goes-wrong) | | |
| [L. Deploying an API fix from `stage`](#l-deploying-an-api-fix-from-stage) | other Mac, main checkout on `stage` | whenever `stage` has API changes (A5); independent of the apps |

**Never run Maestro against a Release, TestFlight or Play build.** They open on production.

---

## A. Before you start

On the **other Mac**, in a terminal. Every later section assumes these two variables are set, so set them
again in any new terminal window. Change the paths if your checkout is elsewhere:

```bash
MAIN="$HOME/regular-workspace/Traxettle"; WT="$MAIN-expo58"
```

### A1. Get the latest branch

The docs for this release were committed and pushed from this Mac. Pull them:

```bash
cd "$WT" && git status -sb && git pull
```

`git status -sb` should show `## chore/expo-58...origin/chore/expo-58` and no changed files before the
pull.

```bash
git diff --name-only HEAD@{1} HEAD
```

If that lists anything other than docs, see
[XCODE_27_AND_MACOS_27.md §2](../runbook/XCODE_27_AND_MACOS_27.md#2-after-pulling-or-switching-branch-what-to-rerun)
for what to rerun.

### A2. Check Xcode 27 is in use

```bash
xcodebuild -version | head -1; xcrun --sdk iphoneos --show-sdk-version
```

Expect `Xcode 27.2` and `27.2`. If you see 26, set it for this terminal and check again:

```bash
export DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer
```

### A3. Check the version files

```bash
cd "$WT/traxettle-rush/apps/mobile" && bash scripts/version.sh
```

Expect `Version (app.json): 1.1.0`, last shipped 1.1.0 on both stores, and `Next TestFlight build:
1.1.1`. Step D1 changes that to 1.2.0.

### A4. Confirm there is nothing to deploy

```bash
cd "$WT" && git fetch origin && git diff --stat origin/stage...origin/chore/expo-58 -- traxettle-rush/apps/api traxettle-rush/apps/web traxettle-rush/libraries
```

It should print nothing. If it prints files, stop: the API or web changed, and they must be deployed
before the apps ([COMMAND_REFERENCE §12](../runbook/COMMAND_REFERENCE.md#12-deploying-the-api-and-web)).

### A5. Check for API fixes on `stage` that production doesn't have yet

Production runs the API as of the 1.1.0 release (tag `ios-v1.1.0`). List the API and web changes `stage`
has gained since:

```bash
cd "$WT" && git fetch origin && git diff --stat ios-v1.1.0 origin/stage -- traxettle-rush/apps/api traxettle-rush/libraries/shared traxettle-rush/apps/web
```

- **Nothing printed:** production is up to date.
- **Files printed** (for example the expense-order fix, `apps/api/src/routes/expenses.ts`): deploy them
  with [L](#l-deploying-an-api-fix-from-stage), then come back. The apps don't depend on them, so this can
  also wait until after 1.2.0.

After an L deploy, this check keeps listing the same files, because it compares with 1.1.0. Note the date
of each deploy in L5 so you know which ones are done.

---

## B. Switch on the 7-day free trial (after 1.1.0 is live)

Do this per store, as soon as **that store** has 1.1.0 live. Do it before you submit 1.2.0, so the 1.2.0
App Store text can mention the trial. The app already handles the trial (since 1.0.40), so nothing needs
building.

These checks use **your own accounts**, not test accounts. Cancelling an Android trial during the free
week costs nothing, and trials started in TestFlight are free.

### B1. Check the stores have 1.1.0 live

**App Store**, from any terminal (6823113088 is Traxettle's App Store id):

```bash
curl -s "https://itunes.apple.com/lookup?id=6823113088&country=in" | python3 -c 'import json,sys; r=json.load(sys.stdin)["results"][0]; print(r["version"], r["currentVersionReleaseDate"])'
```

It must print `1.1.0` and a date. Before then, it prints the previous version, so wait.
App Store Connect shows **Ready for Distribution** for 1.1.0 at the same time.

**Google Play:** Play Console → Traxettle → **Test and release → Production**. The 1.1.0 (42) release
shows **Available on Google Play** at 100%. It has been live since 2026-11-26.

### B2. Check production gives the app its RevenueCat settings

```bash
curl -s https://traxettle-api-prod-ncwutlgtga-uc.a.run.app/api/config | python3 -c 'import json,sys; c=json.load(sys.stdin)["data"]["revenueCatConfig"]; print({k: ("set" if v else "EMPTY") if "Key" in k else v for k, v in c.items()})'
```

Expect `{'googleApiKey': 'set', 'appleApiKey': 'set', 'proEntitlement': 'traxettle-pro', 'offering':
'default'}`. If a key shows `EMPTY` or a value differs, stop: the trial won't reach the app.

### B3. Android: create and activate the offer

1. Play Console → Traxettle → **Monetize with Play → Products → Subscriptions** → `pro_yearly_1` →
   **Base plans and offers**.
2. If an offer `trial-7d` is listed, go to step 4. If not, **Add offer** and pick the yearly base plan:
   - **Offer ID:** `trial-7d` (it can't be changed later);
   - **Eligibility:** *New customer acquisition* → *Never had this subscription*;
   - **Phases → Add phase → Free trial → 7 days**;
   - **Tags:** none. Never `rc-ignore-offer`, which hides the offer from the app.
3. **Save**.
4. Open `trial-7d` → **Activate**. It reaches every installed copy of the app, 1.1.0 included, within
   about an hour.

### B4. Android: check it

On your Android phone, with your own Google account in the Play Store:
1. Open Traxettle, sign in with an account that has never had Pro → Profile → **Upgrade to Pro**.
2. Expect **"Start free trial"** and *"Free for your first week, then ₹299/year"* (or your country's
   price).
   - If it shows the normal price, wait an hour, close and reopen the app.
   - If it still does, deactivate the offer (B9) and stop.
3. **Optional full check:** tap **Start free trial**. Google's sheet shows a 7-day free trial; within
   about a minute Profile shows Pro. Then cancel at once: Play Store → profile picture → **Payments &
   subscriptions → Subscriptions → Traxettle Pro → Cancel subscription**. You keep Pro until the free week
   ends and pay nothing.

### B5. iOS: create the introductory offer

Only once B1 shows 1.1.0 live on the App Store. Apple's offer goes live for everyone the moment it
starts.

1. App Store Connect → Apps → Traxettle → **Monetization → Subscriptions → Traxettle Pro → Pro Yearly**.
2. Under **Subscription Prices**, **Create Introductory Offer**:
   - **Countries or Regions:** all;
   - **Start Date:** today; **End Date:** *No End Date*;
   - **Type:** Free; **Duration:** 1 Week;
   - **Confirm**.

### B6. iOS: check it

On the Mac, in the **TestFlight** app, with your own Apple ID under System Settings → [your name] →
Media & Purchases:
1. Install or open the TestFlight 1.1.0 build. Sign in with an account that has never had Pro →
   **Upgrade to Pro**.
2. Expect **"Start free trial"**, *"Free for your first week, then $5.99/year"* (or ₹299), the renewal
   terms and the Terms and Privacy links.
   - If it shows the normal price, wait up to an hour and reopen the app.
   - If your Apple ID ever bought Pro in TestFlight, it can't get the trial. That explains the normal
     price.
3. **Optional:** tap **Start free trial** and confirm. It's free in TestFlight. Profile shows **Pro
   Active** within about a minute.

### B7. Web check (optional)

Sign in at https://traxettle-prod.web.app with the account that started a trial. Profile shows Pro.

### B8. Promotional Text (optional, no new version needed)

App Store Connect → Traxettle → the live 1.1.0 version → **Promotional Text** (156 of 170 characters):

```text
New: pool money with your group, choose who can spend and approve, and enter costs in the currency you paid in. New Pro subscribers get a 1-week free trial.
```

### B9. If a trial check fails

- **Play:** the `trial-7d` offer → **Deactivate**.
- **Apple:** Pro Yearly → the introductory offer → set its **End Date** to today.

People already in a trial keep it.

---

## C. Final automated checks

On the other Mac.

**1. Bring `stage` into the branch, if it moved.** List the commits `stage` has that the branch lacks:

```bash
cd "$WT" && git fetch origin && git log --oneline HEAD..origin/stage
```

If it lists commits, merge them (merge, never rebase: the branch is pushed), then push:

```bash
git merge --no-ff origin/stage && git push
```

**2. Run the full suite:**

```bash
cd "$WT/traxettle-rush" && bash scripts/regression/run.sh full
```

Every step should pass, with mobile at 174 tests. The summary is in `artifacts/regression/<time>/summary.md`.

**3. Maestro on iOS 27,** only if step 1 brought in app changes. Rebuild the Debug test app first,
because the simulator holds a Release build from milestone B:

```bash
bash apps/mobile/maestro/scripts/build-test-app.sh ios "iPhone 17 Pro iOS27"
```

```bash
SIM_UDID=$(xcrun simctl list devices | grep "iPhone 17 Pro iOS27" | grep -oE '[0-9A-F-]{36}'); MAESTRO_DEVICE="$SIM_UDID" MAESTRO_API_PORT=3011 bash scripts/regression/run.sh mobile
```

---

## D. iOS release candidate (other Mac, Xcode 27)

You can upload while 1.1.0 is still in review. TestFlight builds don't affect App Review. Just don't
submit 1.2.0 until 1.1.0 is released.

### D1. Start version 1.2.0

```bash
cd "$WT/traxettle-rush/apps/mobile" && npm run version:bump -- minor && bash scripts/version.sh
```

Expect `Version (app.json): 1.2.0`, `Next TestFlight build: 1.2.0` and `Next Play build (.aab): 1.2.0,
versionCode 43`. Without the bump, the build would be 1.1.1.

### D2. Build and upload

Quit Xcode first: the script regenerates the iOS project.

```bash
osascript -e 'if application "Xcode" is running then tell application "Xcode" to quit'
```

Sign the way 1.1.0 was signed: **automatically**, with the Apple account in Xcode. First check that
Xcode 27 is signed in. It shares the account with Xcode 26, but it's worth a look:

```bash
open -a /Applications/Xcode.app
```

Look at Xcode → Settings → **Accounts**: your Apple ID, with the Traxettle team. Then quit Xcode again.

Your Team ID is the 10 characters in brackets on this line:

```bash
security find-identity -v -p codesigning | grep "Apple Distribution"
```

```bash
APPLE_TEAM_ID=<team id> bash scripts/build-ios.sh testflight
```

**Only if automatic signing fails** (for example "needs a registered device", or a provisioning error),
sign manually with your App Store profile. This lists the installed profiles for the app, marks the
usable one, and prints the command to use (or says how to download one from developer.apple.com):

```bash
bash scripts/ios-signing-info.sh
```

Then:

```bash
IOS_PROVISIONING_PROFILE="<App Store profile name>" APPLE_TEAM_ID=<team id> bash scripts/build-ios.sh testflight
```

- Near the start it prints `Xcode: Xcode 27.2 … iOS SDK 27.2`. **If it says 26, stop it with Control+C**
  and fix A2.
- It ends with `Uploaded 1.2.0 (<build number>)` and records the build in `release-versions.json`.
- **"No Accounts with App Store Connect access … for <team> is required":** the build and signing
  worked; Xcode 27 just has no Apple account to upload with. That happened for the 1.2.0 release
  candidate (2026-11-27): Xcode 27 doesn't reuse Xcode 26's sign-in. Open Xcode 27 with no project
  (`open -a /Applications/Xcode.app`). In Xcode → Settings → **Accounts**, add the Apple ID that has
  the Admin or App Manager role on the team. Then upload the archive as below, without building again.
- **If the upload fails,** the archive is kept:
  1. Upload it from Xcode → Window → Organizer → Archives → 1.2.0 → **Distribute App → App Store Connect
     → Upload**. No project needs to be open.
  2. Record it:
     ```bash
     bash scripts/version.sh record ios <build number>
     ```

### D3. Prove it was built with the iOS 27 SDK

```bash
A=$(ls -td ~/Library/Developer/Xcode/Archives/*/Traxettle-*.xcarchive | head -1); echo "$A"; plutil -p "$A"/Products/Applications/*.app/Info.plist | grep -E '"DT(Xcode|SDKName)"|CFBundleShortVersionString|"CFBundleVersion"'
```

Expect `"DTSDKName" => "iphoneos27.2"`, `"DTXcode" => "2720"`, `"CFBundleShortVersionString" => "1.2.0"`
and your build number.

### D4. Commit and push the version files

```bash
cd "$WT" && git status --short
```

Expect exactly these four. `rc_prod.properties` may also show up as untracked: never add it.
- `traxettle-rush/apps/mobile/app.json`
- `traxettle-rush/apps/mobile/package.json`
- `traxettle-rush/apps/mobile/android/app/build.gradle`
- `traxettle-rush/apps/mobile/release-versions.json`

```bash
git add traxettle-rush/apps/mobile/app.json traxettle-rush/apps/mobile/package.json traxettle-rush/apps/mobile/android/app/build.gradle traxettle-rush/apps/mobile/release-versions.json
git commit -m "chore: iOS 1.2.0 release candidate"
git push
```

### D5. TestFlight

When the build has processed (10–30 minutes), go to App Store Connect → Traxettle → **TestFlight** →
build 1.2.0:
- **Test Details → What to Test** (405 characters):

  ```text
  1.2.0 moves Traxettle to Expo SDK 58 and the iOS 27 SDK. Nothing should look or work differently from 1.1.0. Please check: signing in (email and password, Google, Apple, email link), opening a link from Mail, adding a receipt from the camera and from photos, changing an expense date, exporting CSV and PDF, and Upgrade to Pro (Start free trial, Restore). Tell us anything that looks or works differently.
  ```

- Add the build to your internal testing group.

**If you need another iOS build later** (a fix found in E): rerun D2. `version.sh` makes it **1.2.1**,
because 1.2.0 is now recorded as shipped. That's fine: release 1.2.1 on both stores, with the same texts.
That is also why the Android build (F) waits for the final iOS build.

---

## E. iOS hand test

Follow [EXPO_58_HAND_TEST.md](../runbook/EXPO_58_HAND_TEST.md) and fill in the iOS column of its results
table (§2).

- **Where:** you have no iPhone, so test the TestFlight 1.2.0 build in the Mac's **TestFlight** app.
  Purchases there are free.
- **H1 (update keeps you signed in) first:** install the live 1.1.0 on the Mac and sign in, then install
  TestFlight 1.2.0 over it. If 1.1.0 can't be installed from the App Store on the Mac, do H1 on Android
  only and note that in the table.
- **H12 (iPad and iPhone Duo):** passed in milestone B step 7 on Release builds with Xcode 27.2. Mark it
  as passed with that note.
- **Anything that fails blocks the release.** Fix it on `chore/expo-58`, then repeat D2–D5. That
  build will be 1.2.1.
- **Expenses in a different order on each load** aren't a 1.2.0 problem. The API returns them unordered
  until the expense-order fix is deployed (L). Note it and carry on.

---

## F. Android build, internal testing and hand test (other Mac)

Only after the **final** iOS build, from the same commit, so both stores ship the same version.

### F1. Build

```bash
cd "$WT" && git pull && cd traxettle-rush/apps/mobile && bash scripts/build-android.sh production
```

- **What it needs:** the release keystore, `android/gradle.properties.local`,
  `google-services.prod.json` and `rc_production.properties` (or `rc_prod.properties`). All of them are
  in the worktree from milestone B.
- **Output:** `android/app/build/outputs/bundle/release/app-release.aab`, version 1.2.0 (or 1.2.1, to
  match iOS), versionCode 43.

```bash
bash scripts/version.sh
```

That should show Android last shipped as 1.2.0 (or 1.2.1) with versionCode 43, the same version as iOS.

### F2. Check the signing key

A bundle carries a JAR signature, so `keytool` can read it, unlike the APK in milestone B:

```bash
keytool -printcert -jarfile android/app/build/outputs/bundle/release/app-release.aab | grep -i sha1
```

Expect `6A:77:3A:F7:80:44:DF:90:49:77:64:40:89:15:27:AB:8D:10:AE:26`. Play Console also refuses a bundle
signed with any other key.

### F3. Upload to internal testing

1. Play Console → Traxettle → **Test and release → Testing → Internal testing → Create new release**.
2. Upload `app-release.aab`.
3. **Release name:** `1.2.0 (43)`. **Release notes** (284 of 500 characters):

   ```text
   • Ready for the latest Android versions: edge-to-edge screens and Android's own launch screen
   • Cancelling Google sign-in now simply takes you back, with no error message
   • Updated app foundations for better reliability
   • New Pro subscribers can try Pro free for a week, where offered
   ```

4. **Next → Save → Start rollout to Internal testing**.
5. **Check the permissions haven't grown:** **Test and release → App bundle explorer**, then compare the
   permissions of version 43 with 42. If 43 adds one, Play may ask for a declaration under **App
   content**.

### F4. Android hand test

On your Android phone, signed in to the Play Store with an account on the internal testers list:
1. **H1 first:** with 1.1.0 from Google Play installed and signed in, open the internal-testing opt-in
   link and update to 1.2.0.
2. Then run H2–H11 from [EXPO_58_HAND_TEST.md](../runbook/EXPO_58_HAND_TEST.md) and fill in the Android
   column.

### F5. Commit and push the Android record

```bash
cd "$WT" && git status --short
```

Expect `release-versions.json`, and `build.gradle` for the new versionCode.

```bash
git add traxettle-rush/apps/mobile/android/app/build.gradle traxettle-rush/apps/mobile/release-versions.json traxettle-rush/apps/mobile/app.json traxettle-rush/apps/mobile/package.json
git commit -m "chore: Android 1.2.0 (43)"
git push
```

`git add` on a file with no changes does nothing, so that list is safe either way.

---

## G. iPhone Duo screenshots (other Mac)

New App Store submissions need iPhone Duo screenshots from April 2027. Adding them to 1.2.0 now saves a
step later. The iPhone (6.3") and iPad (13") screenshots stay as they are.

`capture-screenshots.sh` takes them with Maestro ([REGRESSION_SUITE.md §6.1](../runbook/REGRESSION_SUITE.md#61-app-store-screenshots)):
- It runs on throwaway local Firebase emulators, a local API and Metro, so production is never touched.
- It seeds the same demo content as the iPhone and iPad sets: Anita, Priya and Ravi with the Flat 4B,
  Europe, birthday-budget and Goa events.
- It takes 8 screenshots with a clean 9:41 status bar.

Maestro can't fold the Duo, so it runs twice: once closed and once open. The script works out which it
got from the pixel size: **1398 × 2034** closed (outer display) and **2007 × 2853** open (inner display),
from Apple's screenshot specifications (checked 2026-11-27). It stops on any other size.

All commands run in the worktree terminal, with Xcode 27 (A2).

### G1. Regenerate the iOS project

A TestFlight build (D2) leaves the iOS project set up for App Store signing, and a simulator build on top
of that can fail. Regenerate it and clear Xcode's build cache:

```bash
cd "$WT/traxettle-rush/apps/mobile" && npx expo prebuild --platform ios --clean && cd ../..
find ~/Library/Developer/Xcode/DerivedData -maxdepth 1 -name 'TraxettleappbyKarkhanisLabs-*' -exec rm -rf {} +
```

### G2. Install the Debug test app on the Duo

This replaces the Release build left from the milestone B check:

```bash
bash apps/mobile/maestro/scripts/build-test-app.sh ios "iPhone Duo iOS27"
```

When it prints *Logs for your project will appear below*, the app is installed. Press **Control+C**,
because it keeps port 8081 busy, which the capture needs.

### G3. Capture with the Duo closed

In DeviceHub, make sure **iPhone Duo iOS27** is booted and **closed** (outer display). Then:

```bash
MAESTRO_API_PORT=3011 bash apps/mobile/maestro/scripts/capture-screenshots.sh "iPhone Duo iOS27"
```

It takes a few minutes. It should end with `8 screenshots (iphone-duo-closed, 1398x2034)`.

### G4. Capture with the Duo open

In DeviceHub, **open** the Duo flat (inner display) and wait for the app to fill it. Then run the same
command:

```bash
MAESTRO_API_PORT=3011 bash apps/mobile/maestro/scripts/capture-screenshots.sh "iPhone Duo iOS27"
```

It should end with `8 screenshots (iphone-duo-open, 2007x2853)`.

### G5. Look at them

```bash
ls "$WT/app-store-assets/iphone-duo-closed" "$WT/app-store-assets/iphone-duo-open" && open "$WT/app-store-assets"
```

Check every image:
- the app fills the screen;
- nothing is cut off;
- there's no debug banner or "Save Password?" sheet.

Keep them for I2 step 7. `app-store-assets/` is ignored by git, so they can't be committed by accident.

### G6. If the capture fails

- **It stops before the flows:**
  - "isn't installed" or "Release build": redo G2.
  - "already listening on port(s)": stop what holds them
    ([COMMAND_REFERENCE §7.4](../runbook/COMMAND_REFERENCE.md#74-health-ports-and-stopping)).
- **A flow fails:** the script prints the folder with Maestro's output. Run it once more: the iOS driver
  sometimes fails once. If the same step fails twice, send me the output.
- **"isn't an App Store screenshot size":** the Duo's screen doesn't match Apple's published sizes. Note
  the size it printed and check Apple's specifications page before uploading anything.

**Fallback, by hand.** If the script can't be made to work in time:
1. Install a Release build:
   ```bash
   cd "$WT/traxettle-rush/apps/mobile" && npx expo run:ios --configuration Release --device "iPhone Duo iOS27" --no-bundler
   ```
2. Set the status bar:
   ```bash
   xcrun simctl status_bar "iPhone Duo iOS27" override --time 9:41 --batteryState charged --batteryLevel 100
   ```
3. Sign in with the **App Review demo account** on production. **Look only: don't save, pay or delete
   anything.**
4. Capture each screen, closed and then open:
   ```bash
   xcrun simctl io "iPhone Duo iOS27" screenshot ~/Desktop/<name>.png
   ```
5. Clear the status bar:
   ```bash
   xcrun simctl status_bar "iPhone Duo iOS27" clear
   ```

---

## H. Merge into `stage` and tag

After E and F pass.

### H1. Commit the hand-test results

```bash
cd "$WT" && git add traxettle-app/docs/runbook/EXPO_58_HAND_TEST.md && git commit -m "docs: Expo 58 hand-test results" && git push
```

### H2. Pull request into `stage`

1. Open https://github.com/vkarkhanis/splitex-app/compare/stage...chore/expo-58?expand=1 in the browser.
2. **Title:**

   ```text
   Expo SDK 58 and the iOS 27 SDK (release 1.2.0)
   ```

3. **Description:**

   ```text
   Moves the mobile app to Expo SDK 58 / React Native 0.88 and builds iOS with Xcode 27.2 (iOS 27 SDK). No feature changes; API and web unchanged. Results: EXPO_58_IOS_27_UPGRADE_PLAN.md §10 and EXPO_58_HAND_TEST.md §2. Includes the 1.2.0 version files.
   ```

4. **Create pull request.**
5. Wait for the CI checks to pass: type checks, unit suites and Playwright, on Ubuntu 24.04.
6. Merge with **Create a merge commit** (open the arrow next to the merge button). Never squash or
   rebase.

With the GitHub CLI (`brew install gh`, then `gh auth login` with the account that owns the repo), the
same steps are `gh pr create --repo vkarkhanis/splitex-app --base stage --head chore/expo-58 --fill`,
`gh pr checks --repo vkarkhanis/splitex-app chore/expo-58 --watch` and
`gh pr merge --repo vkarkhanis/splitex-app chore/expo-58 --merge`.

### H3. Tag the release

The tip of `chore/expo-58` is the code you built plus its version files. A hotfix branched from these tags
then builds 1.2.1.

**Tag before deleting `chore/expo-58` on GitHub.** The command below reads the branch. Tags already
pushed are never affected by deleting it.

```bash
cd "$WT" && git fetch origin
git tag ios-v1.2.0 origin/chore/expo-58 && git tag android-v1.2.0 origin/chore/expo-58
git push origin ios-v1.2.0 android-v1.2.0
```

If the branch is already deleted, tag the same commit, which is the second parent of the pull request's
merge commit on `stage`:

```bash
git fetch origin && M=$(git log origin/stage --merges --grep 'chore/expo-58' -1 --format=%H) && echo "merge: $M, branch tip: $(git rev-parse --short "$M^2")" && git tag ios-v1.2.0 "$M^2" && git tag android-v1.2.0 "$M^2" && git push origin ios-v1.2.0 android-v1.2.0
```

Do H4 before deleting the branch as well, because it also reads `origin/chore/expo-58`.

If the shipped version is 1.2.1, use `ios-v1.2.1` and `android-v1.2.1`.

### H4. Check `stage`

```bash
git merge-base --is-ancestor origin/chore/expo-58 origin/stage && echo "merged into stage"
git show origin/stage:traxettle-rush/apps/mobile/release-versions.json
```

Expect `merged into stage`, and 1.2.0 for both platforms.

---

## I. Store listings and submission

### I1. Google Play

0. **Policy status first:** Play Console → **Policy and programs → Policy status**. It must show no issue
   that rejects updates.
   - **On 2026-11-27** it showed *"App must use Google Play Billing Library version 8.0.0 or later"* for
     bundle **34 (1.0.33)**, still active on the **closed testing (Alpha)** track. Play checks every bundle
     that's active on any track.
   - **Fix:** Test and release → Testing → Closed testing → **Alpha → Pause track**, or promote 1.2.0 (43)
     to Alpha too, which replaces it.
   - **The 1.2.0 bundle itself is fine:** `react-native-purchases` 11 brings RevenueCat Android 11.4.3,
     which uses Billing Library 9.1.0. 1.1.0 (42) uses 8.x.
1. **Full description:** no change. It already has the line *"Free trial for new subscribers, where
   offered"*. To check, compare **Grow users → Store presence → Store listings → Default store listing →
   Full description** with `traxettle-rush/play-store-assets/full-description.txt` (3,545 characters).
2. **Short description:** no change.
3. **Screenshots and feature graphic:** no change.
4. **Release:** **Test and release → Testing → Internal testing** → release 1.2.0 (43) → **Promote release
   → Production**:
   - **Release notes:** the F3 text;
   - **Rollout:** **20%** (recommended: this release changes every native library, and a staged rollout
     can be halted);
   - **Next → Save → Start rollout to Production**.
5. **Publishing overview → Send changes for review**, if changes are waiting. Google's review takes a few
   hours to about 2 days.

### I2. App Store Connect: version 1.2.0

Only once 1.1.0 is released (B1), because App Store Connect has one version in progress at a time.

1. **Create the version:** Apps → Traxettle → **iOS App +** → **1.2.0**.
2. **Build:** choose **1.2.0 (<build number>)**. There's no encryption question: the app declares none
   (`usesNonExemptEncryption: false`).
3. **What's New in This Version** (269 characters):

   ```text
   • Ready for iOS 27, including iPhone Duo, closed and open.
   • Cancelling Google sign-in now simply takes you back, with no error message.
   • Updated app foundations for better reliability on the latest iPhones and iPads.
   • New Pro subscribers can try Pro free for a week.
   ```

   If the Apple trial (B5) doesn't exist yet, delete the last line.
4. **Promotional Text:** the B8 text, if you haven't set it already.
5. **Description:** paste `traxettle-rush/play-store-assets/full-description.txt` (3,545 characters). It
   now includes *"Free trial for new subscribers, where offered"*, which 1.1.0's App Store text left out. If
   the Apple trial doesn't exist yet, delete that line. **Then add these two lines at the very end, in every
   localization** (3,693 of 4,000 characters in all). App Review rejected 1.1.0 on 2026-11-27 under 3.1.2
   because the Terms of Use link was missing from the description.

   ```text
   Terms of Use (EULA): https://www.apple.com/legal/internet-services/itunes/dev/stdeula/
   Privacy Policy: https://traxettle-prod.web.app/privacy.html
   ```
6. **Keywords, Support URL, Marketing URL:** no change.
7. **Screenshots** (Previews and Screenshots → **View All Sizes in Media Manager**):
   - **iPhone 6.3"** and **iPad 13":** no change;
   - **iPhone Duo:** upload the G images from `$WT/app-store-assets/iphone-duo-closed/` and
     `iphone-duo-open/`, in file-name order (01 to 08), the same order as the iPhone set.
8. **App Review Information:**
   - **Sign-in information:** no change.
   - **Notes:** paste this (3,292 of 4,000 characters). Fill in `<SECOND EMAIL>` and `<SECOND PASSWORD>`
     in App Store Connect only, never in this file. If no demo video is attached any more, delete the
     last line.

     ```text
     DEMO ACCOUNTS (production server, sample data pre-loaded)
     Main: the username and password above. Tap "Sign In" (please use the password rather than Apple, Google or the email link). Sign in with Apple also works and creates a new, empty account.
     Second account, for the other side of shared events: <SECOND EMAIL> / <SECOND PASSWORD>

     WHAT TRAXETTLE DOES
     A shared-expense tracker for groups (trips, flatmates, families, events, teams). Members record who paid for what, split it (equal, ratio or exact amounts) and Traxettle proposes the fewest payments to settle up. People pay each other outside the app and record it; the receiver confirms. Traxettle never holds, sends or processes money. "Pool money" records money a group collects first and spends from: "Just me" (one person funds a budget others spend from) or "Several of us" (everyone chips in: a trip kitty, shared fund, club treasury or collection), with approvals, receipts and a ledger (again only as a record).

     NEW IN THIS VERSION
     A platform update: the app is built with the iOS 27 SDK, starts with the scene-based life cycle, and runs full screen on iPad and iPhone Duo. Features, payments and data are unchanged. Traxettle still only records payments.

     WHERE TO LOOK
     1. "Goa Trip (sample)": expenses with splits and receipts, and settlement payments. As the payer tap "I've Paid"; as the receiver (second account) tap "Confirm" or "Mark as Paid".
     2. "+ Create Event": name, dates, currency, then "Split expenses" or "Pool money". On the free plan, "Several of us" shows a PRO badge and an upgrade link; "Just me" is free. The free plan allows 3 events; the demo account has 2.
     3. In an event: "+ Add Expense" (attach a receipt with the camera or photo library), "+ Invite", "Settle Now".
     4. "Family Holiday Budget (sample)": tap the pool card for the balance, spending by person and a claim waiting for approval.
     5. Traxettle Pro (yearly auto-renewable subscription via In-App Purchase): Profile → "Upgrade to Pro". It unlocks unlimited events, multi-currency settlement, expenses in another currency and group pools ("Several of us"; only the creator needs Pro). After a Sandbox purchase, "+ Create Event" → "Pool money" → "Several of us" creates a Kitty. Price, renewal terms, Restore Purchase, Terms of Use (Apple standard EULA) and Privacy Policy are on that screen. Pro Yearly includes a 1-week free trial for new subscribers. Please buy with a Sandbox account.
     6. Profile → "Delete Account": removes the sign-in and personal data. Shared events stay for the other members, with the user shown as "Deleted user". For a Sign in with Apple account, the app asks Apple for confirmation and revokes the Apple ID authorization. To try it, please register a new account (or use Sign in with Apple) rather than deleting the demo accounts, which we keep for later reviews.

     PERMISSIONS
     Camera and photo library, only to attach receipt or payment-proof photos. No location, contacts, tracking or push notifications.

     INTERNAL TEST SWITCH (disclosure)
     Tapping the "Traxettle" title 7 times on the sign-in screen points the app at our staging (test) server, which our TestFlight testers use. It is not a feature for users and does not unlock paid features. Please stay on the default production server.

     A demo video is attached.
     ```

9. **Age rating:** App Information → **Age Ratings**. If it shows questions to answer, answer as for 1.1.0:
   no dating, no shared location, no AI chat, no messaging. Then **Save**.
10. **Version Release:**
    - choose **Automatically release this version**;
    - turn **Phased Release for Automatic Updates on**. Automatic updates then reach users over 7 days,
      you can pause it, and anyone can still update by hand.
11. **Submit:** on the version page, **Add for Review**, then open the draft → **Submit for Review**. Only
    the version goes; the subscription is unchanged.

---

## J. After release

### J1. Check both stores are live

```bash
curl -s "https://itunes.apple.com/lookup?id=6823113088&country=in" | python3 -c 'import json,sys; r=json.load(sys.stdin)["results"][0]; print(r["version"], r["currentVersionReleaseDate"])'
```

That should show `1.2.0`. Play Console → **Test and release → Production** shows 1.2.0 (43) **Available on
Google Play** at the rollout percentage.

### J2. Smoke check on production

On your phone and on the Mac (App Store or TestFlight build), with your own account:
1. Sign in and open an event.
2. Add and delete an expense.
3. Open Upgrade to Pro. A new account shows "Start free trial".

### J3. Watch for crashes for a few days

- **Android:** Play Console → **Monitor and improve → Android vitals → Crashes and ANRs**. Compare 43 with
  42.
- **iOS:** Xcode → Window → **Organizer → Crashes** (Traxettle, 1.2.0), and App Store Connect →
  TestFlight → **Crashes**.

### J4. Roll Android out further

Play Console → **Test and release → Production → Manage rollout → Update rollout**. Go 20% → 50% → 100%,
a day or two apart, while the vitals stay at 1.1.0's level.

### J5. Bring `main` up to date

1. Open https://github.com/vkarkhanis/splitex-app/compare/main...stage?expand=1.
2. **Title:** `Bring main up to date with stage (1.2.0)`.
3. **Create pull request**, then merge it with **Create a merge commit**.

### J6. Move the other Mac to Xcode 27 for good

Phase B in [XCODE_27_AND_MACOS_27.md §3.3](../runbook/XCODE_27_AND_MACOS_27.md#33-phase-b-make-xcode-27-the-default):
- make Xcode 27 the default;
- remove the `~/.zshrc` hook;
- remove the worktree.

After that, the macOS 27 upgrade follows the same runbook, §7.

### J7. Optional clean-up

- Copy the Duo screenshots from `$WT/app-store-assets/` to wherever you keep store assets (this Mac's
  `app-store-assets/` holds the iPhone and iPad sets), before removing the worktree in J6.

---

## K. If something goes wrong

| Problem | What to do |
|---|---|
| A trial check fails (B) | Deactivate the Play offer, or end the Apple offer today (B9). People already in a trial keep it |
| A hand test fails (E, F) | Don't submit. Fix it on `chore/expo-58`, rebuild iOS (it becomes 1.2.1), then Android |
| Android crashes after release | Play Console → Production → **Halt rollout**. Fix, then ship 1.2.1 |
| iOS crashes after release | App Store Connect → the version → **Phased Release → Pause**. Fix, then ship 1.2.1 |
| App Review rejects 1.2.0 | Read the reason in App Store Connect. A text or metadata fix needs no new build: change it and resubmit. A code fix needs a new build (1.2.1) |
| Play rejects the bundle's key | The wrong keystore was used. Check F2 and `apps/mobile/keystore/traxettle-release-key.keystore` |
| You need a fix for 1.1.0 users before 1.2.0 is out | Build it from the `ios-v1.1.0` / `android-v1.1.0` tags in the other Mac's **main checkout** (Expo 54) with **Xcode 26**, as 1.1.1 |

The 1.2.0 apps change nothing on the server, so there is nothing to roll back there. An API fix deployed with L is rolled back with L6.

---

## L. Deploying an API fix from `stage`

For API-only fixes such as the expense-order fix. They ship to every app version at once and need no
app or web build. Do it on the **other Mac** (it has the deploy files, [COMMAND_REFERENCE §16](../runbook/COMMAND_REFERENCE.md#16-files-you-need-that-arent-in-git)),
in the **main checkout on `stage`**, not the `chore/expo-58` worktree. Each deploy uploads the folder
it runs in, so it must be exactly `stage`.

### L1. Merge the fix into `stage`

Through its pull request on GitHub, with **Create a merge commit**, once CI passes. For the
expense-order fix, open https://github.com/vkarkhanis/splitex-app/compare/stage...fix/expense-list-order?expand=1
once the branch is pushed.

Then check what production would get (A5):

```bash
cd "$MAIN" && git switch stage && git pull && git status -sb
git diff --stat ios-v1.1.0 origin/stage -- traxettle-rush/apps/api traxettle-rush/libraries/shared traxettle-rush/apps/web
```

`git status -sb` must show `## stage...origin/stage` with no changed files. If anything is listed under
`apps/web`, the web app needs deploying too
([COMMAND_REFERENCE §12.3](../runbook/COMMAND_REFERENCE.md#123-web)).

### L2. Before deploying

```bash
cd "$MAIN/traxettle-rush" && jq --version && gcloud auth list --filter=status:ACTIVE --format='value(account)'
bash scripts/regression/run.sh quick
```

**Staging only: check the RevenueCat Apple key isn't the placeholder.** On 2026-11-27 staging served
`appl_…CHANGE_ME…`, so purchases on staging failed with "Invalid API key":

```bash
grep -c 'CHANGE_ME' rc_staging.properties
```

If it prints more than 0, set `RC_REVENUECAT_APPLE_PUBLIC_KEY` in `rc_staging.properties` to the real Apple
public key (`appl_…`). One RevenueCat project serves both environments, so it's the same key as in
`rc_prod.properties`, also shown in RevenueCat → API keys. Each deploy writes it into the
`…-mobile-config` secret.

`jq` must be installed (without it the API silently runs on mock data), and `gcloud` must be signed in.
The quick suite must pass. If `git pull` changed any `package.json`, run
`node common/scripts/install-run-rush.js install` first.

### L3. Staging

```bash
bash scripts/api-deployment/deploy-staging-gmail.sh
curl -s https://traxettle-api-staging-943648574702.us-central1.run.app/health
gcloud run services logs read traxettle-api-staging --project traxettle-staging --region us-central1 --limit 100 | grep -i firebase
```

- **Health:** the check must answer.
- **Logs:** they must say *Initializing Firebase with real credentials*, never *using mock services*.
- **Try the fix on staging:** in a TestFlight or Play build switched to staging (7 taps on "Traxettle"),
  open an event with several expenses.
  - Pull to refresh or reopen it a few times: the order must stay the same.
  - Check on a second device, or in the web app on staging: it shows the same order.

### L4. Production

```bash
bash scripts/api-deployment/deploy-prod-gmail.sh
curl -s https://traxettle-api-prod-ncwutlgtga-uc.a.run.app/health
bash scripts/api-deployment/verify-deployed-api-env.sh production
gcloud run services logs read traxettle-api-prod --project traxettle-prod --region us-central1 --limit 100 | grep -i firebase
```

- **The checks:** the same as for staging.
- **Known false alarms:** `verify-deployed-api-env.sh` always reports two, a missing
  `FIREBASE_PROJECT_ID` and a missing `…-firebase-project-id` secret. Everything else must pass.
- **The production web address:** `APP_URL` must be `https://traxettle-prod.web.app`, because every
  emailed link is built on it. Until 2026-11-28 it was `https://traxettle.app`, a domain with no DNS
  records, so sign-in, invitation and event links in emails led nowhere.
  ```bash
  gcloud run services describe traxettle-api-prod --project traxettle-prod --region us-central1 --format=yaml | grep -A1 'name: APP_URL'
  ```
- **The live app:** open the store app (1.1.0 or 1.2.0) on your phone. Open an event, add an expense
  and delete it. Everything works, and the order stays the same between loads.

### L5. Record it

Note the date and the `stage` commit you deployed, for example in the pull request's description:

```bash
git -C "$MAIN" log --oneline -1 origin/stage
```

Then bring `stage` into the 1.2.0 branch, so its pull request into `stage` stays clean (as in C1):

```bash
cd "$WT" && git fetch origin && git merge --no-ff origin/stage && git push
```

The apps need no new build for this: the merge brings in API code only.

### L6. Undo

Cloud Run keeps the previous revision. List the revisions, then send all traffic back to the one before:

```bash
gcloud run revisions list --service traxettle-api-prod --project traxettle-prod --region us-central1 --limit 3
gcloud run services update-traffic traxettle-api-prod --project traxettle-prod --region us-central1 --to-revisions <previous revision>=100
```

Do the same for staging, with `traxettle-api-staging` and `traxettle-staging`, if needed.
