# Settlement Integration Recommendation and Execution Runbook

## Recommended provider split
- INR settlements: **Razorpay**
- Non-INR settlements (USD/EUR/GBP/etc.): **Stripe**

This matches your existing routing intent in:
- `traxettle-rush/apps/api/src/services/fx-rate.service.ts` (`INR -> razorpay`, else `stripe`)

## Why this is the best fit for your current code
- You already have a currency-aware settlement model (`settlementCurrency`, `fxRate`, etc.).
- Your settlement flow already has lifecycle states (`pending -> initiated -> completed`).
- You only need to replace "mock payment" in `POST /api/settlements/:id/pay` with real gateway session/order creation + webhook confirmation.

## Expected expenditure (gateway + infra)

### Razorpay (INR)
- Pricing page shows standard online payment MDR around **2%** (depends on method/business category).
- Setup cost: typically **0** for standard account onboarding.
- Optional cost: GST/compliance/accounting overhead.

### Stripe (international)
- Stripe pricing page (India card-processing page) shows **IN cards 2%** and **international cards 3%** (plus applicable taxes).
- If settlement currency and source differ, add FX conversion spread/fees based on your Stripe account settings.

### Infra cost (Traxettle side)
- Webhook handling + Firestore writes: usually negligible compared to payment fees.
- Engineering cost: ~3 to 6 developer days for API + web + mobile + tests.

Note: Fees can vary by geography, payment method, and negotiated enterprise plans. Reconfirm in dashboard before go-live.

## Full step-by-step integration plan (minimal-change path)

### Create gateway accounts and keys
- Create Razorpay account and generate:
  - `RAZORPAY_KEY_ID`
  - `RAZORPAY_KEY_SECRET`
  - `RAZORPAY_WEBHOOK_SECRET`
- Create Stripe account and generate:
  - `STRIPE_SECRET_KEY`
  - `STRIPE_WEBHOOK_SECRET`
- Configure redirect URLs (both gateways):
  - `PAYMENT_SUCCESS_URL`
  - `PAYMENT_CANCEL_URL`

### Install dependencies in API
From repo root (`traxettle-rush`):

```bash
rush add --package razorpay --to @traxettle/api
rush add --package stripe --to @traxettle/api
rush update
```

### Add environment variables
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

### Add payment-gateway abstraction
Create API files:
- `apps/api/src/services/payment-gateway/types.ts`
- `apps/api/src/services/payment-gateway/razorpay.gateway.ts`
- `apps/api/src/services/payment-gateway/stripe.gateway.ts`
- `apps/api/src/services/payment-gateway/payment-gateway.factory.ts`

Implement one interface:
- `createCheckout(settlement): { checkoutUrl, providerPaymentId, provider }`
- `verifyWebhook(headers, body): normalizedEvent`

### Replace mock pay flow in settlement service
Update `apps/api/src/services/settlement.service.ts`:
- In `initiatePayment(...)`, determine provider using settlement currency (`INR => Razorpay`, else Stripe).
- Create gateway checkout session/order.
- Store these fields on settlement doc:
  - `paymentMethod` = `razorpay|stripe`
  - `paymentId` = provider payment/session/order id
  - `checkoutUrl`
  - `status` remains `initiated`
- Return `checkoutUrl` to UI.

### Add webhook endpoint for asynchronous confirmation
Add route file:
- `apps/api/src/routes/payment-webhooks.ts`

Implement endpoints:
- `POST /api/payment-webhooks/razorpay`
- `POST /api/payment-webhooks/stripe`

Webhook logic:
- Verify signature with gateway secret.
- Find settlement by `paymentId`.
- Idempotently mark settlement `completed` on success events.
- Emit existing socket event `settlement:updated`.
- If all event settlements completed, mark event `settled`.

Important: Use idempotency guard (ignore duplicate webhook delivery).

### Wire routes
Update `apps/api/src/index.ts`:
- Register webhook routes before generic error handler.

### Update web and mobile pay action
Current pay actions just call `/pay` and locally mark `initiated`.

Required change:
- `POST /api/settlements/:id/pay` should return `{ checkoutUrl }`.
- Web (`apps/web/src/app/events/[eventId]/page.tsx`):
  - On success, `window.location.href = checkoutUrl`.
- Mobile (`apps/mobile/src/screens/EventDetailScreen.tsx`):
  - Use `Linking.openURL(checkoutUrl)`.

### Testing checklist (must pass before live)
- Razorpay test payment completes and webhook sets settlement `completed`.
- Stripe test payment completes and webhook sets settlement `completed`.
- Duplicate webhook does not double-update state.
- Non-payer cannot call `/pay`.
- Non-payee cannot call `/approve` (if keeping manual approve fallback).
- Event auto-transitions to `settled` when all settlements complete.

### Go-live checklist
- Switch test keys to live keys in secret manager.
- Change webhook URLs to production API base URL.
- Rotate keys and set alerts for webhook failures.
- Monitor first 20 live settlements manually.

## Recommended rollout strategy
- Phase 1: INR-only (Razorpay) in production.
- Phase 2: Enable Stripe for one non-INR currency (USD).
- Phase 3: Enable all supported non-INR currencies.

## Source links used for fee estimates
- Razorpay pricing: <https://razorpay.com/pricing/>
- Stripe India pricing: <https://stripe.com/en-in/pricing>

## Non-production payment safety policy (implemented)

- Local, staging, TestFlight/internal default to mocked settlements.
- Real provider call in non-production is allowed only when all are true:
  - `PAYMENT_ALLOW_REAL_IN_NON_PROD=true` on API
  - request payload contains `useRealGateway=true`
  - requester is marked as internal tester
- Production follows production payment policy and valid live credentials.

## QA validation matrix

- Local default:
  - `PAYMENT_ALLOW_REAL_IN_NON_PROD=false`
  - expected provider in settlement pay response: `mock`
- Internal real-gateway verification:
  - `PAYMENT_ALLOW_REAL_IN_NON_PROD=true`
  - internal tester user only
  - request with `useRealGateway=true`
- Unauthorized non-prod real attempt:
  - non-internal tester or missing flag must silently fall back to mocked provider
