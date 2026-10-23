# App Review — Guideline 2.1 (Information Needed) response

Prepared 2026-10-23 from the code on `feature/money-pooling`. Copy the two texts below into App Store Connect;
fill in the `<…>` placeholders. **Never commit real demo passwords to this public repo.**

## 0. Before you resubmit (these decide whether the next review passes)

1. ~~**Deploy the production API from this branch.**~~ **Done 2026-10-23.** Verified signed out: pool routes
   (`/api/pools/event/:id/summary`), `/api/users/account/outstanding`, `/api/settlements/:id/close-deleted-user`
   and `DELETE /api/users/account` answer 401 (they exist), not 404. The web app (privacy policy with in-app
   account deletion) was deployed the same day. **Deploy both again** for Sign in with Apple: the API gains
   `POST /api/auth/apple`, and the privacy policy now names Sign in with Apple.
2. **Upload a fresh build** (`npm run build:ios:testflight`, version 1.0.37+) and select it on the version
   page. It carries the exchange-rate credit, the new delete-account text and Close Payment.
3. **Create the demo accounts on production** (sign up in the app, not staging), e.g.
   `traxettleapp+review@gmail.com` and `traxettleapp+review2@gmail.com` (Gmail delivers `+` addresses to the
   main inbox). Verify both emails if the app asks. Then add the sample data in section 4.
4. **Subscription:** on the version page, add "Traxettle Pro" under *In-App Purchases and Subscriptions*
   (a first subscription must be submitted with an app version); Paid Apps agreement Active; subscription
   metadata complete (no "Missing Metadata").
5. **Sign in with Apple (guideline 4.8).** Added 2026-10-23 on iOS (sign in, register, and revocation when
   the account is deleted). Before building, do the Apple Developer and API setup in
   [`SIGN_IN_WITH_APPLE_SETUP.md`](../runbook/SIGN_IN_WITH_APPLE_SETUP.md); the App ID needs the capability
   and the App Store profile must be regenerated, or the archive fails to sign.
6. **Dormant code (guideline 2.3.1).** The Razorpay SDK and its checkout are removed from the app
   (2026-10-23); the payment sheet is the manual "I've Paid" flow only. Ship it in the next build.
   The 7-tap staging switch is disclosed in the notes below.
7. **Pro right after purchase.** Fixed 2026-10-23: after a purchase or restore the app waits (up to about
   15 s) for the server to confirm Pro, and re-reads the profile whenever the app returns to the foreground.
   Before this, a reviewer who bought Pro saw Pro features locked until restarting the app. Ship it in the
   next build.
8. **RevenueCat offering and settings.** Fixed 2026-10-23: the `default` offering had no App Store product,
   so Upgrade to Pro had nothing to sell (fixed in the RevenueCat dashboard; no build needed). And the app
   kept the server settings (incl. the RevenueCat key) it first saved; it now refreshes them on every start.
   A reviewer's fresh install was never affected, but ship the refresh in the next build.
9. **Restore onto another account.** Fixed 2026-10-23 (API only, deploy it): Restore Purchase on a second
   Traxettle account made RevenueCat move the subscription (`TRANSFER`), which the API rejected, so the
   new account stayed locked and the old one kept Pro. The API now applies transfers (section 6, step 13).
10. **Age rating:** 13+ (matches the privacy policy).

## 1. Where each piece goes in App Store Connect

| What | Where |
|---|---|
| **Answers to questions 1–5** (section 2) | Your app → **App Review** → the rejected submission → **Reply** in the message thread. Attach the video to the reply. |
| **Demo username and password** | Version page → **App Review Information** → tick **Sign-in required** → **User name** / **Password** |
| **Review Notes** (section 3) | Version page → **App Review Information** → **Notes** (max 4,000 characters; kept for later reviews) |
| **Demo video** | Version page → **App Review Information** → **Attachment** (and/or attach it to the reply) |
| **Contact details** | Version page → **App Review Information** → first and last name, phone, email |
| **Build and subscription** | Version page → **Build** (new build) and **In-App Purchases and Subscriptions** |
| **Resubmit** | Version page → **Add for Review** / **Resubmit to App Review** after replying |

## 2. Reply to App Review (questions 1–5) — 3481 of 4,000 characters

```text
Hello App Review team, thank you for the review. Our answers, in the order you asked:

1. PURPOSE AND AUDIENCE
Traxettle is a shared-expense tracker for groups: friends on a trip, flatmates, families, event and wedding organisers, small teams and clubs. Members record who paid for what and split each expense the way the group agreed (equally, by ratio, or exact amounts; a couple or family can count as one unit). Traxettle then works out the fewest payments needed to settle up. People pay each other outside the app (bank transfer, UPI, cash) and record it, and the receiver confirms. "Pool money" lets one person fund a budget (for example a family holiday or a team offsite) that others spend from, with approval rules, receipt-backed claims and a transparent ledger.
Problem solved: shared spending across many people is hard to track fairly and leads to awkward follow-ups and many small transfers. Value: one shared, live record with receipts, fair splits, the fewest transfers, and confirmation of every payment.
Audience: people aged 13+ who share costs. Free (up to 3 events, no ads); Traxettle Pro is a yearly auto-renewable subscription through Apple In-App Purchase (unlimited events, multi-currency settlement).

2. SETUP AND ACCESS
Sign-in is required. Demo account (production server, pre-loaded with sample data): see the App Review Information username and password; tap "Sign In". A second account, for the other side of shared events, is in the Review Notes. Steps:
- Dashboard → "Goa Trip (sample)": expenses, splits, receipts and settlement payments ("I've Paid" for the payer; "Mark as Paid" / "Confirm" for the receiver).
- "+ Create Event" → name, dates, currency → "Split expenses" or "Pool money → Just me". Inside an event: "+ Add Expense" (attach a receipt with the camera or photo library), "+ Invite", "Settle Now".
- "Family Holiday Budget (sample)": open the pool card to approve or reject a pending claim.
- Profile → "Upgrade to Pro" for the subscription (use a Sandbox account); Profile → "Delete Account" (please try it with a newly registered account, not the demo ones).
No sample files are needed. A demo video is attached.

3. EXTERNAL SERVICES
- Firebase Authentication (Google): email/password, email-link and Google Sign-In
- Sign in with Apple
- Cloud Firestore and Cloud Storage for Firebase: app data and receipt images
- Google Cloud Run: hosts our own API; Firebase Hosting: our web pages
- Apple In-App Purchase with RevenueCat: subscription purchase and status
- ExchangeRate-API (open.er-api.com): daily exchange rates, credited in the app
- Gmail SMTP: invitation emails
No advertising, tracking/analytics or AI services. No payment processor: the app does not move money.

4. REGIONAL DIFFERENCES
None. The app works the same in all regions, with the same features and content and an English interface. Each event uses a currency the user picks (USD, EUR, GBP, INR, JPY, AUD, CAD). Subscription prices are set by Apple per storefront.

5. REGULATED INDUSTRY / PROTECTED MATERIAL
Not applicable. Traxettle is a record-keeping tool. It does not hold, transfer or process money, and offers no payments, lending, investment, insurance, crypto or gambling. Pooled money is recorded, not held: funds stay with the people who own them. The only third-party content is exchange-rate data from ExchangeRate-API, used under its terms (commercial use with attribution, which the app shows). No licences or credentials apply.

Thank you!
```

## 3. App Review Information → Notes — 2580 of 4,000 characters

```text
DEMO ACCOUNTS (production server, sample data pre-loaded)
Main: the username and password above. Tap "Sign In" (please use the password rather than Apple, Google or the email link). Sign in with Apple also works and creates a new, empty account.
Second account, for the other side of shared events: <SECOND EMAIL> / <SECOND PASSWORD>

WHAT TRAXETTLE DOES
A shared-expense tracker for groups (trips, flatmates, families, events, teams). Members record who paid for what, split it (equal, ratio or exact amounts) and Traxettle proposes the fewest payments to settle up. People pay each other outside the app and record it; the receiver confirms. Traxettle never holds, sends or processes money. "Pool money → Just me" lets one person fund a budget that others spend from, with approvals, receipts and a ledger (again only as a record).

WHERE TO LOOK
1. "Goa Trip (sample)": expenses with splits and receipts, and settlement payments. As the payer tap "I've Paid"; as the receiver (second account) tap "Confirm" or "Mark as Paid".
2. "+ Create Event": name, dates, currency, then "Split expenses" or "Pool money → Just me". The free plan allows 3 events; the demo account has 2.
3. In an event: "+ Add Expense" (attach a receipt with the camera or photo library), "+ Invite", "Settle Now".
4. "Family Holiday Budget (sample)": tap the pool card for the balance, spending by person and a claim waiting for approval.
5. Traxettle Pro (yearly auto-renewable subscription via In-App Purchase): Profile → "Upgrade to Pro". It unlocks unlimited events and multi-currency settlement. Price, renewal terms, Restore Purchase, Terms of Use (Apple standard EULA) and Privacy Policy are on that screen. Please buy with a Sandbox account.
6. Profile → "Delete Account": removes the sign-in and personal data. Shared events stay for the other members, with the user shown as "Deleted user". For a Sign in with Apple account, the app asks Apple for confirmation and revokes the Apple ID authorization. To try it, please register a new account (or use Sign in with Apple) rather than deleting the demo accounts, which we keep for later reviews.

PERMISSIONS
Camera and photo library, only to attach receipt or payment-proof photos. No location, contacts, tracking or push notifications.

INTERNAL TEST SWITCH (disclosure)
Tapping the "Traxettle" title 7 times on the sign-in screen points the app at our staging (test) server, which our TestFlight testers use. It is not a feature for users and does not unlock paid features. Please stay on the default production server.

A demo video is attached.
```

## 4. Sample data for the demo accounts (create on production)

Keep the main demo account on the **free plan** with **2 events**, so a reviewer can create a third and can
buy Pro.

- **"Goa Trip (sample)"**: Split expenses, INR, with the second account as a participant. Add 3–4 expenses,
  including one split by ratio and one with a receipt photo. Tap **Settle Now** and approve, so it reaches the
  payment stage. Leave one payment where the main account pays (shows "I've Paid") and one where it receives.
- **"Family Holiday Budget (sample)"**: Pool money → Just me, ₹1,00,000, main account as custodian and the
  second account as spender. Record one approved pool expense, and leave one claim from the second account
  **pending**, so the reviewer can approve or reject it.

## 5. Facts behind the answers (for future reviews)

- **Sign-in:** Firebase Authentication with email and password, an email link, Google Sign-In, or Sign in
  with Apple on iOS (`LoginScreen.tsx`, `RegisterScreen.tsx`). Apple and Google tokens are checked by our API
  (`POST /api/auth/apple`, `/api/auth/google`), which returns a Firebase custom token. Deleting an Apple
  account revokes its Apple authorization (`DELETE /api/users/account` with a fresh authorization code).
- **Services:** Firestore and Cloud Storage for Firebase (receipts), API on Google Cloud Run, Socket.IO on our
  own API for live updates, Firebase Hosting (web, privacy, delete-account pages), RevenueCat with Apple
  In-App Purchase (`traxettle_pro_yearly`, entitlement `traxettle-pro`, offering `default`), ExchangeRate-API (`open.er-api.com`),
  Nodemailer through Gmail SMTP for invitations.
- **No:** ads, analytics or tracking SDKs, AI services, push notifications, location, contacts.
- **Payments:** the production API returns only the "manual" provider (`SETTLEMENT_GATEWAY_PILOT_ENABLED` is
  unset), so users record payments made elsewhere and the app processes none. Razorpay and Stripe code is
  inactive.
- **Permissions:** camera and photo library (receipts and payment proof).
- **Plans:** free, up to 3 active or closed events. Pro adds unlimited events and multi-currency settlement.
- **Hidden switch:** 7 taps on the "Traxettle" title on sign-in toggles the staging server (`LoginScreen.tsx`).
  Profile's developer options only appear in local builds.
- **Support and privacy:** traxettleapp@gmail.com, https://traxettle-prod.web.app/privacy.html, and
  `delete-account-info.html`.

## 6. Testing subscriptions end to end (TestFlight)

TestFlight purchases run in Apple's **Sandbox**: nothing is charged, and renewals come faster than in real
life. App Review also buys in Sandbox, on the submitted build, so steps B–D below are what a reviewer does.
The difference is the account: they use your demo account or sign up themselves.

### A. One-time setup to check first

- **App Store Connect:** "Traxettle Pro" (`traxettle_pro_yearly`) has complete metadata (no "Missing
  Metadata"); Paid Apps agreement **Active**; tax and banking done.
- **RevenueCat → your App Store app:** the In-App Purchase key and App Store Connect API key are uploaded,
  with no "Connection issue" on Products. The product grants entitlement **`traxettle-pro`**, and offering
  **`default`** is *Current*, with package `$rc_annual` holding the App Store product `traxettle_pro_yearly`
  and the Play product `pro_yearly_1` (one offering for both stores). Checked 2026-10-23 with production's keys.
- **RevenueCat → Integrations → Webhooks (production):**
  - URL `https://traxettle-api-prod-ncwutlgtga-uc.a.run.app/api/billing/revenuecat/webhook`
  - Authorization header = `RC_REVENUECAT_WEBHOOK_SECRET` from `rc_production.properties`
  - events for **Production and Sandbox**
- **`rc_production.properties`:** `RC_REVENUECAT_APPLE_PUBLIC_KEY` is the production app's public key
  (`appl_…`), and `RC_REVENUECAT_PRO_ENTITLEMENT_ID=traxettle-pro`. The TestFlight build and the API both read
  this file; the app uses the key the API serves (`/api/config`), so a changed key needs an API deploy.
  `rc_staging.properties` needs the same real key: on 2026-10-23 staging still served `appl_CHANGE_ME`.
- *(Recommended)* App Store Connect → App Information → **App Store Server Notifications**: paste
  RevenueCat's **Apple Server Notification URL** (one URL per app) into both **Production Server URL**
  and **Sandbox Server URL**, Version 2, so it hears about changes immediately. The Sandbox one matters
  for TestFlight, whose purchases are sandbox purchases.

### B. Free plan, new account

1. Install the TestFlight build. Stay on the production server (don't use the 7-tap switch).
2. Sign up with a new email, e.g. `traxettleapp+rc1@gmail.com`, and verify it if asked.
3. Profile → **Upgrade to Pro**: the price is the store's price (US $5.99/year; ₹299 in India), with
   renewal terms, **Restore Purchase**, Terms of Use and Privacy Policy. *A missing or fallback price, or "In-app
   purchases are not configured", means RevenueCat isn't returning the offering: check the key and products.*
4. Create 3 events. The 4th shows **Free Plan Limit**. In "+ Create Event", picking a different settlement
   currency shows the **PRO** lock.

### C. Buy Pro

5. **Upgrade to Pro** → subscribe. The Apple sheet shows *Environment: Sandbox*; confirm.
6. The app shows **Welcome to Pro!** after a few seconds. *Builds before 2026-10-23 show it at once, but Pro
   features stay locked until the app is reopened (fixed in the next build).*
7. **RevenueCat → Customers**: search `production::<Firebase UID>` (find the UID in Firebase → Authentication).
   It shows entitlement `traxettle-pro` active, a Sandbox purchase and an `INITIAL_PURCHASE` event.
8. **RevenueCat → Webhooks → delivery history**: that event was delivered with **200**. *401 means the
   webhook secret doesn't match the deployed one; no delivery means Sandbox events aren't enabled.*
9. **Firestore → `users/<uid>`**: `tier: "pro"`, `entitlementStatus: "active"`, `entitlementSource: "revenuecat"`.
10. In the app: a 4th event can be created; an event with a different settlement currency is allowed.

### D. Restore

**Restore Purchase** is only on the Upgrade screen, which a Pro account doesn't see (it shows "You're a Pro!").
Pro also follows the Traxettle account to any device by itself, so signing in again needs no restore. Restore
matters when an Apple Account that already subscribed is used with a **different** Traxettle account:
RevenueCat then moves the subscription to it (a `TRANSFER`). That needs RevenueCat → Project settings →
**Restore behavior** (*Transfer behavior* in newer dashboards) = *Transfer to new App User ID* (the default) and the API from 2026-10-23 or later.

11. **The button is there:** on a free account, Upgrade to Pro shows **Restore Purchase** (Apple checks this).
12. **Nothing to restore:** a free Traxettle account with an Apple Account that has never subscribed (e.g. a
    new Sandbox Apple Account) → **Restore Purchase** → "No Purchase Found".
13. **Moving the subscription:** keep the Apple Account that bought in C. Sign out, register a second
    Traxettle account (e.g. `traxettleapp+rc2@gmail.com`) → Upgrade to Pro → **Restore Purchase** →
    "Restored!" within about 15 s, and Pro features work.
    - RevenueCat → Customers: the subscription is now on `production::<new uid>`, with a `TRANSFER` event;
      Webhooks shows it delivered with **200**.
    - Firestore: the new account `tier: "pro"`; the first one `tier: "free"`, `entitlementStatus: "expired"`.
    - Sign in to the first account again: it's on the free plan. Restore there moves the subscription back.

### E. Cancel and expire

14. Cancel the subscription in the device's subscription settings. For TestFlight purchases use
    Settings → *your name* → Subscriptions; for a Sandbox tester account use Settings → App Store →
    Sandbox Account → Manage.
15. RevenueCat shows `CANCELLATION`, and the webhook returns 200. Firestore stays `tier: "pro"`, `entitlementStatus:
    "active"`, so Pro is kept until the paid period ends.
16. After the accelerated period ends: `EXPIRATION`, then Firestore `tier: "free"`, `entitlementStatus: "expired"`.
    The app returns to the free plan the next time it comes to the foreground; a 4th event is blocked again.

### F. If something fails

| Symptom | Likely cause |
|---|---|
| No price / "not configured" | Wrong `RC_REVENUECAT_APPLE_PUBLIC_KEY` in the build, offering not Current, or products not imported |
| "Invalid API key" (RevenueCat troubleshooting link) | On Staging: `rc_staging.properties` still has `appl_CHANGE_ME`. On Production with a build before 2026-10-23: the device kept the key it first saved; switch to Staging and back (7 taps twice) or reinstall |
| "You have configured the SDK with an App Store API key, but there are no App Store products registered…" | The `default` offering's `$rc_annual` package has no App Store product attached (RevenueCat → Offerings → `default`) |
| Purchase succeeds, Pro features stay locked | Webhook not reaching the API: wrong secret (401), Sandbox events off, or wrong URL |
| Webhook 200 but Firestore unchanged | Entitlement ID mismatch (`RC_REVENUECAT_PRO_ENTITLEMENT_ID` vs RevenueCat) |
| "Restored!" on a second account, but Pro stays locked | The `TRANSFER` webhook failed or the API predates 2026-10-23. RevenueCat → Webhooks: a **500** means the API couldn't look the customer up in RevenueCat (check the key `/api/config` serves) |
| Pro in the app on one account, not another | Expected: RevenueCat customers are per Traxettle account (`production::<uid>`) |
