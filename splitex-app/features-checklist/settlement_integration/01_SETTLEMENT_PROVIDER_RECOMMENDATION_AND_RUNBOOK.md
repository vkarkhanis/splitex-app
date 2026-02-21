# Settlement Integration Recommendation and Execution Runbook

## 1) Recommended provider split
- INR settlements: **Razorpay**
- Non-INR settlements (USD/EUR/GBP/etc.): **Stripe**

This matches your existing routing intent in:
- `splitex-rush/apps/api/src/services/fx-rate.service.ts` (`INR -> razorpay`, else `stripe`)

## 2) Why this is the best fit for your current code
- You already have a currency-aware settlement model (`settlementCurrency`, `fxRate`, etc.).
- Your settlement flow already has lifecycle states (`pending -> initiated -> completed`).
- You only need to replace "mock payment" in `POST /api/settlements/:id/pay` with real gateway session/order creation + webhook confirmation.

## 3) Expected expenditure (gateway + infra)

## A. Razorpay (INR)
- Pricing page shows standard online payment MDR around **2%** (depends on method/business category).
- Setup cost: typically **0** for standard account onboarding.
- Optional cost: GST/compliance/accounting overhead.

## B. Stripe (international)
- Stripe pricing page (India card-processing page) shows **IN cards 2%** and **international cards 3%** (plus applicable taxes).
- If settlement currency and source differ, add FX conversion spread/fees based on your Stripe account settings.

## C. Infra cost (Splitex side)
- Webhook handling + Firestore writes: usually negligible compared to payment fees.
- Engineering cost: ~3 to 6 developer days for API + web + mobile + tests.

Note: Fees can vary by geography, payment method, and negotiated enterprise plans. Reconfirm in dashboard before go-live.

## 4) Full step-by-step integration plan (minimal-change path)

## Step 0: Create gateway accounts and keys
1. Create Razorpay account and generate:
   - `RAZORPAY_KEY_ID`
   - `RAZORPAY_KEY_SECRET`
   - `RAZORPAY_WEBHOOK_SECRET`
2. Create Stripe account and generate:
   - `STRIPE_SECRET_KEY`
   - `STRIPE_WEBHOOK_SECRET`
3. Configure redirect URLs (both gateways):
   - `PAYMENT_SUCCESS_URL`
   - `PAYMENT_CANCEL_URL`

## Step 1: Install dependencies in API
From repo root (`/Users/vkarkhanis/workspace/Splitex/splitex-rush`):

```bash
rush add --package razorpay --to @splitex/api
rush add --package stripe --to @splitex/api
rush update
```

## Step 2: Add environment variables
Add to monorepo root `.env.local` (loaded already by API startup):

```bash
# Razorpay (INR)
RAZORPAY_KEY_ID=rzp_test_xxxxx
RAZORPAY_KEY_SECRET=xxxxxxxx
RAZORPAY_WEBHOOK_SECRET=xxxxxxxx

# Stripe (non-INR)
STRIPE_SECRET_KEY=sk_test_xxxxx
STRIPE_WEBHOOK_SECRET=whsec_xxxxx

# Redirect URLs
PAYMENT_SUCCESS_URL=http://localhost:3000/payment/success
PAYMENT_CANCEL_URL=http://localhost:3000/payment/cancel
```

## Step 3: Add payment-gateway abstraction
Create API files:
- `apps/api/src/services/payment-gateway/types.ts`
- `apps/api/src/services/payment-gateway/razorpay.gateway.ts`
- `apps/api/src/services/payment-gateway/stripe.gateway.ts`
- `apps/api/src/services/payment-gateway/payment-gateway.factory.ts`

Implement one interface:
- `createCheckout(settlement): { checkoutUrl, providerPaymentId, provider }`
- `verifyWebhook(headers, body): normalizedEvent`

## Step 4: Replace mock pay flow in settlement service
Update `apps/api/src/services/settlement.service.ts`:
1. In `initiatePayment(...)`, determine provider using settlement currency (`INR => Razorpay`, else Stripe).
2. Create gateway checkout session/order.
3. Store these fields on settlement doc:
   - `paymentMethod` = `razorpay|stripe`
   - `paymentId` = provider payment/session/order id
   - `checkoutUrl`
   - `status` remains `initiated`
4. Return `checkoutUrl` to UI.

## Step 5: Add webhook endpoint for asynchronous confirmation
Add route file:
- `apps/api/src/routes/payment-webhooks.ts`

Implement endpoints:
- `POST /api/payment-webhooks/razorpay`
- `POST /api/payment-webhooks/stripe`

Webhook logic:
1. Verify signature with gateway secret.
2. Find settlement by `paymentId`.
3. Idempotently mark settlement `completed` on success events.
4. Emit existing socket event `settlement:updated`.
5. If all event settlements completed, mark event `settled`.

Important: Use idempotency guard (ignore duplicate webhook delivery).

## Step 6: Wire routes
Update `apps/api/src/index.ts`:
- Register webhook routes before generic error handler.

## Step 7: Update web and mobile pay action
Current pay actions just call `/pay` and locally mark `initiated`.

Required change:
1. `POST /api/settlements/:id/pay` should return `{ checkoutUrl }`.
2. Web (`apps/web/src/app/events/[eventId]/page.tsx`):
   - On success, `window.location.href = checkoutUrl`.
3. Mobile (`apps/mobile/src/screens/EventDetailScreen.tsx`):
   - Use `Linking.openURL(checkoutUrl)`.

## Step 8: Testing checklist (must pass before live)
1. Razorpay test payment completes and webhook sets settlement `completed`.
2. Stripe test payment completes and webhook sets settlement `completed`.
3. Duplicate webhook does not double-update state.
4. Non-payer cannot call `/pay`.
5. Non-payee cannot call `/approve` (if keeping manual approve fallback).
6. Event auto-transitions to `settled` when all settlements complete.

## Step 9: Go-live checklist
1. Switch test keys to live keys in secret manager.
2. Change webhook URLs to production API base URL.
3. Rotate keys and set alerts for webhook failures.
4. Monitor first 20 live settlements manually.

## 5) Recommended rollout strategy
1. Phase 1: INR-only (Razorpay) in production.
2. Phase 2: Enable Stripe for one non-INR currency (USD).
3. Phase 3: Enable all supported non-INR currencies.

## 6) Source links used for fee estimates
- Razorpay pricing: <https://razorpay.com/pricing/>
- Stripe India pricing: <https://stripe.com/en-in/pricing>


## 8) Non-production payment safety policy (implemented)

- Local, staging, TestFlight/internal default to mocked settlements.
- Real provider call in non-production is allowed only when all are true:
  - `PAYMENT_ALLOW_REAL_IN_NON_PROD=true` on API
  - request payload contains `useRealGateway=true`
  - requester is marked as internal tester
- Production follows production payment policy and valid live credentials.

## 9) QA validation matrix

1. Local default:
   - `PAYMENT_ALLOW_REAL_IN_NON_PROD=false`
   - expected provider in settlement pay response: `mock`
2. Internal real-gateway verification:
   - `PAYMENT_ALLOW_REAL_IN_NON_PROD=true`
   - internal tester user only
   - request with `useRealGateway=true`
3. Unauthorized non-prod real attempt:
   - non-internal tester or missing flag must silently fall back to mocked provider
