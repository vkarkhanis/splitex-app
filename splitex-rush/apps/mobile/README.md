# Splitex Mobile App — Developer Guide

This README is mobile-only. For monorepo/Firebase/global env setup see:
- `../../README.md`

API runtime details are in:
- `../api/README.md`

## What This App Owns
- React Native + Expo mobile client (iOS/Android)
- Mobile auth/onboarding/event/expense/settlement UX
- Mobile-only internal tier switching controls (non-production)
- Hidden local developer options (including Firebase emulator mode toggle)

## Local Run Options (Simple and Sequential)

### Option 1: Atomic script (recommended, avoids Rush lock complexity)
From repo root:
```bash
# Firebase emulator + API + mobile
sh scripts/local-dev/01_emulator_mobile.sh

# Real Firebase + API + mobile
sh scripts/local-dev/03_real_mobile.sh
```

### Option 2: Manual with Rush
Terminal 1:
```bash
cd splitex-rush
rush dev:api
```
Terminal 2:
```bash
cd splitex-rush
rush dev:mobile
```

### Option 3: Manual with npm (acceptable fallback)
Terminal 1:
```bash
cd splitex-rush/apps/api
npm run dev
```
Terminal 2:
```bash
cd splitex-rush/apps/mobile
npm run start
```

## iOS and Android Execution
From `splitex-rush/apps/mobile`:
```bash
# iOS simulator
npm run ios

# Android emulator/device
npm run android

# Expo dev server only
npm run start
```

Rush equivalents:
```bash
rush mobile:ios
rush mobile:android
rush dev:mobile
```

## Simulator/Device Setup
### iOS
- Install Xcode and command-line tools.
- Start simulator with `npm run ios` or use Expo prompt (`i`).
- Choose simulator device interactively (`Shift + i` in Expo terminal).

### Android
- Install Android Studio + SDK.
- Start emulator from AVD Manager.
- Run `npm run android`.

### Real device (LAN)
- Use `EXPO_PUBLIC_API_URL=http://<LAN_IP>:3001`.
- For Android emulator host mapping, API on host is `10.0.2.2`.

## Mobile Environment Variables
Use mobile-relevant keys here; global descriptions live in `../../README.md`.

### Runtime routing
- `EXPO_PUBLIC_APP_ENV`
- `EXPO_PUBLIC_API_URL`
- `EXPO_PUBLIC_API_URL_IOS`
- `EXPO_PUBLIC_API_URL_ANDROID`
- `EXPO_PUBLIC_API_URL_EMULATOR`
- `EXPO_PUBLIC_API_URL_EMULATOR_IOS`
- `EXPO_PUBLIC_API_URL_EMULATOR_ANDROID`

### Tiering/internal controls
- `EXPO_PUBLIC_DEFAULT_TIER=free|pro`
- `EXPO_PUBLIC_INTERNAL_FEATURES_ENABLED=true|false`
- `EXPO_PUBLIC_LOCAL_DEV_OPTIONS_ENABLED=true|false`

### Payments
- `EXPO_PUBLIC_USE_REAL_PAYMENTS=true|false` (request flag only; API policy decides final behavior)

### OAuth
- `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID`
- `EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID`
- `EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID`

## Local Tier and Payment Flag Control
Set both once using:
```bash
cd splitex-rush
sh scripts/local-dev/05_set-flags.sh --tier pro --payments mock
```

Allowed values:
- `--tier free|pro`
- `--payments mock|real`

Then run one of the atomic scripts (`01`/`03`).

## Behavior by Environment (Mobile)
- Local: tier switch available for testing; developer options may expose emulator mode.
- Internal/TestFlight: tier switch allowed for authorized testers only.
- Production: no manual tier switching.

Payments:
- Local/internal default mocked.
- Real gateway only when API policy allows and user is authorized.

## Testing
From `splitex-rush/apps/mobile`:
```bash
npm run test
npm run test:coverage

# Maestro
npm run test:maestro
npm run test:maestro:artifacts
npm run test:maestro:ios
npm run test:maestro:android
```

From repo root:
```bash
rush test:mobile
rush test:mobile:coverage
rush test:maestro
```

## Firebase Emulator and Maestro
Recommended for quota-safe local testing:
- `sh scripts/local-dev/01_emulator_mobile.sh`
- Maestro uses emulator-supported flow and cleanup scripts under `maestro/scripts/`.

## Troubleshooting
### Rush lock conflicts
Use atomic scripts (`01_emulator_mobile.sh`, `03_real_mobile.sh`) or app-local npm commands.

### Network request failed on device/emulator
- Verify API URL is reachable from that target.
- iOS simulator: `localhost` works.
- Android emulator: use `10.0.2.2`.
- Physical device: use LAN IP or tunnel.

### Firebase quota exceeded
Use local emulator stack (`01_emulator_mobile.sh`).

### Emulator startup errors
Firebase emulator requires Java 21+.

## Cross-References
- Root global env catalog: `../../README.md`
- API policies and sequences: `../api/README.md`
- Tier/gateway policy docs:
  - `../../docs/TIER_ENTITLEMENT_ENV_MATRIX.md`
  - `../../docs/SETTLEMENT_GATEWAY_TESTING_POLICY.md`
- Maestro flow details: `maestro/README.md`

## Legacy Full-Detail Archive
- `../../docs/readme-archives/README.mobile.archive.md`
