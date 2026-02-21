# Maestro Test Suite (Mobile)

This folder contains mobile E2E tests powered by Maestro.

## Structure

- `flows/auth/auth-and-profile.yaml`: authentication and profile smoke flow
- `flows/settlement/same-currency-mock.yaml`: same-currency settlement flow (mock payment)
- `flows/settlement/multi-currency-mock.yaml`: multi-currency (`USD -> INR`) settlement flow with EOD FX path (mock payment)

Settlement retry coverage:
- `same-currency-mock` now validates payer retry by asserting `Retry Payment` after the first pay action and re-triggering payment before payee confirmation.

## Run Commands

From monorepo root:

- `rush test:maestro` : run all Maestro flows without artifacts
- `rush test:maestro:artifacts` : run all Maestro flows with debug artifacts (screenshots/logs)
- `rush test:maestro:android` : run all Maestro flows on Android emulator (`emulator-5556` by default)
- `rush test:maestro:ios` : run all Maestro flows on iOS simulator/device (`MAESTRO_DEVICE` can be set)

## Data Cleanup

Maestro runs automatically clean Firebase Maestro test data:
- before each run
- after each run

Cleanup script:
- `maestro/scripts/cleanup-firebase-maestro.js`

## Firebase Local Emulator Suite

By default Maestro runs now boot the Firebase Local Emulator Suite (`auth`, `firestore`, `storage`) and launch API in emulator mode for the test run.

- default behavior: `MAESTRO_USE_FIREBASE_EMULATOR=true`
- default API lifecycle management: `MAESTRO_MANAGE_API=true`
- emulator-backed API port: `MAESTRO_API_PORT` (default `3001`)

Useful overrides:

```bash
# Run Maestro without emulator mode (uses your existing API/Firebase setup)
MAESTRO_USE_FIREBASE_EMULATOR=false rush test:maestro

# Keep emulator mode, but do not auto-start API (if you run API yourself)
MAESTRO_MANAGE_API=false rush test:maestro
```

## Preconditions

1. Mobile app must be installed and runnable on local simulator/emulator with app id `com.splitex.app`.
2. Maestro CLI must be installed locally.
