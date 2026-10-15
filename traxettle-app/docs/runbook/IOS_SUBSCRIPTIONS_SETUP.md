# iOS Subscriptions (RevenueCat) — Setup, Test and App Review

Step-by-step setup for selling **Traxettle Pro** as a yearly auto-renewable
subscription on iOS through RevenueCat: App Store Connect, the RevenueCat
dashboard, this repo's builds, testing, and what App Review needs.

Do the sections in order. Steps marked **(one-time)** are never repeated.
Apple and RevenueCat rename menus now and then; if a label differs slightly,
look for the nearest match.

Related: [DEPLOYMENT_CHANNELS.md](../deployment/DEPLOYMENT_CHANNELS.md) (TestFlight
build and App Store release), [REVENUECAT_INTEGRATION_RUNBOOK.md](../utility/REVENUECAT_INTEGRATION_RUNBOOK.md).

---

## 0. What the app expects

These come from the code; the setup below has to match them.

| Item | Value | Where in code |
|---|---|---|
| Entitlement | `pro` | `RC_REVENUECAT_PRO_ENTITLEMENT_ID`, API `REVENUECAT_PRO_ENTITLEMENT_ID` |
| Offering | `default`, marked **Current** | `RC_REVENUECAT_OFFERING_ID` |
| Package the app sells | the offering's **Annual** package (falls back to Lifetime, then the first package) | `apps/mobile/src/services/purchases.ts` |
| Product | yearly auto-renewable subscription | `ProUpgradeScreen.tsx` ("Yearly subscription") |
| Webhook | `POST https://<API>/api/billing/revenuecat/webhook`, secret in the `Authorization` header (`Bearer` optional) | `apps/api/src/routes/billing.ts` |
| Bundle ID | `com.traxettle.app` | `apps/mobile/app.json` |

The app already has **Restore Purchase**, **Manage Subscription** and **Delete Account**,
which App Review checks for.

---

## 1. App Store Connect

### 1.1 Agreements, tax and banking (one-time)
1. App Store Connect → **Business** (or *Agreements, Tax, and Banking*).
2. Accept the **Paid Applications** agreement.
3. Add a **bank account** and complete the **tax forms**.
4. Wait until the agreement shows **Active**. Until then products don't load, even in testing.

### 1.2 Create the subscription (one-time)
1. **Apps → Traxettle → Monetization → Subscriptions → Create** a subscription group, e.g. *Traxettle Pro*.
2. In the group, **Create** a subscription:
   - **Reference name:** *Pro Yearly* (internal only).
   - **Product ID:** e.g. `traxettle_pro_yearly`. **It can never be reused or renamed**, so choose carefully.
3. Open the subscription and fill in:
   - **Subscription duration:** 1 year.
   - **Subscription prices:** base country United States **$5.99**; set **India to ₹299** in the price list. Review the auto-generated prices for other countries.
   - **Localization** (at least English): display name (*Traxettle Pro*) and a description.
   - **Review information:** a **screenshot of the Pro upgrade screen** and a short note on how to reach it (*Profile → Upgrade to Pro*).
4. Group **Localization:** add a display name for the group too.
5. The status should read **Ready to Submit**. That is enough for TestFlight testing.

### 1.3 First-year discount (introductory offer, optional)
The upgrade screen shows whatever offer the store returns. With an offer it reads e.g.
*"₹269 for your first year, then ₹299/year."*; without one, the banner is hidden.
1. Subscription → **Subscription prices → Introductory offer → Create**.
2. Countries: all. Type: **Pay up front**, duration **1 year**.
3. Price: e.g. about 10% below each base price. Apple only offers fixed price points.
4. Introductory offers apply once per subscription group, to new subscribers only.

### 1.4 Two keys for RevenueCat (one-time)
RevenueCat needs **two different keys**. They are not interchangeable.

**a) In-App Purchase key** (RevenueCat uses it to verify purchases)
1. **Users and Access → Integrations → In-App Purchase → Generate** (or **+**). Name it *RevenueCat IAP*.
2. **Download the `.p8` file now.** Apple lets you download it only once. Store it safely.
3. Note its **Key ID**.

**b) App Store Connect API key** (RevenueCat uses it to read products and prices; without it the
RevenueCat Products page shows *"Connection issue: App Store Connect API not configured"*)
1. **Users and Access → Integrations → App Store Connect API → Team Keys.** The first time, the
   Account Holder must click **Request Access**.
2. **Generate API Key** (or **+**): name *RevenueCat ASC*, access **App Manager** (Admin also works;
   lower roles fail).
3. **Download the `.p8` now** (once only). Note its **Key ID** and the **Issuer ID** shown above
   the keys table. Use a **Team** key: individual keys have no Issuer ID and RevenueCat can't use them.
4. Note your **Vendor number** too, if RevenueCat asks for it: **Payments and Financial Reports**,
   top left.

### 1.5 App listing items App Review checks (one-time)
1. **App Privacy → Privacy Policy URL:** `https://traxettle-prod.web.app/privacy.html` (served from `apps/web/public/privacy.html`).
2. **App Privacy → Data collection:** declare what the app collects. At least: contact info (email, name), user ID, purchase history (subscriptions), photos (receipts and payment proof), and other user content (expenses). None of it is used for tracking.
3. **Terms of Use (EULA):** either keep Apple's **standard EULA** (no action in the EULA field) **and** add this line at the end of the app **Description**:
   `Terms of Use: https://www.apple.com/legal/internet-services/itunes/dev/stdeula/`
   or upload your own terms under **App Information → License Agreement** and link them instead.

### 1.6 Sandbox test account (optional, one-time)
Only needed to buy on a **simulator** or a development build. TestFlight testers use their own Apple ID in Apple's test environment and are not charged.
1. **Users and Access → Sandbox → Test Accounts → +**. Use an email that isn't an existing Apple ID.
2. On the simulator: **Settings → Developer → Sandbox Apple Account**, then sign in.

---

## 2. RevenueCat dashboard

Use **one RevenueCat project** for now. The app tags customers by environment
(`production::<uid>`, `staging::<uid>`), so staging and production customers don't collide.

### 2.1 Add the App Store app (one-time)
1. RevenueCat → your project → **Apps & providers** (or **Apps**) → **+ New** → **App Store**.
2. **Bundle ID:** `com.traxettle.app`.
3. **In-app purchase key configuration:** upload the **In-App Purchase** `.p8` from 1.4a, with its
   **Key ID** and the **Issuer ID**.
4. **App Store Connect API:** upload the **App Store Connect API** `.p8` from 1.4b, with its
   **Key ID**, the **Issuer ID** and, if asked, the **Vendor number**.
5. Save. Both sections should show as valid. RevenueCat now shows an **Apple Server Notification
   URL** for this app; copy it.

### 2.2 Send Apple's subscription notifications to RevenueCat (one-time)
1. App Store Connect → **Apps → Traxettle → App Information → App Store Server Notifications**.
2. **Production Server URL** and **Sandbox Server URL**: paste the URL from 2.1. Version: **Version 2**.

### 2.3 Product → entitlement → offering (one-time)
1. **Product catalog → Products → + New** → choose the App Store app → Product ID `traxettle_pro_yearly` (from 1.2).
2. **Product catalog → Entitlements → + New** → identifier **`pro`** → **Attach** the product.
3. **Product catalog → Offerings → + New** → identifier **`default`** → **Make current**.
4. In `default`, **+ New package** → identifier **Annual** (`$rc_annual`) → attach the product.

### 2.4 Public API key (one-time)
**API keys** → copy the **App Store public key** (starts with `appl_`).
Never use the secret key (`sk_…`) in the app.

### 2.5 Webhook to the API (one-time per API)
1. **Integrations → Webhooks → + New**.
2. **URL:** `https://<production API>/api/billing/revenuecat/webhook`
3. **Authorization header value:** the value of `RC_REVENUECAT_WEBHOOK_SECRET` from `rc_prod.properties`. It must equal the secret the production API was deployed with.
4. **Environment:** production **and** sandbox, so TestFlight purchases (which are sandbox) reach the API too.

> Test purchases while the app is on **Production** (its default). The API matches unknown users by
> email, so a purchase made while switched to Staging could mark a production account with the
> same email as Pro.

---

## 3. Repo and builds

### 3.1 RevenueCat keys in the properties files
In `traxettle-rush/`, set this line in `rc_prod.properties`:
```
RC_REVENUECAT_APPLE_PUBLIC_KEY=appl_xxxxxxxxxxxxxxxx
```
Put the same value in `rc_staging.properties`, because one project serves both environments.
Keep `RC_REVENUECAT_PRO_ENTITLEMENT_ID=pro`, `RC_REVENUECAT_OFFERING_ID=default`, and the
webhook secret as they are. The build and deploy scripts read these files automatically.
Nothing fills them in for you.

### 3.2 Deploy the API
The API hands the Apple key to the app (`/api/config`) and checks the webhook secret, so
redeploy after changing the properties files:
```bash
bash scripts/api-deployment/deploy-prod-gmail.sh      # or deploy-prod.sh without email
bash scripts/api-deployment/deploy-staging.sh
```
Make sure `jq` is installed first; see the production steps in the deployment docs.

### 3.3 TestFlight build
```bash
cd apps/mobile
APPLE_TEAM_ID=<your Team ID> bash scripts/build-ios.sh testflight
```
The Apple key is baked into the build, so rebuild whenever it changes.

---

## 4. Test (TestFlight)

Use a tester account that is **not** Pro yet, with the app on **Production**.

| # | Do | Expect |
|---|---|---|
| 1 | Profile → **Upgrade to Pro** | Price loads from the App Store; the intro offer shows if set up |
| 2 | **Subscribe**, confirm with Face ID / password | Apple's sheet says *[Environment: Sandbox]*; no real charge |
| 3 | Return to the app (allow up to a minute) | **Pro Active** on Profile; Pro features unlocked. The app needs **both** the App Store entitlement and the API's record from the webhook, so this also proves the webhook works |
| 4 | RevenueCat → **Customers** → search `production::<user id>` | Active `pro` entitlement, sandbox transaction |
| 5 | Still not Pro after a minute | RevenueCat → **Integrations → Webhooks** → recent deliveries: expect **200**. A **401** means the Authorization value doesn't match the API's webhook secret |
| 6 | Second device, same account → **Restore Purchase** | Pro restored |
| 7 | **Manage Subscription** → cancel | Pro ends when the period runs out. Sandbox years last about an hour |

If step 1 shows no price, check in this order: Paid Applications agreement **Active** (1.1),
product **Ready to Submit** (1.2), RevenueCat product, entitlement and **current** offering (2.3),
`RC_REVENUECAT_APPLE_PUBLIC_KEY` set and the build rebuilt (3.1, 3.3).

---

## 5. App Review readiness

### 5.1 In-app links and renewal terms (done in code)
Apple requires, **inside the purchase flow** for auto-renewable subscriptions (Guideline 3.1.2),
the renewal terms plus links to the Terms of Use and Privacy Policy. The upgrade screen shows the
auto-renewal terms with the store price, and **Terms of Use (EULA)** (Apple's standard EULA, iOS
only) and **Privacy Policy** links under the Subscribe button. The URLs and copy live in
`apps/mobile/src/utils/subscriptionTerms.ts`.

### 5.2 Prices from the store (done in code)
The first-year and renewal prices both come from the store (`product.introPrice` and the product
price), so the screen always matches what the user is charged. The offer banner only appears
when the store returns an introductory offer.

### 5.3 Privacy policy content (done; live after a web deploy)
`apps/web/public/privacy.html` now covers receipts on expenses and pool payments, pool records
shared with event members, store-processed payments, RevenueCat as the subscription provider,
and the named service providers. It goes live at `https://traxettle-prod.web.app/privacy.html`
with the next production web deploy (`scripts/web-deployment/deploy-web-prod.sh`). Match the
App Store Connect **App Privacy** answers (1.5) to it.

### 5.4 App Review information (each submission)
App Store Connect → the version → **App Review Information**:
1. **Sign-in required:** give a working **demo account** (email and password) on **production**.
2. **Notes:** how to reach the subscription (*Profile → Upgrade to Pro*). The account deletion path
   is *Profile → Delete Account*.

### 5.5 Submit the subscription with the version (first time only)
On the version page → **In-App Purchases and Subscriptions → +** → add *Pro Yearly*. Apple
reviews the first subscription together with the app version. Later subscription changes can
be submitted on their own.
