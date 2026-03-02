# RevenueCat Integration Runbook (Traxettle)

## Purpose
Set up RevenueCat as the source of truth for `pro` entitlement, with API-side webhook processing and environment-safe controls.

## Prerequisites
1. Traxettle API running locally (`rush dev:api`).
2. Access to RevenueCat dashboard.
3. `curl` available locally.

## Step-by-step (runnable as-is)

1. Bootstrap config:
```bash
cd traxettle-rush
./scripts/revenuecat/bootstrap.sh
```

2. Validate config:
```bash
cd traxettle-rush
./scripts/revenuecat/check-config.sh
```

3. Start API:
```bash
cd traxettle-rush
rush dev:api
```

4. Smoke-test webhook:
```bash
cd traxettle-rush
./scripts/revenuecat/smoke-webhook.sh
```

## RevenueCat Dashboard Configuration

1. Create/confirm Product Entitlement:
- Entitlement ID: `pro` (or update `.env.local` `REVENUECAT_PRO_ENTITLEMENT_ID` accordingly).

2. Configure webhook:
- URL:
  - Local (with tunnel): `https://<your-tunnel-host>/api/billing/revenuecat/webhook`
  - Staging: `https://<staging-api>/api/billing/revenuecat/webhook`
- Secret: set same value as `REVENUECAT_WEBHOOK_SECRET`.

3. Ensure app user identity mapping:
- RevenueCat `app_user_id` must match Traxettle `userId` persisted in API user document.

## Environment Variables

- `APP_ENV=local|staging|production`
- `REVENUECAT_WEBHOOK_SECRET`
- `REVENUECAT_API_KEY`
- `REVENUECAT_PRO_ENTITLEMENT_ID=pro`
- `INTERNAL_TIER_SWITCH_ENABLED=true|false`
- `PAYMENT_GATEWAY_MODE=auto|mock|live`
- `PAYMENT_ALLOW_REAL_IN_NON_PROD=true|false`

## Per-Environment Properties (Recommended)

Use gitignored properties files in `traxettle-rush`:
- `rc_local.properties`
- `rc_staging.properties`
- `rc_prod.properties`

Template to commit and share with developers:
- `traxettle-rush/rc_env.properties.example`

Required keys inside each file:
- `RC_REVENUECAT_APPLE_PUBLIC_KEY`
- `RC_REVENUECAT_GOOGLE_PUBLIC_KEY`
- `RC_REVENUECAT_PRO_ENTITLEMENT_ID` (typically `pro`)
- `RC_REVENUECAT_OFFERING_ID` (typically `default`)
- `RC_REVENUECAT_WEBHOOK_SECRET`
- `RC_REVENUECAT_SECRET_API_KEY` (optional; server REST usage only)

These are auto-loaded by:
- `apps/mobile/scripts/build-android.sh`
- `apps/mobile/scripts/build-ios.sh`
- `scripts/web-deployment/deploy-web-staging.sh`
- `scripts/web-deployment/deploy-web-prod.sh`
- `scripts/api-deployment/deploy-staging.sh`
- `scripts/api-deployment/deploy-prod.sh`
- `scripts/local-dev/01_emulator_mobile.sh`
- `scripts/local-dev/02_emulator_web.sh`
- `scripts/local-dev/03_real_mobile.sh`
- `scripts/local-dev/04_real_web.sh`

## Validation Checklist
1. Webhook request accepted with `200`.
2. User profile reflects updated `tier`, `entitlementStatus`, and `capabilities`.
3. Web client receives `user:tier-updated` and refreshes tier state.
4. Free users are denied Pro FX creation via API.

## Rollback
1. Disable webhook in RevenueCat.
2. Set `INTERNAL_TIER_SWITCH_ENABLED=true` in staging for temporary manual control.
3. Keep users at `tier=free` if incident requires conservative fallback.
