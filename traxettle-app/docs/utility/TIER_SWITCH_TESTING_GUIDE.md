# Tier Switch Testing Guide

## Local (Mobile + Web)

1. Enable internal features:
```bash
cd traxettle-rush
cp .env.revenuecat.template .env.local
```
Set:
- `APP_ENV=local`
- `INTERNAL_TIER_SWITCH_ENABLED=true`
- `EXPO_PUBLIC_INTERNAL_FEATURES_ENABLED=true`
- `NEXT_PUBLIC_ALLOW_LOCAL_TIER_SWITCH=true`

2. Start API + web/mobile.
3. Switch tier from:
- Mobile profile internal section.
- Web profile local switch section.
4. Verify:
- Free blocks FX event creation/update.
- Pro allows FX event creation/update.
- Playwright regression:
```bash
cd traxettle-rush/e2e
npx playwright test tests/tier-entitlements.spec.ts
```

## Staging / Internal / TestFlight

1. Set:
- `APP_ENV=staging`
- `INTERNAL_TIER_SWITCH_ENABLED=true`
- `PAYMENT_ALLOW_REAL_IN_NON_PROD=false` (default-safe)
2. Ensure user has `internalTester=true`.
3. Switch tier from mobile internal controls only.
4. Verify web receives live tier update toast and read-only reflection.

## Production

- Manual switching must be disabled.
- Entitlements should only change through RevenueCat lifecycle webhooks.
