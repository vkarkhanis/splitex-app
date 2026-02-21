# Splitex Free/Pro Production Implementation Checklist

## Scope
This checklist reflects the current Free/Pro rollout across API, Mobile, and Web with server-side entitlement enforcement.

## Locked Rules
- Existing Free cap of 3 active/closed events remains unchanged in API event routes.
- Pro-only FX/multi-currency is server-enforced.
- RevenueCat is entitlement source-of-truth in production.
- Local tier switch: Mobile + Web.
- Staging/Internal/TestFlight tier switch: Mobile only (internal testers).
- Production tier switch: disabled (billing/webhook driven only).
- Settlement real gateway in non-prod is OFF by default.

## Implemented Backend Contracts
- Shared types include:
  - `PlanTier = 'free' | 'pro'`
  - `EntitlementStatus = 'active' | 'grace_period' | 'billing_retry' | 'expired' | 'revoked'`
  - `EntitlementSource = 'revenuecat' | 'manual_override' | 'system'`
  - `UserCapabilities.multiCurrencySettlement`
- `/api/users/profile` includes entitlement and capabilities.
- Gated feature denial payload:
  - `status: 403`
  - `code: FEATURE_REQUIRES_PRO`
  - `feature: multi_currency_settlement`

## Implemented Backend Services/Routes
- Entitlements:
  - `apps/api/src/services/entitlement.service.ts`
  - `GET /api/internal/entitlements/me`
  - `POST /api/internal/entitlements/switch`
- Billing:
  - `POST /api/billing/revenuecat/webhook`
  - idempotency handling in billing events service
- WebSocket push:
  - event `user:tier-updated`

## Implemented Feature Gating
- Event create/update with FX fields is blocked for Free users server-side.
- Existing Free 3-event guard remains untouched.

## Settlement Safety Policy
- Non-production defaults to mocked payment.
- Real payment in non-prod requires all:
  - `PAYMENT_ALLOW_REAL_IN_NON_PROD=true`
  - route input `useRealGateway=true`
  - internal tester entitlement
- Production uses production payment policy.

## Mobile Implementation Status
- Tier/capabilities are fetched from server profile.
- Pro-only event creation is gated by capability.
- Internal tier switch UI is available only in local/internal enabled builds.
- API denial `FEATURE_REQUIRES_PRO` is handled in UX.

## Web Implementation Status
- Event create page uses profile capabilities for FX gating.
- Local-only tier switch UI exists on profile page.
- Staging/TestFlight/internal web is read-only for switching.
- Web listens to `user:tier-updated` and refreshes entitlement state.

## RevenueCat Setup (Runnable)
Use scripts from `splitex-rush/scripts/revenuecat`:
1. `./scripts/revenuecat/bootstrap.sh`
2. `./scripts/revenuecat/check-config.sh`
3. Start API (`rush dev:api`)
4. `./scripts/revenuecat/smoke-webhook.sh`

All steps are documented in:
- `splitex-rush/docs/REVENUECAT_INTEGRATION_RUNBOOK.md`

## Local Tier Test Script
Run:
```bash
cd /Users/vkarkhanis/workspace/Splitex/splitex-app/features-checklist/tier_based_behaviour
TOKEN="<jwt>" USER_ID="<uid>" ./local-entitlement-test.sh
```

Script verifies:
- Free user denied FX event create (`403`).
- Pro user allowed FX event create (`201/200`).

## Remaining Validation Before Production Cutover
- Execute full API/Web/Mobile unit suites and confirm >=80% coverage on changed modules.
- Execute Playwright tier switch and FX gating regression in local/staging pipelines.
- Validate TestFlight internal tester entitlement flow against staging backend.
