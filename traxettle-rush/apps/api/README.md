# Traxettle API — Developer Guide

This README is API-only. Global setup (Firebase project creation, env overview, monorepo commands) is in:
- `../../README.md`

## What This Service Owns
- Auth/session APIs
- Events/expenses/groups/invitations/settlements APIs
- Entitlement and capability enforcement (Free/Pro)
- Payment gateway policy and checkout initiation
- RevenueCat webhook ingestion
- WebSocket events

## Startup Sequences (By Consumer)

### A) API for Web (local emulator stack)
1. Start Firebase emulators
2. Start API with emulator env
3. Start web client

Recommended single command from repo root:
```bash
sh scripts/local-dev/02_emulator_web.sh
```

### B) API for Mobile (local emulator stack)
1. Start Firebase emulators
2. Start API with emulator env
3. Start mobile client

Recommended single command from repo root:
```bash
sh scripts/local-dev/01_emulator_mobile.sh
```

### C) API with real Firebase (local)
- Web stack: `sh scripts/local-dev/04_real_web.sh`
- Mobile stack: `sh scripts/local-dev/03_real_mobile.sh`

## API Run Commands
From `traxettle-rush/apps/api`:
```bash
# npm flow (avoids Rush lock contention)
npm run dev
npm run typecheck
npm run test

# rushx flow
rushx dev
rushx typecheck
rushx test
```

## Required API Environment Variables
Refer `../../README.md` for full catalog. API-critical keys:

### Core
- `APP_ENV`
- `PORT`
- `JWT_SECRET`
- `JWT_REFRESH_SECRET`

### Firebase (Admin SDK)
- `FIREBASE_PROJECT_ID`
- `FIREBASE_CLIENT_EMAIL`
- `FIREBASE_PRIVATE_KEY`
- `FIREBASE_STORAGE_BUCKET`

### Emulator mode
- `FIREBASE_USE_EMULATOR=true|false`
- `FIREBASE_AUTH_EMULATOR_HOST`
- `FIRESTORE_EMULATOR_HOST`
- `STORAGE_EMULATOR_HOST`

### Tiering + entitlement
- `INTERNAL_TIER_SWITCH_ENABLED=true|false`
- `REVENUECAT_WEBHOOK_SECRET`
- `REVENUECAT_PRO_ENTITLEMENT_KEY`

### Settlement/payment policy
- `PAYMENT_GATEWAY_MODE=auto|mock|live`
- `PAYMENT_ALLOW_REAL_IN_NON_PROD=true|false`
- `RAZORPAY_KEY_ID`
- `RAZORPAY_KEY_SECRET`
- `STRIPE_SECRET_KEY`
- `PAYMENT_SUCCESS_URL`
- `PAYMENT_CANCEL_URL`

## Tiering and Capability Enforcement
- Source of truth: server-side entitlement state.
- Free/Pro gates are enforced in API even if client tries bypass.
- Local/internal manual switch is available only when enabled and non-production.

Endpoints:
- `POST /api/internal/entitlements/switch`
- `GET /api/internal/entitlements/me`

## Settlement and Gateway Safety
Default behavior:
- Local/staging/internal/TestFlight: mocked gateway by default.
- Production: governed by production live policy.

Real gateway in non-prod only when all are true:
1. `PAYMENT_ALLOW_REAL_IN_NON_PROD=true`
2. client request sets `useRealGateway=true`
3. caller is authorized internal tester

## RevenueCat Integration
- Webhook endpoint: `POST /api/billing/revenuecat/webhook`
- Use scripts:
  - `../../scripts/revenuecat/bootstrap.sh`
  - `../../scripts/revenuecat/check-config.sh`
  - `../../scripts/revenuecat/smoke-webhook.sh`

Full details: `../../docs/REVENUECAT_INTEGRATION_RUNBOOK.md`

## API Health and Smoke Verification
```bash
# health
curl http://localhost:3001/health

# entitlement introspection (with auth token)
curl -H "Authorization: Bearer <token>" http://localhost:3001/api/internal/entitlements/me
```

## Tests
```bash
# unit/integration
npm run test
npm run test:coverage

# targeted
npm run test -- settlement.service.test.ts
```

## Troubleshooting
- If local runs fail due Firebase quotas, use emulator mode scripts from repo root.
- If Rush lock blocks execution, use app-local `npm run ...` commands.
- If real gateway appears unexpectedly in non-prod, verify `PAYMENT_ALLOW_REAL_IN_NON_PROD` and internal tester authorization.

## Legacy Full-Detail Archive
- `../../docs/readme-archives/README.api.archive.md`
