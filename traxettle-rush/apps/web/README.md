# Traxettle Web App — Developer Guide

This README is web-only. For monorepo/Firebase/global env setup see:
- `../../README.md`

API-specific runtime details are in:
- `../api/README.md`

## What This App Owns
- Next.js frontend for dashboard/events/expenses/groups/invitations/settlements
- WebSocket subscription and live UI updates
- Local-only web tier switch UI (when enabled)

## Local Run Options (Sequential and Predictable)

### Option 1: Atomic script (recommended, avoids Rush lock complexity)
From repo root:
```bash
# Firebase emulator + API + web
sh scripts/local-dev/02_emulator_web.sh

# Real Firebase + API + web
sh scripts/local-dev/04_real_web.sh
```

### Option 2: Manual terminals with Rush
Terminal 1:
```bash
cd traxettle-rush
rush dev:api
```
Terminal 2:
```bash
cd traxettle-rush
rush dev:web
```

### Option 3: Manual terminals with npm (acceptable fallback)
Terminal 1:
```bash
cd traxettle-rush/apps/api
npm run dev
```
Terminal 2:
```bash
cd traxettle-rush/apps/web
npm run dev
```

## Web Environment Variables
Use only web-relevant keys here; global descriptions live in `../../README.md`.

### Required
- `NEXT_PUBLIC_API_URL` (default `http://localhost:3001`)
- `NEXT_PUBLIC_APP_ENV` (`local`/`staging`/`internal`/`production`)

### Local emulator/dev options
- `NEXT_PUBLIC_API_URL_EMULATOR` (default `http://localhost:3002`)
- `NEXT_PUBLIC_ALLOW_LOCAL_TIER_SWITCH=true|false`
- `NEXT_PUBLIC_USE_REAL_PAYMENTS=true|false` (request flag; server still decides)

### Firebase web SDK
- `NEXT_PUBLIC_FIREBASE_API_KEY`
- `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN`
- `NEXT_PUBLIC_FIREBASE_PROJECT_ID`
- `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET`
- `NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID`
- `NEXT_PUBLIC_FIREBASE_APP_ID`
- `NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID`

### Firebase emulator routing (web client)
- `NEXT_PUBLIC_FIREBASE_AUTH_EMULATOR_HOST`
- `NEXT_PUBLIC_FIREBASE_AUTH_EMULATOR_PORT`
- `NEXT_PUBLIC_FIREBASE_FIRESTORE_EMULATOR_HOST`
- `NEXT_PUBLIC_FIREBASE_FIRESTORE_EMULATOR_PORT`
- `NEXT_PUBLIC_FIREBASE_STORAGE_EMULATOR_HOST`
- `NEXT_PUBLIC_FIREBASE_STORAGE_EMULATOR_PORT`

## Tier Behavior in Web
- Local: tier switch UI can be enabled with `NEXT_PUBLIC_ALLOW_LOCAL_TIER_SWITCH=true`.
- Staging/internal/TestFlight/prod: no manual web switch; tier changes come from mobile/billing and are pushed via socket.

## Settlement Behavior in Web
- `NEXT_PUBLIC_USE_REAL_PAYMENTS=true` only requests real gateway usage.
- API policy is final authority (`PAYMENT_ALLOW_REAL_IN_NON_PROD`, internal tester rules, environment policy).

## Build, Test, Typecheck
From `traxettle-rush/apps/web`:
```bash
npm run dev
npm run typecheck
npm run test
npm run test:coverage
npm run build
```

Rush equivalents:
```bash
rushx dev
rushx typecheck
rushx test
```

## Troubleshooting
### Rush lock conflicts
Use atomic script flow (`02_emulator_web.sh` / `04_real_web.sh`) or direct `npm run dev` in app folders.

### Web cannot reach API
- Ensure API is running.
- Check `NEXT_PUBLIC_API_URL` value.
- Verify API health: `curl http://localhost:3001/health`.

### Firebase quota/read errors
Switch to emulator flow (`02_emulator_web.sh`).

## Cross-References
- Root global env catalog: `../../README.md`
- API sequence and policy: `../api/README.md`
- Tier and gateway policy docs:
  - `../../docs/TIER_ENTITLEMENT_ENV_MATRIX.md`
  - `../../docs/SETTLEMENT_GATEWAY_TESTING_POLICY.md`

## Legacy Full-Detail Archive
- `../../docs/readme-archives/README.web.archive.md`
