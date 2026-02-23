# Setup Summary

## Current Setup Tracks

1. Firebase base setup
- Docs: `docs/FIREBASE_SETUP.md`, `docs/FIREBASE_QUICK_START.md`

2. Free/Pro entitlement setup
- Docs: `docs/REVENUECAT_INTEGRATION_RUNBOOK.md`
- Env matrix: `docs/TIER_ENTITLEMENT_ENV_MATRIX.md`
- Testing guide: `docs/TIER_SWITCH_TESTING_GUIDE.md`
- Settlement safety policy: `docs/SETTLEMENT_GATEWAY_TESTING_POLICY.md`

## Free/Pro Quick Start

```bash
cd /Users/vkarkhanis/workspace/Traxettle/traxettle-rush
./scripts/revenuecat/bootstrap.sh
./scripts/revenuecat/check-config.sh
```

Start services:

```bash
rush dev:api
rush dev:web
```

Optional webhook smoke:

```bash
./scripts/revenuecat/smoke-webhook.sh
```

## Environment Expectations

- Local:
  - tier switch: mobile + web
  - payment: mock default
- Staging/Internal/TestFlight:
  - tier switch: mobile only (internal testers)
  - web: read-only for tier switching
  - payment: mock default; explicit internal opt-in for real gateways
- Production:
  - no manual tier switching
  - entitlement from RevenueCat lifecycle

## Safety Defaults

- `INTERNAL_TIER_SWITCH_ENABLED` must remain disabled in production.
- `PAYMENT_ALLOW_REAL_IN_NON_PROD` should remain `false` unless an explicit internal verification run is needed.
