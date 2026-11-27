# Release 1.1.0 — the whole path, in order

Everything needed to finish the 1.1.0 release, from the builds in TestFlight and Play internal testing to
the free trial. Follow it top to bottom.

**Already done (checked 2026-11-26):**
- Production API and web have Phase 3: the `fx-preview` route answers 401 rather than 404, and the user guide lists *Expenses in another currency*.
- The builds are in testing: iOS 1.1.0 (2611260557) in TestFlight and Android 1.1.0 (42) in internal testing.
- Tags `ios-v1.1.0` and `android-v1.1.0` are pushed, and PR #29 is merged.

**Status (2026-11-26, evening):**
- **Android:** 1.1.0 (42) was promoted to production at 100% and sent for Google review, together with the new full description. In the AI declaration, the description is labelled AI-written.
- **iOS:** 1.1.0 (2611260557) was sent for App Review, with the version only and automatic release. The Pro Yearly description and image were left unchanged.
- **Still to do:** the trial offers (section E), once each store's 1.1.0 is live.

**The order:**
- **Today:** D (store text and submission). Decided 2026-11-26: skip A and B.
  - Both release builds already opened on production, signed up, and showed the store price.
  - The purchase code is unchanged since 1.0.40.
  - C (the Play trial offer) can wait for trial day.
- **When each store goes live:** E (switch on the trial and check it).
- **At the end:** F (wrap-up).

---

## A. Accounts (about 15 minutes)

All Traxettle users are created **in the app, on production**. Don't tap 7 times: TestFlight and Play
builds open on production, and test purchases cost nothing there.

iOS is tested on the **Mac** through the TestFlight app. Apple Sandbox accounts don't work there: App Store
Settings has no Sandbox option, and the normal Apple ID sign-in rejects them. So on the Mac, the only way
to buy is your **own Apple ID**, which is free in TestFlight. Keep it unused until trial day.

| # | Traxettle user (sign up in the app) | Pays with | Used in |
|---|---|---|---|
| 1 | `traxettleapp+prerelease@gmail.com` | nothing (it stays free) | B2: free-plan checks on the Mac |
| 2 | `traxettleapp+playprerelease@gmail.com` | **Gmail 1** | B1: Android purchase; then B2 on the Mac as a Pro user |
| 3 | `traxettleapp+play7daytrial@gmail.com` | **Gmail 2** | E1: Android trial |
| 4 | `traxettleapp+7daytrial1@gmail.com` | **your own Apple ID** (Mac TestFlight) | E2: iOS trial |

**Two rules:**
- **Keep each pair together.** A store account that buys or restores on a different Traxettle user moves Pro to that user.
- **Before trial day, don't buy anything with Gmail 2 or your own Apple ID.** An account that pays the normal price never gets the trial, and Google has no way to reset this.

**Gmail 1 and Gmail 2:** new or existing Google accounts.
- **Neither account:** can be `traxettleapp@gmail.com` or have an active Traxettle Pro subscription.
- **Gmail 2:** must never have bought Traxettle Pro, not even a test purchase.

**Set up Gmail 1 and Gmail 2 in Play Console:**
1. **Settings** (account level) → **License testing**:
   - tick the email list that holds both accounts (for example *Beta Testers*), or add them;
   - **License response:** `RESPOND_NORMALLY`;
   - **Save**.
2. Traxettle → **Test and release → Testing → Internal testing → Testers**:
   - tick the same list → **Save**;
   - copy the **opt-in link** (Join on Android).

To check an account is a licence tester without using up its trial: tap Subscribe, look for
**"Test card, always approves"** on Google's sheet, then close the sheet without buying.

---

## B. Sanity check on the test builds (about 30 minutes)

**Prices:** the store shows the price for the store account's country. It's **₹299/year** in India and
**$5.99/year** in the US (the Mac TestFlight app showed $5.99). Wherever this checklist says ₹299, the other
price is just as correct.

### B1. Android: internal testing 1.1.0 (42), with a purchase

1. **Set up the device:**
   - on a phone or emulator with the Play Store, add **Gmail 1** as a Google account;
   - uninstall Traxettle if it's installed;
   - in the Play Store, switch to Gmail 1 (tap your profile picture);
   - open the opt-in link as Gmail 1 → **Become a tester** → install Traxettle.
2. Open the app (no 7 taps). Sign up as `traxettleapp+playprerelease@gmail.com`.
3. **Free account:**
   - Create event → **Pool money**: *Several of us* is locked with **PRO**;
   - the Upgrade to Pro screen lists **Expenses in Another Currency** and **Group pools**;
   - the button reads **"Subscribe for ₹299/year"**, with no trial text.
4. **Subscribe:**
   - Google's sheet must show **Gmail 1** and **"Test card, always approves"**;
   - confirm;
   - within about a minute, Profile shows **Pro Active**.
5. **Don't cancel yet.** B2 uses this Pro user on the Mac.

**If Pro doesn't turn on within 2–3 minutes, stop.**
1. RevenueCat → **Customers**, with sandbox data shown: search for `production::<Firebase uid>`.
2. If the purchase is there, open **Integrations → Webhooks** and look at the delivery log.
3. Send me what you see.

### B2. iOS: TestFlight 1.1.0 (2611260557) on the Mac, no purchase

Stay signed in with your own Apple ID under System Settings → [your name] → Media & Purchases.
**Don't tap Subscribe and confirm.**

1. Install 1.1.0 from the **TestFlight** app and open it (no 7 taps).
2. **Free plan:** sign up as `traxettleapp+prerelease@gmail.com`:
   - Create event → **Pool money**: *Several of us* is locked with **PRO**;
   - the Upgrade to Pro screen lists both new features;
   - the button reads **"Subscribe for $5.99/year"** (or ₹299), with no trial text.
   Don't tap the button.
3. **Pro:** sign out, then sign in as `traxettleapp+playprerelease@gmail.com`. It's Pro from B1, because Pro
   belongs to the Traxettle user. Profile shows Pro. Then:
   - create an event with **Pool money → Several of us → Kitty**, and set spenders to **Only people I choose**;
   - pay in, then add a spend in **USD**;
   - the list shows the ₹ amount with the $ amount under it.
4. Delete the test event.

### B3. Clean up

- On Android: Play Store → profile → **Payments & subscriptions → Subscriptions → Traxettle Pro → Cancel**.
- Pro stays until the test year ends (about 30 minutes), then `traxettleapp+playprerelease` goes back to free.

---

## C. Create the Play trial offer, but don't activate it (5 minutes)

1. Play Console → Traxettle → **Monetize with Play → Products → Subscriptions** → `pro_yearly_1` → **Base plans and offers**.
2. **Add offer**, then pick the yearly base plan:
   - **Offer ID:** `trial-7d` (it can't be changed later);
   - **Eligibility:** *New customer acquisition* → *Never had this subscription*;
   - **Phases → Add phase → Free trial → 7 days**;
   - **Tags:** none. Never `rc-ignore-offer`.
3. **Save**, and **don't click Activate**. Activating switches the trial on for every installed Android app.

**Don't create the Apple offer yet.** It goes live for everyone the moment it starts.

---

## D. Store text and submission (today)

### D1. Google Play

1. **Store listing:** **Grow users → Store presence → Store listings → Default store listing → Full description**.
   Paste `traxettle-rush/play-store-assets/full-description.txt` and **Save**. The short description stays as it is.
2. **Release:** **Test and release → Testing → Internal testing** → release 1.1.0 (42) → **Promote release → Production**.
   - **Release notes:**

     ```text
     • Pool money with your group: a trip kitty, shared fund, club treasury or collection (Pro; people you invite join free)
     • Choose who can spend from a pool, and name approvers
     • Enter a cost in the currency you paid in; it's converted for you (Pro)
     • Hand cash to spenders and see who holds what
     • Settling up combines refunds, repayments and claims into fewer payments
     • Expense dates, and a filter to hide private expenses
     • Fixes, including taps that paused after a message
     ```

   - **Rollout:** 100%. (Recommended here: the user base is small and the build is tested. A staged rollout can be halted, but it delays the trial.)
   - **Next → Save → Start rollout**.
3. **Publishing overview → Send changes for review**, if changes are waiting. Google's review takes from a few hours to about 2 days.

### D2. App Store Connect: version 1.1.0

1. Apps → Traxettle → **iOS App +** → version **1.1.0**, if it doesn't exist yet.
2. **Build:** choose **1.1.0 (2611260557)**. There's no encryption question: the app declares none.
3. **What's New:**

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

4. **Promotional Text:**

   ```text
   New: pool money with your group, choose who can spend and approve, and enter costs in the currency you paid in. Group pools come with Traxettle Pro.
   ```

5. **Description:** copy `traxettle-rush/play-store-assets/full-description.txt`, **delete its line**
   `• Free trial for new subscribers, where offered`, and **add these two lines at the very end**
   (App Review rejected the first 1.1.0 submission on 2026-11-27 under 3.1.2 because the Terms of Use link
   was missing). The result is 3,645 characters. Do this in every localization.

   ```text
   Terms of Use (EULA): https://www.apple.com/legal/internet-services/itunes/dev/stdeula/
   Privacy Policy: https://traxettle-prod.web.app/privacy.html
   ```

   `traxettle-rush/app-store-assets/full-description.txt` is exactly this text.
6. **Screenshots:** keep the current ones.
7. **App Review Information:**
   - **Sign-in:** the username and password stay as they are.
   - **Notes:** paste §3 of [APP_REVIEW_RESPONSE.md](APP_REVIEW_RESPONSE.md) and fill in `<SECOND EMAIL>` / `<SECOND PASSWORD>`. Don't commit those.
8. **Version Release:** *Automatically release this version*, with **Phased Release off**.
9. **Age rating:** App Information → **Age Ratings → Edit**. Answer the new questions: no dating, no shared location, no AI chat, no messaging. Then **Save**.
10. **Subscription (optional; skipped for 1.1.0 on 2026-11-26, so only the version went to review):** **Monetization → Subscriptions → Traxettle Pro → Pro Yearly**:
    - **App Store Localization → Description:** `Unlimited events, multi-currency and group pools` → **Save**;
    - **Image:** replace it with `app-store-assets/pro-yearly-promo-1024-group-pools.png` → **Save**.
11. **Submit:**
    - on the version page, **Add for Review**;
    - then on the **Pro Yearly** page, **Add for Review** (this button works only once the version is in the draft);
    - open the draft → **Submit for Review**.
12. Optional: update the RevenueCat product descriptions ([REVENUECAT_SETUP.md](../utility/REVENUECAT_SETUP.md)).

---

## E. Switch on the trial: separately for each store, once that store's 1.1.0 is live

**Short path (no test accounts):**
1. Activate the Play offer (E1 step 1) and create the Apple offer (E2 step 1).
2. **Android phone, your own Google account:** Upgrade to Pro shows **"Start free trial"**.
   For a full test, start the trial, check that Pro turns on, then cancel at once in the Play Store.
   Cancelling during the free trial costs nothing.
3. **Mac TestFlight, your own Apple ID:** Upgrade to Pro shows **"Start free trial"**. Starting it is free in TestFlight.
4. **Web:** sign in at https://traxettle-prod.web.app with the account that started a trial. Profile shows Pro.

The detailed steps below are for a fuller check, with licence testers and a clean emulator.

The stores are independent, so you don't have to wait for both.
- **Android:** licence-test trials last about 3 minutes, so the check takes about 15 minutes.
- **iOS on the Mac:** the check takes about 15 minutes, plus a look the next day.

### E1. Android: when 1.1.0 is in production at 100%

1. **Activate:** Monetize with Play → Products → Subscriptions → `pro_yearly_1` → `trial-7d` → **Activate**.
2. **Check** with Gmail 2 and `traxettleapp+play7daytrial@gmail.com`:
   1. Set up the device as in B1, with **Gmail 2**: uninstall Traxettle, switch the Play Store to Gmail 2, and install Traxettle.
   2. Sign up as `traxettleapp+play7daytrial@gmail.com` → **Upgrade to Pro**. Expect **"Start free trial"** and *"Free for your first week, then ₹299/year"*.
      If it shows the normal price, wait an hour (the offer is still spreading), close and reopen the app. If it still shows the normal price, **stop and tell me**.
   3. **Start free trial.** Google's sheet should show Gmail 2, a 7-day free trial and the test card. Pro turns on within about a minute.
   4. **Don't cancel.** About 3 minutes later the trial becomes a paid test year, and Pro stays on.
   5. **Cancel** in the Play Store (as in B3). Pro stays until the test year ends (about 30 minutes), then the app goes back to free.
   6. **Upgrade to Pro** again: now **"Subscribe for ₹299/year"**, because the account has had the trial.

### E2. iOS: when 1.1.0 shows *Ready for Distribution* (released)

1. **Create the offer:** **Monetization → Subscriptions → Traxettle Pro → Pro Yearly** → under **Subscription Prices**, **Create Introductory Offer**:
   - **Countries:** all;
   - **Start:** today, with **No End Date**;
   - **Type:** Free, **Duration:** 1 Week → **Confirm**.
2. **Check on the Mac** with the **TestFlight** build (the App Store build would charge real money):
   1. Stay signed in with your own Apple ID under System Settings → [your name] → Media & Purchases. TestFlight purchases are free.
   2. Sign up as `traxettleapp+7daytrial1@gmail.com` → **Upgrade to Pro**. Expect:
      - **"Start free trial"**;
      - *"Free for your first week, then $5.99/year"* (or ₹299);
      - the renewal terms;
      - the Terms and Privacy links.

      If it shows the normal price, wait up to an hour and reopen the app. If it still does, **stop and tell me**.
      (If this Apple ID ever bought Pro in TestFlight before, it can't get the trial, and that explains it.)
   3. **Start free trial** and confirm with Touch ID. Apple's sheet should show a **1-week free trial**. **Pro Active** within about a minute.
   4. **Web:** sign in at https://traxettle-prod.web.app as `traxettleapp+7daytrial1@gmail.com`. Profile shows Pro.
   5. **The next day:** with your own Apple ID, TestFlight turns the trial into a paid year after about a day. Open the app and check that Pro is still on.

   On an iPhone with Sandbox accounts, the fuller checks are T1–T7 in
   [MONEY_POOLING_PHASE2_PLAN.md](../utility/MONEY_POOLING_PHASE2_PLAN.md) §10A.5.
3. **Promotional Text** can change without a new version. Optional (156 characters):

   ```text
   New: pool money with your group, choose who can spend and approve, and enter costs in the currency you paid in. New Pro subscribers get a 1-week free trial.
   ```

**If a trial check fails:**
- Play: the offer → **Deactivate**.
- Apple: the introductory offer → set its end date to today.

People already in a trial keep it. Tell me what failed.

---

## F. Wrap-up

1. **Bring `main` up to date** (it is 126 commits behind `stage`): open a pull request
   https://github.com/vkarkhanis/splitex-app/compare/main...stage and merge it with **Create a merge commit**.
2. **For the next iOS version:**
   - add `• Free trial for new subscribers, where offered` back to the description;
   - add *"Pro Yearly includes a 1-week free trial for new subscribers."* to the review notes.
3. **Optional:** delete the four test Traxettle users in the app (Profile → **Delete Account**) once their subscriptions have ended.
4. **Then the Expo 58 / iOS 27 upgrade**, in its own session.
