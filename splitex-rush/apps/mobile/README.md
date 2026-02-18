# Splitex Mobile App — Developer Guide

Complete React Native (Expo) mobile application for iOS and Android. This guide covers everything you need to set up, run, test, and debug the Splitex mobile app on simulators, emulators, and real devices.

---

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [Quick Start](#quick-start)
3. [Environment Variables](#environment-variables)
4. [Project Structure](#project-structure)
5. [Rush Commands Reference](#rush-commands-reference)
6. [Running on iOS Simulator](#running-on-ios-simulator)
7. [Running on Android Emulator](#running-on-android-emulator)
8. [Running on Real Devices](#running-on-real-devices)
9. [End-to-End Testing Guide](#end-to-end-testing-guide)
10. [Architecture & Key Files](#architecture--key-files)
11. [Features](#features)
12. [Known Limitations & Roadmap](#known-limitations--roadmap)
13. [Troubleshooting](#troubleshooting)

---

## Prerequisites

### Required (all platforms)

| Tool | Version | Install |
|------|---------|---------|
| **Node.js** | `>=24.11.1 <25.0.0` | `nvm install 24` or [nodejs.org](https://nodejs.org) |
| **Rush.js** | `5.167.0` | `npm install -g @microsoft/rush` |
| **Expo CLI** | Latest | `npm install -g expo-cli` |
| **Expo Go** app | Latest | Install from App Store (iOS) or Play Store (Android) |

### For iOS Development (macOS only)

| Tool | Version | Install |
|------|---------|---------|
| **macOS** | 13+ (Ventura or later) | — |
| **Xcode** | 15+ | Mac App Store |
| **Xcode Command Line Tools** | Latest | `xcode-select --install` |
| **CocoaPods** | Latest | `sudo gem install cocoapods` |
| **iOS Simulator** | Included with Xcode | Open Xcode → Settings → Platforms → Download iOS Simulator |

### For Android Development (macOS / Windows / Linux)

| Tool | Version | Install |
|------|---------|---------|
| **Android Studio** | Latest | [developer.android.com/studio](https://developer.android.com/studio) |
| **Android SDK** | API 34+ | Android Studio → SDK Manager |
| **Android Emulator** | Latest | Android Studio → Virtual Device Manager |
| **Java JDK** | 17 | `brew install openjdk@17` (macOS) or [adoptium.net](https://adoptium.net) |

### For Real Device Testing

| Tool | Purpose | Install |
|------|---------|---------|
| **Expo Go** | Run Expo apps without native build | App Store / Play Store |
| **EAS CLI** | Build native binaries for real devices | `npm install -g eas-cli` |
| **@expo/ngrok** | Tunnel for real devices on different networks | `npm install -g @expo/ngrok` |

---

## Quick Start

From the **monorepo root** (`splitex-rush/`):

```bash
# 1. Install all monorepo dependencies
rush update

# 2. Build the shared types library (required before mobile)
rush build:shared

# 3. Start the API backend (Terminal 1)
rush dev:api

# 4. Start the Expo dev server (Terminal 2)
rush dev:mobile
#   → Scan the QR code with Expo Go on your phone
#   → Or press 'i' for iOS Simulator / 'a' for Android Emulator
```

**That's it for basic development.** The app connects to `http://localhost:3001` by default.

---

## Environment Variables

The mobile app uses **Expo public environment variables** (prefixed with `EXPO_PUBLIC_`). These are inlined at build time by Metro bundler.

### Configuration File

The primary config is in `src/config/env.ts`:

```typescript
// Default: connects to localhost:3001 in dev, api.splitex.app in prod
export const ENV = {
  API_URL: __DEV__ ? 'http://localhost:3001' : 'https://api.splitex.app',
  WS_URL:  __DEV__ ? 'ws://localhost:3001/ws' : 'wss://api.splitex.app/ws',
};
```

### Overriding API URL (for real devices)

When testing on a **real device**, `localhost` won't work. Override the API URL:

```bash
# Option 1: Expo public env var (recommended)
EXPO_PUBLIC_API_URL=http://192.168.1.42:3001 npx expo start

# Option 2: Use tunnel mode (works across networks)
rush mobile:tunnel
```

### Finding Your LAN IP

```bash
# macOS
ipconfig getifaddr en0

# Linux
hostname -I | awk '{print $1}'

# Windows
ipconfig | findstr "IPv4"
```

### Environment Variable Reference

| Variable | Default (dev) | Description |
|----------|---------------|-------------|
| `EXPO_PUBLIC_API_URL` | `http://localhost:3001` | Splitex API base URL |
| `__DEV__` | `true` (auto) | Set by Expo; `true` in dev, `false` in production builds |

> **Note:** The mobile app does **not** need Firebase credentials directly. All Firebase operations go through the API server. You only need the API server running with its own `.env.local`.

---

## Project Structure

```
apps/mobile/
├── app.json                    # Expo configuration (app name, bundle ID, splash)
├── babel.config.js             # Babel preset for Expo
├── package.json                # Dependencies and scripts
├── tsconfig.json               # TypeScript config (extends expo/tsconfig.base)
├── README.md                   # This file
└── src/
    ├── App.tsx                 # Root component: AuthProvider + NavigationContainer
    ├── api.ts                  # HTTP client with AsyncStorage token management
    ├── theme.ts                # Colors, spacing, radii, fontSizes, currency symbols
    ├── config/
    │   └── env.ts              # Environment configuration + API URL override
    ├── context/
    │   └── AuthContext.tsx      # Auth state: login, register, logout, tier (free/pro)
    └── screens/
        ├── LoginScreen.tsx     # Email/password login
        ├── RegisterScreen.tsx  # New account registration
        ├── DashboardScreen.tsx # Event list with pull-to-refresh, FX badges
        ├── EventDetailScreen.tsx # Expenses, settlements (dual currency), groups
        ├── CreateExpenseScreen.tsx # Expense form with "On Behalf Of" + entity splits
        └── CreateEventScreen.tsx  # Event form with FX settings + Pro tier gating
```

---

## Rush Commands Reference

All commands run from the **monorepo root**.

### Development

| Command | Description |
|---------|-------------|
| `rush dev:mobile` | Start Expo dev server (QR code for Expo Go) |
| `rush mobile:ios` | Start Expo and auto-open iOS Simulator |
| `rush mobile:android` | Start Expo and auto-open Android Emulator |
| `rush mobile:tunnel` | Start Expo with tunnel mode (real devices on any network) |

### Build & Quality

| Command | Description |
|---------|-------------|
| `rush build:mobile` | Type-check the mobile app (`tsc --noEmit`) |
| `rush clean:mobile` | Clean `.expo`, `dist`, and `node_modules/.cache` |

### Native Builds (for real device deployment)

| Command | Description |
|---------|-------------|
| `rush mobile:prebuild:ios` | Generate native iOS project (`ios/` directory) |
| `rush mobile:prebuild:android` | Generate native Android project (`android/` directory) |

### Direct `rushx` Commands (from `apps/mobile/`)

| Command | Description |
|---------|-------------|
| `rushx start` | `expo start` |
| `rushx ios` | `expo start --ios` |
| `rushx android` | `expo start --android` |
| `rushx start:tunnel` | `expo start --tunnel` |
| `rushx typecheck` | `tsc --noEmit` |
| `rushx clean` | Remove caches |
| `rushx prebuild:ios` | `expo prebuild --platform ios --clean` |
| `rushx prebuild:android` | `expo prebuild --platform android --clean` |

---

## Running on iOS Simulator

### One-Time Setup

1. **Install Xcode** from the Mac App Store
2. **Open Xcode** → Accept the license agreement
3. **Install Simulator runtimes:**
   - Xcode → Settings → Platforms → Click `+` → Download **iOS 17** (or latest)
4. **Install Command Line Tools:**
   ```bash
   xcode-select --install
   ```
5. **Verify Simulator is available:**
   ```bash
   xcrun simctl list devices
   ```

### Running

```bash
# Terminal 1: Start the API
rush dev:api

# Terminal 2: Start Expo and open iOS Simulator
rush mobile:ios
```

Expo will:
1. Start the Metro bundler
2. Auto-launch the iOS Simulator
3. Install Expo Go in the simulator
4. Open the Splitex app

### Tips

- **Switch simulator device:** Press `Shift + i` in the Expo terminal to pick a different iPhone model
- **Reload app:** Press `r` in the terminal, or `Cmd + R` in the simulator
- **Open dev menu:** Press `Cmd + D` in the simulator
- **Shake gesture:** `Ctrl + Cmd + Z` in the simulator

---

## Running on Android Emulator

### One-Time Setup

1. **Install Android Studio** from [developer.android.com/studio](https://developer.android.com/studio)
2. **Install Android SDK:**
   - Android Studio → Settings → Languages & Frameworks → Android SDK
   - SDK Platforms tab → Check **Android 14 (API 34)** → Apply
   - SDK Tools tab → Check **Android SDK Build-Tools**, **Android Emulator**, **Android SDK Platform-Tools** → Apply
3. **Create a Virtual Device:**
   - Android Studio → Virtual Device Manager (or Tools → Device Manager)
   - Click **Create Device** → Select **Pixel 7** (or any device) → Next
   - Select **API 34** system image → Download if needed → Next → Finish
4. **Set environment variables** (add to `~/.zshrc` or `~/.bashrc`):
   ```bash
   export ANDROID_HOME=$HOME/Library/Android/sdk   # macOS
   # export ANDROID_HOME=$HOME/Android/Sdk          # Linux
   export PATH=$PATH:$ANDROID_HOME/emulator
   export PATH=$PATH:$ANDROID_HOME/platform-tools
   ```
5. **Verify ADB is available:**
   ```bash
   source ~/.zshrc   # reload shell
   adb devices
   ```

### Running

```bash
# Terminal 1: Start the API
rush dev:api

# Terminal 2: Start Expo and open Android Emulator
rush mobile:android
```

Expo will:
1. Start the Metro bundler
2. Auto-launch the Android Emulator
3. Install Expo Go in the emulator
4. Open the Splitex app

### Tips

- **Switch emulator:** Press `Shift + a` in the Expo terminal
- **Reload app:** Press `r` in the terminal, or double-tap `R` in the emulator
- **Open dev menu:** Press `m` in the terminal, or shake the emulator (`Cmd + M` on macOS)
- **Cold boot emulator:** If emulator hangs, use `emulator -avd <avd_name> -no-snapshot`

---

## Running on Real Devices

### Option A: Expo Go (Easiest — No Native Build Required)

**Requirements:**
- Phone and computer on the **same Wi-Fi network**
- Expo Go app installed on your phone

**Steps:**

```bash
# 1. Find your computer's LAN IP
ipconfig getifaddr en0    # macOS — e.g. 192.168.1.42

# 2. Start the API server bound to all interfaces
# (The API already binds to 0.0.0.0 by default)
rush dev:api

# 3. Start Expo with your LAN IP as the API URL
EXPO_PUBLIC_API_URL=http://192.168.1.42:3001 rush dev:mobile

# 4. Scan the QR code shown in the terminal
#    - iOS: Use the Camera app → tap the Expo banner
#    - Android: Open Expo Go app → Scan QR Code
```

### Option B: Tunnel Mode (Different Networks / Corporate Wi-Fi)

If your phone and computer are on different networks, or corporate Wi-Fi blocks local connections:

```bash
# Install ngrok (one-time)
npm install -g @expo/ngrok

# Start with tunnel
rush mobile:tunnel

# Scan the QR code — works from any network
```

### Option C: Development Build on Real Device (Native Features)

For testing native modules not available in Expo Go:

```bash
# 1. Install EAS CLI
npm install -g eas-cli

# 2. Log in to Expo
eas login

# 3. Generate native project
rush mobile:prebuild:ios      # iOS
rush mobile:prebuild:android  # Android

# 4. Build development client
# iOS (requires Apple Developer account)
cd apps/mobile && eas build --platform ios --profile development

# Android (generates APK)
cd apps/mobile && eas build --platform android --profile development

# 5. Install the built app on your device and start the dev server
rush dev:mobile
```

### iOS Real Device (via Xcode — Free)

You can run on a real iPhone **without** an Apple Developer account (for personal testing):

```bash
# 1. Generate native iOS project
rush mobile:prebuild:ios

# 2. Open in Xcode
open apps/mobile/ios/Splitex.xcworkspace

# 3. In Xcode:
#    - Select your iPhone as the build target (plug it in via USB)
#    - Go to Signing & Capabilities → Select your personal team
#    - Click Run (▶)

# 4. On your iPhone: Settings → General → VPN & Device Management
#    → Trust the developer certificate

# 5. Start the Expo dev server
EXPO_PUBLIC_API_URL=http://YOUR_LAN_IP:3001 rush dev:mobile
```

### Android Real Device (via USB)

```bash
# 1. Enable Developer Options on your Android phone:
#    Settings → About Phone → Tap "Build Number" 7 times

# 2. Enable USB Debugging:
#    Settings → Developer Options → USB Debugging → On

# 3. Connect phone via USB and verify:
adb devices
# Should show your device ID

# 4. Start Expo
EXPO_PUBLIC_API_URL=http://YOUR_LAN_IP:3001 rush mobile:android
# Expo will auto-install and launch on the connected device
```

---

## End-to-End Testing Guide

### Is the Mobile App Ready for E2E Testing?

**Yes, with caveats.** The mobile app is fully functional for manual E2E testing. Here's the current readiness status:

| Area | Status | Notes |
|------|--------|-------|
| **Auth (Login/Register)** | ✅ Ready | Requires API in mock mode (`Bearer mock-user-1`) or real Firebase auth |
| **Dashboard (Event List)** | ✅ Ready | Pull-to-refresh, FX badges, status badges |
| **Create Event** | ✅ Ready | Including FX settings (Pro tier gated) |
| **Event Detail** | ✅ Ready | Expenses, settlements with dual currency, groups, pay/approve |
| **Create Expense** | ✅ Ready | Entity selection, splits, "On Behalf Of" |
| **Settlement Flow** | ✅ Ready | Settle → Pay → Approve → Auto-close |
| **Automated E2E Tests** | ❌ Not Yet | No Detox/Maestro test suite; manual testing only for now |
| **Offline Mode** | ❌ Not Yet | App requires network connectivity |

### Manual E2E Test Plan

Follow these steps to test the complete flow on a simulator or real device.

#### Prerequisites

```bash
# Terminal 1: Start API in mock mode (no Firebase needed)
rush dev:api
# Verify: curl http://localhost:3001/health

# Terminal 2: Start Expo
rush mobile:ios    # or rush mobile:android
```

#### Test 1: Authentication Flow

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | App launches | Login screen appears with "Splitex" branding |
| 2 | Tap "Don't have an account? Register" | Register screen appears |
| 3 | Fill in name, email, password → Tap "Create Account" | Redirected to Dashboard (empty state) |
| 4 | Tap "Sign Out" | Redirected back to Login screen |
| 5 | Enter email + password → Tap "Sign In" | Redirected to Dashboard |

> **Mock mode tip:** If using mock auth, the API accepts any email/password. Use `test@test.com` / `password123`.

#### Test 2: Create Event

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Tap "+ Create Event" | Create Event form appears |
| 2 | Enter name: "Beach Trip" | — |
| 3 | Select type: "Trip" | Chip highlighted |
| 4 | Select currency: "USD" | Chip highlighted |
| 5 | Tap "Create Event" | Success alert → Redirected to Event Detail |
| 6 | Verify event detail | Name, type, currency shown correctly |

#### Test 3: Create Event with FX (Pro Feature)

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Create new event, select currency "USD" | — |
| 2 | Select settlement currency "INR" | FX section appears |
| 3 | If Free tier: Tap "Create Event" | Alert: "Pro Feature — Multi-currency settlement requires Pro" |
| 4 | If Pro tier: Select "Predefined", enter rate "83.50" | — |
| 5 | Tap "Create Event" | Event created with FX badge on dashboard |

#### Test 4: Create Expense

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | From Event Detail, tap "+ Add Expense" | Create Expense form appears |
| 2 | Enter title: "Dinner", amount: "100" | — |
| 3 | Verify entities are listed with checkboxes | All entities selected by default |
| 4 | Verify split amounts | Equal split: $50 each (for 2 entities) |
| 5 | Tap "Add Expense" | Success alert → Back to Event Detail |
| 6 | Verify expense appears in list | "Dinner" with $100 shown |

#### Test 5: "On Behalf Of" Expense

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Create new expense | — |
| 2 | Toggle "On behalf of" switch ON | Entity selector appears with info box |
| 3 | Select an entity | Entity highlighted |
| 4 | Enter title + amount → Submit | Expense created with "On behalf of" label |

#### Test 6: Settlement Flow

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | As admin, tap "Settle" button | Confirmation alert appears |
| 2 | Tap "Settle" in alert | Settlement cards appear with pending status |
| 3 | As payer, tap "Pay" on a settlement | Status changes to initiated (blue dot) |
| 4 | As payee, tap "Confirm" | Status changes to completed (green dot, ✓ Done) |
| 5 | When all settlements confirmed | Event status changes to "settled" |

#### Test 7: Pull-to-Refresh

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | On Dashboard, pull down | Refresh indicator appears, event list reloads |
| 2 | On Event Detail, pull down | All data refreshes |

### Automated E2E Testing (Future)

The recommended tools for automated mobile E2E testing are:

| Tool | Platform | Notes |
|------|----------|-------|
| **Maestro** | iOS + Android | YAML-based, easiest setup, recommended for Expo |
| **Detox** | iOS + Android | Jest-based, requires native build (`expo prebuild`) |
| **Appium** | iOS + Android | Cross-platform, Selenium-style |

To add Maestro tests in the future:

```bash
# Install Maestro
curl -Ls "https://get.maestro.mobile.dev" | bash

# Create test flow
mkdir -p apps/mobile/__tests__/maestro
cat > apps/mobile/__tests__/maestro/login.yaml << 'EOF'
appId: com.splitex.app
---
- launchApp
- assertVisible: "Splitex"
- tapOn: "Email"
- inputText: "test@test.com"
- tapOn: "Password"
- inputText: "password123"
- tapOn: "Sign In"
- assertVisible: "Hello"
EOF

# Run
maestro test apps/mobile/__tests__/maestro/login.yaml
```

---

## Architecture & Key Files

### Navigation Flow

```
App.tsx
├── AuthStack (user = null)
│   ├── LoginScreen
│   └── RegisterScreen
└── AppStack (user != null)
    ├── DashboardScreen
    ├── EventDetailScreen
    ├── CreateEventScreen (modal)
    └── CreateExpenseScreen (modal)
```

### Authentication

- **`AuthContext.tsx`** manages all auth state
- Tokens stored in `AsyncStorage` under `@splitex_token`
- On app launch, attempts to load token and fetch `/api/users/profile`
- If token is invalid/expired, clears storage and shows login
- `tier` state (`'free' | 'pro'`) controls feature gating

### API Client

- **`api.ts`** wraps `fetch` with automatic token injection
- In `__DEV__` mode, connects to `http://localhost:3001`
- Override with `EXPO_PUBLIC_API_URL` env var for real devices
- All responses unwrapped to `{ data, status }`

### Theme

- **`theme.ts`** exports `colors`, `spacing`, `radii`, `fontSizes`, `CURRENCY_SYMBOLS`
- All screens use `StyleSheet.create()` with theme tokens
- Consistent with the web app's design language

---

## Features

| Feature | Screen | Description |
|---------|--------|-------------|
| **Email/Password Auth** | Login, Register | JWT-based authentication |
| **Event Dashboard** | Dashboard | Event list with status badges, FX badges, pull-to-refresh |
| **Create Event** | CreateEvent | Name, type, currency, FX settings (settlement currency, rate mode) |
| **Event Detail** | EventDetail | Summary cards, expense list, settlement cards, group list |
| **Create Expense** | CreateExpense | Entity selection, equal splits, "On Behalf Of" toggle |
| **Settlement Flow** | EventDetail | Settle → Pay → Confirm Receipt → Auto-settle |
| **Dual Currency** | EventDetail | Settlement amounts shown in both currencies with FX rate |
| **Pro Tier Gating** | CreateEvent | Multi-currency FX blocked for Free tier users |
| **Pull-to-Refresh** | Dashboard, EventDetail | Swipe down to reload data |

---

## Known Limitations & Roadmap

### Current Limitations

| Limitation | Impact | Workaround |
|-----------|--------|------------|
| No edit expense screen | Cannot edit expenses from mobile | Use web app for editing |
| No edit event screen | Cannot edit events from mobile | Use web app for editing |
| No invitation management | Cannot send/accept invitations | Use web app |
| No group management | Cannot create/edit groups | Use web app |
| No WebSocket real-time | Data only refreshes on pull-to-refresh or screen focus | Pull down to refresh |
| No push notifications | No alerts for new expenses or settlements | Check app manually |
| No offline support | Requires network connectivity | — |
| No automated E2E tests | Manual testing only | See test plan above |
| Auth is email/password only | No OTP, Google, or Microsoft OAuth on mobile | Use email/password |

### Roadmap

- [ ] Edit expense screen
- [ ] Edit event screen
- [ ] Invitation management (send, accept, decline)
- [ ] Group management (create, edit, members)
- [ ] WebSocket real-time updates
- [ ] Push notifications (Expo Notifications)
- [ ] Offline mode with sync
- [ ] In-app purchase for Pro tier (RevenueCat / Expo IAP)
- [ ] Automated E2E tests (Maestro)
- [ ] Dark mode support
- [ ] Biometric authentication (Face ID / Fingerprint)

---

## Troubleshooting

| Problem | Solution |
|---------|----------|
| `rush dev:mobile` shows "command not found" | Run `rush update` to install dependencies |
| Expo QR code not scanning | Ensure phone and computer are on the same Wi-Fi; try `rush mobile:tunnel` |
| `Cannot connect to API` on real device | Replace `localhost` with your LAN IP: `EXPO_PUBLIC_API_URL=http://YOUR_IP:3001 rush dev:mobile` |
| iOS Simulator not launching | Open Xcode once to accept license; run `xcode-select --install` |
| Android Emulator not launching | Ensure `ANDROID_HOME` is set; create a virtual device in Android Studio |
| `Metro bundler` port conflict (8081) | Kill existing: `lsof -ti:8081 \| xargs kill` |
| `@splitex/shared` module not found | Run `rush build:shared` from the monorepo root |
| White screen after launch | Check Metro terminal for errors; press `r` to reload |
| `Invariant Violation: "main" has not been registered` | Ensure `app.json` → `"main"` points to `"src/App.tsx"` |
| Expo Go crashes on launch | Update Expo Go to latest version; run `rush clean:mobile` then restart |
| `Network request failed` | API server not running; start with `rush dev:api` |
| Slow Metro bundler | Run `rush clean:mobile` to clear caches; restart Expo |
| TypeScript errors in IDE | Run `rush build:shared` first; IDE lint errors for test files are false positives |
| `expo prebuild` fails | Ensure Xcode (iOS) or Android Studio (Android) is properly installed |
| Real device: "Unable to resolve host" | Use tunnel mode: `rush mobile:tunnel` |

---

## Quick Reference

| What | Command |
|------|---------|
| Start Expo (QR code) | `rush dev:mobile` |
| Open iOS Simulator | `rush mobile:ios` |
| Open Android Emulator | `rush mobile:android` |
| Real device (same Wi-Fi) | `EXPO_PUBLIC_API_URL=http://YOUR_IP:3001 rush dev:mobile` |
| Real device (any network) | `rush mobile:tunnel` |
| Type-check | `rush build:mobile` |
| Clean caches | `rush clean:mobile` |
| Generate iOS native project | `rush mobile:prebuild:ios` |
| Generate Android native project | `rush mobile:prebuild:android` |

---

**Splitex Mobile** — Expense splitting on the go.
