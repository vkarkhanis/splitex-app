# Traxettle Free/Pro Production Implementation Checklist

## Scope
This checklist reflects the current Free/Pro rollout across API, Mobile, and Web with server-side entitlement enforcement.

## Locked Rules
- Existing Free cap of 3 active/closed events remains unchanged in API event routes.
- Pro-only FX/multi-currency is server-enforced.
- Pro-only group pools ("Several of us") are server-enforced at creation and conversion; only the creator needs Pro, and a lapse never blocks an existing pool.
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
  - `UserCapabilities.contributorPools` (optional: a client treats a missing value as unknown and doesn't lock the option)
  - `PRO_FEATURE_CODES.contributorPools = 'contributor_pools'`
- `/api/users/profile` includes entitlement and capabilities.
- Gated feature denial payload:
  - `status: 403`
  - `code: FEATURE_REQUIRES_PRO`
  - `feature: multi_currency_settlement` or `feature: contributor_pools`

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
- Group pools: `groupPoolRefusal` (`apps/api/src/utils/pro-gates.ts`) runs on `POST /api/events` with a "Several of us" pool and on `POST /api/pools/event/:id/convert`. If the subscription lookup fails, the API returns a server error instead of "needs Pro". Tests: `routes/pools.pro-gating.test.ts`; other pool suites make the creator Pro with `makePro`.
- A new user's first profile load reports capabilities from the entitlement service's defaults, so `contributorPools` is present from the start.

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
- API denial `FEATURE_REQUIRES_PRO` is handled in UX, with the message chosen by `feature` (`proRequiredMessage`).
- Create event: a PRO badge and an **Upgrade to Pro** notice on "Several of us" for free users.
- Pro lists (upgrade screen, Profile row, purchase message, Help) include group pools only where "Several of us" is released (`useContributorPoolsAvailable`).
- Free trial: shown on iOS only when RevenueCat says the account is eligible; Google Play's trial is read from the default option (`resolveIntroOffer`, Money Pooling Phase 2 plan §10A).

## Web Implementation Status
- Event create page uses profile capabilities for FX gating, and for the PRO badge on "Several of us" (submitting is blocked with the group-pools message).
- `/pro` and `/help` list group pools only where "Several of us" is released (`apps/web/src/utils/proFeatures.ts`).
- Local-only tier switch UI exists on profile page.
- Staging/TestFlight/internal web is read-only for switching.
- Web listens to `user:tier-updated` and refreshes entitlement state.

## RevenueCat Setup (Runnable)
Use scripts from `traxettle-rush/scripts/revenuecat`:
1. `./scripts/revenuecat/bootstrap.sh`
2. `./scripts/revenuecat/check-config.sh`
3. Start API (`rush dev:api`)
4. `./scripts/revenuecat/smoke-webhook.sh`

All steps are documented in:
- `traxettle-app/docs/utility/REVENUECAT_INTEGRATION_RUNBOOK.md`

## Local Tier Test Script
Run:
```bash
cd docs/utility
TOKEN="<jwt>" USER_ID="<uid>" ./local-entitlement-test.sh
```

Script verifies:
- Free user denied FX event create (`403`).
- Pro user allowed FX event create (`201/200`).

## Remaining Validation Before Production Cutover
- Execute full API/Web/Mobile unit suites and confirm >=80% coverage on changed modules.
- Execute Playwright tier switch and FX gating regression in local/staging pipelines.
- Validate TestFlight internal tester entitlement flow against staging backend.
