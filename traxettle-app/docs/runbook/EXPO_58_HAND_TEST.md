# Expo SDK 58 / iOS 27 SDK — hand-test plan

A short hand test for the branch `chore/expo-58`. It covers only what automation can't reach; the
regression suite ([REGRESSION_SUITE.md](REGRESSION_SUITE.md)) covers the app's screens and rules.
Plan and background: [EXPO_58_IOS_27_UPGRADE_PLAN.md](../utility/EXPO_58_IOS_27_UPGRADE_PLAN.md).

**What changed:** only the platform under the app.
- **Libraries:** Expo SDK 58, React Native 0.88, React Navigation 7, Google Sign-In 17, RevenueCat 11
  and Firebase 12.
- **iOS:** scene-based start-up, and a build with Xcode 27 / the iOS 27 SDK. The minimum is now iOS 16.4.
- **Android:** Gradle 9, mandatory edge-to-edge, and the system splash screen (Android 12+).

No screen or rule changes.

---

## 0. Before you start

**Builds:**
- **iOS:** the 1.2.0 TestFlight build (built with Xcode 27), on an iPhone with iOS 27. If you have none,
  use a Release build on the iOS 27 simulator; purchases then can't be tested.
- **Android:** the 1.2.0 `.aab` from Play internal testing, on a phone (Android 16 or 17 if possible).

**Is it safe?** Yes.
- Store builds open on **production**. Do the sign-in tests on **staging** (H2), except H1, which is
  about your own account.
- Purchases in TestFlight use the Sandbox. On Android, use a license-tester account, so nobody is
  charged.
- Don't buy with a real account.

---

## 1. Scenarios

| # | Test | Platforms | Steps | Expected |
|---|---|---|---|---|
| H1 | **Update keeps you signed in** (do it first) | iOS, Android | Before installing 1.2.0: have 1.1.0 from the store, signed in, with PIN or biometrics on if you use them. Install 1.2.0 over it (TestFlight / internal-testing link) and open it | Still signed in, same events, PIN or biometric unlock works, same environment as before |
| H2 | **Launch screen, production by default, 7-tap switch** | iOS, Android | Cold-start the app and watch the launch screen. Sign out. On the sign-in screen tap "Traxettle" 7 times; the app reloads. Repeat to go back | iOS: the full-screen Traxettle splash. Android: the app icon centred on white. Opens on production; switches to staging and back, each time with a reload |
| H3 | **Google sign-in** (staging) | iOS, Android | Sign in with Google → pick an account. Sign out, start again, and **cancel** the account picker | Signed in. Cancelling returns quietly: no "No ID token" alert, no error |
| H4 | **Sign in with Apple** (staging) | iOS | Sign in with Apple; then start again and cancel | Signed in; cancelling does nothing |
| H5 | **Email-link sign-in, warm and cold** (staging) | iOS, Android | Request a sign-in link. (a) App in the background: tap the link in Mail. (b) Request again, **force-quit** the app, tap the link | Both sign you in. (b) is the cold-start path that the scene life cycle changes on iOS |
| H6 | **Deep link** | iOS, Android | Open `com.traxettle.app://events/<an event id>` from Notes or Safari, once with the app running and once after force-quitting | Opens that event |
| H7 | **Camera and photo receipt** | iOS, Android | On a pool spend (or settlement proof): **Take photo** (allow the camera the first time) → attach. Then **Choose from library** → attach. Open the receipt | Both upload and show; the permission prompts use the app's own wording |
| H8 | **Native date picker** | iOS, Android | Add an expense, change its date with the picker, save; edit it again | The chosen date is saved and shown; the picker opens with it |
| H9 | **RevenueCat Sandbox purchase and Restore** | iOS, Android | As a free test account in the environment you used for 1.1.0's purchase check: open Upgrade to Pro (price and trial shown), buy with the Sandbox / license-tester account. Delete and reinstall (or sign out and in), then **Restore** | Pro unlocks after buying; Restore brings it back; cancelling the purchase sheet does nothing |
| H10 | **Export, share and open** | iOS, Android | Export unsettled payments (CSV) and a PDF; on Android open an attached proof file | Share sheet / print preview appears; the file opens |
| H11 | **Android look and back** | Android | Browse events, add an expense with the keyboard open, use the system back gesture to the dashboard, then back once more | Nothing hidden under the status or navigation bars; the keyboard doesn't cover the field being typed in; back goes to the previous screen, and from the dashboard puts the app in the background |
| H12 | **iPad and iPhone Duo launch** | iOS simulators (Release build, Xcode 27) | Launch on an iPad (iOS 27) and an iPhone Duo (closed, then open); sign in on staging | Fills the screen, no blank or black window; usable in both Duo postures |

---

## 2. Results

**iOS** (2026-11-27): TestFlight 1.2.0, build 2611271830, built with Xcode 27.2. Tested in the Mac's TestFlight
app, with H5, H6 and H12 on iOS 27 simulators.

**Android** (2026-11-28): 1.2.0 (versionCode 43) from Play internal testing, on the user's phone, plus a
second phone for the trial check.

| # | iOS | Android | Notes |
|---|---|---|---|
| H1 | pass | pass | |
| H2 | pass | pass | |
| H3 | pass | pass | |
| H4 | pass | – | |
| H5 | pass (app) | pass | iOS: the app signs in from the link when it receives it (checked with `simctl openurl`, warm and cold). The email's link itself opens a web page that has never existed (pre-existing; fix on `fix/email-link-landing-page`). The email went to spam. Android: passed after the `/auth/email-link` page and production's `APP_URL` fix were deployed |
| H6 | pass | pass | iOS 27 simulator, warm and cold |
| H7 | pass | pass | |
| H8 | pass | pass | |
| H9 | pass | pass | iOS: price and terms load (RevenueCat 11), Apple's sheet opens, Restore works. The Mac's TestFlight shows the US store, so Apple refuses the purchase for an Indian Apple ID (Mac only). On staging, "Invalid API key": staging serves a placeholder RevenueCat Apple key (fixed by the staging redeploy, checklist L2). Android: price ₹299, Google's sheet opens, Restore moves the subscription to the signed-in user; the 7-day trial shows and starts on a second phone with an account that never subscribed. The user's own Google account gets Play's "Server error" because it still has a cancelled subscription active until 2027-02-28 (Play bills through the account that installed the app) |
| H10 | pass | pass | |
| H11 | – | pass | |
| H12 | pass | – | Milestone B step 7: Release builds with Xcode 27.2 on iPhone 17 Pro, iPad Pro 13" and iPhone Duo (closed and open) |

Anything that fails blocks the pull request into `stage`.

**Found while testing, pre-existing (same in 1.1.0), not blocking:**
- **Fixed, deployed to staging and production on 2026-11-28:**
  - The email-link sign-in link opened a missing web page, `/auth/email-link`. The page was added (PR #33).
  - Production's `APP_URL` was `https://traxettle.app`, a domain with no DNS records, so every emailed link
    led nowhere. It's now `https://traxettle-prod.web.app`.
  - Staging's `/api/config` served a placeholder RevenueCat Apple key. Fixed by the staging redeploy.
  - Play: a second new-customer offer, `offer-first-year`, competed with `trial-7d`, so the trial never
    showed. It's deactivated.
- **Still open:**
  - `POST /api/auth/email-link/send` says "sent" even when the email fails, and logs the sign-in link.
  - The 7-tap environment switch doesn't reconfigure RevenueCat: after switching, quit the app fully
    before testing purchases.
  - Signing in with Google on an address whose email/password account was never verified removes the
    password (Firebase's account-linking rule); "Forgot password" restores it.

**Known and unchanged, not tested here:**
- On Android, "share an image into Traxettle" has never worked. The `SEND` intent filter in `app.json`
  is malformed (`categories` instead of `category`, and the generated action is doubled).
- "Forgot Password" on the Profile screen does nothing while signed in: that screen only exists in the
  signed-out stack.
