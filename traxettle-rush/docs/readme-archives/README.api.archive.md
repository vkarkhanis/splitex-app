# Traxettle API

Express API for Traxettle web/mobile clients.

## Entitlement and Tiering

### Source of truth
- Server-side entitlement state on user profile.
- RevenueCat webhook updates entitlement lifecycle.

### Internal tier switch (non-production only)
- `GET /api/internal/entitlements/me`
- `POST /api/internal/entitlements/switch`
- Guardrails:
  - disabled in production
  - requires `INTERNAL_TIER_SWITCH_ENABLED=true`
  - local/dev/test allow local testing
  - staging/internal requires internal tester authorization

### Pro-gated feature contract
- Pro-only FX/multi-currency event fields are API-enforced.
- Denial response:
  - HTTP `403`
  - `code: FEATURE_REQUIRES_PRO`
  - `feature: multi_currency_settlement`

## Billing (RevenueCat)

### Endpoint
- `POST /api/billing/revenuecat/webhook`

### Required env
- `REVENUECAT_WEBHOOK_SECRET`
- `REVENUECAT_PRO_ENTITLEMENT_ID` (default `pro`)

### Behavior
- Validates webhook secret
- idempotently processes event ID
- maps RevenueCat event to internal tier/status
- emits websocket `user:tier-updated`

## Settlement policy (safe defaults)

### Non-production default
- Mocked payments by default.

### Real gateway in non-prod allowed only when all true
- `PAYMENT_ALLOW_REAL_IN_NON_PROD=true`
- request body `useRealGateway=true`
- user is internal tester

### Production
- governed by production payment/live credentials policy

## Firebase Local Emulator Suite (local only)

### Required env
- `FIREBASE_USE_EMULATOR=true`
- `FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099`
- `FIRESTORE_EMULATOR_HOST=127.0.0.1:8080`
- `STORAGE_EMULATOR_HOST=127.0.0.1:9199`

### Rush commands
- `rush dev:firebase:emulators`
- `rush dev:api:emulator`

## Quick local validation

```bash
cd /Users/vkarkhanis/workspace/Traxettle/traxettle-rush
./scripts/revenuecat/bootstrap.sh
./scripts/revenuecat/check-config.sh
rush dev:api
```

In another terminal:

```bash
cd /Users/vkarkhanis/workspace/Traxettle/traxettle-rush
./scripts/revenuecat/smoke-webhook.sh
```
