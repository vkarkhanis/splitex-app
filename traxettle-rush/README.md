# Traxettle Monorepo Developer Guide

Traxettle is a Rush + pnpm monorepo containing:
- API (`apps/api`)
- Web app (`apps/web`)
- Mobile app (`apps/mobile`)
- Shared libraries (`libraries/shared`, `libraries/ui`)
- E2E (`e2e`) and docs (`docs`)

This README is the **single cross-platform entrypoint**. App-specific runbooks are in:
- `apps/api/README.md`
- `apps/web/README.md`
- `apps/mobile/README.md`

## Operator Runbook (Most Common Scenarios)
Use this section first. Each command is runnable as-is from repo root unless noted.

| Scenario | Command(s) | What it starts |
|---|---|---|
| Set local test flags (tier + payments) | `sh scripts/local-dev/05_set-flags.sh --tier free --payments mock` | Saves runtime flags used by local atomic scripts |
| Local: Firebase emulator + mobile | `sh scripts/local-dev/01_emulator_mobile.sh` | Firebase emulators + API + mobile Expo dev server |
| Local: Firebase emulator + web | `sh scripts/local-dev/02_emulator_web.sh` | Firebase emulators + API + web app |
| Local: Real Firebase + mobile | `sh scripts/local-dev/03_real_mobile.sh` | API (real Firebase) + mobile Expo dev server |
| Local: Real Firebase + web | `sh scripts/local-dev/04_real_web.sh` | API (real Firebase) + web app |
| Rush standard dev (manual terminals) | Terminal 1: `rush dev:api`<br/>Terminal 2: `rush dev:web` or `rush dev:mobile` | API + selected client |
| NPM fallback (if Rush lock blocks you) | Terminal 1: `cd apps/api && npm run dev`<br/>Terminal 2: `cd apps/web && npm run dev` *(or `cd apps/mobile && npm run start`)* | API + selected client without Rush |
| Verify API health | `curl http://localhost:3001/health` | Confirms API is reachable |
| Run all tests (repo level) | `rush test` | Unit/integration suites across projects |
| Run web E2E / mobile Maestro | `rush test:e2e` / `rush test:maestro` | Playwright / Maestro flows |

Quick policy reminder:
- Local default payments should remain mocked unless explicitly switched.
- Tier/payment request flags are inputs; API policy is final authority.

## Documentation Structure (Who Owns What)
- `README.md` (this file): platform-agnostic setup, Firebase/Firebase emulator setup, global env matrix, cross-app orchestration.
- `apps/api/README.md`: API-only runtime, env, start order, gateway/tiering server policy.
- `apps/web/README.md`: web-only setup, local/staging behavior, local run options.
- `apps/mobile/README.md`: mobile-only setup, simulator/device workflow, local run options.

## Zero-Lock Quick Start (Recommended)
Use the atomic scripts when Rush lock contention is a problem.

1. Set local test flags once (tier + payments):
```bash
cd traxettle-rush
sh scripts/local-dev/05_set-flags.sh --tier free --payments mock
```

2. Start one of these stacks:
- Firebase emulator + mobile: `sh scripts/local-dev/01_emulator_mobile.sh`
- Firebase emulator + web: `sh scripts/local-dev/02_emulator_web.sh`
- Real Firebase + mobile: `sh scripts/local-dev/03_real_mobile.sh`
- Real Firebase + web: `sh scripts/local-dev/04_real_web.sh`

These scripts centrally apply env flags and avoid multi-terminal Rush lock confusion.

## Standard Rush Quick Start
```bash
cd traxettle-rush
rush update
rush build:shared
```

Then use app guides for API/Web/Mobile start sequences.

## Firebase Setup (Global)
Use this section for Firebase setup common to API, web, and mobile.

### 1. Firebase project/services
In Firebase Console:
- Create/select project
- Enable Authentication (Email/Password + OAuth providers you need)
- Enable Firestore
- Enable Storage

### 2. Backend credentials (API)
From Firebase Console > Project Settings > Service Accounts, generate service-account key values for:
- `FIREBASE_PROJECT_ID`
- `FIREBASE_CLIENT_EMAIL`
- `FIREBASE_PRIVATE_KEY`
- `FIREBASE_STORAGE_BUCKET`

### 3. Frontend credentials (web/mobile auth flows)
From Firebase Console > Project Settings > General > Web app config:
- `NEXT_PUBLIC_FIREBASE_API_KEY`
- `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN`
- `NEXT_PUBLIC_FIREBASE_PROJECT_ID`
- `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET`
- `NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID`
- `NEXT_PUBLIC_FIREBASE_APP_ID`
- `NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID`

### 4. Local Firebase Emulator Suite
- Start emulators via: `sh scripts/firebase/start-emulators.sh`
- Typical endpoints:
  - Auth: `127.0.0.1:9099`
  - Firestore: `127.0.0.1:8080`
  - Storage: `127.0.0.1:9199`

Detailed Firebase docs:
- `../traxettle-app/docs/utility/FIREBASE_SETUP.md`

## Global Environment Variable Summary
Use `.env.example` as base. This table summarizes **why** each key exists.

### Core runtime and auth
| Variable | Used By | Purpose |
|---|---|---|
| `APP_ENV` / `NEXT_PUBLIC_APP_ENV` / `EXPO_PUBLIC_APP_ENV` | API/Web/Mobile | Environment behavior (`local`, `staging`, `internal`, `production`) |
| `PORT` | API | API bind port |
| `JWT_SECRET`, `JWT_REFRESH_SECRET` | API | Token signing |

### Firebase backend (API)
| Variable | Purpose |
|---|---|
| `FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, `FIREBASE_PRIVATE_KEY`, `FIREBASE_STORAGE_BUCKET` | Firebase Admin SDK credentials |
| `FIREBASE_USE_EMULATOR` | Force API to Firebase emulator suite |
| `FIREBASE_AUTH_EMULATOR_HOST`, `FIRESTORE_EMULATOR_HOST`, `STORAGE_EMULATOR_HOST` | Emulator hosts |

### Firebase frontend (web)
| Variable | Purpose |
|---|---|
| `NEXT_PUBLIC_FIREBASE_*` | Firebase client SDK config |
| `NEXT_PUBLIC_FIREBASE_AUTH_EMULATOR_HOST`, `NEXT_PUBLIC_FIREBASE_AUTH_EMULATOR_PORT` | Auth emulator routing |
| `NEXT_PUBLIC_FIREBASE_FIRESTORE_EMULATOR_HOST`, `NEXT_PUBLIC_FIREBASE_FIRESTORE_EMULATOR_PORT` | Firestore emulator routing |
| `NEXT_PUBLIC_FIREBASE_STORAGE_EMULATOR_HOST`, `NEXT_PUBLIC_FIREBASE_STORAGE_EMULATOR_PORT` | Storage emulator routing |

### API routing for clients
| Variable | Used By | Purpose |
|---|---|---|
| `NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_API_URL_EMULATOR` | Web | API base URL for normal/emulator flows |
| `EXPO_PUBLIC_API_URL`, `EXPO_PUBLIC_API_URL_IOS`, `EXPO_PUBLIC_API_URL_ANDROID` | Mobile | API base URL for simulator/device |
| `EXPO_PUBLIC_API_URL_EMULATOR*` | Mobile | Emulator-backed API URL |

### Tiering and feature-test controls
| Variable | Used By | Purpose |
|---|---|---|
| `INTERNAL_TIER_SWITCH_ENABLED` | API | Enables manual tier switch endpoint in non-prod |
| `NEXT_PUBLIC_ALLOW_LOCAL_TIER_SWITCH` | Web | Shows local tier switch UI |
| `EXPO_PUBLIC_DEFAULT_TIER` | Mobile | Local/internal tier override seed (`free`/`pro`) |
| `EXPO_PUBLIC_INTERNAL_FEATURES_ENABLED` | Mobile | Internal-only feature controls |
| `EXPO_PUBLIC_LOCAL_DEV_OPTIONS_ENABLED` | Mobile | Hidden developer options toggle |

### Settlement/payment safety controls
| Variable | Used By | Purpose |
|---|---|---|
| `PAYMENT_GATEWAY_MODE` | API | `auto`/`mock`/`live` gateway policy |
| `PAYMENT_ALLOW_REAL_IN_NON_PROD` | API | Allows real gateway in non-prod (only with extra guards) |
| `NEXT_PUBLIC_USE_REAL_PAYMENTS` | Web | Client-side request flag for real gateway attempts |
| `EXPO_PUBLIC_USE_REAL_PAYMENTS` | Mobile | Client-side request flag for real gateway attempts |
| `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `STRIPE_SECRET_KEY` | API | Real gateway credentials |
| `PAYMENT_SUCCESS_URL`, `PAYMENT_CANCEL_URL` | API | Hosted checkout redirect/callback URLs |

### Billing/RevenueCat
| Variable | Purpose |
|---|---|
| `REVENUECAT_WEBHOOK_SECRET` | Webhook signature validation |
| `REVENUECAT_PRO_ENTITLEMENT_KEY` | Entitlement mapping key (`pro`) |

Full RevenueCat runbook:
- `../traxettle-app/docs/utility/REVENUECAT_INTEGRATION_RUNBOOK.md`
- `scripts/revenuecat/bootstrap.sh`
- `scripts/revenuecat/check-config.sh`
- `scripts/revenuecat/smoke-webhook.sh`

## Environment Behavior Matrix
| Environment | Tier switch | Payment default | Real payment allowed | Web switch UI |
|---|---|---|---|---|
| Local | Yes | Mock | Optional (policy-controlled) | Yes |
| Staging/Internal/TestFlight | Mobile-only (authorized) | Mock | Optional (policy-controlled) | No |
| Production | No manual switch | Live policy | Production policy | No |

Reference docs:
- `../traxettle-app/docs/utility/TIER_ENTITLEMENT_ENV_MATRIX.md`
- `../traxettle-app/docs/utility/SETTLEMENT_GATEWAY_TESTING_POLICY.md`
- `../traxettle-app/docs/utility/TIER_SWITCH_TESTING_GUIDE.md`

## Orchestration: What to Start First
For any stack:
1. Start dependencies (Firebase emulator if needed)
2. Start API
3. Start client (web/mobile)
4. Validate API health (`/health`) and login

Detailed platform sequences are intentionally in app READMEs:
- API sequencing: `apps/api/README.md`
- Web sequencing: `apps/web/README.md`
- Mobile sequencing: `apps/mobile/README.md`

## Testing Commands (Top-level)
```bash
# Unit/integration
rush test
rush test:coverage

# Web E2E (Playwright)
rush test:e2e

# Mobile E2E (Maestro)
rush test:maestro
rush test:maestro:artifacts
```

## Troubleshooting
### Rush lock/contention
Use atomic scripts under `scripts/local-dev/` or app-level npm commands (`npm run dev`) when Rush lock is blocking local flow.

### Firebase quota exceeded
Switch to local emulators (`01_emulator_mobile.sh` / `02_emulator_web.sh`) for local dev and Maestro.

### Java errors for emulators
Firebase emulators require JDK 21+.

## Documentation
All project documentation lives under `../traxettle-app/docs/`:
- **Deployment**: `../traxettle-app/docs/deployment/` — Cloud Run, store releases, checklists
- **Runbook**: `../traxettle-app/docs/runbook/` — Local development modes and commands
- **Utility**: `../traxettle-app/docs/utility/` — Firebase, RevenueCat, tiers, settlements
