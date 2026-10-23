# Traxettle — Deployment Instructions

This document covers all deployment channels: Web (staging/production), Mobile Android (internal testing/Play Store), and Mobile iOS (TestFlight/App Store).

---

## Overview

| Channel | Target | Build Artifact | Deploy To |
|---------|--------|---------------|-----------|
| Web Staging | traxettle-staging | Next.js build | Cloud Run (staging) |
| Web Production | traxettle-production | Next.js build | Cloud Run (production) |
| Android Internal | traxettle-staging | `.aab` (signed) | Play Console → Internal Testing |
| Android Production | traxettle-production | `.aab` (signed) | Play Console → Production |
| iOS Internal | traxettle-staging | `.ipa` (signed) | TestFlight |
| iOS Production | traxettle-production | `.ipa` (signed) | App Store Connect |

---

## 1. Web — Staging

### Prerequisites
- GCP project with Cloud Run enabled
- `gcloud` CLI authenticated (`gcloud auth login`)
- Firebase service account credentials configured in Cloud Run environment

### Steps

```bash
# 1. Build the web app
cd apps/web
NEXT_PUBLIC_APP_ENV=staging \
NEXT_PUBLIC_API_URL=https://traxettle-api-staging-lomxjapdhq-uc.a.run.app \
rushx build

# 2. Build the API
cd apps/api
rushx build

# 3. Deploy API to Cloud Run (staging)
gcloud run deploy traxettle-api-staging \
  --source apps/api \
  --region us-central1 \
  --set-env-vars="APP_ENV=staging,PORT=3001,FIREBASE_USE_EMULATOR=false" \
  --set-env-vars="FIREBASE_PROJECT_ID=traxettle-staging" \
  --set-env-vars="FIREBASE_CLIENT_EMAIL=<service-account-email>" \
  --set-env-vars="FIREBASE_PRIVATE_KEY=<base64-encoded-private-key>" \
  --set-env-vars="FIREBASE_STORAGE_BUCKET=traxettle-staging.firebasestorage.app" \
  --set-env-vars="JWT_SECRET=<jwt-secret>" \
  --set-env-vars="JWT_REFRESH_SECRET=<jwt-refresh-secret>" \
  --allow-unauthenticated

# 4. Deploy Web to Cloud Run (staging) or static hosting
gcloud run deploy traxettle-web-staging \
  --source apps/web \
  --region us-central1 \
  --set-env-vars="NEXT_PUBLIC_APP_ENV=staging" \
  --set-env-vars="NEXT_PUBLIC_API_URL=https://traxettle-api-staging-lomxjapdhq-uc.a.run.app" \
  --allow-unauthenticated
```

### Verify
```bash
curl https://traxettle-api-staging-lomxjapdhq-uc.a.run.app/health
```

---

## 2. Web — Production

Same as staging but with production env vars:

```bash
# Build
cd apps/web
NEXT_PUBLIC_APP_ENV=production \
NEXT_PUBLIC_API_URL=https://<production-api-url> \
rushx build

# Deploy API
gcloud run deploy traxettle-api-production \
  --source apps/api \
  --region us-central1 \
  --set-env-vars="APP_ENV=production,PORT=3001" \
  --set-env-vars="FIREBASE_PROJECT_ID=<production-firebase-project>" \
  --set-env-vars="FIREBASE_CLIENT_EMAIL=<prod-service-account>" \
  --set-env-vars="FIREBASE_PRIVATE_KEY=<prod-private-key>" \
  --set-env-vars="JWT_SECRET=<prod-jwt-secret>" \
  --allow-unauthenticated

# Deploy Web
gcloud run deploy traxettle-web-production \
  --source apps/web \
  --region us-central1 \
  --set-env-vars="NEXT_PUBLIC_APP_ENV=production" \
  --set-env-vars="NEXT_PUBLIC_API_URL=https://<production-api-url>" \
  --allow-unauthenticated
```

---

## 3. Android — Internal Testing (Play Console)

### Prerequisites
- `google-services.staging.json` in `apps/mobile/`
- Release keystore at `apps/mobile/android/app/traxettle-release-key.keystore`
- Signing credentials in `apps/mobile/android/gradle.properties.local`:
  ```
  TRAXETTLE_RELEASE_STORE_FILE=traxettle-release-key.keystore
  TRAXETTLE_RELEASE_STORE_PASSWORD=traxettle2024
  TRAXETTLE_RELEASE_KEY_ALIAS=traxettle-key
  TRAXETTLE_RELEASE_KEY_PASSWORD=traxettle2024
  ```
- Android SDK and Java 17+

### Steps

```bash
# 1. Version: nothing to edit. The build sets the version it shares with iOS and a new
#    versionCode (see "Versions" below). For a feature release, first run:
#    npm run version:bump -- minor

# 2. Build the signed .aab. It's the production build: you upload it to internal
#    testing, then promote the same release to production. Testers switch to
#    staging by tapping "Traxettle" 7 times on the sign-in screen.
cd apps/mobile
rushx build:android:production
# Or directly:
# bash scripts/build-android.sh production

# 3. Output location
#    apps/mobile/android/app/build/outputs/bundle/release/app-release.aab

# 4. Upload to Play Console
#    Google Play Console → Traxettle → Testing → Internal testing
#    → Create new release → Upload app-release.aab
#    → Add release notes → Review → Start rollout
```

### Quick Debug APK (sideload to device)
```bash
# Self-contained APK pointing to staging API (no Metro needed)
rushx build:android:debug:staging
# Output: android/app/build/outputs/apk/release/app-release.apk
# Auto-installs on connected device if adb is available
```

---

## 4. Android — Production (Play Store)

```bash
# 1. Version: set by the build (see "Versions" below)

# 2. Build production .aab
cd apps/mobile
rushx build:android:production
# Or: bash scripts/build-android.sh production

# 3. Upload to Play Console
#    Google Play Console → Traxettle → Production
#    → Create new release → Upload app-release.aab
#    → Add release notes → Review → Start rollout
```

> **Note:** The production build currently falls back to the staging API URL. Set `EXPO_PUBLIC_API_URL` before building when a production API is available:
> ```bash
> EXPO_PUBLIC_API_URL=https://your-prod-api.run.app bash scripts/build-android.sh production
> ```

---

## 5. iOS — TestFlight (Internal Testing)

There is **one iOS build for every environment**. Release builds choose the API at runtime:

- **Production by default.** The TestFlight build is the exact binary you later promote to the App Store (section 6), so it is built with production settings.
- **Staging on request.** Testers tap **"Traxettle" 7 times on the sign-in screen** (also on Register and Forgot password) to switch between Staging and Production; the app reloads. Signed in, the same switch is under Profile → tap **"Traxettle v…" 7 times** → Developer (Hidden) → *Switch to Staging API*.

The `EXPO_PUBLIC_API_URL` baked into a build only affects development builds. Deploy the API the testers will use (staging and/or production) before they test new features.

### Prerequisites (one-time)
- macOS with Xcode and CocoaPods (`gem install cocoapods`)
- Apple Developer account enrolled, and its Apple ID added in Xcode → Settings → Accounts
- App ID `com.traxettle.app` registered (developer.apple.com → Identifiers) and the app created in App Store Connect
- Your 10-character Apple Team ID (developer.apple.com → Membership, or `tools/doctor-tool/scripts/doctor-apple-team.sh`)
- `GoogleService-Info.staging.plist` in `apps/mobile/` (the production profile still uses it; see the Google sign-in note below) and `rc_prod.properties` (or `rc_production.properties`) in the repo root. Its Apple key is optional; without it Pro purchases don't work in the build.

> Google sign-in: the Google client IDs are fixed at build time, and the production settings in `scripts/build-ios.sh` still use the staging IDs (marked TODO). Check Google sign-in against production before releasing; email/password sign-in is unaffected.

### Build and upload (one command)

```bash
cd apps/mobile
APPLE_TEAM_ID=ABCDE12345 bash scripts/build-ios.sh testflight
# or: APPLE_TEAM_ID=ABCDE12345 npm run build:ios:testflight
```

The script writes the production settings (`.env`, restored afterwards), copies the
Firebase plist, runs `expo prebuild --clean`, archives a Release build with `xcodebuild`
and uploads it to App Store Connect. The version is shared with Android (see "Versions"
below), and each run gets a new build number (`yymmddHHMM`; override with `IOS_BUILD_NUMBER`). The archive is kept in Xcode's Organizer, so a failed
upload can be retried from there. To sign without an Xcode account (e.g. on CI), set
`ASC_KEY_PATH`, `ASC_KEY_ID` and `ASC_KEY_ISSUER_ID` for an App Store Connect API key.

Automatic signing archives with a development profile, which needs a registered iPhone or
iPad on the team ("Your team has no devices from which to generate a provisioning profile").
Without a device, sign with your App Store profile instead:

```bash
IOS_PROVISIONING_PROFILE="<profile name>" APPLE_TEAM_ID=ABCDE12345 npm run build:ios:testflight
```

The Mac needs the profile installed (download it from Certificates, Identifiers & Profiles →
Profiles and double-click it) and the **Apple Distribution** certificate with its private key
in the keychain. A downloaded profile doesn't include the key: export the certificate as a
`.p12` from the Mac that created it (Keychain Access → My Certificates → Export) and
double-click it on the other Mac. The script checks both before building.
`plugins/ios-release-signing.js` applies the profile to the app's Release build only.

Then, in App Store Connect → TestFlight: the build appears after processing (~10–30 min).
Add internal testers (no review), or external testers (needs Beta App Review).

### Archive and upload in Xcode instead

```bash
cd apps/mobile
IOS_PROVISIONING_PROFILE="<profile name>" APPLE_TEAM_ID=ABCDE12345 bash scripts/build-ios.sh xcode
```

`xcode` does everything `testflight` does before archiving (production settings, Firebase
plist, version, build number, signing, `expo prebuild --clean`) and opens the workspace in
Xcode. Then in Xcode: destination **Any iOS Device (arm64)** → **Product → Archive** →
Organizer → **Distribute App** → **App Store Connect** → **Upload**.

It leaves `apps/mobile/.env` and `src/config/buildEnv.ts` in place, because Xcode bundles the
JavaScript during the archive and takes the RevenueCat key from them. (Archiving after
`testflight` has finished would ship without the key: that script restores both files when
it exits.) When you're done:

```bash
bash scripts/build-ios.sh xcode-done                 # uploaded: records the version, restores the files
bash scripts/build-ios.sh xcode-done --not-uploaded  # gave up: restores the files only
```

Until then the other build commands refuse to run, and `buildEnv.ts` shows as modified: don't
commit it. If only the upload of a `testflight` run failed, don't use `xcode`: distribute that
run's archive from Organizer, then run `bash scripts/version.sh record ios <build number>`.

### Why not EAS Build
EAS cloud builds don't work for this monorepo: EAS installs dependencies with npm, which
can't resolve Rush's `workspace:` packages (`@traxettle/shared`), and the `.env` the build
scripts write is gitignored, so it never reaches EAS. The `staging` EAS profile is also an
ad-hoc ("internal") build, not a TestFlight one.

---

## 6. iOS — App Store (Production)

Promote the build you tested in TestFlight; no rebuild is needed. It already uses the
production API by default (section 5), and the same binary goes to App Store users.

```bash
# 1. Upload a build with section 5 (or reuse one already in TestFlight)
# 2. In App Store Connect:
#    - Go to App Store tab (not TestFlight)
#    - Create new version
#    - Select the uploaded build
#    - Fill in release notes, screenshots, metadata
#    - Submit for Review
```

---

## Versions

iOS and Android ship the same version, and the store builds set it for you:
`build-ios.sh testflight` and `build-android.sh production` run `scripts/version.sh`
before building. You don't edit version numbers by hand.

- **The version** (`1.0.34`) lives in `apps/mobile/app.json` (`expo.version`), mirrored in
  `package.json` and `android/app/build.gradle` (`versionName`).
- **`release-versions.json`** records what each platform last shipped. A build bumps the
  patch number only if its platform already shipped the current version. So the first
  platform of a release moves to `1.0.34`, and the second one ships `1.0.34` too.
- **Build numbers:** iOS uses `yymmddHHMM`. Android's `versionCode` goes up by one for each
  `.aab`; Play rejects a `versionCode` it has seen before.
- **A failed build** isn't recorded, so the next try reuses its version and `versionCode`.
- **After a successful build**, commit `app.json`, `package.json`, `android/app/build.gradle`
  and `release-versions.json`, then pull on your other Mac before building there. Otherwise
  that Mac reuses a version (and Play rejects the repeated `versionCode`).

Run these in `apps/mobile`:

| Command | What it does |
|---|---|
| `npm run version:show` | Current version, what each platform last shipped, what the next builds get |
| `npm run version:bump -- minor` | Start a feature release (`1.0.34` → `1.1.0`); also `patch`, `major`, or an exact `1.2.0` |

The Profile screen shows the version (`Traxettle v1.0.34`).

---

## Environment Variable Reference (Deployment)

### API (Cloud Run)
| Variable | Staging | Production |
|----------|---------|------------|
| `APP_ENV` | `staging` | `production` |
| `PORT` | `3001` | `3001` |
| `FIREBASE_PROJECT_ID` | `traxettle-staging` | `<prod-project>` |
| `FIREBASE_USE_EMULATOR` | `false` | `false` |
| `JWT_SECRET` | `<staging-secret>` | `<prod-secret>` |
| `PAYMENT_GATEWAY_MODE` | `mock` | `live` |

### Web (Cloud Run / Static)
| Variable | Staging | Production |
|----------|---------|------------|
| `NEXT_PUBLIC_APP_ENV` | `staging` | `production` |
| `NEXT_PUBLIC_API_URL` | `https://traxettle-api-staging-...` | `https://<prod-api>` |

### Mobile (Build-time via .env / build script)
| Variable | Staging | Production |
|----------|---------|------------|
| `EXPO_PUBLIC_APP_ENV` | `staging` | `production` |
| `EXPO_PUBLIC_API_URL` | `https://traxettle-api-staging-...` | `https://<prod-api>` |

---

## Signing Keys

| Key | Location | Alias | Password |
|-----|----------|-------|----------|
| Android Release | `android/app/traxettle-release-key.keystore` | `traxettle-key` | `traxettle2024` |
| Android Debug (local) | `apps/mobile/debug.keystore.local` | `androiddebugkey` | `android` |
| Android Debug (staging) | `apps/mobile/debug.keystore.staging` | `androiddebugkey` | `android` |

Upload key SHA-1: `6A:77:3A:F7:80:44:DF:90:49:77:64:40:89:15:27:AB:8D:10:AE:26`

> **Security:** Never commit keystores or `gradle.properties.local` to git. They are in `.gitignore`.
