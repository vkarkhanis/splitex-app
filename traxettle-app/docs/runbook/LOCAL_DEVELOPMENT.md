# Traxettle — Local Development RunBook

This document covers the **6 local run modes** for Traxettle. Each mode is a single command that starts all required services.

---

## Prerequisites

| Tool | Version | Check |
|------|---------|-------|
| Node.js | ≥ 24 | `node -v` |
| Java (JDK) | ≥ 21 | `java -version` (emulator modes only) |
| Rush | latest | `rush --version` (installed via `npm i -g @microsoft/rush`) |
| Firebase CLI | latest | `firebase --version` (or auto-installed via `npx`) |

**One-time setup:**
```bash
rush install
rush build
```

---

## Optional: Set Tier & Payment Flags

Before running any mode, you can configure the default tier and payment behavior:

```bash
# Default: free tier, mock payments
sh scripts/local-dev/05_set-flags.sh --tier free --payments mock

# Pro tier with mock payments
sh scripts/local-dev/05_set-flags.sh --tier pro --payments mock

# Pro tier with real payment gateway (non-prod only)
sh scripts/local-dev/05_set-flags.sh --tier pro --payments real
```

These flags persist in `scripts/local-dev/.runtime.env` and are picked up by all 4 atomic scripts.

---

## Mode 1: WEB + Firebase Emulator

**What it starts:** Firebase Emulators (Auth, Firestore, Storage) + API (port 3001) + Web (port 3000)

**Firebase project:** `traxettle-local` (emulated — no real cloud data)

```bash
sh scripts/local-dev/02_emulator_web.sh
```

**Access:**
- Web app: http://localhost:3000
- API: http://localhost:3001
- Emulator UI: http://localhost:4000

**When to use:** Frontend web development without touching real Firebase. Safe for experimentation — data resets on emulator restart.

---

## Mode 2: Mobile + Firebase Emulator

**What it starts:** Firebase Emulators + API (port 3001) + Expo Metro bundler (port 8081)

**Firebase project:** `traxettle-local` (emulated)

```bash
sh scripts/local-dev/01_emulator_mobile.sh
```

**Access:**
- Expo dev server: shown in terminal (scan QR or press `a` for Android emulator)
- API: http://localhost:3001 (or http://10.0.2.2:3001 from Android emulator)
- Emulator UI: http://localhost:4000

**Android emulator extra steps:**
```bash
adb reverse tcp:3001 tcp:3001   # API access
adb reverse tcp:8081 tcp:8081   # Metro bundler
```

**When to use:** Mobile development without touching real Firebase.

---

## Mode 3: WEB + Real Firebase (traxettle-staging)

**What it starts:** API (port 3001, real Firebase) + Web (port 3000)

**Firebase project:** `traxettle-staging` (real cloud data)

**Prerequisite files** (in `apps/mobile/`):
- `google-services.staging.json`
- `debug.keystore.staging`

```bash
sh scripts/local-dev/04_real_web.sh
```

**Access:**
- Web app: http://localhost:3000
- API: http://localhost:3001

**Required env vars** (in `.env.local` at repo root or `apps/api/.env`):
```
FIREBASE_PROJECT_ID=traxettle-staging
FIREBASE_CLIENT_EMAIL=<service-account-email>
FIREBASE_PRIVATE_KEY="<service-account-private-key>"
FIREBASE_STORAGE_BUCKET=traxettle-staging.firebasestorage.app
```

**When to use:** Testing against real staging data/auth. Google Sign-In works with real Firebase credentials.

---

## Mode 4: Mobile + Real Firebase (traxettle-staging)

**What it starts:** API (port 3001, real Firebase) + Expo Metro bundler (port 8081)

**Firebase project:** `traxettle-staging` (real cloud data)

```bash
sh scripts/local-dev/03_real_mobile.sh
```

**Access:**
- Expo dev server: shown in terminal
- API: http://localhost:3001

**Android emulator extra steps:**
```bash
adb reverse tcp:3001 tcp:3001
adb reverse tcp:8081 tcp:8081
```

**When to use:** Testing mobile app against real Firebase (staging). Google Sign-In with real OAuth.

---

## Mode 5: WEB + Real Firebase (traxettle-testing)

Same as Mode 3 but pointing at the `traxettle-test` project. Update `.env.local`:

```
FIREBASE_PROJECT_ID=traxettle-test
FIREBASE_CLIENT_EMAIL=<test-project-service-account>
FIREBASE_PRIVATE_KEY="<test-project-private-key>"
FIREBASE_STORAGE_BUCKET=traxettle-test.firebasestorage.app
```

Then run:
```bash
sh scripts/local-dev/04_real_web.sh
```

> **Note:** The bootstrap script copies `google-services.staging.json` by default. To use `traxettle-test`, either update the `.env.local` credentials or modify the bootstrap call.

---

## Mode 6: Mobile + Real Firebase (traxettle-testing)

Same as Mode 4 but pointing at `traxettle-test`. Update `.env.local` as in Mode 5, then:

```bash
sh scripts/local-dev/03_real_mobile.sh
```

---

## Quick Reference

| # | Mode | Command | Firebase | Client |
|---|------|---------|----------|--------|
| 1 | Web + Emulator | `sh scripts/local-dev/02_emulator_web.sh` | Emulated (local) | Web |
| 2 | Mobile + Emulator | `sh scripts/local-dev/01_emulator_mobile.sh` | Emulated (local) | Mobile |
| 3 | Web + Staging | `sh scripts/local-dev/04_real_web.sh` | traxettle-staging | Web |
| 4 | Mobile + Staging | `sh scripts/local-dev/03_real_mobile.sh` | traxettle-staging | Mobile |
| 5 | Web + Testing | `sh scripts/local-dev/04_real_web.sh` + .env.local | traxettle-test | Web |
| 6 | Mobile + Testing | `sh scripts/local-dev/03_real_mobile.sh` + .env.local | traxettle-test | Mobile |

---

## Ports

| Service | Port |
|---------|------|
| Web (Next.js) | 3000 |
| API (Express) | 3001 |
| Expo Metro | 8081 |
| Firebase Auth Emulator | 9099 |
| Firestore Emulator | 8080 |
| Storage Emulator | 9199 |
| Emulator UI | 4000 |

---

## Troubleshooting

**"Java not found"** — Install JDK 21+ (`brew install openjdk@21` on macOS).

**Google Sign-In Error 10 (developer_error)** — SHA-1 mismatch. Run `bootstrap.sh` and check the SHA-1 output matches your Firebase Console Android app fingerprints.

**API 401 on mobile emulator** — Run `adb reverse tcp:3001 tcp:3001`.

**"Rush is already running"** — Use the atomic scripts (01–04) instead of `rush dev` commands. They don't hold Rush locks.

**Data not persisting in emulator** — Emulator data is saved to `.firebase/emulator-data/` on clean shutdown. Force-killing the process may lose data.

**Verify API is running:**
```bash
curl http://localhost:3001/health
```

---

## Running Tests

```bash
# All unit tests
rush test

# API unit tests with coverage
cd apps/api && npx jest --coverage

# Mobile unit tests with coverage
cd apps/mobile && npx jest --coverage

# E2E (Playwright) — starts API + Web automatically
cd e2e && npx playwright test

# Maestro (requires running mobile app + emulator)
maestro test apps/mobile/maestro/flows/auth/auth-and-profile.yaml
maestro test apps/mobile/maestro/flows/settlement/same-currency-mock.yaml
maestro test apps/mobile/maestro/flows/settlement/multi-currency-mock.yaml
maestro test apps/mobile/maestro/flows/events/create-and-manage.yaml
maestro test apps/mobile/maestro/flows/groups/create-group.yaml
```
