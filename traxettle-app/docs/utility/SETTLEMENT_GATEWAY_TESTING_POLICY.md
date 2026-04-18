# Settlement Gateway Testing Policy

## Goal
Prevent accidental real charges in local/staging/internal validation while allowing explicit real-gateway verification when required.

## Current Product Default

Traxettle currently keeps the original external-payment settlement flow as the default user experience:

- payer completes payment outside the app
- payer marks the settlement as paid inside Traxettle
- payee confirms receipt inside Traxettle

Gateway-based settlement (`Razorpay` / `BillDesk`) is now treated as an optional pilot path and is hidden unless explicitly enabled.

## Policy Matrix

| Environment | Default | Real Gateway Allowed | Conditions |
|---|---|---|---|
| Any environment with `SETTLEMENT_GATEWAY_PILOT_ENABLED=false` | Manual only | No | Gateway options hidden; only legacy/manual settlement flow is exposed |
| Local | Mock | Yes | `SETTLEMENT_GATEWAY_PILOT_ENABLED=true` + `PAYMENT_ALLOW_REAL_IN_NON_PROD=true` + `useRealGateway=true` + internal tester |
| Staging/Internal | Mock | Yes | `SETTLEMENT_GATEWAY_PILOT_ENABLED=true` + `PAYMENT_ALLOW_REAL_IN_NON_PROD=true` + `useRealGateway=true` + internal tester |
| TestFlight (staging API) | Mock | Yes | same as staging/internal |
| Production | Manual by default | Yes | `SETTLEMENT_GATEWAY_PILOT_ENABLED=true` + production credentials/configuration |

## Enforcement Points
- Route: `apps/api/src/routes/settlements.ts`
  - non-prod `useRealGateway=true` is downgraded to mock unless policy conditions pass.
  - Razorpay verification/order routes are hidden when `SETTLEMENT_GATEWAY_PILOT_ENABLED=false`.
- Service: `apps/api/src/services/payment.service.ts`
  - `SETTLEMENT_GATEWAY_PILOT_ENABLED=true|false`
  - `PAYMENT_GATEWAY_MODE=auto|mock|live`
  - auto mode uses mock by default in non-prod.
  - provider availability collapses to `manual` only when the pilot flag is off.
- Mobile UI: `apps/mobile/src/screens/EventDetailScreen.tsx`
  - settlement modal shows the original manual flow when no pilot providers are exposed

## Required Environment Variables
- `SETTLEMENT_GATEWAY_PILOT_ENABLED`
- `APP_ENV`
- `PAYMENT_GATEWAY_MODE`
- `PAYMENT_ALLOW_REAL_IN_NON_PROD`
- gateway credentials (only for real path):
  - `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`
  - `STRIPE_SECRET_KEY`
  - `BILLDESK_LIVE_APPROVED` only matters once BillDesk is actually supported

## Recommended Production Setting

For the current product posture:

```bash
SETTLEMENT_GATEWAY_PILOT_ENABLED=false
```

That keeps the legacy settlement UX intact while preserving the gateway code for controlled pilot testing later.

## Test Cases

1. Default production-safe mode
```bash
SETTLEMENT_GATEWAY_PILOT_ENABLED=false
```
Expected:
- only `manual` provider is returned by `/api/settlements/providers`
- mobile settlement modal shows the classic external-payment flow

2. Local/staging default safe mode
```bash
SETTLEMENT_GATEWAY_PILOT_ENABLED=true
PAYMENT_GATEWAY_MODE=auto
PAYMENT_ALLOW_REAL_IN_NON_PROD=false
```
Expected: `POST /api/settlements/:id/pay` returns mocked provider.

3. Explicit non-prod real-gateway check (internal tester)
```bash
SETTLEMENT_GATEWAY_PILOT_ENABLED=true
PAYMENT_GATEWAY_MODE=auto
PAYMENT_ALLOW_REAL_IN_NON_PROD=true
```
Request body includes `{ "useRealGateway": true }`.
Expected: provider path can use Razorpay/Stripe when credentials are valid.

4. Unauthorized real attempt
- non-internal tester or missing env flag.
Expected: server falls back to mock provider.

5. Production gateway pilot
```bash
SETTLEMENT_GATEWAY_PILOT_ENABLED=true
```
Expected:
- provider buttons can appear
- production credentials/approval flags determine whether Razorpay/BillDesk are actually usable

## Out of Scope

- Google Play Billing / App Store in-app subscription purchase for `Pro`
- BillDesk merchant verification required by Google Play for Android subscriptions

Those store-purchase flows are separate from Traxettle settlement gateways.
