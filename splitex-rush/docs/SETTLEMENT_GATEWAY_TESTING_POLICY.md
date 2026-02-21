# Settlement Gateway Testing Policy

## Goal
Prevent accidental real charges in local/staging/internal validation while allowing explicit real-gateway verification when required.

## Policy Matrix

| Environment | Default | Real Gateway Allowed | Conditions |
|---|---|---|---|
| Local | Mock | Yes | `PAYMENT_ALLOW_REAL_IN_NON_PROD=true` + `useRealGateway=true` + internal tester |
| Staging/Internal | Mock | Yes | `PAYMENT_ALLOW_REAL_IN_NON_PROD=true` + `useRealGateway=true` + internal tester |
| TestFlight (staging API) | Mock | Yes | same as staging/internal |
| Production | Production policy | Yes | production credentials/configuration |

## Enforcement Points
- Route: `apps/api/src/routes/settlements.ts`
  - non-prod `useRealGateway=true` is downgraded to mock unless policy conditions pass.
- Service: `apps/api/src/services/payment.service.ts`
  - `PAYMENT_GATEWAY_MODE=auto|mock|live`
  - auto mode uses mock by default in non-prod.

## Required Environment Variables
- `APP_ENV`
- `PAYMENT_GATEWAY_MODE`
- `PAYMENT_ALLOW_REAL_IN_NON_PROD`
- gateway credentials (only for real path):
  - `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`
  - `STRIPE_SECRET_KEY`

## Test Cases

1. Local/staging default safe mode
```bash
PAYMENT_GATEWAY_MODE=auto
PAYMENT_ALLOW_REAL_IN_NON_PROD=false
```
Expected: `POST /api/settlements/:id/pay` returns mocked provider.

2. Explicit non-prod real-gateway check (internal tester)
```bash
PAYMENT_GATEWAY_MODE=auto
PAYMENT_ALLOW_REAL_IN_NON_PROD=true
```
Request body includes `{ "useRealGateway": true }`.
Expected: provider path can use Razorpay/Stripe when credentials are valid.

3. Unauthorized real attempt
- non-internal tester or missing env flag.
Expected: server falls back to mock provider.

4. Production behavior
- manual test controls disabled.
- no entitlement switch route usage.
