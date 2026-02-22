# Splitex Web App — Developer Guide

React + Next.js web frontend for Splitex. This guide mirrors the mobile README structure but is tailored for web setup, testing, settlements, and internal validation.

---

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [Quick Start](#quick-start)
3. [Environment Variables](#environment-variables)
4. [Settlement](#settlement)
5. [Project Structure](#project-structure)
6. [Rush Commands Reference](#rush-commands-reference)
7. [Testing Splitex](#testing-splitex)
8. [Automated Test Coverage](#automated-test-coverage)
9. [Architecture & Key Files](#architecture--key-files)
10. [Features](#features)
11. [Known Limitations & Roadmap](#known-limitations--roadmap)
12. [Troubleshooting](#troubleshooting)

## Tier Entitlement Behavior

- Web reads tier/capabilities from `/api/users/profile`.
- Local tier switching is available only when:
  - `NEXT_PUBLIC_APP_ENV=local`
  - `NEXT_PUBLIC_ALLOW_LOCAL_TIER_SWITCH=true`
- Staging/TestFlight/internal web is read-only for tier switching.
- Web listens for `user:tier-updated` and refreshes profile/capabilities.

## Hidden Local Developer Option: Firebase Emulator

- Available only when `NEXT_PUBLIC_APP_ENV=local`.
- Unlock: open Profile and click the app version label 7 times.
- Option: toggle Firebase Local Emulator Suite mode.
- Effect:
  - web API calls and socket base switch to emulator API (`NEXT_PUBLIC_API_URL_EMULATOR`, default `http://localhost:3002`)
  - Firebase client SDK connects to local Auth/Firestore/Storage emulators
- Not available in staging/internal/production.

---

## Prerequisites

| Tool | Version | Install |
|------|---------|---------|
| Node.js | `>=24.11.1 <25.0.0` | `nvm install 24` or [nodejs.org](https://nodejs.org) |
| Rush | `5.167.0` | `corepack enable && npx @microsoft/rush@5.167.0 --version` |
| Chromium (for Playwright E2E) | Latest | `cd e2e && rushx install:browsers` |

---

## Quick Start

Run from monorepo root (`splitex-rush/`):

```bash
# 1. Install dependencies
rush update

# 2. Build shared library used by web
rush build:shared
rush build:ui

# 3. Start API (terminal 1)
rush dev:api

# 4. Start web (terminal 2)
rush dev:web
```

Open: `http://localhost:3000`

---

## Environment Variables

Web uses:

- `NEXT_PUBLIC_API_URL`

Default behavior:
- If `NEXT_PUBLIC_API_URL` is not set, web client uses `http://localhost:3001`.

Example:

```bash
NEXT_PUBLIC_API_URL=http://localhost:3001 rush dev:web
```

---

## Settlement

Settlement behavior is configuration-driven and shared with API/mobile.

Gateway routing:
- `INR` settlements -> Razorpay
- Non-`INR` settlements -> Stripe

Backend mode flags (set in `/Users/vkarkhanis/workspace/Splitex/splitex-rush/.env.local`):

```env
PAYMENT_GATEWAY_MODE=auto
PAYMENT_ALLOW_REAL_IN_NON_PROD=false
RAZORPAY_KEY_ID=...
RAZORPAY_KEY_SECRET=...
STRIPE_SECRET_KEY=...
PAYMENT_SUCCESS_URL=http://localhost:3000/payment/success
PAYMENT_CANCEL_URL=http://localhost:3000/payment/cancel
```

Notes:
- In local/internal validation, keep `PAYMENT_ALLOW_REAL_IN_NON_PROD=false` so checkout remains mocked.
- For explicit real-gateway verification, switch `PAYMENT_ALLOW_REAL_IN_NON_PROD=true` and provide valid keys.

---

## Project Structure

```text
apps/web/
├── README.md
├── package.json
├── jest.config.ts
├── src/
│   ├── app/                      # Next.js App Router pages
│   ├── components/
│   │   └── WebAppShell.tsx
│   ├── config/
│   │   └── firebase-client.ts
│   ├── hooks/
│   │   └── useSocket.ts
│   └── utils/
│       ├── api.ts
│       └── errorMessages.ts
└── public/
```

---

## Rush Commands Reference

All commands run from monorepo root:

| Command | Description |
|--------|-------------|
| `rush dev:web` | Start web app on `http://localhost:3000` |
| `rush build:web` | Production build |
| `rush start:web` | Run production build |
| `rush test:web` | Run web unit tests |
| `rush test:web:coverage` | Run web unit tests with coverage thresholds |
| `rush test:e2e` | Run Playwright E2E suite |
| `rush test:e2e:headed` | Run Playwright in headed mode |
| `rush test:e2e:ui` | Open Playwright UI mode |
| `rush test:e2e:report` | Show Playwright report |

---

## Testing Splitex

### Local

1. Install and build dependencies:
   ```bash
   cd /Users/vkarkhanis/workspace/Splitex/splitex-rush
   rush update
   rush build:shared
   rush build:ui
   ```
2. Start API:
   ```bash
   rush dev:api
   ```
3. Start web:
   ```bash
   NEXT_PUBLIC_API_URL=http://localhost:3001 rush dev:web
   ```
4. Open `http://localhost:3000`.
5. Validate core flows:
   - register/login
   - create event
   - invite participant
   - create expense
   - settle (mock flow default)

### Internal Testing

1. Deploy API + web to staging.
2. Set staging env:
   - `PAYMENT_GATEWAY_MODE=auto`
   - `PAYMENT_ALLOW_REAL_IN_NON_PROD=false`
3. Run smoke checks in staging browser:
   - auth flow
   - event/expense/group/invite lifecycle
   - settlement lifecycle with mocked gateway
4. Optional controlled gateway validation:
   - set `PAYMENT_ALLOW_REAL_IN_NON_PROD=true` with valid keys
   - run limited payment verification
   - revert to mocked defaults after test cycle

---

## Automated Test Coverage

### Unit Tests (Web)

- Framework: `Jest` + `ts-jest`
- Command: `rush test:web:coverage`
- Coverage thresholds:
  - branches >= 80
  - functions >= 80
  - lines >= 80
  - statements >= 80

Current verified run:
- `25 passed`
- statements: `98.11%`
- branches: `88.67%`
- functions: `100%`
- lines: `100%`

### E2E Tests (Web)

- Framework: Playwright (`/Users/vkarkhanis/workspace/Splitex/splitex-rush/e2e`)
- Command: `rush test:e2e`
- Current verified run:
  - `45 passed`
  - `0 skipped`
  - includes mocked settlement E2E for same-currency and multi-currency paths

---

## Architecture & Key Files

- `src/app/*`: route-level pages and workflows
- `src/components/WebAppShell.tsx`: top navigation, auth controls, theme selector
- `src/utils/api.ts`: authenticated API wrapper with token refresh fallback
- `src/hooks/useSocket.ts`: real-time event subscriptions
- `src/config/firebase-client.ts`: Firebase initialization and mock fallbacks

---

## Features

| Feature | Status |
|--------|--------|
| Email/password auth | Available |
| Event create/edit/delete | Available |
| Expense create/edit/delete | Available |
| Group management | Available |
| Invitation lifecycle (create/accept/decline) | Available |
| Settlement lifecycle (mocked and configurable real gateways) | Available |
| Multi-currency settlement visibility | Available |
| Realtime updates with sockets | Available |

---

## Known Limitations & Roadmap

### Current Limitations

| Limitation | Impact | Workaround |
|-----------|--------|------------|
| Real-gateway E2E checkout is not automated | CI/test runs use mocked settlement checkout only | Validate real gateways in controlled manual cycles |
| Mobile and web parity still evolving | Some UX behavior differs by platform | Follow platform-specific README checklists |

### Roadmap

- [ ] Expand real-gateway automated validation strategy
- [ ] Strengthen cross-platform parity checks
- [ ] Add richer Playwright assertions for settlement detail displays

---

## Troubleshooting

| Problem | Solution |
|--------|----------|
| Web cannot reach API | Ensure `rush dev:api` is running and `NEXT_PUBLIC_API_URL` points to API |
| E2E flaky setup | Ensure ports `3000` and `3001` are free before `rush test:e2e` |
| Jest env errors | Run `rush update` and retry `rush test:web:coverage` |
| Browser deps missing for Playwright | Run `cd e2e && rushx install:browsers` |

---

## Quick Reference

| What | Command |
|------|---------|
| Start web dev server | `rush dev:web` |
| Start API | `rush dev:api` |
| Web unit tests | `rush test:web` |
| Web unit tests with coverage | `rush test:web:coverage` |
| Web E2E tests | `rush test:e2e` |
| View Playwright report | `rush test:e2e:report` |
