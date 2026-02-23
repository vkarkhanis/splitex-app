# Traxettle - Expense Splitting Application

A comprehensive expense splitting application built as a Rush.js monorepo. Supports web (React/Next.js) and mobile (React Native) platforms. Users can create events/trips, invite participants, track expenses with flexible splitting (equal, ratio, custom), manage groups as single entities, generate settlements using a greedy algorithm, and receive real-time updates via WebSocket. Events follow an Active → Payment → Settled → Closed lifecycle with full mutation locking once payments begin. Settlement includes mock payment initiation by debtors and receipt confirmation by payees, with real-time status updates. The dashboard reflects event status changes in real-time. All destructive actions use themed confirmation modals—no browser dialogs.

---

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [Initial Setup](#initial-setup)
3. [Firebase Setup](#firebase-setup)
4. [Environment Variables](#environment-variables)
5. [Project Structure](#project-structure)
6. [Rush Commands Reference](#rush-commands-reference)
7. [Running Dev Servers](#running-dev-servers)
8. [Running Tests](#running-tests)
9. [Technology Stack](#technology-stack)
10. [API Endpoints](#api-endpoints)
11. [Authentication](#authentication)
12. [Troubleshooting](#troubleshooting)
13. [Contributing](#contributing)

---

## Prerequisites

Install the following **before** cloning the repo:

| Tool | Version | Install Command |
|------|---------|-----------------|
| **Node.js** | `>=24.11.1 <25.0.0` | [https://nodejs.org](https://nodejs.org) or `nvm install 24` |
| **Rush.js** | `5.167.0` | `corepack enable && npx @microsoft/rush@5.167.0 --version` |
| **pnpm** | `9.15.9` (managed by Rush) | Installed automatically by `rush install` |
| **Git** | Latest | [https://git-scm.com](https://git-scm.com) |

**Required for mobile development:**

| Tool | Version | Install Command |
|------|---------|------------------|
| **Expo CLI** | Latest | `pnpm dlx expo --version` |
| **Expo Go** | Latest | Install from App Store / Play Store on your device |
| **Xcode** (iOS) | 15+ | Mac App Store (macOS only) |
| **Android Studio** (Android) | Latest | [developer.android.com/studio](https://developer.android.com/studio) |

> **See [`apps/mobile/README.md`](apps/mobile/README.md) for the complete mobile setup guide** including iOS Simulator, Android Emulator, and real device instructions.

**Optional (for E2E testing):**

| Tool | Version | Install Command |
|------|---------|-----------------|
| **Playwright** | `^1.42.0` | Installed via `rush update`; browsers via `rush test:e2e` setup |

---

## Initial Setup

Run these commands in order from the repo root:

```bash
# 1. Clone the repository
git clone <repository-url>
cd traxettle-rush

# 2. Install all dependencies (Rush + pnpm)
rush update

# 3. Build shared libraries first (required before apps)
rush build:shared
rush build:ui

# 4. Build all projects
rush build

# 5. Verify the setup
rush test:api
rush test:shared
```

If `rush update` fails, try:
```bash
rush purge          # Cleans all Rush temp files
rush update         # Re-install from scratch
```

---

## Firebase Setup

Traxettle uses Firebase for authentication, Firestore database, and storage. Follow these steps to configure Firebase.

### Step 1: Create a Firebase Project

1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Click **"Add project"** → Name it `traxettle-dev` (or any name)
3. Disable Google Analytics (optional for dev)
4. Click **Create project**

### Step 2: Enable Firebase Services

In the Firebase Console for your project:

```
Authentication → Get started → Sign-in method:
  ✅ Enable "Phone" (no additional config needed)
  ✅ Enable "Google" (add localhost to authorized domains)
  ✅ Enable "Microsoft" (optional, requires Azure AD app)

Firestore Database → Create database:
  ✅ Select "Start in test mode"
  ✅ Choose nearest region

Storage → Get started:
  ✅ Select "Start in test mode"
```

### Step 3: Get Backend Credentials (Service Account)

1. Firebase Console → **Project Settings** (gear icon) → **Service Accounts**
2. Click **"Generate new private key"**
3. Download the JSON file
4. Extract these values for your `.env.local`:
   - `project_id` → `FIREBASE_PROJECT_ID`
   - `client_email` → `FIREBASE_CLIENT_EMAIL`
   - `private_key` → `FIREBASE_PRIVATE_KEY`

### Step 4: Get Frontend Credentials (Web App Config)

1. Firebase Console → **Project Settings** → **General** → scroll to **"Your apps"**
2. Click the **Web** icon (`</>`) → Register app as "Traxettle Web"
3. Copy the `firebaseConfig` values for your `.env.local`

### Step 5: Configure Google OAuth Authorized Domains

1. Firebase Console → **Authentication** → **Settings** → **Authorized domains**
2. Add: `localhost`

### Mock Mode (No Firebase Required)

For development without Firebase credentials:
- Leave Firebase env vars empty or remove them
- The API automatically falls back to **mock services**
- Mock OTP code: `123456`
- Mock tokens: Use `Bearer mock-user-1` as Authorization header

For detailed Firebase guides, see:
- [Firebase Quick Start](docs/FIREBASE_QUICK_START.md) — 5-minute setup
- [Firebase Full Setup](docs/FIREBASE_SETUP.md) — Complete guide
- [Google OAuth Guide](docs/FIREBASE_GOOGLE_OAUTH_GUIDE.md)
- [Microsoft OAuth Guide](docs/FIREBASE_MICROSOFT_OAUTH_GUIDE.md)

---

## Environment Variables

Copy the example file and fill in your values:

```bash
cp .env.example .env.local
```

**Required variables in `.env.local`:**

```env
# ──────────────────────────────────────────────
# Firebase Backend (Service Account)
# ──────────────────────────────────────────────
FIREBASE_PROJECT_ID=your-project-id
FIREBASE_CLIENT_EMAIL=your-service-account@your-project-id.iam.gserviceaccount.com
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nYOUR_KEY_HERE\n-----END PRIVATE KEY-----\n"
FIREBASE_STORAGE_BUCKET=your-project-id.appspot.com

# ──────────────────────────────────────────────
# Firebase Frontend (Web App Config)
# ──────────────────────────────────────────────
NEXT_PUBLIC_FIREBASE_API_KEY=your-api-key
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=your-project-id.firebaseapp.com
NEXT_PUBLIC_FIREBASE_PROJECT_ID=your-project-id
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=your-project-id.appspot.com
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=your-sender-id
NEXT_PUBLIC_FIREBASE_APP_ID=your-app-id
NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID=your-measurement-id

# ──────────────────────────────────────────────
# JWT (change these for production!)
# ──────────────────────────────────────────────
JWT_SECRET=your-super-secret-jwt-key-change-this-in-production
JWT_REFRESH_SECRET=your-super-secret-refresh-key-change-this-in-production

# ──────────────────────────────────────────────
# API Server
# ──────────────────────────────────────────────
PORT=3001
NODE_ENV=development
DEV_MODE=true

# ──────────────────────────────────────────────
# App URL (used in invitation email links)
# ──────────────────────────────────────────────
APP_URL=http://localhost:3000

# ──────────────────────────────────────────────
# SMTP (for sending invitation emails)
# Leave SMTP_HOST empty for mock mode (emails logged to console)
# ──────────────────────────────────────────────
# SMTP_HOST=smtp.gmail.com
# SMTP_PORT=587
# SMTP_SECURE=false
# SMTP_USER=your-email@gmail.com
# SMTP_PASS=your-app-password
# SMTP_FROM=noreply@traxettle.app
```

> **Tip:** Without SMTP configured, invitation emails are logged to the API console in mock mode. To send real emails, configure SMTP (e.g., Gmail App Password, SendGrid, Mailgun).

---

## Project Structure

```
traxettle-rush/
├── apps/
│   ├── api/                  # Express.js backend API
│   │   ├── src/
│   │   │   ├── config/       # Firebase initialization
│   │   │   ├── middleware/    # Auth, error handling, logging
│   │   │   ├── routes/       # API route handlers
│   │   │   ├── services/     # Business logic services
│   │   │   └── __tests__/    # Jest unit tests
│   │   └── package.json
│   ├── web/                  # Next.js web application
│   │   ├── src/
│   │   │   ├── app/          # Next.js App Router pages
│   │   │   ├── components/   # React components
│   │   │   └── lib/          # Firebase client, utilities
│   │   └── package.json
│   └── mobile/               # React Native (Expo) mobile app
│       ├── src/              # App.tsx, screens, context, API client
│       ├── app.json          # Expo configuration
│       └── README.md         # ⭐ Complete mobile setup guide
├── libraries/
│   ├── shared/               # Shared TypeScript types & enums
│   │   ├── src/index.ts      # All type definitions
│   │   └── package.json
│   └── ui/                   # Shared UI component library
│       ├── src/              # Styled-components based UI
│       └── package.json
├── e2e/                      # Playwright E2E tests
│   ├── tests/                # Test spec files
│   ├── helpers/              # Auth & API test helpers
│   └── playwright.config.ts
├── docs/                     # Setup guides & documentation
├── common/config/rush/       # Rush monorepo configuration
├── rush.json                 # Rush project registry
├── .env.example              # Environment variable template
└── .env.local                # Your local environment (git-ignored)
```

### Package Dependency Graph

```
@traxettle/shared  ←──  @traxettle/ui  ←──  @traxettle/web
       ↑                                      
       └──────────────────────────  @traxettle/api
                                    @traxettle/mobile
```

---

## Rush Commands Reference

All commands are run from the **repo root** directory.

### Setup & Build

| Command | Description |
|---------|-------------|
| `rush update` | Install all dependencies across the monorepo |
| `rush build` | Build all projects (respects dependency order) |
| `rush build:shared` | Build only the shared types library |
| `rush build:ui` | Build only the UI component library |
| `rush build:api` | Build only the API server |
| `rush build:web` | Build only the web app for production |
| `rush build:mobile` | Type-check the mobile app (`tsc --noEmit`) |
| `rush clean` | Clean all build outputs (`dist/`, `.next/`) |
| `rush clean:mobile` | Clean mobile caches (`.expo`, `dist`, `node_modules/.cache`) |
| `rush purge` | Deep clean Rush temp files (use if `rush update` fails) |

### Development Servers

| Command | Description | URL |
|---------|-------------|-----|
| `rush dev:api` | Start API dev server (hot-reload) | http://localhost:3001 |
| `rush dev:web` | Start web app dev server (hot-reload) | http://localhost:3000 |
| `rush dev` | Alias for `rush dev:web` | http://localhost:3000 |
| `rush dev:mobile` | Start Expo mobile dev server | Expo Go QR code |
| `rush mobile:ios` | Start Expo + open iOS Simulator | iOS Simulator |
| `rush mobile:android` | Start Expo + open Android Emulator | Android Emulator |
| `rush mobile:tunnel` | Start Expo with tunnel (real devices) | Any network |
| `rush dev:shared` | Watch-mode rebuild of shared types | — |
| `rush dev:ui` | Watch-mode rebuild of UI components | — |

### Testing

| Command | Description |
|---------|-------------|
| `rush test` | Run all unit tests across all projects |
| `rush test:api` | Run API unit tests with coverage |
| `rush test:shared` | Run shared library unit tests |
| `rush test:e2e` | Run Playwright E2E tests (headless) |
| `rush test:e2e:headed` | Run E2E tests with visible browser |
| `rush test:e2e:ui` | Open Playwright interactive test UI |
| `rush test:e2e:report` | View the last E2E test HTML report |
| `rush test:regression` | Run regression suite (validates all Phase 2 functionality) |

### Code Quality

| Command | Description |
|---------|-------------|
| `rush lint` | Run ESLint across all projects |
| `rush typecheck` | Run TypeScript type-checking (no emit) |

### Production

| Command | Description |
|---------|-------------|
| `rush start:api` | Start API in production mode (requires `rush build:api` first) |
| `rush start:web` | Start web app in production mode (requires `rush build:web` first) |
| `rush mobile:prebuild:ios` | Generate native iOS project for Xcode builds |
| `rush mobile:prebuild:android` | Generate native Android project for Android Studio builds |

---

## Running Dev Servers

For local development, you need **two terminals** — one for the API and one for the web app.

### Terminal 1: API Server

```bash
rush dev:api
```

Verify it's running:
```bash
curl http://localhost:3001/health
# Expected: {"status":"OK","timestamp":"..."}
```

### Terminal 2: Web App

```bash
rush dev:web
```

Open in browser: [http://localhost:3000](http://localhost:3000)

### Full-Stack Development Tips

- If you modify `@traxettle/shared` types, rebuild before restarting servers:
  ```bash
  rush build:shared
  ```
- For live type updates during development, run in a third terminal:
  ```bash
  rush dev:shared
  ```
- The API auto-restarts on file changes (via `nodemon`)
- The web app auto-refreshes on file changes (via Next.js HMR)

---

## Running Tests

### Unit Tests

```bash
# Run all unit tests
rush test

# Run only API tests (392 tests across 15 suites, ~93% statement coverage)
rush test:api

# Run only shared library tests (36 tests, 100% coverage)
rush test:shared

# Run regression suite (validates all existing functionality is intact)
rush test:regression
```

### E2E Tests (Playwright)

**First-time setup:**
```bash
# Install Playwright browsers (one-time)
cd e2e && rushx install:browsers && cd ..
```

**Running E2E tests:**
```bash
# Headless (CI-friendly)
rush test:e2e

# With visible browser
rush test:e2e:headed

# Interactive UI mode (best for debugging)
rush test:e2e:ui

# View last test report
rush test:e2e:report
```

> **Note:** E2E tests automatically start the API (port 3001) and Web (port 3000) servers via the Playwright config. You do **not** need to start them manually.

### Test Coverage Summary

| Package | Tests | Statements | Branches | Functions | Lines |
|---------|-------|------------|----------|-----------|-------|
| `@traxettle/api` | 392 | 92.87% | 83.60% | 91.20% | 93.80% |
| `@traxettle/shared` | 36 | 100% | 100% | 100% | 100% |
| `@traxettle/e2e` | 31 | — | — | — | — |

---

## Technology Stack

| Layer | Technology | Version |
|-------|-----------|---------|
| **Monorepo** | Rush.js + pnpm | 5.167.0 / 9.15.9 |
| **Web Frontend** | Next.js (App Router) | 16.x |
| **Web UI** | React + styled-components | 19.x / 6.x |
| **Mobile** | React Native + Expo | 0.74 / 51.x |
| **API Server** | Express.js + TypeScript | 4.x / 5.x |
| **Real-time** | Socket.IO (WebSocket) | 4.x |
| **Database** | Firebase Firestore | Admin SDK 12.x |
| **Authentication** | Firebase Auth + JWT | 10.x / 9.x |
| **Shared Types** | TypeScript | 5.x |
| **Unit Testing** | Jest + Supertest + ts-jest | 29.x |
| **E2E Testing** | Playwright | 1.42+ |
| **Linting** | ESLint + TypeScript ESLint | 8.x / 6.x |

---

## API Endpoints

Base URL: `http://localhost:3001`

### Health Check
| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| `GET` | `/health` | No | Server health check |

### Authentication (`/api/auth`)
| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| `POST` | `/api/auth/send-otp` | No | Send OTP to phone number |
| `POST` | `/api/auth/verify-otp` | No | Verify OTP and receive tokens |
| `POST` | `/api/auth/google` | No | Google OAuth sign-in |
| `POST` | `/api/auth/microsoft` | No | Microsoft OAuth sign-in |
| `POST` | `/api/auth/refresh` | No | Refresh JWT access token |
| `POST` | `/api/auth/logout` | Yes | Invalidate session |

### Users (`/api/users`)
| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| `GET` | `/api/users/profile` | Yes | Get current user profile |
| `PUT` | `/api/users/profile` | Yes | Update user profile |

### Events (`/api/events`)
| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| `GET` | `/api/events` | Yes | List all events for current user |
| `GET` | `/api/events/:eventId` | Yes | Get single event details |
| `POST` | `/api/events` | Yes | Create a new event |
| `PUT` | `/api/events/:eventId` | Yes | Update an event (admin only; payment events block all edits; settled events only allow status→closed) |
| `DELETE` | `/api/events/:eventId` | Yes | Delete an event (creator only; blocked for settled/closed events) |
| `GET` | `/api/events/:eventId/participants` | Yes | List event participants |
| `POST` | `/api/events/:eventId/participants` | Yes | Add participant (admin only) |
| `DELETE` | `/api/events/:eventId/participants/:userId` | Yes | Remove participant |

### Expenses (`/api/expenses`)
| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| `GET` | `/api/expenses/event/:eventId` | Yes | List expenses for an event |
| `GET` | `/api/expenses/:expenseId` | Yes | Get single expense |
| `POST` | `/api/expenses` | Yes | Create a new expense |
| `PUT` | `/api/expenses/:expenseId` | Yes | Update an expense (creator or event admin; blocked on settled/closed events) |
| `DELETE` | `/api/expenses/:expenseId` | Yes | Delete an expense (creator or event admin; blocked on settled/closed events) |
| `GET` | `/api/expenses/event/:eventId/balances` | Yes | Get event balance summary |
| `POST` | `/api/expenses/calculate-splits` | Yes | Calculate split amounts |

### Groups (`/api/groups`)
| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| `GET` | `/api/groups/my` | Yes | Get all groups where current user is a member |
| `GET` | `/api/groups/event/:eventId` | Yes | List groups for an event |
| `GET` | `/api/groups/:groupId` | Yes | Get single group |
| `POST` | `/api/groups` | Yes | Create a new group |
| `POST` | `/api/groups/suggest` | Yes | Suggest existing groups by member overlap (70%) |
| `POST` | `/api/groups/:groupId/add-to-event` | Yes | Add existing group to another event (reuse) |
| `PUT` | `/api/groups/:groupId` | Yes | Update a group (payerUserId only; immutable name/members) |
| `PUT` | `/api/groups/:groupId/transfer-representative` | Yes | Transfer representative role to another member |
| `DELETE` | `/api/groups/:groupId` | Yes | Delete a group (creator or representative) |
| `POST` | `/api/groups/:groupId/members` | Yes | Add member to group |
| `DELETE` | `/api/groups/:groupId/members/:userId` | Yes | Remove member from group |

### Invitations (`/api/invitations`)
| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| `GET` | `/api/invitations/my` | Yes | Get current user's invitations |
| `GET` | `/api/invitations/event/:eventId` | Yes | Get invitations for an event |
| `GET` | `/api/invitations/token/:token` | No | Get invitation by share token |
| `GET` | `/api/invitations/:invitationId` | Yes | Get single invitation |
| `POST` | `/api/invitations` | Yes | Create invitation (admin only); sends email; optional `groupId` |
| `POST` | `/api/invitations/:id/accept` | Yes | Accept invitation; adds to event + group if `groupId` set |
| `POST` | `/api/invitations/:id/decline` | Yes | Decline an invitation |
| `DELETE` | `/api/invitations/:id` | Yes | Revoke an invitation |

### Settlements (`/api/settlements`)
| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| `GET` | `/api/settlements/event/:eventId/balances` | Yes | Get entity-level balances (groups as single entities) |
| `GET` | `/api/settlements/event/:eventId` | Yes | Get existing settlements for an event |
| `GET` | `/api/settlements/event/:eventId/pending-total` | Yes | Get pending settlement total |
| `POST` | `/api/settlements/event/:eventId/generate` | Yes | Generate settlement plan (admin only; greedy algorithm); enters payment mode |
| `POST` | `/api/settlements/:settlementId/pay` | Yes | Initiate mock payment (payer only); sets transaction to `initiated` |
| `POST` | `/api/settlements/:settlementId/approve` | Yes | Confirm receipt of payment (payee only); sets transaction to `completed`; auto-settles event when all complete |

### WebSocket (Socket.IO)
| Event | Direction | Description |
|-------|-----------|-------------|
| `join-event` | Client → Server | Join event room for real-time updates |
| `leave-event` | Client → Server | Leave event room |
| `expense:created` | Server → Client | Expense was created |
| `expense:updated` | Server → Client | Expense was updated |
| `expense:deleted` | Server → Client | Expense was deleted |
| `group:updated` | Server → Client | Group was created/updated/deleted |
| `event:updated` | Server → Client | Event details or status changed (also emitted on settlement generation and auto-settle) |
| `event:deleted` | Server → Client | Event was deleted |
| `settlement:generated` | Server → Client | Settlement plan generated |
| `settlement:updated` | Server → Client | Settlement transaction status changed (pay/approve) |

WebSocket path: `ws://localhost:3001/ws`

**Dashboard Real-time:** The dashboard subscribes to all visible event rooms via `useMultiEventSocket` and updates event tiles in-place when status changes (e.g., `active` → `payment` → `settled`). Closed events are removed from the dashboard automatically.

---

## Authentication

### Supported Methods
- **Phone OTP** — Enter phone number, receive OTP, verify
- **Google OAuth** — Sign in with Google account
- **Microsoft OAuth** — Sign in with Microsoft account (optional)

### Token Flow
1. User authenticates → receives **access token** (1h) + **refresh token** (7d)
2. Access token sent as `Authorization: Bearer <token>` header
3. On expiry, use `/api/auth/refresh` with refresh token
4. Mock mode: Use `Bearer mock-user-1` for development without Firebase

### Development Mock Auth
In mock mode (no Firebase credentials), the API accepts:
- `Authorization: Bearer mock-<any-user-id>` — Creates a mock user context
- OTP code: `123456` for any phone number

---

## Free/Pro Entitlements

### Server-authoritative tiering
- Tier and capabilities are derived by API from user entitlement state.
- Pro-only FX/multi-currency event fields are blocked server-side for Free users.
- Existing Free 3 active/closed event limit is unchanged.

### Manual test switch controls
- Local: mobile + web tier switch enabled when internal flags are enabled.
- Staging/Internal/TestFlight: mobile-only tier switch for internal testers.
- Production: manual switch disabled.

### RevenueCat integration
- Webhook endpoint: `POST /api/billing/revenuecat/webhook`
- Internal routes: `GET /api/internal/entitlements/me`, `POST /api/internal/entitlements/switch`
- Runbook: `docs/REVENUECAT_INTEGRATION_RUNBOOK.md`

### Settlement payment safety
- Non-prod defaults to mocked payments.
- Real Razorpay/Stripe in non-prod requires all:
  - `PAYMENT_ALLOW_REAL_IN_NON_PROD=true`
  - request payload `useRealGateway=true`
  - internal tester user
- Policy doc: `docs/SETTLEMENT_GATEWAY_TESTING_POLICY.md`

---

## Firebase Local Emulator Suite (Local Development)

Use the simple local scripts (no Rush lock juggling):

1. Set test flags (tier + payment mode):
   - `sh scripts/local-dev/05_set-flags.sh --tier free --payments mock`
   - `sh scripts/local-dev/05_set-flags.sh --tier pro --payments real`
2. Run one mode:
   - Firebase emulator + mobile: `sh scripts/local-dev/01_emulator_mobile.sh`
   - Firebase emulator + web: `sh scripts/local-dev/02_emulator_web.sh`
   - Real Firebase + mobile: `sh scripts/local-dev/03_real_mobile.sh`
   - Real Firebase + web: `sh scripts/local-dev/04_real_web.sh`

All scripts start API + app together and stop all child processes with `Ctrl+C`.

### Hidden developer mode (local only)

- Web:
  - Open Profile page.
  - Click version label `Traxettle v1.0.0` 7 times.
  - In unlocked `Developer (Hidden)` section, toggle Firebase emulator on/off.
- Mobile:
  - Open Profile screen.
  - Tap version label `Traxettle v1.0.0` 7 times.
  - In unlocked `Developer (Hidden)` section, toggle `Use Firebase Emulator`.

Notes:
- This hidden developer mode is available only in local/dev environment.
- It is not available in internal testing/TestFlight/production.

---

## Troubleshooting

| Problem | Solution |
|---------|----------|
| `rush update` fails | Run `rush purge` then `rush update` |
| `Cannot find module '@traxettle/shared'` | Run `rush build:shared` first |
| `Cannot find module '@traxettle/ui'` | Run `rush build:ui` first |
| API returns `Firebase app does not exist` | Check `.env.local` Firebase credentials |
| API returns `Permission denied` | Update Firestore security rules to test mode |
| Google OAuth fails | Add `localhost` to Firebase authorized domains |
| Port 3000/3001 already in use | Kill existing process: `lsof -ti:3000 \| xargs kill` |
| E2E tests fail to start servers | Ensure ports 3000 and 3001 are free |
| `rush` command not found | Run via `npx @microsoft/rush@5.167.0 <command>` or install Rush globally |
| Node version mismatch | Use `nvm use 24` or install Node.js 24.x |
| Invitation emails not sending | Configure SMTP_HOST in `.env.local`; without it, emails are logged to console |
| `Cannot find module 'nodemailer'` | Run `rush update` to install new dependencies |

---

## Contributing

1. Clone the repo and run `rush update`
2. Create a feature branch: `git checkout -b feature/my-feature`
3. Make changes following existing code patterns
4. Run checks before committing:
   ```bash
   rush build
   rush typecheck
   rush lint
   rush test
   ```
5. Submit a pull request

---

## Local URLs Quick Reference

| Service | URL | Description |
|---------|-----|-------------|
| Web App | http://localhost:3000 | Next.js frontend |
| API Server | http://localhost:3001 | Express backend |
| API Health | http://localhost:3001/health | Health check endpoint |
| Expo (Mobile) | Shown in terminal | Scan QR with Expo Go |

---

**Traxettle** — Making expense splitting simple and fair.
