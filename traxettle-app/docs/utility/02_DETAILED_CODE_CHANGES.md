# Detailed Code Changes for Razorpay (INR) + Stripe (Other Currencies)

This document is mapped to your current code in `traxettle-rush` and is written for minimal structural change.

## 1) Files to modify

## A. Shared types
1. `traxettle-rush/libraries/shared/src/index.ts`
- Extend `Settlement` model with:
  - `checkoutUrl?: string`
  - `providerStatus?: 'created' | 'processing' | 'succeeded' | 'failed' | 'cancelled'`
  - `providerRawEventId?: string`
- Keep existing `status: 'pending' | 'initiated' | 'completed'` unchanged to avoid broad UI impact.

## B. API dependencies
1. `traxettle-rush/apps/api/package.json`
- Add:
  - `razorpay`
  - `stripe`

## C. API service layer (new files)
1. `traxettle-rush/apps/api/src/services/payment-gateway/types.ts`
- Add interfaces:
  - `GatewayCheckoutRequest`
  - `GatewayCheckoutResponse`
  - `NormalizedWebhookEvent`
  - `PaymentGateway`

2. `traxettle-rush/apps/api/src/services/payment-gateway/razorpay.gateway.ts`
- Implement Razorpay payment-link based flow for INR.
- Method `createCheckout(...)` returns `short_url` as `checkoutUrl`.
- Method `verifyWebhook(...)` validates HMAC and normalizes event.

3. `traxettle-rush/apps/api/src/services/payment-gateway/stripe.gateway.ts`
- Implement Stripe Checkout Session flow for non-INR.
- Method `createCheckout(...)` returns `session.url` as `checkoutUrl`.
- Method `verifyWebhook(...)` with `stripe.webhooks.constructEvent`.

4. `traxettle-rush/apps/api/src/services/payment-gateway/payment-gateway.factory.ts`
- Provider selection:
  - `INR => RazorpayGateway`
  - otherwise `StripeGateway`

## D. API existing services
1. `traxettle-rush/apps/api/src/services/fx-rate.service.ts`
- Keep `getPaymentProvider` behavior as-is (already aligned).
- Optional: return `PaymentProvider` enum from shared types for consistency.

2. `traxettle-rush/apps/api/src/services/settlement.service.ts`
- Replace mock implementation in `initiatePayment(settlementId, userId)`.
- New behavior:
  1. Load settlement and auth check (existing).
  2. Resolve settlement currency (`settlementCurrency || currency`).
  3. Build checkout request.
  4. Use gateway factory to create checkout.
  5. Persist:
     - `status = 'initiated'`
     - `paymentMethod = provider`
     - `paymentId = providerPaymentId`
     - `checkoutUrl`
     - `providerStatus = 'created'`
  6. Return settlement + checkoutUrl.

- Add new method:
  - `markPaymentCompletedByProvider(paymentId: string, provider: string, providerEventId: string)`
- Add new method:
  - `markPaymentFailedByProvider(...)` (optional but recommended)

## E. API routes
1. `traxettle-rush/apps/api/src/routes/settlements.ts`
- `POST /:settlementId/pay` response body currently returns settlement object.
- Update to include `checkoutUrl` in response.
- Keep backward compatibility:
  - `{ success: true, data: { ...settlement, checkoutUrl } }`

2. New file: `traxettle-rush/apps/api/src/routes/payment-webhooks.ts`
- Add endpoints:
  - `POST /razorpay`
  - `POST /stripe`
- Route flow:
  1. Verify signature.
  2. Normalize event -> `{ provider, paymentId, status, eventId }`.
  3. Call settlement service update methods.
  4. Emit websocket updates for affected event.

3. `traxettle-rush/apps/api/src/index.ts`
- Register:
  - `app.use('/api/payment-webhooks', paymentWebhookRoutes)`
- Ensure raw body parsing for webhook verification if required by provider:
  - Stripe usually needs raw body for signature check.

## F. Web app
1. `traxettle-rush/apps/web/src/app/events/[eventId]/page.tsx`
- Existing `handlePay` currently only calls API and optimistic-updates status.
- Replace with:
  1. call `/api/settlements/:id/pay`
  2. read `checkoutUrl`
  3. `window.location.href = checkoutUrl`

- Keep optimistic state update only if API returns no URL (fallback).

## G. Mobile app
1. `traxettle-rush/apps/mobile/src/screens/EventDetailScreen.tsx`
- Existing `handlePay` currently only calls API and optimistic-updates status.
- Replace with:
  1. call `/api/settlements/:id/pay`
  2. read `checkoutUrl`
  3. `Linking.openURL(checkoutUrl)`

## H. Tests
1. `traxettle-rush/apps/api/src/__tests__/services/settlement.service.test.ts`
- Add tests for gateway checkout creation:
  - INR settlement uses Razorpay
  - non-INR uses Stripe
  - saves `paymentId`, `paymentMethod`, `checkoutUrl`

2. New file:
- `traxettle-rush/apps/api/src/__tests__/routes/payment-webhooks.test.ts`
- Cases:
  - valid signature -> completed
  - duplicate webhook -> no duplicate state transition
  - invalid signature -> 401

3. `traxettle-rush/apps/web` and `traxettle-rush/apps/mobile`
- Add pay-button behavior tests to confirm redirect/openURL call when URL is returned.

## 2) Firestore schema impact

Settlement document additions (non-breaking):
- `checkoutUrl: string`
- `providerStatus: string`
- `providerRawEventId: string`

No migration required for old records; fields are optional.

## 3) API contract changes

## Existing endpoint changed
- `POST /api/settlements/:settlementId/pay`

Example response:

```json
{
  "success": true,
  "data": {
    "id": "s_123",
    "status": "initiated",
    "paymentMethod": "stripe",
    "paymentId": "cs_test_xxx",
    "checkoutUrl": "https://checkout.stripe.com/c/pay/cs_test_xxx"
  }
}
```

## New endpoints
- `POST /api/payment-webhooks/stripe`
- `POST /api/payment-webhooks/razorpay`

## 4) Minimal implementation sequence (recommended)
1. Add dependencies and env vars.
2. Add gateway abstraction + provider implementations.
3. Replace `initiatePayment` in settlement service.
4. Add webhook routes and registration.
5. Update web/mobile pay action to use `checkoutUrl`.
6. Add tests and run regression.

## 5) Commands to validate after code changes

```bash
cd traxettle-rush
node common/scripts/install-run-rush.js update
node common/scripts/install-run-rush.js build -t @traxettle/shared
node common/scripts/install-run-rush.js build -t @traxettle/api
node common/scripts/install-run-rush.js test -t @traxettle/api
```

Optional local app checks:

```bash
cd traxettle-rush && rush dev:web
cd traxettle-rush && rush dev:mobile
```

## 6) Risks and mitigations
- Webhook duplication: use idempotency guard with `providerRawEventId`.
- Webhook race condition: settle updates by transaction doc id + status check.
- Redirect failure on mobile: show fallback copyable URL if `openURL` fails.
- Currency mismatch: always base provider routing on `settlementCurrency || currency`.


## 12) Implemented policy controls (current state)

### API route enforcement
- `apps/api/src/routes/settlements.ts`
  - In non-production, requested `useRealGateway=true` is accepted only when:
    - `PAYMENT_ALLOW_REAL_IN_NON_PROD=true`
    - user is an internal tester

### Provider selection service
- `apps/api/src/services/payment.service.ts`
  - `PAYMENT_GATEWAY_MODE=auto|mock|live`
  - Auto mode behavior:
    - production => live
    - non-production => mock unless explicit non-prod opt-in

### Required test cases
1. Non-prod with default flags returns `paymentMethod=mock`.
2. Non-prod with explicit opt-in + internal tester can hit live provider path.
3. Production path ignores non-prod overrides.
